/**
 * MapView — Web version
 * Uses Mapbox GL JS (same as the original Next.js app).
 * This file is automatically picked by Metro/webpack when building for web.
 */

import { useRef, useCallback, useEffect, useState, useMemo } from "react";
import { View, StyleSheet } from "react-native";
import Map, {
  NavigationControl,
  GeolocateControl,
  Marker,
  Source,
  Layer,
  type MapRef,
  type ViewStateChangeEvent,
} from "react-map-gl/mapbox";
import { useDebouncedCallback } from "use-debounce";
import { useFocusEffect } from "expo-router";
import "mapbox-gl/dist/mapbox-gl.css";

import { useColorScheme } from "@/components/useColorScheme";
import { useListingsStore, type Listing } from "@/store/listings";
import { MAP_STYLES, COLORS, API_BASE_URL } from "@/lib/theme";
import { formatPrice } from "@/lib/format";
import { fetchViewportListings, fetchPolygonListings } from "@/lib/api";



const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN || "";
const DRAW_SOURCE_ID = "freehand-draw-source";
const BOUNDARY_SOURCE_ID = "boundary-source";
const EMPTY_FC: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

const INITIAL_VIEW = {
  latitude: 17.385,
  longitude: 78.4867,
  zoom: 12,
};

// Minimum distance (in degrees) between sampled points while dragging.
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


// Generate a circle polygon (64 points) for boundary fallback
function makeCircle(lat: number, lng: number, radiusKm: number): GeoJSON.Polygon {
  const pts = 64;
  const coords: [number, number][] = [];
  for (let i = 0; i <= pts; i++) {
    const angle = (i / pts) * 2 * Math.PI;
    const dLat = (radiusKm / 111) * Math.sin(angle);
    const dLng = (radiusKm / (111 * Math.cos((lat * Math.PI) / 180))) * Math.cos(angle);
    coords.push([lng + dLng, lat + dLat]);
  }
  return { type: "Polygon", coordinates: [coords] };
}

export default function MapViewWeb() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = isDark ? COLORS.dark : COLORS.light;
  const mapRef = useRef<MapRef>(null);
  // Tracks whether a Marker was just clicked so the Map's onClick (which
  // always fires after) doesn't immediately clear the selection.
  const markerClickedRef = useRef(false);

  // ── Resize on focus ────────────────────────────────────────────────────────
  // Mapbox GL JS does not auto-detect DOM container size changes.
  // When returning from the listing wizard modal (or any overlay), the map
  // container may have stale dimensions. resize() forces Mapbox to
  // recalculate and fill its container correctly.
  useFocusEffect(
    useCallback(() => {
      const timer = setTimeout(() => {
        mapRef.current?.getMap()?.resize();
      }, 100); // small delay lets the layout paint settle first
      return () => clearTimeout(timer);
    }, [])
  );
  const [mapLoaded, setMapLoaded] = useState(false);
  const [isDrawingSession, setIsDrawingSession] = useState(false);
  const [committedGeoJSON, setCommittedGeoJSON] = useState<GeoJSON.FeatureCollection>(EMPTY_FC);
  const [boundaryGeoJSON, setBoundaryGeoJSON] = useState<GeoJSON.FeatureCollection | null>(null);
  const committedFeaturesRef = useRef<GeoJSON.Feature[]>([]);
  const dragPointsRef = useRef<number[][]>([]);
  const isDrawingRef = useRef(false);

  const mapStyle = useMemo(() => MAP_STYLES[isDark ? "dark" : "light"], [isDark]);

  // Compass control — added to Mapbox control stack so it aligns automatically
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

  // When switching styles (light/dark), apply label spelling overrides
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
      // all layers are directly accessible. Verified against live tile data.

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

    // Apply immediately if style already loaded, then re-apply on every style reload
    if (map.isStyleLoaded()) {
      applyStyleSettings();
    }
    map.on("style.load", applyStyleSettings);
    return () => {
      map.off("style.load", applyStyleSettings);
    };
  }, [isDark, mapLoaded]);

  const {
    boundary,
    drawActive,
    setViewportBounds,
    listings,
    setSelectedListing,
    selectedListing,
    viewportBounds,
    addListings,
    setListings,
    setTotal,
    listingType,
    setIsLoading,
    setBoundary,
    setCurrentZoom,
  } = useListingsStore();

  // Fetch representative listing pins for the current viewport.
  // The server always returns Listing[] (DISTINCT ON representative pins or raw listings).
  // Uses setListings (replace) not addListings (merge) so panning to a new area
  // shows only the pins relevant to the current viewport — no stale pins from prior areas.
  const fetchListingsForBounds = useDebouncedCallback(async (bounds: [number, number, number, number]) => {
    if (drawActive || boundary) return;
    try {
      setIsLoading(true);
      const zoom = mapRef.current?.getMap()?.getZoom() ?? 14;
      const data = await fetchViewportListings(bounds, listingType, zoom);
      setListings(Array.isArray(data.listings) ? data.listings : []);
      setTotal(data.total ?? 0);
    } catch (err) {
      console.error("Failed to fetch listings:", err);
    } finally {
      setIsLoading(false);
    }
  }, 150);

  // Refresh viewport listings when theme switches dark⟷light.
  // Style reload doesn't fire onMoveEnd, so markers stay blank until next pan/zoom.
  useEffect(() => {
    if (!mapLoaded) return;
    const map = mapRef.current?.getMap();
    if (!map) return;

    const refreshViewport = () => {
      if (drawActive || boundary) return;
      const bounds = map.getBounds();
      if (bounds) {
        const b: [number, number, number, number] = [
          bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth(),
        ];
        setViewportBounds(b);
        fetchListingsForBounds(b);
      }
    };

    if (map.isStyleLoaded()) {
      refreshViewport();
    } else {
      map.once("style.load", refreshViewport);
    }

    return () => { try { map.off("style.load", refreshViewport); } catch {} };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDark]); // Only re-run on theme toggle


  // Fit map to city boundary + fetch city polygon from OSM
  useEffect(() => {
    if (boundary?.type === "city" && boundary.bbox && mapRef.current) {
      mapRef.current.fitBounds(
        [[boundary.bbox[0], boundary.bbox[1]], [boundary.bbox[2], boundary.bbox[3]]],
        { padding: 40, duration: 1000 }
      );

      // Fetch OSM boundary polygon
      if (boundary.center) {
        const { lat, lng } = boundary.center;
        const placeName = boundary.label || "";

        (async () => {
          let geometry: any = null;
          let realBbox: [number, number, number, number] | null = null;

          try {
            const bRes = await fetch(
              `${API_BASE_URL}/api/mappls/boundary?name=${encodeURIComponent(placeName)}&lat=${lat}&lng=${lng}`
            );
            if (bRes.ok) {
              const bData = await bRes.json();
              if (bData.boundary) {
                geometry = bData.boundary;
                if (bData.bbox && bData.bbox.length === 4) {
                  const [south, north, west, east] = bData.bbox.map(Number);
                  realBbox = [west, south, east, north];
                }
              }
            }
          } catch {}

          // Fallback: circle based on place type
          if (!geometry) {
            const radiusKm =
              boundary.placeType === "STATE" ? 50 :
              boundary.placeType === "CITY" ? 12 :
              boundary.placeType === "LOCALITY" ? 2.5 :
              boundary.placeType === "SUB_LOCALITY" ? 1 : 0.8;
            geometry = makeCircle(lat, lng, radiusKm);
          }

          // Render boundary on map
          setBoundaryGeoJSON({
            type: "FeatureCollection",
            features: [{ type: "Feature", properties: {}, geometry }],
          });

          // Re-fit to real boundary bounds
          if (realBbox) {
            mapRef.current?.fitBounds(
              [[realBbox[0], realBbox[1]], [realBbox[2], realBbox[3]]],
              { padding: 60, duration: 800 }
            );
          }

          // Fetch listings inside this boundary geometry
          try {
            setIsLoading(true);
            const data = await fetchPolygonListings({ geometry, listingType });
            setListings(data);
          } catch (err) {
            console.error("Failed to fetch city polygon listings:", err);
          } finally {
            setIsLoading(false);
          }
        })();
      }
    }

    // Clear draw and boundary overlays when boundary is removed
    if (!boundary) {
      committedFeaturesRef.current = [];
      setCommittedGeoJSON(EMPTY_FC);
      setBoundaryGeoJSON(null);

      // Refetch viewport listings immediately
      const map = mapRef.current?.getMap();
      if (map) {
        const bounds = map.getBounds();
        if (bounds) {
          const b: [number, number, number, number] = [
            bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth(),
          ];
          setViewportBounds(b);
          fetchListingsForBounds(b);
        }
      }
    }
  }, [boundary]);

  // Toggle drawing mode
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
      dragPointsRef.current = [];
      isDrawingRef.current = false;
      setIsDrawingSession(false);
    }
  }, [drawActive, mapLoaded]);

  const handleMoveEnd = useDebouncedCallback((_evt: ViewStateChangeEvent) => {
    const map = mapRef.current;
    if (!map) return;
    const zoom = map.getMap().getZoom();
    setCurrentZoom(zoom);
    const bounds = map.getMap().getBounds();
    if (bounds) {
      const b: [number, number, number, number] = [
        bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth(),
      ];
      setViewportBounds(b);
      fetchListingsForBounds(b);
    }
  }, 150);

  const handleLoad = useCallback(() => {
    setMapLoaded(true);
    const map = mapRef.current;
    if (!map) return;
    const zoom = map.getMap().getZoom();
    setCurrentZoom(zoom);
    const bounds = map.getMap().getBounds();
    if (bounds) {
      const b: [number, number, number, number] = [
        bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth(),
      ];
      setViewportBounds(b);
      fetchListingsForBounds(b);
    }
  }, [setViewportBounds, setCurrentZoom]);


  // Draw handlers
  const updateDrawSource = useCallback(() => {
    const raw = mapRef.current?.getMap();
    if (!raw) return;
    const source = raw.getSource(DRAW_SOURCE_ID) as any;
    if (source) {
      const live = buildDrawGeoJSON(dragPointsRef.current);
      source.setData({ type: "FeatureCollection", features: [...committedFeaturesRef.current, ...live.features] });
    }
  }, []);

  // Fix #6: Multiple polygons — use updateBoundary (keeps drawActive) instead of setBoundary
  const completeDraw = useCallback(async () => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    const pts = dragPointsRef.current;
    dragPointsRef.current = [];
    if (pts.length >= 3) {
      const closed = [...pts, pts[0]];
      const newFeature: GeoJSON.Feature = { type: "Feature", geometry: { type: "Polygon", coordinates: [closed] }, properties: {} };
      const updated = [...committedFeaturesRef.current, newFeature];
      committedFeaturesRef.current = updated;
      setCommittedGeoJSON({ type: "FeatureCollection", features: updated });

      // Don't call setBoundary (which turns off drawActive) — keep drawing mode on
      // Just use setBoundary which will also keep drawActive since we're in draw mode
      // Actually: use the store directly with a custom partial set
      useListingsStore.setState({
        boundary: { type: "polygon", coordinates: closed, label: "Custom Area" },
        // Note: Don't set drawActive to false — allow multiple polygons
      });

      // Fetch listings inside the drawn polygon
      try {
        setIsLoading(true);
        const data = await fetchPolygonListings({ coordinates: closed, listingType });
        addListings(data);
      } catch (err) {
        console.error("Failed to fetch polygon listings:", err);
      } finally {
        setIsLoading(false);
      }
    }
    setIsDrawingSession(false);
  }, [setIsLoading, addListings, listingType]);

  const handleMouseDown = useCallback((e: any) => {
    if (!drawActive) return;
    isDrawingRef.current = true;
    dragPointsRef.current = [[e.lngLat.lng, e.lngLat.lat]];
    setIsDrawingSession(true);
  }, [drawActive]);

  const handleMouseMove = useCallback((e: any) => {
    if (!drawActive || !isDrawingRef.current) return;
    const [lng, lat] = [e.lngLat.lng, e.lngLat.lat];
    const pts = dragPointsRef.current;
    const last = pts[pts.length - 1];
    if (!last || Math.abs(lng - last[0]) > MIN_POINT_DISTANCE || Math.abs(lat - last[1]) > MIN_POINT_DISTANCE) {
      dragPointsRef.current = [...pts, [lng, lat]];
      updateDrawSource();
    }
  }, [drawActive, updateDrawSource]);

  const handleMouseUp = useCallback((_e: any) => {
    if (!drawActive) return;
    completeDraw();
  }, [drawActive, completeDraw]);

  return (
    <View style={styles.container}>
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
        onClick={() => {
          // If a marker was clicked, skip clearing — the marker's handler already
          // set the selection and the Map onClick fires right after it.
          if (markerClickedRef.current) {
            markerClickedRef.current = false;
            return;
          }
          setSelectedListing(null);
        }}
        attributionControl={false}
        reuseMaps
      >
        <NavigationControl position="top-right" showCompass={false} />
        <GeolocateControl position="top-right" trackUserLocation={false} showAccuracyCircle={false} />

        {/* Draw layer */}
        {(isDrawingSession || boundary?.type === "polygon") && (
          <Source id={DRAW_SOURCE_ID} type="geojson" data={committedGeoJSON}>
            <Layer id="draw-fill" type="fill" filter={["==", "$type", "Polygon"]} paint={{ "fill-color": colors.drawColor, "fill-opacity": 0.12 }} />
            <Layer id="draw-line" type="line" filter={["any", ["==", "$type", "LineString"], ["==", "$type", "Polygon"]]} paint={{ "line-color": colors.drawColor, "line-width": 2.5 }} />
            {isDrawingSession && (
              <Layer id="draw-start-dot" type="circle" filter={["==", "$type", "Point"]} paint={{ "circle-radius": 6, "circle-color": colors.drawColor, "circle-stroke-color": "#fff", "circle-stroke-width": 2 }} />
            )}
          </Source>
        )}

        {/* City boundary polygon overlay */}
        {boundaryGeoJSON && boundary?.type === "city" && (
          <Source id={BOUNDARY_SOURCE_ID} type="geojson" data={boundaryGeoJSON}>
            <Layer id="boundary-fill" type="fill" paint={{ "fill-color": colors.drawColor, "fill-opacity": 0.12 }} />
            <Layer id="boundary-line" type="line" paint={{ "line-color": colors.drawColor, "line-width": 2 }} />
          </Source>
        )}

        {/* ── Price pins — one per listing, all zoom levels ───────────────────── */}
        {mapLoaded && listings.map((listing) => {
          const isActive = selectedListing?.id === listing.id;
          const bg = isActive ? colors.markerBgActive : colors.markerBg;
          return (
            <Marker key={listing.id} longitude={listing.longitude} latitude={listing.latitude} anchor="bottom"
              onClick={(e: any) => {
                markerClickedRef.current = true;
                setSelectedListing(listing);
              }}>
              <div style={{ position: "relative", cursor: "pointer" }}>
                <div style={{
                  padding: "4px 10px",
                  background: bg,
                  color: colors.markerText,
                  borderRadius: 6,
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  whiteSpace: "nowrap",
                  boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
                  transform: isActive ? "scale(1.12)" : "scale(1)",
                  transition: "transform 150ms cubic-bezier(0.34,1.56,0.64,1), background 150ms",
                  zIndex: isActive ? 10 : 1,
                }}>
                  {formatPrice(listing.price)}
                </div>
                {/* Drop arrow */}
                <div style={{
                  position: "absolute",
                  bottom: -5, left: "50%",
                  transform: "translateX(-50%)",
                  width: 0, height: 0,
                  borderLeft: "5px solid transparent",
                  borderRight: "5px solid transparent",
                  borderTop: `5px solid ${bg}`,
                }} />
              </div>
            </Marker>
          );
        })}
      </Map>
    </View>
  );
}


const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
