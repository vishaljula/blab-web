"use client";

import { useRef, useCallback, useEffect, useState } from "react";
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
import PriceMarkers from "./PriceMarkers";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";
const DRAW_SOURCE_ID = "freehand-draw-source";
const EMPTY_FC: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

const INITIAL_VIEW = {
  latitude: 17.385,
  longitude: 78.4867,
  zoom: 12,
};

// Minimum distance (in degrees) between sampled points while dragging.
// Prevents excessive point accumulation on fast drags.
const MIN_POINT_DISTANCE = 0.0005;

function buildDrawGeoJSON(pts: number[][]): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];

  if (pts.length >= 2) {
    features.push({
      type: "Feature",
      geometry: { type: "LineString", coordinates: pts },
      properties: {},
    });
  }
  if (pts.length >= 3) {
    features.push({
      type: "Feature",
      geometry: { type: "Polygon", coordinates: [[...pts, pts[0]]] },
      properties: {},
    });
  }
  // First vertex dot
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
        mapStyle="mapbox://styles/mapbox/streets-v12"
        onMoveEnd={handleMoveEnd}
        onLoad={handleLoad}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
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
        {(isDrawingSession || boundary?.type === "polygon") && (
          <Source
            id={DRAW_SOURCE_ID}
            type="geojson"
            data={committedGeoJSON}
          >
            {/* Fill — only for polygon features */}
            <Layer
              id="draw-fill"
              type="fill"
              filter={["==", "$type", "Polygon"]}
              paint={{ "fill-color": "#8B2500", "fill-opacity": 0.12 }}
            />
            {/* Stroke — always solid */}
            <Layer
              id="draw-line"
              type="line"
              filter={["any", ["==", "$type", "LineString"], ["==", "$type", "Polygon"]]}
              paint={{
                "line-color": "#8B2500",
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
                  "circle-color": "#8B2500",
                  "circle-stroke-color": "#fff",
                  "circle-stroke-width": 2,
                }}
              />
            )}
          </Source>
        )}

        {mapLoaded && (
          <PriceMarkers listings={listings} onSelect={setSelectedListing} />
        )}
      </Map>
    </div>
  );
}
