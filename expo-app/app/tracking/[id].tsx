/**
 * Customer Live Tracking Screen — /tracking/[id]
 *
 * Shows a Mapbox map with:
 *  - Customer's property pinned (destination)
 *  - Shutterbug's live location (animated camera icon)
 *  - ETA from API
 *
 * Web: uses mapbox-gl directly via raw div injection
 * Native: uses @rnmapbox/maps with animated PointAnnotation
 *
 * Polls /api/photography/bookings/[id]/track every 10 seconds when en_route.
 */
import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  Animated,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useListingsStore } from "@/store/listings";
import { COLORS, API_BASE_URL } from "@/lib/theme";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const POLL_INTERVAL_MS = 10_000;
const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? "";

interface TrackData {
  status: string;
  shutterbugLocation: { lat: number; lng: number; heading: number; ts: number } | null;
  etaMinutes: number | null;
  propertyLocation: { lat: number; lng: number } | null;
}

// ── Shared fetch hook ──────────────────────────────────────────────────────────
function useTracking(bookingId: string) {
  const { token } = useListingsStore();
  const [track, setTrack] = useState<TrackData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchTrack = useCallback(async () => {
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/photography/bookings/${bookingId}/track`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} }
      );
      const data = await res.json();
      if (data.success) setTrack(data);
      else setError(data.error ?? "Failed to load tracking");
    } catch {
      setError("Network error — retrying…");
    }
  }, [bookingId, token]);

  useEffect(() => {
    fetchTrack();
    pollRef.current = setInterval(fetchTrack, POLL_INTERVAL_MS);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchTrack]);

  return { track, error };
}

// ── Web implementation ─────────────────────────────────────────────────────────
function TrackingWeb({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const colors = COLORS.dark;
  const insets = useSafeAreaInsets();
  const { track, error } = useTracking(bookingId);

  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const prevLocRef = useRef<{ lat: number; lng: number } | null>(null);

  // Init map when property location is known
  const mapContainerRef = useCallback((el: any) => {
    if (!el || mapRef.current) return;
    const mbgl = (window as any).mapboxgl;
    if (!mbgl) return;
    mbgl.accessToken = MAPBOX_TOKEN;
    const center = track?.propertyLocation
      ? [track.propertyLocation.lng, track.propertyLocation.lat]
      : [78.5521, 17.3496];
    const map = new mbgl.Map({
      container: el,
      style: "mapbox://styles/mapbox/dark-v11",
      center,
      zoom: 14,
    });
    mapRef.current = map;

    map.on("load", () => {
      // Property pin
      if (track?.propertyLocation) {
        const pin = document.createElement("div");
        pin.innerHTML = "📍";
        pin.style.fontSize = "32px";
        new mbgl.Marker({ element: pin })
          .setLngLat([track.propertyLocation.lng, track.propertyLocation.lat])
          .addTo(map);
      }
      // Shutterbug marker
      const cam = document.createElement("div");
      cam.id = "shutterbug-marker";
      cam.innerHTML = "📸";
      cam.style.cssText = "font-size:28px;transition:all 2s ease;";
      if (track?.shutterbugLocation) {
        markerRef.current = new mbgl.Marker({ element: cam })
          .setLngLat([track.shutterbugLocation.lng, track.shutterbugLocation.lat])
          .addTo(map);
      }
    });
  }, [track?.propertyLocation]);

  // Animate marker on new location
  useEffect(() => {
    if (!track?.shutterbugLocation || !mapRef.current) return;
    const { lat, lng } = track.shutterbugLocation;
    if (markerRef.current) {
      markerRef.current.setLngLat([lng, lat]);
    } else {
      const mbgl = (window as any).mapboxgl;
      if (!mbgl) return;
      const cam = document.createElement("div");
      cam.innerHTML = "📸";
      cam.style.cssText = "font-size:28px;";
      markerRef.current = new mbgl.Marker({ element: cam })
        .setLngLat([lng, lat])
        .addTo(mapRef.current);
    }
    // Fly camera to follow
    if (!prevLocRef.current) {
      mapRef.current.flyTo({ center: [lng, lat], zoom: 15, duration: 1500 });
    } else {
      mapRef.current.easeTo({ center: [lng, lat], duration: 2000 });
    }
    prevLocRef.current = { lat, lng };
  }, [track?.shutterbugLocation]);

  const { status, etaMinutes, shutterbugLocation } = track ?? {};

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
      {/* Map */}
      <div
        ref={mapContainerRef}
        style={{ width: "100%", height: 420, borderRadius: 0, overflow: "hidden" } as any}
      />

      {/* Status card */}
      <StatusCard
        status={status}
        etaMinutes={etaMinutes}
        colors={colors}
        hasLocation={!!shutterbugLocation}
      />

      <Pressable style={[styles.backBtn, { borderColor: colors.border, margin: 16 }]} onPress={() => router.back()}>
        <Ionicons name="arrow-back-outline" size={16} color={colors.mutedForeground} />
        <Text style={[styles.backBtnText, { color: colors.mutedForeground }]}>Back</Text>
      </Pressable>
    </View>
  );
}

// ── Native implementation ──────────────────────────────────────────────────────
function TrackingNative({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const colors = COLORS.dark;
  const insets = useSafeAreaInsets();
  const { track, error } = useTracking(bookingId);

  // Lazy-import Mapbox to avoid issues on web bundle
  const [Mapbox, setMapbox] = useState<any>(null);
  useEffect(() => {
    import("@rnmapbox/maps").then((m) => {
      m.default.setAccessToken(MAPBOX_TOKEN);
      setMapbox(m.default);
    }).catch(() => {});
  }, []);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (track?.status !== "en_route") return;
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.3, duration: 700, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [track?.status]);

  const { status, etaMinutes, shutterbugLocation, propertyLocation } = track ?? {};

  const center: [number, number] = shutterbugLocation
    ? [shutterbugLocation.lng, shutterbugLocation.lat]
    : propertyLocation
    ? [propertyLocation.lng, propertyLocation.lat]
    : [78.5521, 17.3496];

  if (!Mapbox) {
    return (
      <View style={[styles.nativeCenter, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
        <Text style={[styles.statusText, { color: colors.mutedForeground }]}>Loading map…</Text>
      </View>
    );
  }

  const MapboxMap = Mapbox.MapView;
  const Camera = Mapbox.Camera;
  const PointAnnotation = Mapbox.PointAnnotation;

  return (
    <View style={[styles.nativeContainer, { backgroundColor: colors.background }]}>
      {/* Map fills top portion */}
      <View style={[styles.mapWrapper, { paddingTop: insets.top }]}>
        <MapboxMap
          style={{ flex: 1 }}
          styleURL="mapbox://styles/mapbox/dark-v11"
          logoEnabled={false}
          attributionEnabled={false}
          compassEnabled={false}
        >
          <Camera
            centerCoordinate={center}
            zoomLevel={14}
            animationMode="flyTo"
            animationDuration={2000}
          />

          {/* Property destination pin */}
          {propertyLocation && (
            <PointAnnotation
              id="property-pin"
              coordinate={[propertyLocation.lng, propertyLocation.lat]}
            >
              <View style={styles.propertyPin}>
                <Text style={{ fontSize: 22 }}>🏠</Text>
              </View>
            </PointAnnotation>
          )}

          {/* Shutterbug live marker */}
          {shutterbugLocation && (
            <PointAnnotation
              id="shutterbug-marker"
              coordinate={[shutterbugLocation.lng, shutterbugLocation.lat]}
            >
              <Animated.View
                style={[
                  styles.shutterbugMarker,
                  { transform: [{ scale: pulseAnim }] },
                ]}
              >
                <Text style={{ fontSize: 26 }}>📸</Text>
              </Animated.View>
            </PointAnnotation>
          )}
        </MapboxMap>
      </View>

      {/* Status card below map */}
      <StatusCard
        status={status}
        etaMinutes={etaMinutes}
        colors={colors}
        hasLocation={!!shutterbugLocation}
      />

      <Pressable
        style={[styles.backBtn, { borderColor: colors.border, marginHorizontal: 16, marginBottom: insets.bottom + 8 }]}
        onPress={() => router.back()}
      >
        <Ionicons name="arrow-back-outline" size={16} color={colors.mutedForeground} />
        <Text style={[styles.backBtnText, { color: colors.mutedForeground }]}>Back</Text>
      </Pressable>
    </View>
  );
}

// ── Shared status card ─────────────────────────────────────────────────────────
function StatusCard({
  status,
  etaMinutes,
  colors,
  hasLocation,
}: {
  status?: string;
  etaMinutes?: number | null;
  colors: any;
  hasLocation: boolean;
}) {
  if (status === "en_route") {
    return (
      <View style={[styles.statusCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={[styles.etaBadge, { backgroundColor: "#6366F1" }]}>
          <Text style={styles.etaNumber}>{etaMinutes ?? "—"}</Text>
          <Text style={styles.etaUnit}>min</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.statusTitle, { color: colors.foreground }]}>
            📸 Shutterbug on the way!
          </Text>
          <Text style={[styles.statusSub, { color: colors.mutedForeground }]}>
            {hasLocation ? "Map updates every 10s" : "Waiting for first location ping…"}
          </Text>
        </View>
      </View>
    );
  }
  if (status === "completed") {
    return (
      <View style={[styles.statusCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={{ fontSize: 36 }}>✅</Text>
        <View style={{ flex: 1 }}>
          <Text style={[styles.statusTitle, { color: colors.foreground }]}>Shoot completed!</Text>
          <Text style={[styles.statusSub, { color: colors.mutedForeground }]}>
            Photos will be ready within 24 hours
          </Text>
        </View>
      </View>
    );
  }
  // scheduled / pending
  return (
    <View style={[styles.statusCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <ActivityIndicator color="#6366F1" size="small" />
      <View style={{ flex: 1 }}>
        <Text style={[styles.statusTitle, { color: colors.foreground }]}>Shoot scheduled</Text>
        <Text style={[styles.statusSub, { color: colors.mutedForeground }]}>
          Tracking starts when your Shutterbug departs
        </Text>
      </View>
    </View>
  );
}

// ── Entry ──────────────────────────────────────────────────────────────────────
export default function TrackingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  if (!id) return null;
  return Platform.OS === "web"
    ? <TrackingWeb bookingId={id} />
    : <TrackingNative bookingId={id} />;
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  nativeCenter: {
    flex: 1, justifyContent: "center", alignItems: "center", gap: 12,
  },
  nativeContainer: { flex: 1 },
  mapWrapper: { flex: 1 },
  propertyPin: {
    alignItems: "center", justifyContent: "center",
  },
  shutterbugMarker: {
    alignItems: "center", justifyContent: "center",
  },
  statusCard: {
    flexDirection: "row", alignItems: "center", gap: 16,
    margin: 16, borderRadius: 20, borderWidth: 1, padding: 16,
  },
  etaBadge: {
    width: 60, height: 60, borderRadius: 30,
    justifyContent: "center", alignItems: "center",
  },
  etaNumber: { color: "#fff", fontSize: 20, fontWeight: "800" },
  etaUnit: { color: "#fff", fontSize: 11, fontWeight: "600" },
  statusTitle: { fontSize: 16, fontWeight: "700", marginBottom: 4 },
  statusSub: { fontSize: 13 },
  statusText: { fontSize: 14, marginTop: 8 },
  backBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
    alignSelf: "flex-start",
  },
  backBtnText: { fontSize: 13 },
});
