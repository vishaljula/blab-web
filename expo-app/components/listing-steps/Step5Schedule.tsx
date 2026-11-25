/**
 * Step5Schedule — Photography shoot scheduling step in the listing wizard.
 *
 * Two modes based on zone check:
 *  1. IN ZONE  → Calendar + 3 Daylight Windows (+ conditional Express slot) + Access Mode → confirm booking
 *  2. OUT ZONE → Waitlist capture screen with queue position
 *
 * Web + Native: single component, Platform.select() for shadows, web cursor guards.
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
  Share,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
  durationProfile?: { onsiteMinutes: number; exteriorMinutes: number; setupMinutes: number };
  pricingQuote?: {
    basePriceInr: number;
    expressSurchargeInr: number;
    discountInr: number;
    payableInr: number;
    promoActive: boolean;
    promoLabel: string;
  };
  expressSlot?: { available: boolean; etaMinutes: number | null; candidateCount: number };
  availability?: DayAvailability[];
  zoneCenter?: { lat: number; lng: number };
  zoneRadiusKm?: number;
}

type AccessMode = "booker_present" | "onsite_contact" | "open_plot_no_key";

const webCursor: any = Platform.OS === "web" ? { cursor: "pointer" } : null;

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" });
}

function windowTimeLabel(w: TimeWindow) {
  if (w.id === "E") return "Arrives in ~25–30 mins";
  const fmt = (h: number, m = 0) => {
    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 === 0 ? 12 : h % 12;
    const minStr = m > 0 ? `:${String(m).padStart(2, "0")}` : "";
    return `${h12}${minStr} ${ampm}`;
  };
  return `${fmt(w.startHour, w.startMin)} – ${fmt(w.endHour, w.endMin)}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Step5Schedule() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = isDark ? COLORS.dark : COLORS.light;
  const insets = useSafeAreaInsets();

  const router = useRouter();
  const token = useListingsStore((s) => s.token);
  const setActiveBookingId = useListingsStore((s) => s.setActiveBookingId);
  const setPreloadedTrack = useListingsStore((s) => s.setPreloadedTrack);

  const formState = useListingFormStore((s) => s);
  const listingId = formState.createdListingId;

  const isPlotOrWarehouse =
    formState.propertyType === "plot" || formState.propertyType === "commercial";

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [availability, setAvailability] = useState<AvailabilityResponse | null>(null);
  const [slotNotice, setSlotNotice] = useState<string | null>(null);

  // Selection state
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedWindow, setSelectedWindow] = useState<TimeWindow | null>(null);
  const [accessMode, setAccessMode] = useState<AccessMode>(
    formState.propertyType === "plot" ? "open_plot_no_key" : "booker_present"
  );
  const [onsiteName, setOnsiteName] = useState("");
  const [onsitePhone, setOnsitePhone] = useState("");
  const [notes, setNotes] = useState("");

  // Success state
  const [booked, setBooked] = useState(false);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [trackingToken, setTrackingToken] = useState<string | null>(null);
  const [arrivalOtp, setArrivalOtp] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [simulatingPreview, setSimulatingPreview] = useState(false);

  const handleDoneToMap = useCallback(() => {
    router.replace("/(tabs)");
    setTimeout(() => formState.reset(), 450);
  }, [formState, router]);

  const handleOpenTracking = useCallback(() => {
    if (!bookingId) return;
    const id = bookingId;
    const tok = trackingToken;
    router.replace((tok ? `/tracking/${id}?t=${tok}` : `/tracking/${id}`) as any);
    setTimeout(() => formState.reset(), 450);
  }, [bookingId, trackingToken, formState, router]);

  const handleDevSimulateAndTrack = useCallback(async () => {
    if (!bookingId) return;
    setSimulatingPreview(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/dev/simulate-booking/${bookingId}`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (data?.success && data.route && data.shutterbugLocation) {
        setPreloadedTrack(bookingId, {
          status: "en_route",
          lifecycleState: "en_route",
          route: data.route,
          shutterbugLocation: data.shutterbugLocation,
          propertyLocation: data.propertyLocation,
          propertyAddress: data.propertyAddress,
          propertyType: data.propertyType,
          arrivalOtp: data.arrivalOtp,
        });
      }
      setActiveBookingId(bookingId);
    } catch {
      // ignore
    } finally {
      setSimulatingPreview(false);
    }
    const id = bookingId;
    const tok = trackingToken;
    router.replace((tok ? `/tracking/${id}?t=${tok}` : `/tracking/${id}`) as any);
    setTimeout(() => formState.reset(), 450);
  }, [bookingId, trackingToken, formState, router, setActiveBookingId, setPreloadedTrack]);

  // ── Fetch availability on mount (Fetch-on-Intent, no background timer polling) ──
  const fetchAvailability = useCallback(async () => {
    setLoading(true);
    try {
      const propType = encodeURIComponent(formState.propertyType ?? "apartment");
      const url = `${API_BASE_URL}/api/photography/availability?lat=${formState.latitude}&lng=${formState.longitude}&days=10&propertyType=${propType}`;
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
  }, [formState.latitude, formState.longitude, formState.propertyType, token]);

  useEffect(() => {
    if (!formState.latitude || !formState.longitude) {
      setLoading(false);
      return;
    }
    fetchAvailability();
  }, [fetchAvailability]);

  // Auto-select first available date
  useEffect(() => {
    if (!availability?.availability) return;
    const first = availability.availability.find((d) => d.hasAnySlot);
    if (first && (!selectedDate || !availability.availability.some((d) => d.date === selectedDate && d.hasAnySlot))) {
      setSelectedDate(first.date);
    }
  }, [availability]);

  // Clear window selection when date changes
  useEffect(() => {
    setSelectedWindow(null);
  }, [selectedDate]);

  // ── Submit booking ────────────────────────────────────────────────────────
  const handleBook = useCallback(async () => {
    if (!selectedDate || !selectedWindow || !listingId) return;
    if (accessMode === "onsite_contact" && (!onsiteName.trim() || !onsitePhone.trim())) {
      setSlotNotice("Please enter the name and phone number of the person at the property.");
      return;
    }

    setSubmitting(true);
    setSlotNotice(null);
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
          serviceMode: selectedWindow.id === "E" ? "express" : "scheduled",
          accessMode,
          onsiteName: accessMode === "onsite_contact" ? onsiteName.trim() : null,
          onsitePhone: accessMode === "onsite_contact" ? onsitePhone.trim() : null,
          customerNotes: notes.trim() || null,
          propertyH3Cell: availability?.propertyH3Cell,
          bookingSource: "organic",
        }),
      });
      const data = await res.json();
      if (data.success) {
        setBookingId(data.bookingId);
        setTrackingToken(data.trackingToken ?? null);
        setArrivalOtp(data.arrivalOtp ?? null);
        if (data.initialTrack) {
          setPreloadedTrack(data.bookingId, {
            ...data.initialTrack,
            propertyAddress: formState.address ?? null,
          });
        }
        // Only show "Shutterbug tracking active" banner on the home map if the Shutterbug is actually en_route (Express)
        if (selectedWindow.id === "E" || data.status === "en_route") {
          setActiveBookingId(data.bookingId);
        }
        setBooked(true);
      } else if (data.error === "slot_full") {
        // Piggybacked 409 refresh: update availability directly from the response body
        if (data.availability) {
          setAvailability(data.availability);
        } else {
          await fetchAvailability();
        }
        setSelectedWindow(null);
        setSlotNotice(data.message ?? "That slot just filled up! Please pick an updated time below.");
      } else {
        setSlotNotice(data.message ?? data.error ?? "Booking failed. Please try again.");
      }
    } catch {
      setSlotNotice("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }, [
    selectedDate,
    selectedWindow,
    listingId,
    accessMode,
    onsiteName,
    onsitePhone,
    notes,
    token,
    availability,
    fetchAvailability,
    setActiveBookingId,
  ]);

  const handleShareTrackingLink = useCallback(async () => {
    if (!bookingId) return;
    const shareUrl = `${API_BASE_URL.replace(":3000", ":8081")}/tracking/${bookingId}${
      trackingToken ? `?t=${trackingToken}` : ""
    }`;
    const msg = `Blab Photography Shoot Tracking Link${
      onsiteName ? ` for ${onsiteName}` : ""
    }: ${shareUrl}${arrivalOtp ? `\nArrival Code (OTP): ${arrivalOtp}` : ""}`;

    if (Platform.OS === "web") {
      try {
        await (navigator as any)?.clipboard?.writeText(msg);
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 2500);
      } catch {
        // ignore
      }
    } else {
      try {
        await Share.share({ message: msg });
      } catch {
        // ignore
      }
    }
  }, [bookingId, trackingToken, arrivalOtp, onsiteName]);

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
    } catch {
      setSlotNotice("Failed to join waitlist. Please try again.");
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
          Checking Shutterbug routes in your area…
        </Text>
      </View>
    );
  }

  // ── Success: booked ───────────────────────────────────────────────────────
  if (booked && availability?.inServiceZone) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={[styles.successContainer, { paddingTop: insets.top + 24 }]}
      >
        <View style={[styles.successCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.successBadge, { backgroundColor: "#22C55E15" }]}>
            <Ionicons name="checkmark-circle" size={52} color="#22C55E" />
          </View>
          <Text style={[styles.successTitle, { color: colors.foreground }]}>Shoot booked!</Text>

          {selectedDate && selectedWindow && (
            <View style={[styles.slotDetail, { backgroundColor: colors.muted, borderColor: colors.border }]}>
              <View style={styles.slotRow}>
                <Ionicons name="calendar-outline" size={18} color={colors.primary} />
                <Text style={[styles.slotText, { color: colors.foreground }]}>
                  {formatDate(selectedDate)}
                </Text>
              </View>
              <View style={[styles.slotDivider, { backgroundColor: colors.border }]} />
              <View style={styles.slotRow}>
                <Ionicons name="time-outline" size={18} color={colors.primary} />
                <Text style={[styles.slotText, { color: colors.foreground }]}>
                  {selectedWindow.label} · {windowTimeLabel(selectedWindow)}
                </Text>
              </View>
            </View>
          )}

          {/* Arrival OTP & Keyholder Share Card */}
          {arrivalOtp && accessMode !== "open_plot_no_key" && (
            <View style={[styles.otpBox, { backgroundColor: `${colors.primary}10`, borderColor: `${colors.primary}35` }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.otpLabel, { color: colors.mutedForeground }]}>
                  6-DIGIT ARRIVAL CODE
                </Text>
                <Text style={[styles.otpValue, { color: colors.primary }]}>{arrivalOtp}</Text>
                <Text style={[styles.otpHint, { color: colors.mutedForeground }]}>
                  Share this code with the Shutterbug when they arrive at the property gate.
                </Text>
              </View>
            </View>
          )}

          {trackingToken && (
            <Pressable
              style={[
                styles.secondaryBtn,
                { borderColor: colors.primary, backgroundColor: `${colors.primary}10` },
                webCursor,
              ]}
              onPress={handleShareTrackingLink}
            >
              <Ionicons name="share-social-outline" size={18} color={colors.primary} />
              <Text style={[styles.secondaryBtnText, { color: colors.primary }]}>
                {copiedLink
                  ? "Copied tracking link & code!"
                  : accessMode === "onsite_contact" && onsiteName
                  ? `Share tracking link with ${onsiteName}`
                  : "Share live tracking link (Watchman / Tenant)"}
              </Text>
            </Pressable>
          )}

          <Text style={[styles.nextLabel, { color: colors.mutedForeground }]}>WHAT HAPPENS NEXT</Text>

          {[
            {
              icon: "notifications-outline" as const,
              text: "You'll get an alert the moment your Shutterbug taps 'Start Ride' to head your way.",
            },
            {
              icon: "navigate-outline" as const,
              text: "Track their 3D scooter live on the map as they ride to your property.",
            },
            {
              icon: "images-outline" as const,
              text: "Your verified listing goes live on the map within 24 hrs of the shoot.",
            },
          ].map((item, i) => (
            <View key={i} style={[styles.nextStep, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
              <View style={[styles.nextIconBox, { backgroundColor: colors.primary + "15" }]}>
                <Ionicons name={item.icon} size={18} color={colors.primary} />
              </View>
              <Text style={[styles.nextText, { color: colors.mutedForeground }]}>{item.text}</Text>
            </View>
          ))}

          {selectedWindow?.id === "E" ? (
            <>
              <Pressable
                style={[styles.primaryBtn, { backgroundColor: colors.primary }, webCursor]}
                onPress={handleOpenTracking}
              >
                <Text style={styles.primaryBtnText}>Track Live Scooter Now →</Text>
              </Pressable>

              <Pressable style={[styles.skipBtn, webCursor]} onPress={handleDoneToMap}>
                <Text style={[styles.skipText, { color: colors.mutedForeground }]}>Back to Map</Text>
              </Pressable>
            </>
          ) : (
            <>
              <View
                style={[
                  styles.secondaryBtn,
                  { borderColor: colors.border, backgroundColor: colors.muted, opacity: 0.7 },
                ]}
              >
                <Ionicons name="lock-closed-outline" size={16} color={colors.mutedForeground} />
                <Text style={[styles.secondaryBtnText, { color: colors.mutedForeground }]}>
                  Live 3D map unlocks when Shutterbug starts ride
                </Text>
              </View>

              <Pressable
                style={[styles.primaryBtn, { backgroundColor: colors.primary }, webCursor]}
                onPress={handleDoneToMap}
              >
                <Text style={styles.primaryBtnText}>Done — Back to Map</Text>
              </Pressable>

              {__DEV__ && (
                <Pressable
                  style={[styles.skipBtn, webCursor]}
                  onPress={handleDevSimulateAndTrack}
                  disabled={simulatingPreview}
                >
                  <Text style={[styles.skipText, { color: colors.primary, fontWeight: "700" }]}>
                    {simulatingPreview
                      ? "Starting scooter ride…"
                      : "⚡ DEV · Start Ride & Preview 3D Tracking"}
                  </Text>
                </Pressable>
              )}
            </>
          )}
        </View>
      </ScrollView>
    );
  }

  // ── Success: waitlisted ───────────────────────────────────────────────────
  if (booked && !availability?.inServiceZone) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={[styles.successContainer, { paddingTop: insets.top + 24 }]}
      >
        <View style={[styles.successCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={{ fontSize: 48, textAlign: "center", marginBottom: 8 }}>📬</Text>
          <Text style={[styles.successTitle, { color: colors.foreground }]}>You're on the list!</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground, textAlign: "center" }]}>
            We're expanding fast. The moment our Shutterbugs reach your area, you'll be first to know.
          </Text>
          <View style={[styles.queuePill, { backgroundColor: colors.primary + "20" }]}>
            <Text style={[styles.queueText, { color: colors.primary }]}>
              #{availability?.waitlistQueuePosition ?? "?"} in your area
            </Text>
          </View>
          <Pressable
            style={[styles.primaryBtn, { backgroundColor: colors.primary }, webCursor]}
            onPress={handleDoneToMap}
          >
            <Text style={styles.primaryBtnText}>Back to Map →</Text>
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
        contentContainerStyle={[styles.container, { paddingTop: insets.top + 16 }]}
      >
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={{ fontSize: 48, textAlign: "center", marginBottom: 12 }}>📍</Text>
          <Text style={[styles.title, { color: colors.foreground }]}>Coming to your area soon!</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground, textAlign: "center" }]}>
            Our Shutterbug team currently serves Greater Hyderabad (ORR + 25 km belt). Your listing is saved — we'll notify you when we expand to your area.
          </Text>
          <View style={[styles.queuePill, { backgroundColor: colors.primary + "20" }]}>
            <Text style={[styles.queueText, { color: colors.primary }]}>
              You'd be #{availability?.waitlistQueuePosition ?? "..."} in your area
            </Text>
          </View>
          <Pressable
            style={[styles.primaryBtn, { backgroundColor: colors.primary }, webCursor]}
            onPress={handleWaitlist}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>Notify me when available</Text>
            )}
          </Pressable>
          <Pressable style={[styles.skipBtn, webCursor]} onPress={handleDoneToMap}>
            <Text style={[styles.skipText, { color: colors.mutedForeground }]}>Skip for now</Text>
          </Pressable>
        </View>
      </ScrollView>
    );
  }

  // ── In zone: calendar + 3 Daylight Windows + Access Mode ─────────────────
  const days = availability.availability ?? [];
  const selectedDayData = days.find((d) => d.date === selectedDate);
  const isTodaySelected = days.length > 0 && selectedDate === days[0].date;
  const expressOption: TimeWindow | null =
    isTodaySelected && availability.expressSlot?.available
      ? {
          id: "E",
          label: "⚡ Express Shoot",
          startHour: 0,
          startMin: 0,
          endHour: 0,
          endMin: 0,
          available: true,
          spotsLeft: availability.expressSlot.candidateCount,
          tooSoon: false,
        }
      : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={[styles.container, { paddingTop: insets.top + 16 }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.title, { color: colors.foreground }]}>Schedule your shoot</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Daylight slots (~{availability.durationProfile?.onsiteMinutes ?? 50} mins on-site). Live scooter tracking starts as soon as your Shutterbug heads your way.
        </Text>

        {slotNotice && (
          <View style={[styles.noticeBanner, { backgroundColor: "#F59E0B18", borderColor: "#F59E0B50" }]}>
            <Ionicons name="information-circle" size={18} color="#D97706" />
            <Text style={[styles.noticeText, { color: colors.foreground }]}>{slotNotice}</Text>
          </View>
        )}

        {/* Date strip */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dateStrip}>
          {days.map((day) => {
            const isSelected = day.date === selectedDate;
            const isFull = !day.hasAnySlot;
            const d = new Date(day.date + "T00:00:00");
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
                  webCursor,
                ]}
                onPress={() => !isFull && setSelectedDate(day.date)}
                disabled={isFull}
              >
                <Text style={[styles.dateChipDay, { color: isSelected ? "#fff" : colors.mutedForeground }]}>
                  {d.toLocaleDateString("en-IN", { weekday: "short" }).toUpperCase()}
                </Text>
                <Text style={[styles.dateChipNum, { color: isSelected ? "#fff" : colors.foreground }]}>
                  {d.getDate()}
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

            {expressOption && (
              <Pressable
                style={[
                  styles.windowRow,
                  {
                    backgroundColor: selectedWindow?.id === "E" ? colors.primary + "15" : colors.card,
                    borderColor: selectedWindow?.id === "E" ? colors.primary : "#22C55E",
                  },
                  webCursor,
                ]}
                onPress={() => setSelectedWindow(expressOption)}
              >
                <View style={[styles.windowLeft, { flex: 1 }]}>
                  <View style={[styles.windowRadio, { borderColor: selectedWindow?.id === "E" ? colors.primary : "#22C55E" }]}>
                    {selectedWindow?.id === "E" && (
                      <View style={[styles.windowRadioInner, { backgroundColor: colors.primary }]} />
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.windowLabel, { color: colors.foreground }]}>
                      {expressOption.label}
                    </Text>
                    <Text style={[styles.windowTime, { color: "#16A34A", fontWeight: "600" }]}>
                      Arrives in ~{availability.expressSlot?.etaMinutes ?? 25} mins
                    </Text>
                  </View>
                </View>
                <View style={[styles.windowBadgePill, { backgroundColor: "#22C55E20" }]}>
                  <Text style={[styles.windowBadge, { color: "#16A34A" }]}>Available</Text>
                </View>
              </Pressable>
            )}

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
                      backgroundColor: isSelected ? colors.primary + "12" : colors.card,
                      borderColor: isSelected ? colors.primary : colors.border,
                      opacity: disabled ? 0.45 : 1,
                    },
                    Platform.select({
                      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6 },
                      android: { elevation: 2 },
                      web: { boxShadow: "0 2px 8px rgba(0,0,0,0.06)" },
                    }) as any,
                    webCursor,
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
                    <Text style={[styles.windowBadge, { color: colors.mutedForeground }]}>Passed</Text>
                  ) : isFull ? (
                    <View style={[styles.windowBadgePill, { backgroundColor: "#EF444420" }]}>
                      <Text style={[styles.windowBadge, { color: "#EF4444" }]}>FULL</Text>
                    </View>
                  ) : (
                    <View style={[styles.windowBadgePill, { backgroundColor: `${colors.primary}15` }]}>
                      <Text style={[styles.windowBadge, { color: colors.primary }]}>Available</Text>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
        )}

        {/* Who will be at the property? (Tri-Party Keyholder / Open Plot Support) */}
        {selectedWindow && (
          <View style={styles.accessSection}>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
              WHO WILL OPEN THE PROPERTY?
            </Text>
            <View style={styles.accessPills}>
              {[
                { id: "booker_present" as AccessMode, label: "I'll be there", icon: "person-outline" as const },
                { id: "onsite_contact" as AccessMode, label: "Watchman / Tenant", icon: "key-outline" as const },
                ...(isPlotOrWarehouse
                  ? [{ id: "open_plot_no_key" as AccessMode, label: "Open Plot (No Key)", icon: "map-outline" as const }]
                  : []),
              ].map((opt) => {
                const active = accessMode === opt.id;
                return (
                  <Pressable
                    key={opt.id}
                    onPress={() => setAccessMode(opt.id)}
                    style={[
                      styles.accessPill,
                      {
                        backgroundColor: active ? `${colors.primary}15` : colors.card,
                        borderColor: active ? colors.primary : colors.border,
                      },
                      webCursor,
                    ]}
                  >
                    <Ionicons
                      name={opt.icon}
                      size={16}
                      color={active ? colors.primary : colors.mutedForeground}
                    />
                    <Text
                      style={[
                        styles.accessPillText,
                        { color: active ? colors.primary : colors.foreground },
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {accessMode === "onsite_contact" && (
              <View style={styles.contactInputs}>
                <TextInput
                  style={[
                    styles.contactInput,
                    { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border },
                  ]}
                  placeholder="On-site contact name (e.g. Watchman Ramesh)"
                  placeholderTextColor={colors.mutedForeground}
                  value={onsiteName}
                  onChangeText={setOnsiteName}
                />
                <TextInput
                  style={[
                    styles.contactInput,
                    { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border },
                  ]}
                  placeholder="On-site contact phone (receives live tracking & OTP)"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="phone-pad"
                  value={onsitePhone}
                  onChangeText={setOnsitePhone}
                />
              </View>
            )}

            <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginTop: 12 }]}>
              Notes for your Shutterbug{" "}
              <Text style={{ fontWeight: "400", textTransform: "none" }}>(optional)</Text>
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

        {/* Launch Promo Price Bar */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: 18,
            paddingHorizontal: 14,
            paddingVertical: 11,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: "#22C55E50",
            backgroundColor: "#22C55E12",
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Ionicons name="pricetag" size={15} color="#16A34A" />
            <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground }}>
              {availability.pricingQuote?.promoLabel ?? "Launch Offer · 100% Free"}
            </Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text style={{ fontSize: 13, color: colors.mutedForeground, textDecorationLine: "line-through" }}>
              ₹{availability.pricingQuote?.basePriceInr ?? 999}
            </Text>
            <Text style={{ fontSize: 15, fontWeight: "900", color: "#16A34A" }}>
              ₹{availability.pricingQuote?.payableInr ?? 0}
            </Text>
          </View>
        </View>

        {/* Confirm CTA */}
        <Pressable
          style={[
            styles.primaryBtn,
            {
              backgroundColor: selectedWindow ? colors.primary : colors.border,
              marginTop: 12,
            },
            webCursor,
          ]}
          onPress={handleBook}
          disabled={!selectedWindow || submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryBtnText}>
              {selectedWindow ? "Book Free Shoot (Worth ₹999) →" : "Select a time slot"}
            </Text>
          )}
        </Pressable>

        <Text style={[styles.footerNote, { color: colors.mutedForeground }]}>
          You'll receive a live 3D map link the moment your Shutterbug starts riding to your property.
        </Text>
      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12 },
  loadingText: { fontSize: 14 },
  container: { padding: 20, paddingBottom: 48 },
  card: {
    borderRadius: 20, borderWidth: 1, padding: 24, alignItems: "center", gap: 16,
  },
  title: { fontSize: 24, fontWeight: "800", marginBottom: 4 },
  subtitle: { fontSize: 14, lineHeight: 20, marginBottom: 8 },
  noticeBanner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    padding: 12, borderRadius: 12, borderWidth: 1, marginVertical: 6,
  },
  noticeText: { fontSize: 13, fontWeight: "600", flex: 1 },
  successContainer: { padding: 20, paddingBottom: 48 },
  successCard: {
    borderRadius: 24, borderWidth: 1, padding: 24, alignItems: "center", gap: 14,
  },
  successBadge: {
    width: 76, height: 76, borderRadius: 38,
    justifyContent: "center", alignItems: "center",
  },
  successTitle: { fontSize: 24, fontWeight: "800", textAlign: "center" },
  slotDetail: {
    width: "100%", borderRadius: 14, borderWidth: 1, overflow: "hidden",
  },
  slotRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 16, paddingVertical: 12,
  },
  slotDivider: { height: 1, marginHorizontal: 16 },
  slotText: { fontSize: 14, fontWeight: "600" },
  otpBox: {
    width: "100%", borderRadius: 14, borderWidth: 1.5, padding: 14,
    flexDirection: "row", alignItems: "center",
  },
  otpLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  otpValue: { fontSize: 26, fontWeight: "900", letterSpacing: 4, marginVertical: 4 },
  otpHint: { fontSize: 12, lineHeight: 17 },
  secondaryBtn: {
    width: "100%", height: 46, borderRadius: 12, borderWidth: 1.5,
    flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8,
  },
  secondaryBtnText: { fontSize: 14, fontWeight: "700" },
  nextLabel: {
    fontSize: 11, fontWeight: "700", letterSpacing: 1.2,
    textTransform: "uppercase", alignSelf: "flex-start", marginTop: 4,
  },
  nextStep: {
    width: "100%", flexDirection: "row", alignItems: "flex-start", gap: 12,
    borderRadius: 12, borderWidth: 1, padding: 12,
  },
  nextIconBox: {
    width: 34, height: 34, borderRadius: 10,
    justifyContent: "center", alignItems: "center", flexShrink: 0,
  },
  nextText: { fontSize: 13, lineHeight: 19, flex: 1 },
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
  skipBtn: { paddingVertical: 10 },
  skipText: { fontSize: 14, fontWeight: "600" },
  dateStrip: { marginVertical: 14 },
  dateChip: {
    width: 62, marginRight: 10, borderRadius: 16, borderWidth: 1.5,
    paddingVertical: 12, alignItems: "center", gap: 2,
  },
  dateChipDay: { fontSize: 11, fontWeight: "700" },
  dateChipNum: { fontSize: 22, fontWeight: "800" },
  dateChipFull: { fontSize: 9, fontWeight: "700" },
  windowsContainer: { gap: 10, marginTop: 4 },
  sectionLabel: { fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 },
  windowRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    borderRadius: 14, borderWidth: 1.5, padding: 16,
  },
  windowLeft: { flexDirection: "row", alignItems: "center", gap: 14, flex: 1 },
  windowRadio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, justifyContent: "center", alignItems: "center" },
  windowRadioInner: { width: 11, height: 11, borderRadius: 5.5 },
  windowLabel: { fontSize: 15, fontWeight: "700" },
  windowTime: { fontSize: 12, marginTop: 2 },
  windowBadgePill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  windowBadge: { fontSize: 11, fontWeight: "800" },
  accessSection: { marginTop: 18, gap: 8 },
  accessPills: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  accessPill: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5,
  },
  accessPillText: { fontSize: 13, fontWeight: "700" },
  contactInputs: { gap: 8, marginTop: 4 },
  contactInput: {
    borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14,
  },
  notesInput: {
    borderWidth: 1.5, borderRadius: 12, padding: 14,
    fontSize: 14, minHeight: 72, textAlignVertical: "top",
  },
  footerNote: { fontSize: 12, textAlign: "center", marginTop: 14, lineHeight: 18 },
});
