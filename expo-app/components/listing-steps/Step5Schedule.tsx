/**
 * Step5Schedule — Photography shoot scheduling step in the listing wizard.
 *
 * Two modes based on zone check:
 *  1. IN ZONE  → Calendar + time window picker → confirm booking
 *  2. OUT ZONE → Waitlist capture screen with queue position
 *
 * Web + Native: single component, Platform.select() for shadows.
 */
import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColorScheme } from "@/components/useColorScheme";
import { COLORS, API_BASE_URL } from "@/lib/theme";
import { useListingsStore } from "@/store/listings";
import { useListingFormStore } from "@/store/listingForm";
import { useRouter } from "expo-router";

// ── Types ──────────────────────────────────────────────────────────────────────

interface TimeWindow {
  id: string;
  label: string;
  startHour: number;
  startMin: number;
  endHour: number;
  endMin: number;
  available: boolean;
  spotsLeft: number;
  tooSoon: boolean;
}

interface DayAvailability {
  date: string; // YYYY-MM-DD
  hasAnySlot: boolean;
  windows: TimeWindow[];
}

interface AvailabilityResponse {
  success: boolean;
  inServiceZone: boolean;
  propertyH3Cell?: string;
  waitlistQueuePosition?: number;
  capacity?: number;
  availability?: DayAvailability[];
  zoneCenter?: { lat: number; lng: number };
  zoneRadiusKm?: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function windowTimeLabel(w: TimeWindow) {
  return `${pad2(w.startHour)}:${pad2(w.startMin)} – ${pad2(w.endHour)}:${pad2(w.endMin)}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Step5Schedule() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = isDark ? COLORS.dark : COLORS.light;

  const router = useRouter();
  const token = useListingsStore((s) => s.token);
  const formState = useListingFormStore((s) => s);
  const listingId = formState.createdListingId;

  // Navigate to tabs and reset form when done
  const handleDone = useCallback(() => {
    formState.reset();
    router.replace("/(tabs)");
  }, [formState, router]);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [availability, setAvailability] = useState<AvailabilityResponse | null>(null);

  // Selection state
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedWindow, setSelectedWindow] = useState<TimeWindow | null>(null);
  const [notes, setNotes] = useState("");

  // Success state
  const [booked, setBooked] = useState(false);
  const [bookingId, setBookingId] = useState<string | null>(null);

  // ── Fetch availability ───────────────────────────────────────────────────
  useEffect(() => {
    if (!formState.latitude || !formState.longitude) {
      setLoading(false);
      return;
    }
    fetchAvailability();
  }, []);

  const fetchAvailability = useCallback(async () => {
    setLoading(true);
    try {
      const url = `${API_BASE_URL}/api/photography/availability?lat=${formState.latitude}&lng=${formState.longitude}&days=10`;
      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data: AvailabilityResponse = await res.json();
      setAvailability(data);
    } catch (e) {
      console.error("[Step5Schedule] fetchAvailability error:", e);
    } finally {
      setLoading(false);
    }
  }, [formState.latitude, formState.longitude, token]);

  // Auto-select first available date
  useEffect(() => {
    if (!availability?.availability) return;
    const first = availability.availability.find((d) => d.hasAnySlot);
    if (first && !selectedDate) setSelectedDate(first.date);
  }, [availability]);

  // Clear window selection when date changes
  useEffect(() => {
    setSelectedWindow(null);
  }, [selectedDate]);

  // ── Submit booking ────────────────────────────────────────────────────────
  const handleBook = useCallback(async () => {
    if (!selectedDate || !selectedWindow || !listingId) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/photography/bookings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          listingId,
          slotDate: selectedDate,
          slotWindow: selectedWindow.id,
          customerNotes: notes.trim() || null,
          propertyH3Cell: availability?.propertyH3Cell,
          bookingSource: "organic",
        }),
      });
      const data = await res.json();
      if (data.success) {
        setBookingId(data.bookingId);
        setBooked(true);
      } else if (data.error === "slot_full") {
        // Refresh availability — another customer snagged the slot
        await fetchAvailability();
        setSelectedWindow(null);
        alert("That slot just filled up. Please pick another.");
      } else {
        alert(data.message ?? "Booking failed. Please try again.");
      }
    } catch (e) {
      alert("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }, [selectedDate, selectedWindow, listingId, notes, token, availability, fetchAvailability]);

  // ── Submit waitlist ───────────────────────────────────────────────────────
  const handleWaitlist = useCallback(async () => {
    if (!token) return;
    setSubmitting(true);
    try {
      await fetch(`${API_BASE_URL}/api/photography/waitlist`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          listingId,
          propertyAddress: formState.address,
          propertyLat: formState.latitude,
          propertyLng: formState.longitude,
          propertyH3Cell: availability?.propertyH3Cell,
        }),
      });
      setBooked(true);
    } catch (e) {
      alert("Failed to join waitlist. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }, [token, listingId, formState, availability]);

  // ── Loading state ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>
          Checking availability…
        </Text>
      </View>
    );
  }

  // ── Success: booked ───────────────────────────────────────────────────────
  if (booked && availability?.inServiceZone) {
    const selDay = availability.availability?.find((d) => d.date === selectedDate);
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={styles.successContainer}
      >
        <View style={[styles.successCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.successIcon}>
            <Ionicons name="checkmark-circle" size={64} color="#22C55E" />
          </View>
          <Text style={[styles.successTitle, { color: colors.foreground }]}>You're booked!</Text>
          {selDay && selectedWindow && (
            <>
              <Text style={[styles.successDate, { color: colors.foreground }]}>
                {formatDate(selectedDate!)}
              </Text>
              <View style={[styles.successWindowPill, { backgroundColor: colors.primary + "20" }]}>
                <Ionicons name="time-outline" size={16} color={colors.primary} />
                <Text style={[styles.successWindowText, { color: colors.primary }]}>
                  {selectedWindow.label} · {windowTimeLabel(selectedWindow)}
                </Text>
              </View>
            </>
          )}
          <View style={[styles.successNote, { backgroundColor: colors.muted }]}>
            <Ionicons name="phone-portrait-outline" size={16} color={colors.mutedForeground} />
            <Text style={[styles.successNoteText, { color: colors.mutedForeground }]}>
              Your Shutterbug will WhatsApp you 30 minutes before arrival.
            </Text>
          </View>
          <View style={[styles.successNote, { backgroundColor: colors.muted }]}>
            <Ionicons name="bulb-outline" size={16} color={colors.mutedForeground} />
            <Text style={[styles.successNoteText, { color: colors.mutedForeground }]}>
              Keep lights on and the property tidy for the best photos.
            </Text>
          </View>
          <Pressable
            style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
            onPress={handleDone}
          >
            <Text style={styles.primaryBtnText}>View my listing →</Text>
          </Pressable>
        </View>
      </ScrollView>
    );
  }

  // ── Success: waitlisted ───────────────────────────────────────────────────
  if (booked && !availability?.inServiceZone) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={styles.successContainer}
      >
        <View style={[styles.successCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={{ fontSize: 48, textAlign: "center", marginBottom: 8 }}>📬</Text>
          <Text style={[styles.successTitle, { color: colors.foreground }]}>You're on the list!</Text>
          <Text style={[styles.successSubtitle, { color: colors.mutedForeground }]}>
            We're expanding fast. We'll notify you the moment our Shutterbugs reach your area.
          </Text>
          <View style={[styles.queuePill, { backgroundColor: colors.primary + "20" }]}>
            <Text style={[styles.queueText, { color: colors.primary }]}>
              #{availability?.waitlistQueuePosition ?? "?"} in your area
            </Text>
          </View>
          <Pressable
            style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
            onPress={handleDone}
          >
            <Text style={styles.primaryBtnText}>Continue to my listing →</Text>
          </Pressable>
        </View>
      </ScrollView>
    );
  }

  // ── Out of zone: waitlist CTA ─────────────────────────────────────────────
  if (!availability?.inServiceZone) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={styles.container}
      >
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={{ fontSize: 48, textAlign: "center", marginBottom: 12 }}>📍</Text>
          <Text style={[styles.title, { color: colors.foreground }]}>Coming to your area soon!</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            Your Blab Shutterbug team is currently serving the L.B. Nagar area. We're expanding fast — your listing is saved and live on the map now.
          </Text>
          <View style={[styles.queuePill, { backgroundColor: colors.primary + "20" }]}>
            <Text style={[styles.queueText, { color: colors.primary }]}>
              You'd be #{availability?.waitlistQueuePosition ?? "..."} in your area
            </Text>
          </View>
          <Pressable
            style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
            onPress={handleWaitlist}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>Notify me when available</Text>
            )}
          </Pressable>
          <Pressable style={styles.skipBtn} onPress={handleDone}>
            <Text style={[styles.skipText, { color: colors.mutedForeground }]}>Skip for now</Text>
          </Pressable>
        </View>
      </ScrollView>
    );
  }

  // ── In zone: calendar + window picker ────────────────────────────────────
  const days = availability.availability ?? [];
  const selectedDayData = days.find((d) => d.date === selectedDate);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={[styles.title, { color: colors.foreground }]}>Schedule your shoot</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          A Blab Shutterbug will photograph your property professionally. Takes ~45 minutes.
        </Text>

        {/* Date strip */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dateStrip}>
          {days.map((day) => {
            const isSelected = day.date === selectedDate;
            const isFull = !day.hasAnySlot;
            return (
              <Pressable
                key={day.date}
                style={[
                  styles.dateChip,
                  {
                    backgroundColor: isSelected ? colors.primary : colors.card,
                    borderColor: isSelected ? colors.primary : colors.border,
                    opacity: isFull ? 0.4 : 1,
                  },
                ]}
                onPress={() => !isFull && setSelectedDate(day.date)}
                disabled={isFull}
              >
                <Text style={[styles.dateChipDay, { color: isSelected ? "#fff" : colors.mutedForeground }]}>
                  {new Date(day.date + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short" }).toUpperCase()}
                </Text>
                <Text style={[styles.dateChipNum, { color: isSelected ? "#fff" : colors.foreground }]}>
                  {new Date(day.date + "T00:00:00").getDate()}
                </Text>
                {isFull && (
                  <Text style={[styles.dateChipFull, { color: isSelected ? "#fff" : colors.mutedForeground }]}>
                    FULL
                  </Text>
                )}
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Time windows */}
        {selectedDayData && (
          <View style={styles.windowsContainer}>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
              {formatDate(selectedDate!)}
            </Text>
            {selectedDayData.windows.map((w) => {
              const isSelected = selectedWindow?.id === w.id;
              const isFull = !w.available && !w.tooSoon;
              const isTooSoon = w.tooSoon;
              const disabled = !w.available;

              return (
                <Pressable
                  key={w.id}
                  style={[
                    styles.windowRow,
                    {
                      backgroundColor: isSelected ? colors.primary + "15" : colors.card,
                      borderColor: isSelected ? colors.primary : colors.border,
                      opacity: disabled ? 0.45 : 1,
                    },
                    Platform.select({
                      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6 },
                      android: { elevation: 2 },
                      web: { boxShadow: "0 2px 8px rgba(0,0,0,0.06)" },
                    }) as any,
                  ]}
                  onPress={() => !disabled && setSelectedWindow(w)}
                  disabled={disabled}
                >
                  <View style={styles.windowLeft}>
                    <View style={[styles.windowRadio, { borderColor: isSelected ? colors.primary : colors.border }]}>
                      {isSelected && (
                        <View style={[styles.windowRadioInner, { backgroundColor: colors.primary }]} />
                      )}
                    </View>
                    <View>
                      <Text style={[styles.windowLabel, { color: colors.foreground }]}>{w.label}</Text>
                      <Text style={[styles.windowTime, { color: colors.mutedForeground }]}>
                        {windowTimeLabel(w)}
                      </Text>
                    </View>
                  </View>
                  {isTooSoon ? (
                    <Text style={[styles.windowBadge, { color: colors.mutedForeground }]}>Too soon</Text>
                  ) : isFull ? (
                    <View style={[styles.windowBadgePill, { backgroundColor: "#EF444420" }]}>
                      <Text style={[styles.windowBadge, { color: "#EF4444" }]}>FULL</Text>
                    </View>
                  ) : w.spotsLeft <= 3 ? (
                    <View style={[styles.windowBadgePill, { backgroundColor: "#F59E0B20" }]}>
                      <Text style={[styles.windowBadge, { color: "#F59E0B" }]}>
                        {w.spotsLeft} left
                      </Text>
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        )}

        {/* Notes for shutterbug */}
        {selectedWindow && (
          <View style={styles.notesContainer}>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
              Notes for your Shutterbug <Text style={{ fontWeight: "400" }}>(optional)</Text>
            </Text>
            <TextInput
              style={[
                styles.notesInput,
                { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border },
              ]}
              placeholder="e.g. Gate code 1234, parking on left, 3rd floor"
              placeholderTextColor={colors.mutedForeground}
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={3}
            />
          </View>
        )}

        {/* Confirm CTA */}
        <Pressable
          style={[
            styles.primaryBtn,
            {
              backgroundColor: selectedWindow ? colors.primary : colors.border,
              marginTop: 8,
            },
          ]}
          onPress={handleBook}
          disabled={!selectedWindow || submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryBtnText}>
              {selectedWindow ? "Confirm Shoot Time" : "Select a time window above"}
            </Text>
          )}
        </Pressable>

        <Text style={[styles.footerNote, { color: colors.mutedForeground }]}>
          We'll WhatsApp you 30 minutes before your Shutterbug arrives.
        </Text>
      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12 },
  loadingText: { fontSize: 14 },
  container: { padding: 20, paddingBottom: 40 },
  card: {
    borderRadius: 20, borderWidth: 1, padding: 24, alignItems: "center", gap: 16,
  },
  title: { fontSize: 22, fontWeight: "700", textAlign: "center" },
  subtitle: { fontSize: 14, lineHeight: 20, textAlign: "center" },
  successContainer: { padding: 20, paddingBottom: 40 },
  successCard: {
    borderRadius: 20, borderWidth: 1, padding: 28, alignItems: "center", gap: 16,
  },
  successIcon: { marginBottom: 4 },
  successTitle: { fontSize: 26, fontWeight: "800", textAlign: "center" },
  successDate: { fontSize: 18, fontWeight: "600", textAlign: "center" },
  successWindowPill: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
  },
  successWindowText: { fontSize: 14, fontWeight: "600" },
  successNote: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    padding: 12, borderRadius: 12, width: "100%",
  },
  successNoteText: { fontSize: 13, lineHeight: 18, flex: 1 },
  successSubtitle: { fontSize: 14, lineHeight: 20, textAlign: "center" },
  queuePill: {
    paddingHorizontal: 18, paddingVertical: 10, borderRadius: 24,
  },
  queueText: { fontSize: 16, fontWeight: "700" },
  primaryBtn: {
    width: "100%", height: 52, borderRadius: 14,
    justifyContent: "center", alignItems: "center",
    marginTop: 4,
  },
  primaryBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  skipBtn: { paddingVertical: 12 },
  skipText: { fontSize: 14 },
  dateStrip: { marginVertical: 12 },
  dateChip: {
    width: 60, marginRight: 10, borderRadius: 14, borderWidth: 1.5,
    paddingVertical: 10, alignItems: "center", gap: 2,
  },
  dateChipDay: { fontSize: 11, fontWeight: "600" },
  dateChipNum: { fontSize: 20, fontWeight: "800" },
  dateChipFull: { fontSize: 9, fontWeight: "700" },
  windowsContainer: { gap: 10, marginTop: 4 },
  sectionLabel: { fontSize: 13, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 },
  windowRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    borderRadius: 14, borderWidth: 1.5, padding: 16,
  },
  windowLeft: { flexDirection: "row", alignItems: "center", gap: 14 },
  windowRadio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, justifyContent: "center", alignItems: "center" },
  windowRadioInner: { width: 11, height: 11, borderRadius: 5.5 },
  windowLabel: { fontSize: 16, fontWeight: "600" },
  windowTime: { fontSize: 12, marginTop: 2 },
  windowBadgePill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  windowBadge: { fontSize: 12, fontWeight: "700" },
  notesContainer: { marginTop: 16, gap: 8 },
  notesInput: {
    borderWidth: 1.5, borderRadius: 12, padding: 14,
    fontSize: 14, minHeight: 72, textAlignVertical: "top",
  },
  footerNote: { fontSize: 12, textAlign: "center", marginTop: 16, lineHeight: 18 },
});
