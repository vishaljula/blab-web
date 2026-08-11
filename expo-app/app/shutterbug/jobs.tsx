/**
 * Shutterbug Job Screen — shows today's and upcoming assigned shoots.
 * Accessible only to users with role = 'shutterbug'.
 *
 * Features:
 *  - List of assigned photography bookings (pending + confirmed + en_route)
 *  - "I'm heading there" button → starts GPS streaming → customer tracking activates
 *  - "Navigate →" button → opens Google Maps with property as destination
 *  - "Mark Done" button → marks booking as completed
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Linking,
  Platform,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import * as ExpoLocation from "expo-location";
import { useListingsStore } from "@/store/listings";
import { COLORS, API_BASE_URL } from "@/lib/theme";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Booking {
  id: string;
  slot_date: string;
  slot_window: string;
  status: string;
  customer_notes: string | null;
  property_address: string;
  property_lat: number;
  property_lng: number;
  customer_name: string | null;
  customer_phone: string | null;
}

const WINDOW_LABELS: Record<string, { label: string; time: string }> = {
  A: { label: "Morning",       time: "9:00 – 11:00 AM" },
  B: { label: "Late Morning",  time: "11:30 AM – 1:30 PM" },
  C: { label: "Afternoon",     time: "2:30 – 4:30 PM" },
  D: { label: "Evening",       time: "5:00 – 7:00 PM" },
};

const STATUS_COLORS: Record<string, string> = {
  pending:   "#F59E0B",
  confirmed: "#6366F1",
  en_route:  "#22C55E",
  completed: "#6B7280",
};

// ── Component ──────────────────────────────────────────────────────────────────

export default function ShutterbugJobsScreen() {
  const { token, user } = useListingsStore();
  const isDark = true; // shutterbugs use dark UI
  const colors = COLORS.dark;

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTracking, setActiveTracking] = useState<string | null>(null); // booking ID being tracked
  const locationWatchRef = useRef<any>(null);

  // ── Fetch jobs ──────────────────────────────────────────────────────────────
  const fetchJobs = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/shutterbug/jobs`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setBookings(Array.isArray(data.bookings) ? data.bookings : []);
    } catch (e) {
      console.error("[ShutterbugJobs] fetch error:", e);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useFocusEffect(useCallback(() => { fetchJobs(); }, [fetchJobs]));

  // ── Start GPS tracking → POST to /api/shutterbug/location every 10s ─────────
  const startTracking = useCallback(async (bookingId: string) => {
    if (Platform.OS !== "web") {
      const { status } = await ExpoLocation.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Location required", "Please allow location access to start tracking.");
        return;
      }
    }

    setActiveTracking(bookingId);

    if (Platform.OS !== "web") {
      locationWatchRef.current = await ExpoLocation.watchPositionAsync(
        { accuracy: ExpoLocation.Accuracy.High, timeInterval: 10000, distanceInterval: 20 },
        async (loc) => {
          try {
            await fetch(`${API_BASE_URL}/api/shutterbug/location`, {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify({
                bookingId,
                lat: loc.coords.latitude,
                lng: loc.coords.longitude,
                heading: loc.coords.heading ?? 0,
                speed: loc.coords.speed ?? 0,
              }),
            });
          } catch (e) {
            console.warn("[ShutterbugJobs] location post failed:", e);
          }
        }
      );
    } else {
      // Web: use navigator.geolocation
      if (!navigator.geolocation) {
        Alert.alert("Not supported", "Geolocation is not supported in this browser.");
        return;
      }
      locationWatchRef.current = navigator.geolocation.watchPosition(
        async (pos) => {
          try {
            await fetch(`${API_BASE_URL}/api/shutterbug/location`, {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify({
                bookingId,
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
                heading: pos.coords.heading ?? 0,
                speed: pos.coords.speed ?? 0,
              }),
            });
          } catch (e) {
            console.warn("[ShutterbugJobs] location post failed:", e);
          }
        },
        (err) => console.warn("[ShutterbugJobs] geolocation error:", err),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
      );
    }

    // Refresh job list to reflect status change
    setTimeout(fetchJobs, 2000);
  }, [token, fetchJobs]);

  const stopTracking = useCallback(() => {
    if (locationWatchRef.current) {
      if (Platform.OS !== "web") {
        locationWatchRef.current.remove();
      } else {
        navigator.geolocation.clearWatch(locationWatchRef.current);
      }
      locationWatchRef.current = null;
    }
    setActiveTracking(null);
  }, []);

  // ── Mark done ────────────────────────────────────────────────────────────────
  const markDone = useCallback(async (bookingId: string) => {
    try {
      await fetch(`${API_BASE_URL}/api/shutterbug/jobs/${bookingId}/complete`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (activeTracking === bookingId) stopTracking();
      await fetchJobs();
    } catch (e) {
      Alert.alert("Error", "Failed to mark job as complete.");
    }
  }, [token, activeTracking, stopTracking, fetchJobs]);

  // ── Navigate via Google Maps ─────────────────────────────────────────────────
  const openNavigation = useCallback((lat: number, lng: number, address: string) => {
    const encoded = encodeURIComponent(address || `${lat},${lng}`);
    const url = Platform.OS === "ios"
      ? `http://maps.apple.com/?daddr=${lat},${lng}`
      : `https://maps.google.com/?daddr=${lat},${lng}&travelmode=driving`;
    Linking.openURL(url).catch(() =>
      Linking.openURL(`https://maps.google.com/?q=${encoded}`)
    );
  }, []);

  // ── Render ───────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (bookings.length === 0) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={{ fontSize: 48 }}>📸</Text>
        <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No shoots today</Text>
        <Text style={[styles.emptySubtitle, { color: colors.mutedForeground }]}>
          New jobs will appear here when assigned to you.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={styles.container}>
      <Text style={[styles.heading, { color: colors.foreground }]}>Your Shoots</Text>

      {bookings.map((booking) => {
        const win = WINDOW_LABELS[booking.slot_window] ?? { label: booking.slot_window, time: "" };
        const isTracking = activeTracking === booking.id;
        const statusColor = STATUS_COLORS[booking.status] ?? "#6B7280";
        const isDone = booking.status === "completed";

        return (
          <View
            key={booking.id}
            style={[
              styles.card,
              { backgroundColor: colors.card, borderColor: colors.border },
              Platform.select({
                ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 10 },
                android: { elevation: 4 },
                web: { boxShadow: "0 4px 16px rgba(0,0,0,0.2)" },
              }) as any,
            ]}
          >
            {/* Header row */}
            <View style={styles.cardHeader}>
              <View>
                <Text style={[styles.cardDate, { color: colors.foreground }]}>
                  {new Date(booking.slot_date + "T00:00:00").toLocaleDateString("en-IN", {
                    weekday: "short", day: "numeric", month: "short",
                  })}
                </Text>
                <Text style={[styles.cardWindow, { color: colors.mutedForeground }]}>
                  {win.label} · {win.time}
                </Text>
              </View>
              <View style={[styles.statusPill, { backgroundColor: statusColor + "25" }]}>
                <Text style={[styles.statusText, { color: statusColor }]}>
                  {booking.status === "en_route" ? "🚗 En route" : booking.status.charAt(0).toUpperCase() + booking.status.slice(1)}
                </Text>
              </View>
            </View>

            {/* Address */}
            <Text style={[styles.address, { color: colors.foreground }]} numberOfLines={2}>
              📍 {booking.property_address || "Address not provided"}
            </Text>

            {/* Customer notes */}
            {booking.customer_notes ? (
              <View style={[styles.notesBox, { backgroundColor: colors.muted ?? "#1a1a2e" }]}>
                <Text style={[styles.notesText, { color: colors.mutedForeground }]}>
                  💬 {booking.customer_notes}
                </Text>
              </View>
            ) : null}

            {/* Actions */}
            {!isDone && (
              <View style={styles.actions}>
                {/* Navigate */}
                <Pressable
                  style={[styles.actionBtn, styles.actionBtnSecondary, { borderColor: colors.border }]}
                  onPress={() => openNavigation(booking.property_lat, booking.property_lng, booking.property_address)}
                >
                  <Ionicons name="navigate-outline" size={16} color={colors.primary} />
                  <Text style={[styles.actionBtnText, { color: colors.primary }]}>Navigate</Text>
                </Pressable>

                {/* I'm heading there / Stop tracking */}
                {booking.status !== "en_route" ? (
                  <Pressable
                    style={[styles.actionBtn, { backgroundColor: colors.primary }]}
                    onPress={() => startTracking(booking.id)}
                    disabled={isTracking}
                  >
                    <Text style={styles.actionBtnPrimaryText}>
                      {isTracking ? "Starting…" : "🚗 I'm heading there"}
                    </Text>
                  </Pressable>
                ) : (
                  <Pressable
                    style={[styles.actionBtn, { backgroundColor: "#22C55E" }]}
                    onPress={() => markDone(booking.id)}
                  >
                    <Ionicons name="checkmark-circle-outline" size={16} color="#fff" />
                    <Text style={styles.actionBtnPrimaryText}>Mark Done</Text>
                  </Pressable>
                )}
              </View>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12 },
  container: { padding: 16, paddingBottom: 40 },
  heading: { fontSize: 22, fontWeight: "800", marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontWeight: "700" },
  emptySubtitle: { fontSize: 14, textAlign: "center", maxWidth: 240, lineHeight: 20 },
  card: { borderRadius: 18, borderWidth: 1, padding: 18, marginBottom: 16, gap: 12 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  cardDate: { fontSize: 17, fontWeight: "700" },
  cardWindow: { fontSize: 13, marginTop: 2 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  statusText: { fontSize: 12, fontWeight: "700" },
  address: { fontSize: 14, lineHeight: 20 },
  notesBox: { padding: 10, borderRadius: 10 },
  notesText: { fontSize: 13, lineHeight: 18 },
  actions: { flexDirection: "row", gap: 10 },
  actionBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, height: 44, borderRadius: 12,
    ...(Platform.OS === "web" ? ({ cursor: "pointer" } as any) : {}),
  },
  actionBtnSecondary: { borderWidth: 1.5 },
  actionBtnText: { fontSize: 14, fontWeight: "600" },
  actionBtnPrimaryText: { color: "#fff", fontSize: 14, fontWeight: "700" },
});
