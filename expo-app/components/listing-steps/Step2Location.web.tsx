/**
 * Step2Location — Web (react-map-gl/mapbox)
 *
 * Same white-card layout as WizardShell (muted bg, centred 860px card,
 * rounded corners, shadow) but the card body is a map that fills the
 * available height. Search bar + bottom panel overlay the card.
 *
 * Native stays full-screen — this card treatment is web-only.
 */
import { useState, useRef, useCallback } from "react";
import {
  View, Text, Pressable, TextInput, StyleSheet, ActivityIndicator,
  useWindowDimensions,
} from "react-native";
import Map, { type MapRef, type ViewState } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColorScheme } from "@/components/useColorScheme";
import { COLORS, MAP_STYLES, API_BASE_URL } from "@/lib/theme";
import { useListingFormStore } from "@/store/listingForm";
import { useRouter } from "expo-router";

const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN || "";
const DEFAULT_LAT  = 17.385;
const DEFAULT_LNG  = 78.4867;
const PRECISION_ZOOM = 16.5;  // User-tested: good street context without losing precision
const MAX_CARD_WIDTH = 860; // matches WizardShell

export default function Step2Location() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const C = isDark ? COLORS.dark : COLORS.light;
  const mapStyle = isDark ? MAP_STYLES.dark : MAP_STYLES.light;

  const isWide = width > MAX_CARD_WIDTH + 64;
  const hPad = isWide ? 0 : 20;

  const store = useListingFormStore();
  const {
    propertyType, setStep2, setRealtorAvailability, goNext,
    currentStep, listingPath, goToStep,
  } = store;
  const isApartment = propertyType === "apartment";

  // Secondary fields (society removed — collected in Details step)
  const [floor, setFloor]             = useState(store.floorNumber?.toString() ?? "");
  const [totalFloors, setTotalFloors] = useState(store.totalFloors?.toString() ?? "");

  const [viewport, setViewport] = useState<ViewState>({
    latitude:  store.latitude  ?? DEFAULT_LAT,
    longitude: store.longitude ?? DEFAULT_LNG,
    zoom: PRECISION_ZOOM,
    bearing: 0, pitch: 0,
    padding: { top: 0, bottom: 0, left: 0, right: 0 },
  });

  const [resolvedAddress, setResolvedAddress] = useState(store.address ?? "");
  const [isResolving, setIsResolving]         = useState(false);
  const [isMoving, setIsMoving]               = useState(false);
  const [isSubmitting, setIsSubmitting]       = useState(false);

  // Search
  const [searchQuery, setSearchQuery]   = useState("");
  const [suggestions, setSuggestions]   = useState<{ place_name: string; center: [number, number] }[]>([]);
  const [searching, setSearching]       = useState(false);
  const [showSearch, setShowSearch]     = useState(false);

  const mapRef              = useRef<MapRef>(null);
  const debounceRef         = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reverseDebounceRef  = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Reverse geocode ──────────────────────────────────────────────
  const reverseGeocode = useCallback(async (lat: number, lng: number) => {
    try {
      const url =
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json` +
        `?country=IN&types=address,neighborhood,locality,place,poi&limit=1&access_token=${MAPBOX_TOKEN}`;
      const res  = await fetch(url);
      const data = await res.json();
      const place = data.features?.[0];
      if (place?.place_name) setResolvedAddress(place.place_name);
    } catch {}
    setIsResolving(false);
  }, []);

  const handleMoveStart = useCallback(() => {
    setIsMoving(true);
    setIsResolving(true);
  }, []);

  const handleMoveEnd = useCallback((e: { viewState: ViewState }) => {
    setIsMoving(false);
    const { latitude, longitude } = e.viewState;
    setViewport((v) => ({ ...v, latitude, longitude, zoom: e.viewState.zoom }));
    if (reverseDebounceRef.current) clearTimeout(reverseDebounceRef.current);
    reverseDebounceRef.current = setTimeout(() => reverseGeocode(latitude, longitude), 200);
  }, [reverseGeocode]);

  // ── Address search ─────────────────────────────────────────────────────────
  const searchAddress = (q: string) => {
    setSearchQuery(q);
    if (q.length < 3) { setSuggestions([]); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const url =
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json` +
          `?country=IN&limit=5&access_token=${MAPBOX_TOKEN}`;
        const res  = await fetch(url);
        const data = await res.json();
        setSuggestions(data.features ?? []);
      } catch {}
      setSearching(false);
    }, 350);
  };

  const pickSuggestion = (sg: { place_name: string; center: [number, number] }) => {
    const lat = sg.center[1], lng = sg.center[0];
    setSearchQuery(sg.place_name);
    setResolvedAddress(sg.place_name);
    setSuggestions([]);
    setShowSearch(false);
    setViewport((v) => ({ ...v, latitude: lat, longitude: lng, zoom: PRECISION_ZOOM }));
  };

  // ── Confirm ────────────────────────────────────────────────────────────────
  const handleConfirm = async () => {
    if (!canConfirm) return;
    setIsSubmitting(true);
    try {
      setStep2({
        address:      resolvedAddress,
        latitude:     viewport.latitude,
        longitude:    viewport.longitude,
        locationConfirmed: true,
        floorNumber:  floor       ? parseInt(floor, 10)       : null,
        totalFloors:  totalFloors ? parseInt(totalFloors, 10) : null,
      });
      try {
        const res = await fetch(`${API_BASE_URL}/api/realtors/available`);
        if (res.ok) {
          const data = await res.json();
          setRealtorAvailability(Array.isArray(data) && data.length > 0 ? "available" : "unavailable");
        } else {
          setRealtorAvailability("unknown");
        }
      } catch {
        setRealtorAvailability("unknown");
      }
      goNext();
    } finally {
      setIsSubmitting(false);
    }
  };

  const stepLabels = listingPath === "realtor"
    ? ["Type", "Location", "Path", "Realtor"]
    : ["Type", "Location", "Path", "Details", "Review"];

  const canConfirm = !!resolvedAddress && !isMoving && !isResolving && !isSubmitting;

  return (
    <View style={[s.root, { backgroundColor: isDark ? C.muted : "#EDEBE7" }]}>

      {/* ── 1. Top bar (matches WizardShell) ─────────────────────── */}
      <View style={[s.topBar, {
        backgroundColor: C.card,
        borderBottomColor: C.border,
        paddingTop: insets.top + 6,
      }]}>
        <View style={{ flex: 1 }} />
        <Text style={[s.wordmark, { color: C.primary }]}>blab.</Text>
        <View style={[{ flex: 1 }, s.topRight]}>
          <Pressable onPress={() => router.back()} hitSlop={14}>
            <Text style={[s.topBtnText, { color: C.mutedForeground }]}>Save & exit</Text>
          </Pressable>
        </View>
      </View>

      {/* ── 2. Stepper bar (matches WizardShell) ─────────────────── */}
      <View style={[s.stepperBar, { backgroundColor: C.card, borderBottomColor: C.border }]}>
        <View style={[s.stepperInner, {
          maxWidth: MAX_CARD_WIDTH,
          width: "100%",
          paddingHorizontal: hPad,
        }]}>
          {stepLabels.map((label, i) => {
            const sn        = i + 1;
            const completed = sn < currentStep;
            const active    = sn === currentStep;
            return (
              <View key={label} style={s.stepItem}>
                {i > 0 && (
                  <View style={[s.stepLine, {
                    backgroundColor: completed || active ? C.primary : C.border,
                  }]} />
                )}
                <Pressable
                  onPress={completed ? () => goToStep(sn) : undefined}
                  hitSlop={10}
                  style={[s.stepCircle,
                    active || completed
                      ? { backgroundColor: C.primary, borderColor: C.primary }
                      : { backgroundColor: C.card,    borderColor: C.border  },
                  ]}
                >
                  {completed
                    ? <Text style={s.stepCheck}>✓</Text>
                    : active
                      ? <View style={s.stepActiveDot} />
                      : <View style={[s.stepFutureDot, { backgroundColor: C.border }]} />
                  }
                </Pressable>
                <Text style={[s.stepLabel, {
                  color:      active ? C.primary : completed ? C.primary : C.mutedForeground,
                  fontWeight: active ? "800" : "500",
                }]}>{label}</Text>
              </View>
            );
          })}
        </View>
      </View>

      {/* ── 3. Card area — map fills the card ─────────────────────── */}
      <View style={[s.cardArea, {
        paddingHorizontal: hPad,
        alignItems: isWide ? "center" : "stretch",
      }]}>
        <View style={[s.card, {
          backgroundColor: C.card,
          maxWidth: MAX_CARD_WIDTH,
          width: isWide ? MAX_CARD_WIDTH : "100%",
          // 3D pop effect — inline so React Native Web picks it up
          boxShadow:
            "0 2px 4px rgba(0,0,0,0.12), " +
            "0 8px 20px rgba(0,0,0,0.18), " +
            "0 40px 80px rgba(0,0,0,0.15)",
          borderWidth: 1,
          borderColor: "rgba(0,0,0,0.09)",
        } as any]}>

          {/* Map fills the card */}
          <View style={s.mapContainer}>
            <Map
              ref={mapRef}
              mapboxAccessToken={MAPBOX_TOKEN}
              mapStyle={mapStyle}
              {...viewport}
              onMove={(e) => setViewport(e.viewState)}
              onMoveStart={handleMoveStart}
              onMoveEnd={handleMoveEnd}
              maxZoom={PRECISION_ZOOM}
              style={{ position: "absolute", inset: 0 } as any}
              dragRotate={false}
              pitchWithRotate={false}
              touchPitch={false}
            />

            {/* ── Fixed crosshair pin ────────────────────────── */}
            <View style={s.pinContainer} pointerEvents="none">
              <View style={[s.pinHead, { backgroundColor: C.primary }]} />
              <View style={[s.pinTail, { borderTopColor: C.primary }]} />
              <View style={s.pinShadowDot} />
            </View>

            {/* ── Floating search bar ────────────────────────── */}
            <View style={[s.searchContainer, { zIndex: 100 }]}>
              {showSearch ? (
                <View style={[s.searchBox, { backgroundColor: C.card }]}>
                  <Text style={[s.searchIcon, { color: C.mutedForeground }]}>🔍</Text>
                  <TextInput
                    autoFocus
                    value={searchQuery}
                    onChangeText={searchAddress}
                    placeholder="Search address..."
                    placeholderTextColor={C.mutedForeground}
                    style={[s.searchInput, { color: C.foreground }]}
                  />
                  {searching
                    ? <ActivityIndicator size="small" color={C.mutedForeground} />
                    : (
                      <Pressable
                        onPress={() => {
                          if (searchQuery) {
                            setSearchQuery("");
                            setSuggestions([]);
                          } else {
                            setShowSearch(false);
                          }
                        }}
                        hitSlop={10}
                      >
                        <Text style={{ color: C.mutedForeground, fontSize: 16, fontWeight: "600" }}>✕</Text>
                      </Pressable>
                    )
                  }
                </View>
              ) : (
                <Pressable
                  onPress={() => setShowSearch(true)}
                  style={[s.searchPill, { backgroundColor: C.card }]}
                >
                  <Text style={[s.searchIcon, { color: C.mutedForeground }]}>🔍</Text>
                  <Text style={{ color: C.mutedForeground, fontSize: 14 }}>Search address...</Text>
                </Pressable>
              )}

              {suggestions.length > 0 && (
                <View style={[s.dropdown, { backgroundColor: C.card }]}>
                  {suggestions.map((sg, i) => (
                    <Pressable
                      key={i}
                      onPress={() => pickSuggestion(sg)}
                      style={[
                        s.suggestion,
                        i < suggestions.length - 1 && { borderBottomWidth: 1, borderBottomColor: C.border },
                      ]}
                    >
                      <Text style={{ color: C.primary, marginRight: 10, fontSize: 15 }}>📍</Text>
                      <Text style={{ color: C.foreground, fontSize: 13, flex: 1 }} numberOfLines={2}>
                        {sg.place_name}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>

            {/* ── Bottom panel (inside card, overlaid on map) ── */}
            <View style={[s.bottomPanel, { backgroundColor: C.card }]}>
              {/* Address display */}
              <View style={s.addressRow}>
                <View style={[s.pinBadge, { backgroundColor: C.primary + "22" }]}>
                  <Text style={{ fontSize: 18 }}>📍</Text>
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={[s.addressHint, { color: C.mutedForeground }]}>
                    Move map to position the pin precisely
                  </Text>
                  {(isMoving || isResolving) ? (
                    <ActivityIndicator
                      size="small"
                      color={C.primary}
                      style={{ alignSelf: "flex-start", marginTop: 4 } as any}
                    />
                  ) : (
                    <Text style={[s.addressText, { color: C.foreground }]} numberOfLines={2}>
                      {resolvedAddress || "Waiting for location…"}
                    </Text>
                  )}
                </View>
              </View>

              <View style={[s.divider, { backgroundColor: C.border }]} />

              {isApartment && (
                <View style={s.extrasRow}>
                  <TextInput
                    value={floor} onChangeText={setFloor}
                    placeholder="Floor no." placeholderTextColor={C.mutedForeground}
                    keyboardType="numeric"
                    style={[s.miniInput, { borderColor: C.border, backgroundColor: isDark ? C.muted : "#F6F5F2", color: C.foreground }]}
                  />
                  <TextInput
                    value={totalFloors} onChangeText={setTotalFloors}
                    placeholder="Total floors" placeholderTextColor={C.mutedForeground}
                    keyboardType="numeric"
                    style={[s.miniInput, { borderColor: C.border, backgroundColor: isDark ? C.muted : "#F6F5F2", color: C.foreground }]}
                  />
                </View>
              )}

              {/* Confirm CTA */}
              <Pressable
                onPress={handleConfirm}
                disabled={!canConfirm}
                style={[s.confirmBtn, { backgroundColor: canConfirm ? C.primary : C.muted }]}
              >
                <Text style={[s.confirmBtnText, {
                  color: canConfirm ? C.primaryForeground : C.mutedForeground,
                }]}>
                  Use This Location →
                </Text>
              </Pressable>
            </View>

          </View>
        </View>
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const PIN_PRIMARY = "#8B2500"; // fallback — component uses C.primary dynamically

const s = StyleSheet.create({
  root: { flex: 1 },

  // ── Top bar (matches WizardShell)
  topBar: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 20, paddingBottom: 12,
    borderBottomWidth: 1,
  },
  wordmark:   { fontSize: 20, fontWeight: "900", letterSpacing: -0.4, textAlign: "center" },
  topRight:   { alignItems: "flex-end" },
  topBtnText: { fontSize: 13, fontWeight: "500" },

  // ── Stepper bar (matches WizardShell)
  stepperBar: {
    borderBottomWidth: 1,
    paddingVertical: 14,
    alignItems: "center",
  },
  stepperInner: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  stepItem:      { flexDirection: "column", alignItems: "center", flex: 1, position: "relative" },
  stepLine:      { position: "absolute", top: 13, left: "-50%", right: "50%", height: 2 },
  stepCircle:    { width: 26, height: 26, borderRadius: 13, borderWidth: 2, alignItems: "center", justifyContent: "center", marginBottom: 6 },
  stepCheck:     { color: "#fff", fontSize: 11, fontWeight: "900" },
  stepActiveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#fff" },
  stepFutureDot: { width: 8, height: 8, borderRadius: 4 },
  stepLabel:     { fontSize: 10, textTransform: "uppercase", letterSpacing: 0.6, textAlign: "center" },

  // ── Card area — fills remaining height
  cardArea: {
    flex: 1,
    paddingTop: 28,
    paddingBottom: 28,
  },

  // ── Card — 3D pop shadow applied inline on View for RN Web compatibility
  card: {
    flex: 1,
    borderRadius: 18,
    overflow: "hidden",  // clip map to rounded corners
  } as any,

  // Map fills the card
  mapContainer: { flex: 1, position: "relative" },

  // ── Fixed pin (tip at centre)
  pinContainer: {
    position: "absolute",
    top: "50%", left: "50%",
    transform: [{ translateX: -15 }, { translateY: -42 }] as any,
    alignItems: "center",
    zIndex: 10,
    pointerEvents: "none" as any,
  },
  pinHead: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: PIN_PRIMARY,
    borderWidth: 3, borderColor: "#fff",
    boxShadow: "0 3px 8px rgba(0,0,0,0.35)",
  } as any,
  pinTail: {
    width: 0, height: 0,
    borderLeftWidth: 8, borderRightWidth: 8, borderTopWidth: 14,
    borderLeftColor: "transparent", borderRightColor: "transparent",
    borderTopColor: PIN_PRIMARY,
    marginTop: -2,
  },
  pinShadowDot: {
    width: 10, height: 4, borderRadius: 5,
    backgroundColor: "rgba(0,0,0,0.18)",
    marginTop: 3,
  },

  // ── Search
  searchContainer: {
    position: "absolute", top: 12, left: 12, right: 12,
  },
  searchBox: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 14, paddingVertical: 12,
    borderRadius: 14,
    boxShadow: "0 3px 10px rgba(0,0,0,0.14)",
  } as any,
  searchPill: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 14, paddingVertical: 13,
    borderRadius: 14,
    boxShadow: "0 3px 10px rgba(0,0,0,0.14)",
    cursor: "pointer",
  } as any,
  searchIcon:  { fontSize: 16, marginRight: 8 },
  searchInput: { flex: 1, fontSize: 14 },
  dropdown: {
    marginTop: 6, borderRadius: 14, overflow: "hidden",
    boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
  } as any,
  suggestion: {
    flexDirection: "row", alignItems: "flex-start",
    paddingHorizontal: 14, paddingVertical: 12,
    cursor: "pointer",
  } as any,

  // ── Bottom panel (overlaid inside the card, at the bottom of the map)
  bottomPanel: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingTop: 14, paddingHorizontal: 16, paddingBottom: 20,
    boxShadow: "0 -4px 16px rgba(0,0,0,0.10)",
  } as any,
  addressRow:  { flexDirection: "row", alignItems: "flex-start", marginBottom: 10 },
  pinBadge:    { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  addressHint: { fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2, fontWeight: "600" },
  addressText: { fontSize: 13, fontWeight: "600", lineHeight: 18 },
  divider:     { height: 1, marginBottom: 10 },

  extrasRow: { flexDirection: "row", gap: 10, marginBottom: 8 },
  miniInput: {
    flex: 1, borderWidth: 1.5, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 9, fontSize: 14,
  },
  confirmBtn: {
    paddingVertical: 14, borderRadius: 14,
    alignItems: "center", justifyContent: "center",
    cursor: "pointer",
  } as any,
  confirmBtnText: { fontSize: 15, fontWeight: "800", letterSpacing: 0.2 },
});
