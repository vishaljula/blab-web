/**
 * MapView — Native version
 * Uses @rnmapbox/maps for high performance native map rendering on iOS/Android.
 */

import { useRef, useCallback, useEffect, useState, useMemo } from "react";
import { View, StyleSheet, PanResponder, Pressable, Text, Keyboard } from "react-native";
import Mapbox from "@rnmapbox/maps";
import Supercluster from "supercluster";
import { useDebouncedCallback } from "use-debounce";

import { useColorScheme } from "@/components/useColorScheme";
import { useListingsStore, type Listing } from "@/store/listings";
import { DRAW_COLOR, MAP_STYLES, DARK_MAP_CONFIG, COLORS, API_BASE_URL } from "@/lib/theme";
import { formatPrice } from "@/lib/format";
import { fetchViewportListings, fetchPolygonListings } from "@/lib/api";

const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN || "";
Mapbox.setAccessToken(MAPBOX_TOKEN);

const DRAW_SOURCE_ID = "freehand-draw-source";
const LIVE_DRAW_SOURCE_ID = "live-draw-source"; // live stroke while finger is down
const BOUNDARY_SOURCE_ID = "boundary-source";   // city/search boundary polygon
const EMPTY_FC: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

const INITIAL_VIEW = {
  latitude: 17.385,
  longitude: 78.4867,
  zoom: 12,
};

// Builds the GeoJSON rendered as the live pencil stroke during freehand drawing.
// Emits a LineString (the path), a Point (start dot), and optionally a Polygon
// (filled shape preview). Polygon is only shown when closed=true.
function buildDrawGeoJSON(pts: number[][], closed = false): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];

  if (pts.length >= 2) {
    features.push({
      type: "Feature",
      geometry: { type: "LineString", coordinates: pts },
      properties: {},
    });
  }

  if (closed && pts.length >= 3) {
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

// Builds a Supercluster index from the current listings array.
// Called inside useMemo so the index is only rebuilt when listings change.
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

// Module-level variable — survives tab switches (MapView unmounts/remounts when
// navigating between Map and List tabs). Polygon drawings must persist across those
// unmounts so they don't disappear when the user switches tabs.
let globalPolygons: GeoJSON.Feature[] = [];

// Similarly persists the last known camera position (zoom + center) across tab switches.
// Read as defaultSettings on remount so the map restores to the same view.
let globalCameraState: { centerCoordinate: [number, number]; zoomLevel: number } | null = null;

export default function MapView() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = isDark ? COLORS.dark : COLORS.light;

  const mapRef = useRef<Mapbox.MapView>(null);
  const cameraRef = useRef<Mapbox.Camera>(null);

  const [mapLoaded, setMapLoaded] = useState(false);
  const [isDrawingSession, setIsDrawingSession] = useState(false);

  const [committedGeoJSON, setCommittedGeoJSON] = useState<GeoJSON.FeatureCollection>(() => ({
    type: "FeatureCollection",
    features: globalPolygons,
  }));

  const [liveGeoJSON, setLiveGeoJSON] = useState<GeoJSON.FeatureCollection>(EMPTY_FC);
  const [boundaryGeoJSON, setBoundaryGeoJSON] = useState<GeoJSON.FeatureCollection | null>(null);

  const dragPointsRef = useRef<number[][]>([]);
  // Tracks if the map is being zoomed (pinch) during a draw session.
  const isMultiTouchSessionRef = useRef(false);
  // Tracks previous drawActive value so we can detect the draw→done transition.
  const prevDrawActiveRef = useRef(false);
  const mapStyle = useMemo(() => MAP_STYLES[isDark ? "dark" : "light"], [isDark]);

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
  } = useListingsStore();

  // Two responsibilities in one effect (both keyed to drawActive/boundary):
  //
  // 1. Draw activated (drawActive=true, boundary=null): wipe listings and any
  //    committed polygon visuals so the user starts fresh. The store's toggleDraw
  //    does an optimistic clear, but a debounced fetchListingsForBounds call that
  //    was already in-flight can re-populate listings. This effect runs after the
  //    render cycle and is the reliable final cleanup.
  //
  // 2. Done clicked without drawing (drawActive: true→false, boundary still null):
  //    boundary didn't change so the boundary effect won't fire. prevDrawActiveRef
  //    detects the direction of the drawActive transition and triggers a viewport
  //    refetch to restore listings.
  useEffect(() => {
    if (drawActive && !boundary) {
      // Branch 1: draw mode entered — wipe listings and committed polygons
      setListings([]);
      globalPolygons = [];
      setCommittedGeoJSON(EMPTY_FC);
    } else if (!drawActive && prevDrawActiveRef.current && !boundary) {
      // Branch 2: done clicked without drawing — restore viewport listings
      (async () => {
        const bounds = await mapRef.current?.getVisibleBounds();
        if (bounds) {
          const b: [number, number, number, number] = [
            bounds[1][0], bounds[1][1], bounds[0][0], bounds[0][1],
          ];
          setViewportBounds(b);
          fetchListingsForBounds(b);
        }
      })();
    }
    prevDrawActiveRef.current = drawActive;
  }, [drawActive, boundary]);

  // 150ms debounce: collapses rapid successive onRegionDidChange calls that happen
  // during programmatic camera animations (flyTo / fitBounds). onRegionDidChange
  // already only fires after the camera settles, so for normal scrolling the debounce
  // adds minimal perceived delay while still protecting against animation burst calls.
  const fetchListingsForBounds = useDebouncedCallback(async (bounds: [number, number, number, number]) => {
    if (drawActive || boundary) return; // don't fetch viewport listings while a boundary search is active
    try {
      setIsLoading(true);
      const data = await fetchViewportListings(bounds, listingType);
      addListings(data); // merges with existing listings so markers from adjacent areas persist
    } catch (err) {
      console.error("Failed to fetch listings:", err);
    } finally {
      setIsLoading(false);
    }
  }, 150);

  // Rebuild Supercluster index only when the listings array changes.
  const clusterIndex = useMemo(() => createClusterIndex(listings), [listings]);

  // Derive visible clusters from the current viewport bounds + zoom level.
  // lngDelta→zoom approximation keeps cluster radius consistent at any zoom level.
  const clusters = useMemo(() => {
    if (!viewportBounds) return [];
    try {
      const lngDelta = Math.abs(viewportBounds[2] - viewportBounds[0]);
      const zoom = Math.round(Math.log2(360 / lngDelta)); // approximate map zoom from lng span
      return clusterIndex.getClusters(
        [viewportBounds[0], viewportBounds[1], viewportBounds[2], viewportBounds[3]],
        Math.min(Math.max(zoom, 0), 16)
      );
    } catch { return []; }
  }, [clusterIndex, viewportBounds]);

  // Fit map to city boundary + fetch city polygon from OSM
  useEffect(() => {
    if (boundary?.type === "polygon" && boundary.coordinates) {
      const pts = boundary.coordinates;
      const closed = pts[pts.length - 1][0] === pts[0][0] && pts[pts.length - 1][1] === pts[0][1] ? pts : [...pts, pts[0]];
      const exists = committedGeoJSON.features.some((f) => {
        if (f.geometry.type !== "Polygon") return false;
        const coords = f.geometry.coordinates[0];
        if (coords.length !== closed.length) return false;
        return coords.every((p, i) => p[0] === closed[i][0] && p[1] === closed[i][1]);
      });
      if (!exists) {
        const feature: GeoJSON.Feature = {
          type: "Feature",
          geometry: { type: "Polygon", coordinates: [closed] },
          properties: {},
        };
        globalPolygons = [...globalPolygons, feature];
        setCommittedGeoJSON({
          type: "FeatureCollection",
          features: globalPolygons,
        });
      }
    }

    if (boundary?.type === "city" && boundary.bbox && cameraRef.current) {
      const sw: [number, number] = [boundary.bbox[0], boundary.bbox[1]];
      const ne: [number, number] = [boundary.bbox[2], boundary.bbox[3]];
      cameraRef.current.fitBounds(ne, sw, [40, 40, 40, 40], 600);

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
          } catch { }

          // Fallback: circle boundary
          if (!geometry) {
            const radiusKm =
              boundary.placeType === "STATE" ? 50 :
                boundary.placeType === "CITY" ? 12 :
                  boundary.placeType === "LOCALITY" ? 2.5 :
                    boundary.placeType === "SUB_LOCALITY" ? 1 : 0.8;
            geometry = makeCircle(lat, lng, radiusKm);
          }

          setBoundaryGeoJSON({
            type: "FeatureCollection",
            features: [{ type: "Feature", properties: {}, geometry }],
          });

          if (realBbox && cameraRef.current) {
            cameraRef.current.fitBounds([realBbox[2], realBbox[3]], [realBbox[0], realBbox[1]], [60, 60, 60, 60], 500);
          }

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

    if (!boundary) {
      globalPolygons = [];
      setCommittedGeoJSON(EMPTY_FC);
      setBoundaryGeoJSON(null);

      // Refetch viewport listings
      (async () => {
        const bounds = await mapRef.current?.getVisibleBounds();
        if (bounds) {
          const b: [number, number, number, number] = [
            bounds[1][0], bounds[1][1], bounds[0][0], bounds[0][1]
          ];
          setViewportBounds(b);
          fetchListingsForBounds(b);
        }
      })();
    }
  }, [boundary]);

  // After every camera settle: update viewportBounds (triggers cluster recompute),
  // kick off a debounced listing fetch, and save camera position to globalCameraState
  // so tab switches restore the same view.
  const handleRegionDidChange = useCallback(async () => {
    if (!mapLoaded) return;
    const bounds = await mapRef.current?.getVisibleBounds();
    if (bounds) {
      const b: [number, number, number, number] = [
        bounds[1][0], bounds[1][1], bounds[0][0], bounds[0][1]
      ];
      setViewportBounds(b);
      fetchListingsForBounds(b);
    }
    // Persist camera state so tab switches restore the same view
    try {
      const cam = await mapRef.current?.getZoom();
      const center = await mapRef.current?.getCenter();
      if (cam !== undefined && center) {
        globalCameraState = { centerCoordinate: [center[0], center[1]], zoomLevel: cam };
      }
    } catch { }
  }, [mapLoaded, setViewportBounds]);

  // Pinch-zoom detection during freehand drawing.
  // scrollEnabled=false during drawActive, so the ONLY reason onRegionIsChanging fires
  // while drawing is a pinch-zoom gesture. We abort the in-progress draw immediately
  // and set the contamination flag so the PanResponder release doesn't commit it.
  const handleRegionIsChanging = useCallback(() => {
    if (!drawActive || !isDrawingSession) return;
    isMultiTouchSessionRef.current = true;
    dragPointsRef.current = [];
    setLiveGeoJSON(EMPTY_FC);
    setIsDrawingSession(false);
  }, [drawActive, isDrawingSession]);

  // Expands a cluster into its leaves and flies the camera to fit them.
  // Key trick: setViewportBounds is called with the TARGET bounds BEFORE the camera
  // animation starts. This causes the clusters useMemo to recompute immediately,
  // so individual markers render during the fly animation instead of appearing
  // only after it completes (eliminating the blank-map flash).
  const handleClusterClick = useCallback((clusterId: number, coordinates: [number, number]) => {
    try {
      const leaves = (clusterIndex as any).getLeaves(clusterId, 100);
      const coords = leaves.map((l: any) => l.geometry.coordinates as [number, number]);
      if (coords.length === 0) return;
      if (!cameraRef.current) return;

      if (coords.length === 1) {
        // Pre-update viewport bounds immediately so markers render during the fly animation
        const pad = 0.005;
        const targetBounds: [number, number, number, number] = [
          coordinates[0] - pad, coordinates[1] - pad,
          coordinates[0] + pad, coordinates[1] + pad,
        ];
        setViewportBounds(targetBounds);
        cameraRef.current.setCamera({ centerCoordinate: coordinates, zoomLevel: 16, animationDuration: 750, animationMode: "flyTo" });
        return;
      }
      let [minLng, minLat, maxLng, maxLat] = [coords[0][0], coords[0][1], coords[0][0], coords[0][1]];
      for (const [lng, lat] of coords) {
        if (lng < minLng) minLng = lng; if (lat < minLat) minLat = lat;
        if (lng > maxLng) maxLng = lng; if (lat > maxLat) maxLat = lat;
      }
      // Pre-update viewport bounds immediately so markers render during the fly animation
      const targetBounds: [number, number, number, number] = [minLng, minLat, maxLng, maxLat];
      setViewportBounds(targetBounds);
      cameraRef.current.fitBounds([maxLng, maxLat], [minLng, minLat], [80, 80, 80, 80], 650);
    } catch (err) { console.error("Cluster click error:", err); }
  }, [clusterIndex, setViewportBounds]);

  // Called when the user lifts their finger after freehand drawing.
  // Closes the polygon, commits it to globalPolygons (survives tab switches),
  // updates the store boundary (triggers the boundary useEffect), and fetches
  // listings that intersect the drawn polygon.
  const completeDraw = useCallback(async () => {
    const pts = dragPointsRef.current;
    dragPointsRef.current = [];
    setLiveGeoJSON(EMPTY_FC);
    setIsDrawingSession(false);

    if (pts.length >= 3) {
      const closed = [...pts, pts[0]];
      const newFeature: GeoJSON.Feature = { type: "Feature", geometry: { type: "Polygon", coordinates: [closed] }, properties: {} };

      globalPolygons = [...globalPolygons, newFeature];
      setCommittedGeoJSON({
        type: "FeatureCollection",
        features: globalPolygons,
      });

      useListingsStore.setState({
        boundary: { type: "polygon", coordinates: closed, label: "Custom Area" },
      });

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
  }, [setIsLoading, addListings, listingType]);

  // PanResponder drives the freehand drawing UX:
  // - Only claims the gesture for single-finger touches (multi-touch = pinch, not draw)
  // - isMultiTouchSessionRef is set by onRegionIsChanging when a pinch is detected;
  //   once set, the remainder of that gesture is ignored even if a finger lifts
  // - Post-await contamination checks prevent async getCoordinateFromView results
  //   from being written after the gesture has already been aborted
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: (evt) => drawActive && evt.nativeEvent.touches.length === 1,
        onMoveShouldSetPanResponder: (evt) => drawActive && evt.nativeEvent.touches.length === 1,
        onPanResponderGrant: async (evt) => {
          Keyboard.dismiss();
          if (!drawActive) return;
          if (evt.nativeEvent.touches.length !== 1) return;
          isMultiTouchSessionRef.current = false;
          const { locationX, locationY } = evt.nativeEvent;
          setIsDrawingSession(true);
          try {
            const coord = await mapRef.current?.getCoordinateFromView([locationX, locationY]);
            if (coord && !isMultiTouchSessionRef.current) {
              dragPointsRef.current = [coord];
              setLiveGeoJSON(buildDrawGeoJSON([coord]));
            }
          } catch { }
        },
        onPanResponderMove: async (evt) => {
          if (!drawActive) return;
          if (evt.nativeEvent.touches.length !== 1) {
            isMultiTouchSessionRef.current = true;
            dragPointsRef.current = [];
            setLiveGeoJSON(EMPTY_FC);
            setIsDrawingSession(false);
            return;
          }
          if (isMultiTouchSessionRef.current) return;
          const { locationX, locationY } = evt.nativeEvent;
          try {
            const coord = await mapRef.current?.getCoordinateFromView([locationX, locationY]);
            if (coord && !isMultiTouchSessionRef.current) {
              const pts = dragPointsRef.current;
              const last = pts[pts.length - 1];
              if (
                !last ||
                Math.abs(coord[0] - last[0]) > 0.0005 ||
                Math.abs(coord[1] - last[1]) > 0.0005
              ) {
                const updated = [...pts, coord];
                dragPointsRef.current = updated;
                setLiveGeoJSON(buildDrawGeoJSON(updated));
              }
            }
          } catch { }
        },
        onPanResponderRelease: () => {
          if (!drawActive) return;
          if (isMultiTouchSessionRef.current) {
            isMultiTouchSessionRef.current = false;
            dragPointsRef.current = [];
            setLiveGeoJSON(EMPTY_FC);
            setIsDrawingSession(false);
            return;
          }
          if (dragPointsRef.current.length >= 3) {
            completeDraw();
          } else {
            dragPointsRef.current = [];
            setLiveGeoJSON(EMPTY_FC);
            setIsDrawingSession(false);
          }
        },
      }),
    [drawActive, completeDraw]
  );

  return (
    <View style={styles.container} {...panResponder.panHandlers}>
      <Mapbox.MapView
        ref={mapRef}
        style={styles.map}
        styleURL={mapStyle}
        onDidFinishLoadingMap={() => setMapLoaded(true)}
        onRegionDidChange={handleRegionDidChange}
        onRegionIsChanging={handleRegionIsChanging}
        onPress={() => {
          // MapView.onPress fires ONLY for empty-space taps — Mapbox does not fire it
          // when a MarkerView child handles the tap. No overlay needed.
          // zoomEnabled={!selectedListing} disables the double-tap recognizer while a
          // card is open, making this fire instantly instead of waiting ~300ms.
          Keyboard.dismiss();
          setSelectedListing(null);
        }}
        // scrollEnabled / pitchEnabled / rotateEnabled: all disabled in draw mode so
        // the PanResponder can own the touch without fighting Mapbox's gesture recognizers.
        //
        // zoomEnabled={!selectedListing}: disables Mapbox's double-tap zoom recognizer
        // while a listing card is open. Without double-tap, the single-tap onPress fires
        // instantly instead of waiting ~300ms for the double-tap recognition window.
        // This gives zero-latency card dismissal on empty-space taps.
        // Trade-off: pinch-zoom is also disabled while a card is open.
        scrollEnabled={!drawActive}
        pitchEnabled={!drawActive}
        rotateEnabled={!drawActive}
        zoomEnabled={!selectedListing}
        scaleBarEnabled={false}
        logoEnabled={false}
        attributionEnabled={false}
      >
        {/* defaultSettings (not animateTo) so the camera position is applied on mount
            without triggering an animation. globalCameraState is null on first launch,
            falling back to INITIAL_VIEW. After any tab switch it holds the last position. */}
        <Mapbox.Camera
          ref={cameraRef}
          defaultSettings={{
            centerCoordinate: globalCameraState?.centerCoordinate ?? [INITIAL_VIEW.longitude, INITIAL_VIEW.latitude],
            zoomLevel: globalCameraState?.zoomLevel ?? INITIAL_VIEW.zoom,
          }}
        />

        {/* Dark mode: Mapbox Standard style + dusk light preset + bright yellow motorways.
            StyleImport is the React Native equivalent of the web app's setConfigProperty.
            Values come from DARK_MAP_CONFIG in theme.ts (sync with src/lib/theme.ts). */}
        {isDark && (
          <Mapbox.StyleImport
            id="basemap"
            config={{
              lightPreset: DARK_MAP_CONFIG.lightPreset,
              colorMotorways: DARK_MAP_CONFIG.colorMotorways,
              colorTrunks: DARK_MAP_CONFIG.colorTrunks,
            }}
          />
        )}

        {/* Live drawing feedback layer */}
        {isDrawingSession && (
          <Mapbox.ShapeSource id={LIVE_DRAW_SOURCE_ID} shape={liveGeoJSON}>
            <Mapbox.LineLayer
              id="live-draw-line"
              style={{
                lineColor: DRAW_COLOR,
                lineWidth: 2.5,
              }}
            />
            <Mapbox.CircleLayer
              id="live-draw-start"
              filter={["==", "$type", "Point"]}
              style={{
                circleRadius: 6,
                circleColor: DRAW_COLOR,
                circleStrokeColor: "#ffffff",
                circleStrokeWidth: 2,
              }}
            />
          </Mapbox.ShapeSource>
        )}

        {/* Saved drawn boundaries */}
        {(committedGeoJSON.features.length > 0 || boundary?.type === "polygon") && (
          <Mapbox.ShapeSource id={DRAW_SOURCE_ID} shape={committedGeoJSON}>
            <Mapbox.FillLayer
              id="draw-fill"
              filter={["==", "$type", "Polygon"]}
              style={{
                fillColor: DRAW_COLOR,
                fillOpacity: 0.12,
              }}
            />
            <Mapbox.LineLayer
              id="draw-line"
              style={{
                lineColor: DRAW_COLOR,
                lineWidth: 2.5,
              }}
            />
          </Mapbox.ShapeSource>
        )}

        {/* City boundary polygon */}
        {boundaryGeoJSON && boundary?.type === "city" && (
          <Mapbox.ShapeSource id={BOUNDARY_SOURCE_ID} shape={boundaryGeoJSON}>
            <Mapbox.FillLayer
              id="boundary-fill"
              style={{
                fillColor: DRAW_COLOR,
                fillOpacity: 0.12,
              }}
            />
            <Mapbox.LineLayer
              id="boundary-line"
              style={{
                lineColor: DRAW_COLOR,
                lineWidth: 2.0,
              }}
            />
          </Mapbox.ShapeSource>
        )}

        {/* Markers and Clusters */}
        {mapLoaded &&
          clusters.map((cluster) => {
            const [lng, lat] = cluster.geometry.coordinates;
            if (!isFinite(lng) || !isFinite(lat)) return null;

            const isCluster = cluster.properties.cluster;

            if (isCluster) {
              const clusterId = cluster.properties.cluster_id ?? 0;
              return (
                <Mapbox.MarkerView
                  key={`c-${clusterId}`}
                  coordinate={[lng, lat]}
                  anchor={{ x: 0.5, y: 0.5 }}
                >
                  <Pressable
                    onPress={() => handleClusterClick(clusterId, [lng, lat])}
                    style={[
                      styles.clusterDot,
                      {
                        backgroundColor: colors.markerBg,
                        borderColor: colors.markerText,
                      },
                    ]}
                  />
                </Mapbox.MarkerView>
              );
            }

            const listing = cluster.properties.listing as Listing;
            const isActive = selectedListing?.id === listing.id;
            const bg = isActive ? colors.markerBgActive : colors.markerBg;

            return (
              <Mapbox.MarkerView
                key={listing.id}
                coordinate={[lng, lat]}
                anchor={{ x: 0.5, y: 1.0 }}
              >
                <Pressable
                  onPress={() => setSelectedListing(listing)}
                  style={{ alignItems: "center" }}
                >
                  <View
                    style={[
                      styles.priceTag,
                      {
                        backgroundColor: bg,
                        transform: [{ scale: isActive ? 1.12 : 1.0 }],
                      },
                    ]}
                  >
                    <Text style={[styles.priceText, { color: colors.markerText }]}>
                      {formatPrice(listing.price)}
                    </Text>
                  </View>
                  <View style={[styles.priceArrow, { borderTopColor: bg }]} />
                </Pressable>
              </Mapbox.MarkerView>
            );
          })}
      </Mapbox.MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  clusterDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 3,
  },
  priceTag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 3,
  },
  priceText: {
    fontSize: 12,
    fontWeight: "700",
  },
  priceArrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderLeftColor: "transparent",
    borderRightWidth: 5,
    borderRightColor: "transparent",
    borderTopWidth: 5,
    marginTop: -1,
  },
});
