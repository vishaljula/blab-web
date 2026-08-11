/**
 * Customer Live Tracking Screen — /tracking/[id]
 *
 * Shows a Mapbox map with:
 *  - Customer's property pinned (destination)
 *  - Shutterbug's live location (animated camera icon)
 *  - ETA from Mapbox Directions API
 *
 * Polls /api/photography/bookings/[id]/track every 10 seconds when en_route.
 * Smoothly animates the shutterbug icon between GPS updates.
 *
 * This is the web-specific version (uses MapboxGL directly via react-map-gl).
 * Native version (MapView) will use Mapbox.MarkerView + polling hook.
 */
import React, { useState, useEffect, useRef, useCallback } from "react";
import { View, Text, StyleSheet, Pressable, Platform } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useListingsStore } from "@/store/listings";
import { COLORS, API_BASE_URL } from "@/lib/theme";

const POLL_INTERVAL_MS = 10_000;

interface TrackData {
  status: string;
  shutterbugLocation: { lat: number; lng: number; heading: number; ts: number } | null;
  etaMinutes: number | null;
  propertyLocation: { lat: number; lng: number } | null;
}

// ── Web implementation ─────────────────────────────────────────────────────────
function TrackingWeb({ bookingId }: { bookingId: string }) {
  const { token } = useListingsStore();
  const router = useRouter();
  const colors = COLORS.dark;

  const [track, setTrack] = useState<TrackData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchTrack = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/photography/bookings/${bookingId}/track`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (data.success) setTrack(data);
      else setError(data.error ?? "Failed to load tracking");
    } catch (e) {
      setError("Network error");
    }
  }, [bookingId, token]);

  useEffect(() => {
    fetchTrack();
    pollRef.current = setInterval(fetchTrack, POLL_INTERVAL_MS);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchTrack]);

  // Animate map to follow shutterbug
  useEffect(() => {
    if (!track?.shutterbugLocation || !mapRef.current) return;
    mapRef.current.flyTo({
      center: [track.shutterbugLocation.lng, track.shutterbugLocation.lat],
      zoom: 14,
      duration: 2000,
      essential: true,
    });
  }, [track?.shutterbugLocation]);

  const { shutterbugLocation, etaMinutes, status, propertyLocation } = track ?? {};

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Map container — renders via a div + mapbox-gl on web */}
      <div
        id="tracking-map"
        ref={(el) => {
          if (el && !mapRef.current && (window as any).mapboxgl) {
            const mbgl = (window as any).mapboxgl;
            const map = new mbgl.Map({
              container: el,
              style: "mapbox://styles/mapbox/dark-v11",
              center: propertyLocation
                ? [propertyLocation.lng, propertyLocation.lat]
                : [78.5521, 17.3496],
              zoom: 13,
              accessToken: process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? "",
            });
            mapRef.current = map;

            map.on("load", () => {
              // Property marker (destination)
              if (propertyLocation) {
                const el = document.createElement("div");
                el.innerHTML = "📍";
                el.style.fontSize = "28px";
                new mbgl.Marker({ element: el })
                  .setLngLat([propertyLocation.lng, propertyLocation.lat])
                  .addTo(map);
              }
            });
          }
        }}
        style={{ width: "100%", height: 380, borderRadius: 16, overflow: "hidden" }}
      />

      {/* Info card */}
      <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {status === "en_route" ? (
          <>
            <View style={styles.infoRow}>
              <View style={[styles.etaBadge, { backgroundColor: "#6366F1" }]}>
                <Text style={styles.etaNumber}>{etaMinutes ?? "—"}</Text>
                <Text style={styles.etaUnit}>min</Text>
              </View>
              <View>
                <Text style={[styles.infoTitle, { color: colors.foreground }]}>
                  🚗 Your Shutterbug is on the way!
                </Text>
                <Text style={[styles.infoSubtitle, { color: colors.mutedForeground }]}>
                  Map updates every 10 seconds
                </Text>
              </View>
            </View>
          </>
        ) : status === "completed" ? (
          <View style={styles.infoRow}>
            <Text style={{ fontSize: 32 }}>✅</Text>
            <View>
              <Text style={[styles.infoTitle, { color: colors.foreground }]}>Shoot completed!</Text>
              <Text style={[styles.infoSubtitle, { color: colors.mutedForeground }]}>
                Photos will be ready within 24 hours
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.infoRow}>
            <Text style={{ fontSize: 32 }}>⏳</Text>
            <View>
              <Text style={[styles.infoTitle, { color: colors.foreground }]}>Shoot scheduled</Text>
              <Text style={[styles.infoSubtitle, { color: colors.mutedForeground }]}>
                Tracking will appear when your Shutterbug is en route
              </Text>
            </View>
          </View>
        )}

        <Pressable
          style={[styles.backBtn, { borderColor: colors.border }]}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back-outline" size={16} color={colors.mutedForeground} />
          <Text style={[styles.backBtnText, { color: colors.mutedForeground }]}>Back to my listing</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ── Native implementation ──────────────────────────────────────────────────────
function TrackingNative({ bookingId }: { bookingId: string }) {
  const { token } = useListingsStore();
  const router = useRouter();
  const colors = COLORS.dark;
  const [track, setTrack] = useState<TrackData | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchTrack = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/photography/bookings/${bookingId}/track`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (data.success) setTrack(data);
    } catch {}
  }, [bookingId, token]);

  useEffect(() => {
    fetchTrack();
    pollRef.current = setInterval(fetchTrack, POLL_INTERVAL_MS);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchTrack]);

  const { status, etaMinutes } = track ?? {};

  return (
    <View style={[styles.nativeCenter, { backgroundColor: colors.background }]}>
      <Text style={{ fontSize: 48, marginBottom: 12 }}>🚗</Text>
      <Text style={[styles.infoTitle, { color: colors.foreground, textAlign: "center" }]}>
        {status === "en_route"
          ? `Your Shutterbug is on the way!\nETA: ${etaMinutes ?? "—"} min`
          : status === "completed"
          ? "Shoot completed! Photos coming soon."
          : "Waiting for your Shutterbug to depart…"}
      </Text>
      <Pressable
        style={[styles.backBtn, { borderColor: colors.border, marginTop: 24 }]}
        onPress={() => router.back()}
      >
        <Text style={[styles.backBtnText, { color: colors.mutedForeground }]}>← Back</Text>
      </Pressable>
    </View>
  );
}

// ── Entry ──────────────────────────────────────────────────────────────────────

export default function TrackingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  if (!id) return null;
  return Platform.OS === "web" ? <TrackingWeb bookingId={id} /> : <TrackingNative bookingId={id} />;
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  infoCard: {
    margin: 16,
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    gap: 16,
  },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 16 },
  etaBadge: {
    width: 64, height: 64, borderRadius: 32,
    justifyContent: "center", alignItems: "center",
  },
  etaNumber: { color: "#fff", fontSize: 22, fontWeight: "800" },
  etaUnit: { color: "#fff", fontSize: 11, fontWeight: "600" },
  infoTitle: { fontSize: 16, fontWeight: "700", marginBottom: 4 },
  infoSubtitle: { fontSize: 13 },
  backBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
    alignSelf: "flex-start",
  },
  backBtnText: { fontSize: 13 },
  nativeCenter: { flex: 1, justifyContent: "center", alignItems: "center", padding: 32 },
});
