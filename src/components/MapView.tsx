"use client";

import { useRef, useCallback, useEffect, useState, useMemo } from "react";
import { useTheme } from "next-themes";
import Map, {
  NavigationControl,
  GeolocateControl,
  type MapRef,
  type ViewStateChangeEvent,
} from "react-map-gl/mapbox";
import { Source, Layer } from "@vis.gl/react-mapbox";
import type { MapMouseEvent, GeoJSONSource } from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { useDebouncedCallback } from "use-debounce";
import { useListingsStore } from "@/store/listings";
import { COLORS, MAP_STYLES } from "@/lib/theme";
import PriceMarkers from "./PriceMarkers";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";
const DRAW_SOURCE_ID = "freehand-draw-source";
const EMPTY_FC: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

// Theme constants (DRAW_COLOR, MAP_STYLES) imported from @/lib/theme

const INITIAL_VIEW = {
  latitude: 17.385,
  longitude: 78.4867,
  zoom: 12,
};

// Minimum distance (in degrees) between sampled points while dragging.
// Prevents excessive point accumulation on fast drags.
const MIN_POINT_DISTANCE = 0.0005;

/**
 * Constructs the GeoJSON feature collection representing the current drawing progress.
 * While actively drawing, only a LineString (pencil stroke) and the starting Point are shown.
 * The closed Polygon is only constructed and filled when the drawing completes.
 * 
 * @param pts - Array of coordinates [longitude, latitude] representing the drawn line
 * @param closed - True if drawing is complete and the polygon should be closed/filled
 */
function buildDrawGeoJSON(pts: number[][], closed = false): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];

  // 1. LineString representing the drawn path
  if (pts.length >= 2) {
    features.push({
      type: "Feature",
      geometry: { type: "LineString", coordinates: pts },
      properties: {},
    });
  }

  // 2. Polygon representing the final closed/filled region (only once drawing is finished)
  if (closed && pts.length >= 3) {
    features.push({
      type: "Feature",
      geometry: { type: "Polygon", coordinates: [[...pts, pts[0]]] },
      properties: {},
    });
  }

  // 3. Dot marker representing the starting point of the drawing
  if (pts.length >= 1) {
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: pts[0] },
      properties: {},
    });
  }

  return { type: "FeatureCollection", features };
}

export default function MapView() {
  const mapRef = useRef<MapRef>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const mapStyle = useMemo(
    () => MAP_STYLES[isDark ? "dark" : "light"],
    [isDark]
  );
  const colors = isDark ? COLORS.dark : COLORS.light;
  const drawColor = colors.drawColor;

  // Compass control — added imperatively so it lives inside .mapboxgl-ctrl-top-right
  // alongside the zoom/geolocate buttons (no pixel-guessing needed).
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map || !mapLoaded) return;

    let svgEl: SVGSVGElement | null = null;

    const ctrl = {
      onAdd() {
        const container = document.createElement('div');
        container.className = 'mapboxgl-ctrl mapboxgl-ctrl-group';

        const btn = document.createElement('button');
        btn.title = 'Reset to North';
        btn.style.cssText = 'display:flex;align-items:center;justify-content:center';

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', '22');
        svg.setAttribute('height', '22');
        svg.setAttribute('viewBox', '0 0 22 22');
        svg.style.transition = 'transform 0.15s linear';
        svgEl = svg;

        const north = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        north.setAttribute('d', 'M11 2 L14.5 12 L11 10 L7.5 12 Z');
        north.setAttribute('fill', '#E84235');

        const south = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        south.setAttribute('d', 'M11 20 L7.5 10 L11 12 L14.5 10 Z');
        south.setAttribute('fill', '#6B6B6B');
        south.setAttribute('opacity', '0.5');

        svg.appendChild(north);
        svg.appendChild(south);
        btn.appendChild(svg);
        container.appendChild(btn);

        btn.addEventListener('click', () => {
          map.easeTo({ bearing: 0, pitch: 0, duration: 600 });
        });

        return container;
      },
      onRemove() {},
    };

    const onMove = () => {
      if (svgEl) svgEl.style.transform = `rotate(${-map.getBearing()}deg)`;
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    map.addControl(ctrl as any, 'top-right');
    map.on('move', onMove);

    return () => {
      map.off('move', onMove);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      try { map.removeControl(ctrl as any); } catch {}
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapLoaded]);

  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map || !mapLoaded) return;

    const applyStyleSettings = () => {
      // ── Label spelling fix ─────────────────────────────────────────────
      // Mapbox tile data has two different problems depending on label type:
      //
      // MAJOR settlements (settlement-major-label, state-label, country-label):
      //   • `name`    = correct English (e.g. "Secunderabad") ✓
      //   • `name_en` = wrong transliteration (e.g. "Sikandarabad") ✗
      //   Fix: use ["get", "name"]
      //
      // SUBDIVISION labels (settlement-subdivision-label, settlement-minor-label):
      //   • `name`    = local/OSM romanization (e.g. "Kacheguda") ✗
      //   • `name_en` = correct English (e.g. "Kachiguda") ✓
      //   Fix: explicitly set ["get", "name_en"]
      //
      // Both light (streets-v12) and dark (dark-v11) are classic styles —
      // all layers are directly accessible, no Standard-style import indirection.
      // Verified against live tile data at Secunderabad + Kachiguda coordinates.

      const MAJOR_LABEL_LAYERS = [
        "settlement-major-label",
        "state-label",
        "country-label",
        "continent-label",
      ];
      const SUBDIVISION_LABEL_LAYERS = [
        "settlement-minor-label",
        "settlement-subdivision-label",
      ];

      MAJOR_LABEL_LAYERS.forEach(layerId => {
        if (map.getLayer(layerId)) {
          try { map.setLayoutProperty(layerId, "text-field", ["get", "name"]); } catch {}
        }
      });

      SUBDIVISION_LABEL_LAYERS.forEach(layerId => {
        if (map.getLayer(layerId)) {
          try { map.setLayoutProperty(layerId, "text-field", ["get", "name_en"]); } catch {}
        }
      });
    };

    // Style may already be loaded, or we need to wait
    if (map.isStyleLoaded()) {
      applyStyleSettings();
    }
    map.on("style.load", applyStyleSettings);
    return () => {
      map.off("style.load", applyStyleSettings);
    };
  }, [isDark, mapLoaded]);

  // Whether the user is actively dragging to draw right now
  const [isDrawingSession, setIsDrawingSession] = useState(false);

  // Accumulated committed polygons — React state drives the declarative Source data prop
  const [committedGeoJSON, setCommittedGeoJSON] = useState<GeoJSON.FeatureCollection>(EMPTY_FC);
  // Ref mirrors state so imperative setData (during drag) always has the current committed polygons
  const committedFeaturesRef = useRef<GeoJSON.Feature[]>([]);

  // Accumulated drag points — stored in a ref to avoid re-renders on every mousemove
  const dragPointsRef = useRef<number[][]>([]);
  const isDrawingRef = useRef(false);

  const {
    boundary,
    drawActive,
    updateBoundary,
    setViewportBounds,
    listings,
    setSelectedListing,
  } = useListingsStore();

  // Fit map to city boundary when selected from search
  useEffect(() => {
    if (boundary?.type === "city" && boundary.bbox && mapRef.current) {
      mapRef.current.fitBounds(
        [
          [boundary.bbox[0], boundary.bbox[1]],
          [boundary.bbox[2], boundary.bbox[3]],
        ],
        { padding: 40, duration: 1000 }
      );
    }
    // When boundary is cleared (Remove button), reset committed GeoJSON too
    if (!boundary) {
      committedFeaturesRef.current = [];
      setCommittedGeoJSON(EMPTY_FC);
    }
  }, [boundary]);

  // Toggle map interactions and cursor when draw mode changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    const raw = map.getMap();
    if (drawActive) {
      raw.dragPan.disable();
      raw.doubleClickZoom.disable();
      raw.getCanvas().style.cursor = "crosshair";
    } else {
      raw.dragPan.enable();
      raw.doubleClickZoom.enable();
      raw.getCanvas().style.cursor = "";
      // Clear any in-progress drawing when mode turns off
      dragPointsRef.current = [];
      isDrawingRef.current = false;
      setIsDrawingSession(false);
    }
  }, [drawActive, mapLoaded]);

  const handleMoveEnd = useDebouncedCallback(
    (_evt: ViewStateChangeEvent) => {
      const map = mapRef.current;
      if (!map) return;
      const bounds = map.getMap().getBounds();
      if (bounds) {
        setViewportBounds([
          bounds.getWest(),
          bounds.getSouth(),
          bounds.getEast(),
          bounds.getNorth(),
        ]);
      }
    },
    300
  );

  const handleLoad = useCallback(() => {
    setMapLoaded(true);
    const map = mapRef.current;
    if (!map) return;
    (window as any).map = map.getMap();
    const bounds = map.getMap().getBounds();
    if (bounds) {
      setViewportBounds([
        bounds.getWest(),
        bounds.getSouth(),
        bounds.getEast(),
        bounds.getNorth(),
      ]);
    }
  }, [setViewportBounds]);

  const handleClusterClick = useCallback((coords: [number, number][]) => {
    if (coords.length === 0) return;
    const map = mapRef.current?.getMap();
    if (!map) return;

    if (coords.length === 1) {
      map.flyTo({
        center: coords[0],
        zoom: 16,
        duration: 800,
      });
      return;
    }

    let minLng = coords[0][0];
    let minLat = coords[0][1];
    let maxLng = coords[0][0];
    let maxLat = coords[0][1];

    for (const [lng, lat] of coords) {
      if (lng < minLng) minLng = lng;
      if (lat < minLat) minLat = lat;
      if (lng > maxLng) maxLng = lng;
      if (lat > maxLat) maxLat = lat;
    }

    map.fitBounds(
      [[minLng, minLat], [maxLng, maxLat]],
      { padding: 80, maxZoom: 16, duration: 800 }
    );
  }, []);

  // ── Freehand drawing event handlers ──────────────────────────────────────

  // Update the map source directly — merges committed polygons + live stroke
  // This bypasses React state so the canvas stays smooth during drag
  const updateDrawSource = useCallback(() => {
    const raw = mapRef.current?.getMap();
    if (!raw) return;
    const source = raw.getSource(DRAW_SOURCE_ID) as GeoJSONSource | undefined;
    if (source) {
      const live = buildDrawGeoJSON(dragPointsRef.current);
      source.setData({
        type: "FeatureCollection",
        // Committed polygons always shown underneath the live stroke
        features: [...committedFeaturesRef.current, ...live.features],
      });
    }
  }, []);

  const handleMouseDown = useCallback(
    (e: MapMouseEvent) => {
      if (!drawActive) return;
      isDrawingRef.current = true;
      dragPointsRef.current = [[e.lngLat.lng, e.lngLat.lat]];
      setIsDrawingSession(true);
    },
    [drawActive]
  );

  const handleMouseMove = useCallback(
    (e: MapMouseEvent) => {
      if (!drawActive || !isDrawingRef.current) return;
      const [lng, lat] = [e.lngLat.lng, e.lngLat.lat];
      const pts = dragPointsRef.current;
      const last = pts[pts.length - 1];
      // Only sample if moved enough — avoids thousands of near-duplicate points
      if (
        !last ||
        Math.abs(lng - last[0]) > MIN_POINT_DISTANCE ||
        Math.abs(lat - last[1]) > MIN_POINT_DISTANCE
      ) {
        dragPointsRef.current = [...pts, [lng, lat]];
        updateDrawSource();
      }
    },
    [drawActive, updateDrawSource]
  );

  const completeDraw = useCallback(() => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    const pts = dragPointsRef.current;
    dragPointsRef.current = [];

    if (pts.length >= 3) {
      const closed = [...pts, pts[0]];
      const newFeature: GeoJSON.Feature = {
        type: "Feature",
        geometry: { type: "Polygon", coordinates: [closed] },
        properties: {},
      };
      // Append to accumulated committed polygons (don't replace)
      const updatedFeatures = [...committedFeaturesRef.current, newFeature];
      committedFeaturesRef.current = updatedFeatures;
      const updatedGeoJSON: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features: updatedFeatures,
      };
      // Same React batch: update committed + clear drawing session → no blink
      setCommittedGeoJSON(updatedGeoJSON);
      updateBoundary({ type: "polygon", coordinates: closed, label: "Custom Area" });
    }
    setIsDrawingSession(false);
  }, [updateBoundary]);

  const handleMouseUp = useCallback(
    (_e: MapMouseEvent) => {
      if (!drawActive) return;
      completeDraw();
    },
    [drawActive, completeDraw]
  );

  // Touch support — map canvas touch events
  useEffect(() => {
    if (!mapLoaded || !drawActive) return;
    const canvas = mapRef.current?.getMap().getCanvas();
    if (!canvas) return;

    const getCoords = (touch: Touch) => {
      const rect = canvas.getBoundingClientRect();
      const x = touch.clientX - rect.left;
      const y = touch.clientY - rect.top;
      return mapRef.current!.getMap().unproject([x, y]);
    };

    const onTouchStart = (e: TouchEvent) => {
      if (!drawActive) return;
      e.preventDefault();
      const lngLat = getCoords(e.touches[0]);
      isDrawingRef.current = true;
      dragPointsRef.current = [[lngLat.lng, lngLat.lat]];
      setIsDrawingSession(true);
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!drawActive || !isDrawingRef.current) return;
      e.preventDefault();
      const lngLat = getCoords(e.touches[0]);
      const [lng, lat] = [lngLat.lng, lngLat.lat];
      const pts = dragPointsRef.current;
      const last = pts[pts.length - 1];
      if (
        !last ||
        Math.abs(lng - last[0]) > MIN_POINT_DISTANCE ||
        Math.abs(lat - last[1]) > MIN_POINT_DISTANCE
      ) {
        dragPointsRef.current = [...pts, [lng, lat]];
        updateDrawSource();
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (!drawActive) return;
      e.preventDefault();
      completeDraw();
    };

    canvas.addEventListener("touchstart", onTouchStart, { passive: false });
    canvas.addEventListener("touchmove", onTouchMove, { passive: false });
    canvas.addEventListener("touchend", onTouchEnd, { passive: false });

    return () => {
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("touchend", onTouchEnd);
    };
  }, [mapLoaded, drawActive, updateDrawSource, completeDraw]);

  return (
    <div className="map-container" id="map-container">
      <Map
        ref={mapRef}
        mapboxAccessToken={MAPBOX_TOKEN}
        initialViewState={INITIAL_VIEW}
        style={{ width: "100%", height: "100%" }}
        mapStyle={mapStyle}
        onMoveEnd={handleMoveEnd}
        onLoad={handleLoad}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onClick={() => setSelectedListing(null)}
        attributionControl={false}
        reuseMaps
      >
        <NavigationControl position="top-right" showCompass={false} />
        <GeolocateControl
          position="top-right"
          trackUserLocation={false}
          showAccuracyCircle={false}
        />

        {/* Single persistent draw/boundary Source — always shows committed polygons.
          During drag: updated imperatively via setData (committed + live stroke merged).
          After drag: committedGeoJSON state drives the data prop. No blink because
          the Source stays mounted the entire time drawActive OR boundary exists. */}
        {/* Single persistent draw/boundary Source — always shows committed polygons.
          During drag: updated imperatively via setData (committed + live stroke merged).
          After drag: committedGeoJSON state drives the data prop. No blink because
          the Source stays mounted the entire time drawActive OR boundary exists. */}
        {(isDrawingSession || boundary?.type === "polygon") && (
          <Source
            id={DRAW_SOURCE_ID}
            type="geojson"
            data={committedGeoJSON}
          >
            {/* Fill — only for polygon features. Uses dynamic drawColor for correct theme contrast. */}
            <Layer
              id="draw-fill"
              type="fill"
              filter={["==", "$type", "Polygon"]}
              paint={{ "fill-color": drawColor, "fill-opacity": 0.12 }}
            />
            {/* Stroke — always solid. Uses dynamic drawColor to stand out. */}
            <Layer
              id="draw-line"
              type="line"
              filter={["any", ["==", "$type", "LineString"], ["==", "$type", "Polygon"]]}
              paint={{
                "line-color": drawColor,
                "line-width": 2.5,
              }}
            />
            {/* Start-point dot — only while actively drawing */}
            {isDrawingSession && (
              <Layer
                id="draw-start-dot"
                type="circle"
                filter={["==", "$type", "Point"]}
                paint={{
                  "circle-radius": 6,
                  "circle-color": drawColor,
                  "circle-stroke-color": "#fff",
                  "circle-stroke-width": 2,
                }}
              />
            )}
          </Source>
        )}

        {mapLoaded && (
          <PriceMarkers
            listings={listings}
            onSelect={setSelectedListing}
            onClusterClick={handleClusterClick}
          />
        )}
      </Map>
    </div>
  );
}

