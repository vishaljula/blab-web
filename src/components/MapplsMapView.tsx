"use client";

import { useRef, useCallback, useEffect, useState, useMemo } from "react";
import { useTheme } from "next-themes";
import { useDebouncedCallback } from "use-debounce";
import Supercluster from "supercluster";
import { useListingsStore, type Listing } from "@/store/listings";
import { DRAW_COLOR } from "@/lib/theme";
import { formatPrice } from "@/lib/format";

const INITIAL_CENTER: [number, number] = [17.385, 78.4867];
const INITIAL_ZOOM = 12;
const MIN_POINT_DISTANCE = 0.0005;

// Background color matching the Mappls tile palette — shown while tiles load
// instead of white flash. Eliminates perceived loading lag during fast panning.
const MAP_BG_LIGHT = "#f0ede5";
const MAP_BG_DARK = "#1a1a1a";

// Safely extract viewport bounds from a Mappls map object
function safeGetBounds(map: any): [number, number, number, number] | null {
  try {
    const b = map.getBounds?.();
    if (!b) return null;
    // Mappls getBounds may return {_sw, _ne} or have getWest/getSouth methods
    if (typeof b.getWest === 'function') {
      return [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
    }
    if (b._sw && b._ne) {
      return [b._sw.lng, b._sw.lat, b._ne.lng, b._ne.lat];
    }
  } catch {}
  return null;
}

// Source/layer IDs for draw and boundary overlays
const DRAW_SOURCE = "freehand-draw-source";
const BOUNDARY_SOURCE = "boundary-source";

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
  if (pts.length >= 1) {
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: pts[0] },
      properties: {},
    });
  }
  return { type: "FeatureCollection", features };
}

function createClusterIndex(listings: Listing[]) {
  const index = new Supercluster({ radius: 40, maxZoom: 20, minZoom: 0 });
  index.load(
    listings.map((l) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [l.longitude, l.latitude] },
      properties: { listing: l },
    }))
  );
  return index;
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

export default function MapplsMapView() {
  const mapRef = useRef<any>(null);
  const mapplsRef = useRef<any>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  // Drawing state
  const committedFeaturesRef = useRef<GeoJSON.Feature[]>([]);
  const dragPointsRef = useRef<number[][]>([]);
  const isDrawingRef = useRef(false);
  const markersRef = useRef<any[]>([]);

  const {
    boundary,
    drawActive,
    updateBoundary,
    updateBoundaryGeometry,
    setViewportBounds,
    listings,
    selectedListing,
    viewportBounds,
  } = useListingsStore();

  // ── Initialize Mappls map ──────────────────────────────────────────
  useEffect(() => {
    let mounted = true;

    // Polls until the Mappls map's internal MapLibre instance is fully wired.
    // The SDK fires "load" before methods like getZoom/getBounds are available.
    function waitForMapReady(
      map: any,
      onReady: () => void,
      maxAttempts = 50 // 50 × 100ms = 5s max
    ) {
      let attempts = 0;
      const interval = setInterval(() => {
        if (!mounted) { clearInterval(interval); return; }
        attempts++;
        try {
          // These calls throw if the internal MapLibre map isn't wired yet
          const zoom = map.getZoom();
          const bounds = map.getBounds();
          if (typeof zoom === "number" && bounds) {
            clearInterval(interval);
            onReady();
          }
        } catch {
          // Not ready yet — keep polling
        }
        if (attempts >= maxAttempts) {
          clearInterval(interval);
          console.error("Mappls map failed to become ready after 5s");
        }
      }, 100);
    }

    async function loadMap() {
      try {
        const tokenRes = await fetch("/api/mappls/token");
        if (!tokenRes.ok) {
          setMapError("Failed to get Mappls token");
          return;
        }
        const { token } = await tokenRes.json();

        const { mappls } = await import("mappls-web-maps");
        const mapplsClass = new mappls();

        mapplsClass.initialize(
          token,
          {
            map: true,
            layer: "vector",
            version: "3.0",
            auth: "legacy",
          },
          () => {
            if (!mounted) return;

            const map = mapplsClass.Map({
              id: "mappls-main-map",
              properties: {
                center: INITIAL_CENTER,
                zoom: INITIAL_ZOOM,
                zoomControl: false,
                location: false,
                backgroundColor: MAP_BG_LIGHT,
                maxTileCacheSize: 200,
              },
            });

            map.on("load", () => {
              if (!mounted) return;
              mapRef.current = map;
              mapplsRef.current = mapplsClass;

              // Poll until the map's internal state is truly ready
              waitForMapReady(map, () => {
                if (!mounted) return;
                try {
                  map.addControl(new (mapplsClass as any).NavigationControl(), "top-right");
                } catch {}
                setMapLoaded(true);
                const bounds = safeGetBounds(map);
                if (bounds) setViewportBounds(bounds);
              });
            });
          }
        );
      } catch (err) {
        setMapError(`Map init failed: ${err}`);
      }
    }

    loadMap();
    return () => { mounted = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Dark mode: CSS filter approach ─────────────────────────────────
  // Mappls doesn't expose style-switching like Mapbox; use CSS inversion
  useEffect(() => {
    const container = document.getElementById("mappls-main-map");
    if (!container) return;
    if (isDark) {
      container.style.filter = "invert(1) hue-rotate(180deg)";
      container.style.background = "#1a1a1a";
    } else {
      container.style.filter = "";
      container.style.background = "";
    }
  }, [isDark, mapLoaded]);

  // ── Viewport tracking ──────────────────────────────────────────────
  const handleMoveEnd = useDebouncedCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const bounds = safeGetBounds(map);
    if (bounds) setViewportBounds(bounds);
  }, 300);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    map.on("moveend", handleMoveEnd);
    return () => { try { map.off("moveend", handleMoveEnd); } catch {} };
  }, [mapLoaded, handleMoveEnd]);

  // ── Price markers ──────────────────────────────────────────────────
  const clusterIndex = useMemo(() => createClusterIndex(listings), [listings]);

  const clusters = useMemo(() => {
    if (!viewportBounds) return [];
    try {
      const lngDelta = Math.abs(viewportBounds[2] - viewportBounds[0]);
      const zoom = Math.round(Math.log2(360 / lngDelta));
      return clusterIndex.getClusters(
        [viewportBounds[0], viewportBounds[1], viewportBounds[2], viewportBounds[3]],
        Math.min(Math.max(zoom, 0), 16)
      );
    } catch {
      return [];
    }
  }, [clusterIndex, viewportBounds]);

  useEffect(() => {
    const map = mapRef.current;
    const mapplsClass = mapplsRef.current;
    if (!map || !mapplsClass || !mapLoaded) return;

    // Clear old markers
    markersRef.current.forEach((m) => {
      try { mapplsClass.removeLayer({ map, layer: m }); } catch {}
    });
    markersRef.current = [];

    clusters.forEach((cluster) => {
      const [lng, lat] = cluster.geometry.coordinates;
      if (!isFinite(lng) || !isFinite(lat)) return;
      const isCluster = cluster.properties.cluster;

      if (isCluster) {
        const count = cluster.properties.point_count || 0;
        try {
          const marker = mapplsClass.Marker({
            map,
            position: { lat, lng },
            fitbounds: false,
            html: `<div style="
              display:flex;align-items:center;justify-content:center;
              width:32px;height:32px;border-radius:50%;
              background:#5a1a00;color:#fff;font-size:12px;font-weight:700;
              font-family:system-ui,sans-serif;
              box-shadow:0 1px 4px rgba(0,0,0,0.4);
            ">${count}</div>`,
            width: 32,
            height: 32,
          });
          markersRef.current.push(marker);
        } catch {}
      } else {
        const listing = cluster.properties.listing as Listing;
        const isActive = selectedListing?.id === listing.id;
        try {
          const marker = mapplsClass.Marker({
            map,
            position: { lat, lng },
            fitbounds: false,
            html: `<div style="
              background:${isActive ? "#fff" : "#5a1a00"};
              color:${isActive ? "#5a1a00" : "#fff"};
              padding:3px 8px;border-radius:6px;
              font-size:12px;font-weight:600;
              font-family:system-ui,sans-serif;
              white-space:nowrap;cursor:pointer;
              box-shadow:0 1px 3px rgba(0,0,0,0.4);
              border:${isActive ? "2px solid #5a1a00" : "none"};
              transform:translateY(${isActive ? "-4px" : "0"});
            ">${formatPrice(listing.price)}</div>`,
            width: 60,
            height: 24,
          });
          markersRef.current.push(marker);
        } catch {}
      }
    });
  }, [clusters, mapLoaded, selectedListing]);

  // ── Draw mode: toggle map interactions ──────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    try {
      if (drawActive) {
        map.dragPan?.disable?.();
        map.doubleClickZoom?.disable?.();
        map.getCanvas().style.cursor = "crosshair";
      } else {
        map.dragPan?.enable?.();
        map.doubleClickZoom?.enable?.();
        map.getCanvas().style.cursor = "";
        dragPointsRef.current = [];
        isDrawingRef.current = false;
      }
    } catch {}
  }, [drawActive, mapLoaded]);

  // When boundary is cleared, remove draw source/layers
  useEffect(() => {
    if (!boundary) {
      committedFeaturesRef.current = [];
      const map = mapRef.current;
      if (map) {
        try {
          if (map.getLayer("draw-fill")) map.removeLayer("draw-fill");
          if (map.getLayer("draw-line")) map.removeLayer("draw-line");
          if (map.getLayer("draw-dot")) map.removeLayer("draw-dot");
          if (map.getSource(DRAW_SOURCE)) map.removeSource(DRAW_SOURCE);
        } catch {}
        // Also remove boundary overlay
        try {
          if (map.getLayer("boundary-fill")) map.removeLayer("boundary-fill");
          if (map.getLayer("boundary-line")) map.removeLayer("boundary-line");
          if (map.getSource(BOUNDARY_SOURCE)) map.removeSource(BOUNDARY_SOURCE);
        } catch {}
      }
    }
  }, [boundary]);

  // ── Draw: imperative source update ─────────────────────────────────
  const updateDrawSource = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const live = buildDrawGeoJSON(dragPointsRef.current);
    const allFeatures = [...committedFeaturesRef.current, ...live.features];
    const data: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: allFeatures };

    try {
      const src = map.getSource(DRAW_SOURCE);
      if (src) {
        src.setData(data);
      } else {
        map.addSource(DRAW_SOURCE, { type: "geojson", data });
        map.addLayer({
          id: "draw-fill", type: "fill", source: DRAW_SOURCE,
          filter: ["==", "$type", "Polygon"],
          paint: { "fill-color": DRAW_COLOR, "fill-opacity": 0.12 },
        });
        map.addLayer({
          id: "draw-line", type: "line", source: DRAW_SOURCE,
          filter: ["any", ["==", "$type", "LineString"], ["==", "$type", "Polygon"]],
          paint: { "line-color": DRAW_COLOR, "line-width": 2.5 },
        });
        map.addLayer({
          id: "draw-dot", type: "circle", source: DRAW_SOURCE,
          filter: ["==", "$type", "Point"],
          paint: {
            "circle-radius": 6, "circle-color": DRAW_COLOR,
            "circle-stroke-color": "#fff", "circle-stroke-width": 2,
          },
        });
      }
    } catch {}
  }, []);

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
      const updatedFeatures = [...committedFeaturesRef.current, newFeature];
      committedFeaturesRef.current = updatedFeatures;
      updateDrawSource();
      updateBoundary({ type: "polygon", coordinates: closed, label: "Custom Area" });
    }
  }, [updateBoundary, updateDrawSource]);

  // ── Draw: mouse events ─────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    const onMouseDown = (e: any) => {
      if (!drawActive) return;
      isDrawingRef.current = true;
      const lng = e.lngLat?.lng ?? e.lngLat?.[0];
      const lat = e.lngLat?.lat ?? e.lngLat?.[1];
      dragPointsRef.current = [[lng, lat]];
    };

    const onMouseMove = (e: any) => {
      if (!drawActive || !isDrawingRef.current) return;
      const lng = e.lngLat?.lng ?? e.lngLat?.[0];
      const lat = e.lngLat?.lat ?? e.lngLat?.[1];
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

    const onMouseUp = () => {
      if (!drawActive) return;
      completeDraw();
    };

    map.on("mousedown", onMouseDown);
    map.on("mousemove", onMouseMove);
    map.on("mouseup", onMouseUp);

    return () => {
      try {
        map.off("mousedown", onMouseDown);
        map.off("mousemove", onMouseMove);
        map.off("mouseup", onMouseUp);
      } catch {}
    };
  }, [mapLoaded, drawActive, updateDrawSource, completeDraw]);

  // ── Draw: touch events ─────────────────────────────────────────────
  // Standard map-drawing pattern: single finger = draw, second finger = cancel draw + zoom
  useEffect(() => {
    if (!mapLoaded || !drawActive) return;
    const map = mapRef.current;
    const canvas = map?.getCanvas?.();
    if (!canvas) return;

    const getCoords = (touch: Touch) => {
      const rect = canvas.getBoundingClientRect();
      const x = touch.clientX - rect.left;
      const y = touch.clientY - rect.top;
      return map.unproject([x, y]);
    };

    // Cancel an in-progress draw and clear the partial visual
    const cancelDraw = () => {
      isDrawingRef.current = false;
      dragPointsRef.current = [];
      updateDrawSource(); // remove partial line/polygon from the map
      // Temporarily re-enable map gestures so pinch-zoom works
      try { map.dragPan?.enable?.(); } catch {}
    };

    const onTouchStart = (e: TouchEvent) => {
      if (!drawActive) return;
      // Only start drawing with a single finger
      if (e.touches.length !== 1) {
        // Multi-touch detected at start — don't draw, let browser handle
        return;
      }
      e.preventDefault();
      const lngLat = getCoords(e.touches[0]);
      isDrawingRef.current = true;
      dragPointsRef.current = [[lngLat.lng, lngLat.lat]];
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!drawActive) return;
      // Second finger appeared mid-stroke — cancel the draw, let pinch-zoom work
      if (e.touches.length > 1) {
        if (isDrawingRef.current) cancelDraw();
        return; // don't preventDefault — let browser handle pinch
      }
      if (!isDrawingRef.current) return;
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
      // Only complete if we were actually drawing (not canceled by pinch)
      if (isDrawingRef.current) {
        e.preventDefault();
        completeDraw();
      }
      // Always re-disable dragPan in draw mode (may have been enabled by cancelDraw during pinch)
      try { map.dragPan?.disable?.(); } catch {}
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

  // ── City boundary: fitBounds + render boundary polygon/circle ──────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    if (boundary?.type === "city" && boundary.bbox && !boundary.geometry) {
      // Initial fly — use synthetic bbox as a rough first position
      // Wrapped in try/catch: the SDK's fitBounds internally calls getZoom()
      // on its MapLibre instance, which can be undefined intermittently.
      try {
        map.fitBounds(
          [
            [boundary.bbox[0], boundary.bbox[1]],
            [boundary.bbox[2], boundary.bbox[3]],
          ],
          { padding: 40, duration: 600 }
        );
      } catch {}

      // Remove previous boundary overlay
      try {
        if (map.getLayer("boundary-fill")) map.removeLayer("boundary-fill");
        if (map.getLayer("boundary-line")) map.removeLayer("boundary-line");
        if (map.getSource(BOUNDARY_SOURCE)) map.removeSource(BOUNDARY_SOURCE);
      } catch {}

      // Fetch OSM polygon, fallback to circle
      if (boundary.center) {
        const { lat, lng } = boundary.center;
        const placeName = boundary.label || "";

        (async () => {
          let geometry: any = null;
          let realBbox: [number, number, number, number] | null = null;

          // Try OSM polygon
          try {
            const bRes = await fetch(
              `/api/mappls/boundary?name=${encodeURIComponent(placeName)}&lat=${lat}&lng=${lng}`
            );
            if (bRes.ok) {
              const bData = await bRes.json();
              if (bData.boundary) {
                geometry = bData.boundary;
                // OSM bbox is [south, north, west, east] — convert to [w, s, e, n]
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

          // Store the actual polygon geometry back to Zustand so page.tsx
          // can use it for listing queries instead of viewport bounds.
          // Note: this updates boundary which re-triggers this effect, but
          // the !boundary.geometry guard above prevents re-execution.
          updateBoundaryGeometry(geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon);

          try {
            map.addSource(BOUNDARY_SOURCE, {
              type: "geojson",
              data: { type: "Feature", properties: {}, geometry },
            });
            map.addLayer({
              id: "boundary-fill", type: "fill", source: BOUNDARY_SOURCE,
              paint: { "fill-color": DRAW_COLOR, "fill-opacity": 0.12 },
            });
            map.addLayer({
              id: "boundary-line", type: "line", source: BOUNDARY_SOURCE,
              paint: { "line-color": DRAW_COLOR, "line-width": 2 },
            });
          } catch (err) {
            console.warn("Boundary render failed:", err);
          }

          // Re-fit to the actual boundary bbox so the entire polygon is visible
          if (realBbox) {
            try {
              map.fitBounds(
                [
                  [realBbox[0], realBbox[1]],
                  [realBbox[2], realBbox[3]],
                ],
                { padding: 60, duration: 800 }
              );
            } catch {}
          }
        })();
      }
    }
  }, [boundary, mapLoaded, updateBoundaryGeometry]);

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <div className="map-container" id="map-container" style={{ position: "relative", width: "100%", height: "100%" }}>
      <div
        id="mappls-main-map"
        style={{
          width: "100%",
          height: "100%",
          transition: "filter 0.3s",
          backgroundColor: isDark ? MAP_BG_DARK : MAP_BG_LIGHT,
        }}
      />

      {mapError && (
        <div
          style={{
            position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
            padding: "16px 24px", background: "rgba(200,0,0,0.9)", borderRadius: 12,
            color: "#fff", fontSize: 14, textAlign: "center", zIndex: 10,
          }}
        >
          {mapError}
        </div>
      )}
    </div>
  );
}
