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
import Supercluster from "supercluster";
import { useDebouncedCallback } from "use-debounce";
import "mapbox-gl/dist/mapbox-gl.css";

import { useColorScheme } from "@/components/useColorScheme";
import { useListingsStore, type Listing } from "@/store/listings";
import { DRAW_COLOR, MAP_STYLES, COLORS, API_BASE_URL } from "@/lib/theme";
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

function createClusterIndex(listings: Listing[]) {
  const index = new Supercluster({ radius: 40, maxZoom: 20, minZoom: 0 });
  const points: Supercluster.PointFeature<{ listing: Listing }>[] = listings.map((listing) => ({
    type: "Feature",
    geometry: { type: "Point", coordinates: [listing.longitude, listing.latitude] },
    properties: { listing },
  }));
  index.load(points);
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

export default function MapViewWeb() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = isDark ? COLORS.dark : COLORS.light;
  const mapRef = useRef<MapRef>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [isDrawingSession, setIsDrawingSession] = useState(false);
  const [committedGeoJSON, setCommittedGeoJSON] = useState<GeoJSON.FeatureCollection>(EMPTY_FC);
  const [boundaryGeoJSON, setBoundaryGeoJSON] = useState<GeoJSON.FeatureCollection | null>(null);
  const committedFeaturesRef = useRef<GeoJSON.Feature[]>([]);
  const dragPointsRef = useRef<number[][]>([]);
  const isDrawingRef = useRef(false);

  const mapStyle = useMemo(() => MAP_STYLES[isDark ? "dark" : "light"], [isDark]);

  // Dark mode map config
  const DARK_MAP_CONFIG = {
    lightPreset: "dusk",
    colorMotorways: "hsl(60, 100%, 50%)",
    colorTrunks: "hsl(60, 100%, 50%)",
  };

  // When switching styles (light/dark), apply theme config and fix label spellings
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map || !mapLoaded) return;

    const applyStyleSettings = () => {
      if (isDark) {
        try {
          map.setConfigProperty("basemap", "lightPreset", DARK_MAP_CONFIG.lightPreset);
          map.setConfigProperty("basemap", "colorMotorways", DARK_MAP_CONFIG.colorMotorways);
          map.setConfigProperty("basemap", "colorTrunks", DARK_MAP_CONFIG.colorTrunks);
        } catch {}
      }

      // Override text-field to use the raw `name` field which has correct English
      // spellings (e.g. "Secunderabad" not "Sikandarabad").
      // For Standard style: layer.layout is empty in getStyle(), so we use
      // getLayoutProperty() to check the runtime text-field value.
      try {
        const style = map.getStyle();
        if (style && style.layers) {
          style.layers.forEach((layer: any) => {
            // Skip shield layers — they use ["get", "ref"] for route numbers
            if (layer.id && layer.id.includes("shield")) return;
            try {
              const tf = map.getLayoutProperty(layer.id, "text-field");
              if (tf) {
                map.setLayoutProperty(layer.id, "text-field", ["get", "name"]);
              }
            } catch {}
          });
        }
      } catch {}
    };

    // Apply immediately for the current style
    applyStyleSettings();
    // Also apply when new style finishes loading (theme switch)
    map.on("style.load", applyStyleSettings);
    return () => { map.off("style.load", applyStyleSettings); };
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
    listingType,
    setIsLoading,
    setBoundary,
  } = useListingsStore();

  // Fetch listings when viewport changes
  const fetchListingsForBounds = useDebouncedCallback(async (bounds: [number, number, number, number]) => {
    if (drawActive || boundary) return;
    try {
      setIsLoading(true);
      const data = await fetchViewportListings(bounds, listingType);
      addListings(data);
    } catch (err) {
      console.error("Failed to fetch listings:", err);
    } finally {
      setIsLoading(false);
    }
  }, 500);

  // Cluster index
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
    } catch { return []; }
  }, [clusterIndex, viewportBounds]);

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
    const bounds = map.getMap().getBounds();
    if (bounds) {
      const b: [number, number, number, number] = [
        bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth(),
      ];
      setViewportBounds(b);
      fetchListingsForBounds(b);
    }
  }, 300);

  const handleLoad = useCallback(() => {
    setMapLoaded(true);
    const map = mapRef.current;
    if (!map) return;
    const bounds = map.getMap().getBounds();
    if (bounds) {
      const b: [number, number, number, number] = [
        bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth(),
      ];
      setViewportBounds(b);
      fetchListingsForBounds(b);
    }
  }, [setViewportBounds]);

  const handleClusterClick = useCallback((clusterId: number) => {
    try {
      const leaves = (clusterIndex as any).getLeaves(clusterId, 100);
      const coords = leaves.map((l: any) => l.geometry.coordinates as [number, number]);
      if (coords.length === 0) return;
      const map = mapRef.current?.getMap();
      if (!map) return;
      if (coords.length === 1) {
        map.flyTo({ center: coords[0], zoom: 16, duration: 800 });
        return;
      }
      let [minLng, minLat, maxLng, maxLat] = [coords[0][0], coords[0][1], coords[0][0], coords[0][1]];
      for (const [lng, lat] of coords) {
        if (lng < minLng) minLng = lng; if (lat < minLat) minLat = lat;
        if (lng > maxLng) maxLng = lng; if (lat > maxLat) maxLat = lat;
      }
      map.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: 80, maxZoom: 16, duration: 800 });
    } catch (err) { console.error("Cluster click error:", err); }
  }, [clusterIndex]);

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
        onClick={() => setSelectedListing(null)}
        attributionControl={false}
        reuseMaps
      >
        <NavigationControl position="top-right" showCompass={false} />
        <GeolocateControl position="top-right" trackUserLocation={false} showAccuracyCircle={false} />

        {/* Draw layer */}
        {(isDrawingSession || boundary?.type === "polygon") && (
          <Source id={DRAW_SOURCE_ID} type="geojson" data={committedGeoJSON}>
            <Layer id="draw-fill" type="fill" filter={["==", "$type", "Polygon"]} paint={{ "fill-color": DRAW_COLOR, "fill-opacity": 0.12 }} />
            <Layer id="draw-line" type="line" filter={["any", ["==", "$type", "LineString"], ["==", "$type", "Polygon"]]} paint={{ "line-color": DRAW_COLOR, "line-width": 2.5 }} />
            {isDrawingSession && (
              <Layer id="draw-start-dot" type="circle" filter={["==", "$type", "Point"]} paint={{ "circle-radius": 6, "circle-color": DRAW_COLOR, "circle-stroke-color": "#fff", "circle-stroke-width": 2 }} />
            )}
          </Source>
        )}

        {/* City boundary polygon overlay */}
        {boundaryGeoJSON && boundary?.type === "city" && (
          <Source id={BOUNDARY_SOURCE_ID} type="geojson" data={boundaryGeoJSON}>
            <Layer id="boundary-fill" type="fill" paint={{ "fill-color": DRAW_COLOR, "fill-opacity": 0.12 }} />
            <Layer id="boundary-line" type="line" paint={{ "line-color": DRAW_COLOR, "line-width": 2 }} />
          </Source>
        )}

        {/* Price markers — inline styles (NativeWind strips custom CSS classes) */}
        {mapLoaded && clusters.map((cluster) => {
          const [lng, lat] = cluster.geometry.coordinates;
          if (!isFinite(lng) || !isFinite(lat)) return null;
          const isCluster = cluster.properties.cluster;

          if (isCluster) {
            const clusterId = cluster.properties.cluster_id ?? 0;
            return (
              <Marker key={`c-${clusterId}`} longitude={lng} latitude={lat} anchor="center"
                onClick={(e: any) => { e.originalEvent?.stopPropagation(); handleClusterClick(clusterId); }}>
                <div style={{
                  width: 14, height: 14, borderRadius: 7,
                  background: colors.markerBg,
                  border: `2px solid ${colors.markerText}`,
                  boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
                  cursor: "pointer",
                  transition: "transform 150ms cubic-bezier(0.34,1.56,0.64,1)",
                }} onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.3)")}
                   onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")} />
              </Marker>
            );
          }

          const listing = cluster.properties.listing as Listing;
          const isActive = selectedListing?.id === listing.id;
          const bg = isActive ? colors.markerBgActive : colors.markerBg;
          return (
            <Marker key={listing.id} longitude={lng} latitude={lat} anchor="bottom"
              onClick={(e: any) => { e.originalEvent?.stopPropagation(); setSelectedListing(listing); }}>
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
