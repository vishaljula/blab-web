/**
 * Shutterbug Guided Queue Screen — shows today's and upcoming assigned shoots
 * in strict `planned_start_at` order with an "UP NEXT" hero card and 1-tap
 * lifecycle transitions:
 *   Start Ride → Arrived at Property → Verify 6-Digit OTP & Start Shoot → Complete
 */
import React, { useState, useCallback, useRef } from "react";
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
  TextInput,
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
  lifecycle_state?: string;
  access_mode?: string;
  onsite_name?: string | null;
  onsite_phone?: string | null;
  arrival_otp?: string | null;
  planned_start_at?: string | null;
  planned_end_at?: string | null;
  customer_notes: string | null;
  property_address: string;
  property_lat: number;
  property_lng: number;
  customer_name: string | null;
  customer_phone: string | null;
}

const WINDOW_LABELS: Record<string, { label: string; time: string }> = {
  A: { label: "Morning",      time: "9:00 AM – 12:00 PM" },
  B: { label: "Midday",       time: "12:00 PM – 3:00 PM" },
  C: { label: "Afternoon",    time: "3:00 PM – 5:30 PM" },
  E: { label: "Express Shoot", time: "ASAP (~45 min)" },
};

const ACCESS_LABELS: Record<string, string> = {
  booker_present:    "👤 Owner / Booker at property",
  onsite_contact:    "🔑 Keyholder / Watchman / Tenant at property",
  key_with_watchman: "🔑 Watchman / Security Desk holds key",
  open_plot_no_key:  "🌳 Open plot / No key needed",
  owner:             "👤 Owner at property",
  tenant:            "🏠 Tenant / Family inside",
  watchman:          "🔑 Watchman / Security has keys",
  lockbox:           "🔒 Lockbox / Smart lock",
};

const STATUS_META: Record<string, { label: string; color: string }> = {
  booked:    { label: "Scheduled",   color: "#6366F1" },
  assigned:  { label: "Assigned",    color: "#6366F1" },
  pending:   { label: "Scheduled",   color: "#F59E0B" },
  confirmed: { label: "Confirmed",   color: "#6366F1" },
  en_route:  { label: "🛵 En Route", color: "#22C55E" },
  arrived:   { label: "📍 Arrived",  color: "#10B981" },
  shooting:  { label: "📸 Shooting", color: "#3B82F6" },
  uploading: { label: "☁️ Uploading", color: "#8B5CF6" },
  completed: { label: "✅ Completed", color: "#6B7280" },
};

const webCursor: any = Platform.OS === "web" ? { cursor: "pointer" } : {};

// ── Component ──────────────────────────────────────────────────────────────────

export default function ShutterbugJobsScreen() {
  const { token } = useListingsStore();
  const colors = COLORS.dark;

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [profile, setProfile] = useState<{ displayName: string; dispatchEnabled: boolean; completedToday: number }>({
    displayName: "Blab Shutterbug",
    dispatchEnabled: true,
    completedToday: 0,
  });
  const [loading, setLoading] = useState(true);
  const [activeTracking, setActiveTracking] = useState<string | null>(null);
  const [otpInputs, setOtpInputs] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const locationWatchRef = useRef<any>(null);

  // ── Fetch jobs ──────────────────────────────────────────────────────────────
  const fetchJobs = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(`${API_BASE_URL}/api/shutterbug/jobs`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setBookings(Array.isArray(data.bookings) ? data.bookings : []);
        if (data.profile) setProfile(data.profile);
      }
    } catch (e) {
      console.error("[ShutterbugJobs] fetch error:", e);
    } finally {
      setLoading(false);
    }
  }, [token]);

  const toggleShift = useCallback(async () => {
    if (!token) return;
    const next = !profile.dispatchEnabled;
    setProfile((p) => ({ ...p, dispatchEnabled: next }));
    try {
      await fetch(`${API_BASE_URL}/api/shutterbug/jobs`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ dispatchEnabled: next }),
      });
    } catch {
      setProfile((p) => ({ ...p, dispatchEnabled: !next }));
    }
  }, [token, profile.dispatchEnabled]);

  useFocusEffect(useCallback(() => { fetchJobs(); }, [fetchJobs]));

  // ── Start GPS tracking → POST to /api/shutterbug/location ──────────────────
  const startTracking = useCallback(async (bookingId: string) => {
    setBusyId(bookingId);
    try {
      if (Platform.OS !== "web") {
        const { status } = await ExpoLocation.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          Alert.alert("Location required", "Please allow location access to start live tracking.");
          return;
        }
      }

      setActiveTracking(bookingId);

      if (Platform.OS !== "web") {
        locationWatchRef.current = await ExpoLocation.watchPositionAsync(
          { accuracy: ExpoLocation.Accuracy.High, timeInterval: 3000, distanceInterval: 8 },
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
      } else if (typeof navigator !== "undefined" && navigator.geolocation) {
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
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 3000 }
        );
      }

      setTimeout(fetchJobs, 1200);
    } finally {
      setBusyId(null);
    }
  }, [token, fetchJobs]);

  const stopTracking = useCallback(() => {
    if (locationWatchRef.current) {
      if (Platform.OS !== "web") {
        locationWatchRef.current.remove?.();
      } else if (typeof navigator !== "undefined" && navigator.geolocation) {
        navigator.geolocation.clearWatch(locationWatchRef.current);
      }
      locationWatchRef.current = null;
    }
    setActiveTracking(null);
  }, []);

  // ── Lifecycle transition helper (`arrived` | `start_shoot` | `complete`) ────
  const runJobAction = useCallback(
    async (bookingId: string, action: "arrived" | "start_shoot" | "complete", otp?: string) => {
      setBusyId(bookingId);
      try {
        const res = await fetch(`${API_BASE_URL}/api/shutterbug/jobs/${bookingId}/complete`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ action, otp }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          Alert.alert("Check Code", data.error || "Could not update job state.");
          return;
        }
        if (action === "arrived" || action === "complete") {
          if (activeTracking === bookingId) stopTracking();
        }
        await fetchJobs();
      } catch {
        Alert.alert("Network Error", "Could not reach server. Please try again.");
      } finally {
        setBusyId(null);
      }
    },
    [token, activeTracking, stopTracking, fetchJobs]
  );

  // ── Navigate via Apple / Google Maps ─────────────────────────────────────────
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
        <Pressable
          onPress={toggleShift}
          style={[
            styles.shiftPill,
            { backgroundColor: profile.dispatchEnabled ? "#16A34A22" : colors.card, borderColor: profile.dispatchEnabled ? "#22C55E" : colors.border },
            webCursor,
          ]}
        >
          <View style={[styles.shiftDot, { backgroundColor: profile.dispatchEnabled ? "#22C55E" : "#9CA3AF" }]} />
          <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "700" }}>
            {profile.dispatchEnabled ? "Online · Ready" : "Offline"}
          </Text>
        </Pressable>
        <Text style={{ fontSize: 48 }}>📸</Text>
        <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Queue clear</Text>
        <Text style={[styles.emptySubtitle, { color: colors.mutedForeground }]}>
          {profile.completedToday > 0 ? `${profile.completedToday} completed today` : "Assigned shoots appear here."}
        </Text>
      </View>
    );
  }

  // First non-completed job is the Guided "#1 UP NEXT" stop
  const firstActiveIdx = bookings.findIndex(
    (b) => (b.lifecycle_state || b.status) !== "completed"
  );

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={styles.container}>
      <View style={styles.topRow}>
        <View>
          <Text style={[styles.heading, { color: colors.foreground }]}>Shoot Queue</Text>
          <Text style={[styles.subheading, { color: colors.mutedForeground }]}>
            {profile.completedToday} done today · {bookings.length} active
          </Text>
        </View>
        <Pressable
          onPress={toggleShift}
          style={[
            styles.shiftPill,
            { backgroundColor: profile.dispatchEnabled ? "#16A34A22" : colors.card, borderColor: profile.dispatchEnabled ? "#22C55E" : colors.border },
            webCursor,
          ]}
        >
          <View style={[styles.shiftDot, { backgroundColor: profile.dispatchEnabled ? "#22C55E" : "#9CA3AF" }]} />
          <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "700" }}>
            {profile.dispatchEnabled ? "Online" : "Offline"}
          </Text>
        </Pressable>
      </View>

      {bookings.map((booking, index) => {
        const state = booking.lifecycle_state || booking.status;
        const win = WINDOW_LABELS[booking.slot_window] ?? { label: booking.slot_window, time: "" };
        const meta = STATUS_META[state] ?? { label: state, color: "#6B7280" };
        const isUpNext = index === firstActiveIdx;
        const isDone = state === "completed";
        const isBusy = busyId === booking.id;
        const plannedTime = booking.planned_start_at
          ? new Date(booking.planned_start_at).toLocaleTimeString("en-IN", {
              hour: "numeric",
              minute: "2-digit",
            })
          : null;

        return (
          <View
            key={booking.id}
            style={[
              styles.card,
              {
                backgroundColor: colors.card,
                borderColor: isUpNext ? colors.primary : colors.border,
                borderWidth: isUpNext ? 2 : 1,
              },
              Platform.select({
                ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.14, shadowRadius: 10 },
                android: { elevation: 4 },
                web: { boxShadow: "0 4px 16px rgba(0,0,0,0.22)" },
              }) as any,
            ]}
          >
            {isUpNext && (
              <View style={[styles.upNextBanner, { backgroundColor: colors.primary + "22" }]}>
                <Ionicons name="sparkles" size={13} color={colors.primary} />
                <Text style={[styles.upNextText, { color: colors.primary }]}>
                  UP NEXT{plannedTime ? ` · TARGET ARRIVAL ${plannedTime.toUpperCase()}` : ""}
                </Text>
              </View>
            )}

            {/* Header row */}
            <View style={styles.cardHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.cardDate, { color: colors.foreground }]}>
                  {new Date(booking.slot_date + "T00:00:00").toLocaleDateString("en-IN", {
                    weekday: "short", day: "numeric", month: "short",
                  })}
                </Text>
                <Text style={[styles.cardWindow, { color: colors.mutedForeground }]}>
                  {win.label} · {win.time}
                </Text>
              </View>
              <View style={[styles.statusPill, { backgroundColor: meta.color + "25" }]}>
                <Text style={[styles.statusText, { color: meta.color }]}>{meta.label}</Text>
              </View>
            </View>

            {/* Address */}
            <Text style={[styles.address, { color: colors.foreground }]} numberOfLines={2}>
              📍 {booking.property_address || "Address not provided"}
            </Text>

            {/* Access mode & contact */}
            {booking.access_mode && (
              <View style={[styles.notesBox, { backgroundColor: colors.muted ?? "#1a1a2e" }]}>
                <Text style={[styles.notesText, { color: colors.foreground, fontWeight: "600" }]}>
                  {ACCESS_LABELS[booking.access_mode] ?? booking.access_mode}
                </Text>
                {(booking.onsite_name || booking.onsite_phone) && (
                  <Text style={[styles.notesText, { color: colors.mutedForeground, marginTop: 2 }]}>
                    Contact: {booking.onsite_name || "Keyholder"} {booking.onsite_phone ? `(${booking.onsite_phone})` : ""}
                  </Text>
                )}
              </View>
            )}

            {/* Customer notes */}
            {booking.customer_notes ? (
              <View style={[styles.notesBox, { backgroundColor: colors.muted ?? "#1a1a2e" }]}>
                <Text style={[styles.notesText, { color: colors.mutedForeground }]}>
                  💬 {booking.customer_notes}
                </Text>
              </View>
            ) : null}

            {/* OTP Handshake Input when Arrived */}
            {state === "arrived" && (
              <View style={[styles.otpSection, { borderColor: colors.border }]}>
                <Text style={[styles.otpPrompt, { color: colors.mutedForeground }]}>
                  Ask keyholder for 6-digit Arrival Code (or tap Start Shoot):
                </Text>
                <TextInput
                  value={otpInputs[booking.id] ?? ""}
                  onChangeText={(txt) => setOtpInputs((prev) => ({ ...prev, [booking.id]: txt }))}
                  placeholder={booking.arrival_otp || "6-digit code"}
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="number-pad"
                  maxLength={6}
                  style={[styles.otpInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
                />
              </View>
            )}

            {/* 25-Min Shoot Checklist when Shooting (HD Photos + 30s 9:16 Vertical Reel) */}
            {(state === "shooting" || state === "uploading") && (
              <View style={[styles.notesBox, { backgroundColor: "#10B98114", borderColor: "#10B98140", borderWidth: 1, marginBottom: 10 }]}>
                <Text style={{ fontSize: 12, fontWeight: "800", color: "#059669", marginBottom: 4 }}>
                  📸 25-MIN SHOOT DELIVERABLES
                </Text>
                <Text style={{ fontSize: 12, color: colors.foreground }}>
                  ✓ 8–10 Wide-Angle Horizontal HD Photos{"\n"}
                  ✓ 1× 30-sec Vertical (9:16) Walkthrough Reel (IG/YT Reverse-Link)
                </Text>
              </View>
            )}

            {/* Actions */}
            {!isDone && (
              <View style={styles.actions}>
                {/* Navigate */}
                <Pressable
                  style={[styles.actionBtn, styles.actionBtnSecondary, { borderColor: colors.border }, webCursor]}
                  onPress={() => openNavigation(booking.property_lat, booking.property_lng, booking.property_address)}
                >
                  <Ionicons name="navigate-outline" size={16} color={colors.primary} />
                  <Text style={[styles.actionBtnText, { color: colors.primary }]}>Navigate</Text>
                </Pressable>

                {/* Step 1: Start Ride */}
                {(state === "booked" || state === "assigned" || state === "pending" || state === "confirmed") && (
                  <Pressable
                    style={[styles.actionBtn, { backgroundColor: colors.primary }, webCursor]}
                    onPress={() => startTracking(booking.id)}
                    disabled={isBusy || activeTracking === booking.id}
                  >
                    <Text style={styles.actionBtnPrimaryText}>
                      {isBusy || activeTracking === booking.id ? "Starting…" : "🛵 Start Ride"}
                    </Text>
                  </Pressable>
                )}

                {/* Step 2: Mark Arrived */}
                {state === "en_route" && (
                  <Pressable
                    style={[styles.actionBtn, { backgroundColor: "#10B981" }, webCursor]}
                    onPress={() => runJobAction(booking.id, "arrived")}
                    disabled={isBusy}
                  >
                    <Ionicons name="location-outline" size={16} color="#fff" />
                    <Text style={styles.actionBtnPrimaryText}>I've Arrived</Text>
                  </Pressable>
                )}

                {/* Step 3: Verify OTP & Start Shoot */}
                {state === "arrived" && (
                  <Pressable
                    style={[styles.actionBtn, { backgroundColor: "#3B82F6" }, webCursor]}
                    onPress={() => runJobAction(booking.id, "start_shoot", otpInputs[booking.id]?.trim())}
                    disabled={isBusy}
                  >
                    <Ionicons name="camera-outline" size={16} color="#fff" />
                    <Text style={styles.actionBtnPrimaryText}>Start Shoot</Text>
                  </Pressable>
                )}

                {/* Step 4: Complete Shoot */}
                {(state === "shooting" || state === "uploading") && (
                  <Pressable
                    style={[styles.actionBtn, { backgroundColor: "#22C55E" }, webCursor]}
                    onPress={() => runJobAction(booking.id, "complete")}
                    disabled={isBusy}
                  >
                    <Ionicons name="checkmark-circle-outline" size={16} color="#fff" />
                    <Text style={styles.actionBtnPrimaryText}>Upload HD + 9:16 Reel</Text>
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
  heading: { fontSize: 22, fontWeight: "800" },
  subheading: { fontSize: 12, marginTop: 2 },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  shiftPill: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1,
  },
  shiftDot: { width: 8, height: 8, borderRadius: 4 },
  emptyTitle: { fontSize: 20, fontWeight: "700" },
  emptySubtitle: { fontSize: 14, textAlign: "center", maxWidth: 240, lineHeight: 20 },
  card: { borderRadius: 18, borderWidth: 1, padding: 18, marginBottom: 16, gap: 12 },
  upNextBanner: {
    flexDirection: "row", alignItems: "center", gap: 6,
    alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8,
  },
  upNextText: { fontSize: 11, fontWeight: "800", letterSpacing: 0.6 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  cardDate: { fontSize: 17, fontWeight: "700" },
  cardWindow: { fontSize: 13, marginTop: 2 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  statusText: { fontSize: 12, fontWeight: "700" },
  address: { fontSize: 14, lineHeight: 20 },
  notesBox: { padding: 10, borderRadius: 10 },
  notesText: { fontSize: 13, lineHeight: 18 },
  otpSection: { gap: 8, paddingTop: 4 },
  otpPrompt: { fontSize: 12 },
  otpInput: {
    height: 42, borderRadius: 10, borderWidth: 1, paddingHorizontal: 12,
    fontSize: 16, fontWeight: "700", letterSpacing: 4,
  },
  actions: { flexDirection: "row", gap: 10 },
  actionBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, height: 44, borderRadius: 12,
  },
  actionBtnSecondary: { borderWidth: 1.5 },
  actionBtnText: { fontSize: 14, fontWeight: "600" },
  actionBtnPrimaryText: { color: "#fff", fontSize: 14, fontWeight: "700" },
});
