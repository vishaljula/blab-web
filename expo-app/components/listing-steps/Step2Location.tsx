/**
 * Step2Location — Native (@rnmapbox/maps)
 *
 * Rapido-style full-screen location picker:
 *  - Map fills all available space (no card/scroll wrapper)
 *  - Crosshair pin is a fixed JSX element at screen centre — only the map moves
 *  - No auto-zoom: starts at zoom 17 (building level) and stays there
 *  - onMapIdle → reverse-geocode map centre → update bottom panel address
 *  - Search bar floats at the top; suggestions dropdown under it
 *  - Bottom sheet: resolved address + optional fields + "Use This Location" button
 */
import { useState, useRef, useCallback } from "react";
import {
  View, Text, Pressable, TextInput, StyleSheet,
  ActivityIndicator, Platform, Keyboard,
} from "react-native";
import Mapbox from "@rnmapbox/maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useColorScheme } from "@/components/useColorScheme";
import { COLORS, MAP_STYLES, API_BASE_URL } from "@/lib/theme";
import { useListingFormStore } from "@/store/listingForm";

const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN || "";
Mapbox.setAccessToken(MAPBOX_TOKEN);

const DEFAULT_LAT = 17.385;
const DEFAULT_LNG = 78.4867;
/** Zoom 17 = building-level precision, tighter than the previous 16 */
const PRECISION_ZOOM = 17;

export default function Step2Location() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const C = isDark ? COLORS.dark : COLORS.light;
  const mapStyle = isDark ? MAP_STYLES.dark : MAP_STYLES.light;

  const store = useListingFormStore();
  const {
    propertyType, setStep2, setRealtorAvailability, goNext,
    currentStep, listingPath, goToStep,
  } = store;
  const isApartment = propertyType === "apartment";

  // Secondary fields (society removed — collected in Details step)
  const [floor, setFloor]             = useState(store.floorNumber?.toString() ?? "");
  const [totalFloors, setTotalFloors] = useState(store.totalFloors?.toString() ?? "");

  // Centre of the map = position of the pin
  const [center, setCenter] = useState({
    lat: store.latitude ?? DEFAULT_LAT,
    lng: store.longitude ?? DEFAULT_LNG,
  });
  // Track user's zoom independently — do NOT reset it on idle
  const currentZoomRef = useRef<number>(PRECISION_ZOOM);
  const [resolvedAddress, setResolvedAddress] = useState(store.address ?? "");
  const [isResolving, setIsResolving]         = useState(false);
  const [isMoving, setIsMoving]               = useState(false);
  const [isSubmitting, setIsSubmitting]       = useState(false);

  // Search UI
  const [searchQuery, setSearchQuery]   = useState("");
  const [suggestions, setSuggestions]   = useState<{ place_name: string; center: [number, number] }[]>([]);
  const [searching, setSearching]       = useState(false);
  const [showSearch, setShowSearch]     = useState(false);

  const mapRef    = useRef<Mapbox.MapView>(null);
  const cameraRef = useRef<Mapbox.Camera>(null);
  const debounceRef        = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reverseDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Reverse geocode ──────────────────────────────────────────────
  // isResolving is already true before this fires (set on pan-start) —
  // only need to clear it when done.
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

  // ── Map idle: map stopped — clear moving state, then geocode ────────────
  const handleMapIdle = useCallback(async () => {
    setIsMoving(false);
    try {
      const c = await mapRef.current?.getCenter(); // [lng, lat]
      const z = await mapRef.current?.getZoom();
      if (!c) return;
      const [lng, lat] = c;
      if (z != null) currentZoomRef.current = z;
      setCenter({ lat, lng });
      if (reverseDebounceRef.current) clearTimeout(reverseDebounceRef.current);
      reverseDebounceRef.current = setTimeout(() => reverseGeocode(lat, lng), 200);
    } catch {}
  }, [reverseGeocode]);

  // ── Camera moving: mark both moving + resolving immediately ───────────────
  // Setting isResolving=true here ensures the disabled/spinner state is
  // continuous from pan-start all the way through geocode completion.
  // No gap between isMoving becoming false and isResolving becoming true.
  const handleCameraChanged = useCallback(() => {
    setIsMoving(true);
    setIsResolving(true);
  }, []);

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
    Keyboard.dismiss();
    setCenter({ lat, lng });
    cameraRef.current?.setCamera({
      centerCoordinate: [lng, lat],
      zoomLevel: PRECISION_ZOOM,   // fly to precision zoom when picking from search
      animationDuration: 700,
      animationMode: "flyTo",
    });
    currentZoomRef.current = PRECISION_ZOOM;
  };

  // ── Confirm & advance ──────────────────────────────────────────────────────
  const handleConfirm = async () => {
    if (!canConfirm) return;
    setIsSubmitting(true);
    try {
      setStep2({
        address: resolvedAddress,
        latitude: center.lat,
        longitude: center.lng,
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

  // ── Stepper labels (mirror WizardShell) ───────────────────────────────────
  const stepLabels = listingPath === "realtor"
    ? ["Type", "Location", "Path", "Realtor"]
    : ["Type", "Location", "Path", "Details", "Review"];

  const canConfirm = !!resolvedAddress && !isMoving && !isResolving && !isSubmitting;

  return (
    <View style={[s.root, { backgroundColor: C.background }]}>

      {/* ── Top bar (same as WizardShell) ─────────────────────────────── */}
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

      {/* ── Stepper bar ───────────────────────────────────────────────── */}
      <View style={[s.stepperBar, { backgroundColor: C.card, borderBottomColor: C.border }]}>
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

      {/* ── Full-screen map area ──────────────────────────────────────── */}
      <View style={s.mapContainer}>

        {/* Map fills everything */}
        <Mapbox.MapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          styleURL={mapStyle}
          onMapIdle={handleMapIdle}
          onCameraChanged={handleCameraChanged}
          compassEnabled={false}
          logoEnabled={true}
          attributionEnabled={false}
          scaleBarEnabled={false}
          rotateEnabled={false}
          pitchEnabled={false}
        >
          <Mapbox.Camera
            ref={cameraRef}
            centerCoordinate={[center.lng, center.lat]}
            zoomLevel={currentZoomRef.current}
            maxZoomLevel={PRECISION_ZOOM}   // cap zoom — default is also the max
            animationDuration={0}
          />
        </Mapbox.MapView>

        {/* ── Fixed crosshair pin — tip always at dead centre ─────── */}
        {/* pointerEvents="none" so touches pass through to the map   */}
        <View style={s.pinContainer} pointerEvents="none">
          {/* Pointed map-pin shape: circle head + triangular tail */}
          <View style={[s.pinHead, { backgroundColor: C.primary }]} />
          <View style={[s.pinTail, { borderTopColor: C.primary }]} />
          {/* Ground shadow dot */}
          <View style={s.pinShadowDot} />
        </View>

        {/* ── Floating search bar ─────────────────────────────────── */}
        <View style={s.searchContainer} pointerEvents="box-none">
          {showSearch ? (
            <View style={[s.searchBox, {
              backgroundColor: C.card,
              ...Platform.select({ ios: {}, android: { elevation: 6 } }),
            }]}>
              <Text style={[s.searchIcon, { color: C.mutedForeground }]}>🔍</Text>
              <TextInput
                autoFocus
                value={searchQuery}
                onChangeText={searchAddress}
                placeholder="Search address..."
                placeholderTextColor={C.mutedForeground}
                style={[s.searchInput, { color: C.foreground }]}
                returnKeyType="search"
              />
              {searching
                ? <ActivityIndicator size="small" color={C.mutedForeground} />
                : (
                  <Pressable
                    onPress={() => {
                      if (searchQuery) {
                        // Clear text so user can type fresh — don't close bar
                        setSearchQuery("");
                        setSuggestions([]);
                      } else {
                        // Already empty — close search bar
                        setShowSearch(false);
                        Keyboard.dismiss();
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
              style={[s.searchPill, {
                backgroundColor: C.card,
                ...Platform.select({ ios: {}, android: { elevation: 6 } }),
              }]}
            >
              <Text style={[s.searchIcon, { color: C.mutedForeground }]}>🔍</Text>
              <Text style={{ color: C.mutedForeground, fontSize: 14 }}>Search address...</Text>
            </Pressable>
          )}

          {/* Autocomplete dropdown */}
          {suggestions.length > 0 && (
            <View style={[s.dropdown, {
              backgroundColor: C.card,
              ...Platform.select({ ios: {}, android: { elevation: 8 } }),
            }]}>
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
                  <Text style={{ color: C.foreground, fontSize: 13, flex: 1, lineHeight: 18 }} numberOfLines={2}>
                    {sg.place_name}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>

        {/* ── Bottom sheet panel ──────────────────────────────────── */}
        <View style={[s.bottomPanel, {
          backgroundColor: C.card,
          paddingBottom: insets.bottom + 16,
          ...Platform.select({ ios: {}, android: { elevation: 16 } }),
        }]}>

          {/* Address display — hint NEVER changes, address stays until new one arrives */}
          <View style={s.addressRow}>
            <View style={[s.pinBadge, { backgroundColor: C.primary + "22" }]}>
              <Text style={{ fontSize: 18 }}>📍</Text>
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={[s.addressHint, { color: C.mutedForeground }]}>
                Move map to position the pin precisely
              </Text>
              {(isMoving || isResolving) ? (
                // Spinner REPLACES the address text while locating
                <ActivityIndicator
                  size="small"
                  color={C.primary}
                  style={{ alignSelf: "flex-start", marginTop: 4 }}
                />
              ) : (
                <Text style={[s.addressText, { color: C.foreground }]} numberOfLines={2}>
                  {resolvedAddress || "Waiting for location…"}
                </Text>
              )}
            </View>
          </View>

          {/* Divider */}
          <View style={[s.divider, { backgroundColor: C.border }]} />

          {/* Apartment floor fields */}
          {isApartment && (
            <View style={s.extrasRow}>
              <TextInput
                value={floor}
                onChangeText={setFloor}
                placeholder="Floor no."
                placeholderTextColor={C.mutedForeground}
                keyboardType="numeric"
                style={[s.miniInput, {
                  borderColor: C.border,
                  backgroundColor: isDark ? C.muted : "#F6F5F2",
                  color: C.foreground,
                }]}
              />
              <TextInput
                value={totalFloors}
                onChangeText={setTotalFloors}
                placeholder="Total floors"
                placeholderTextColor={C.mutedForeground}
                keyboardType="numeric"
                style={[s.miniInput, {
                  borderColor: C.border,
                  backgroundColor: isDark ? C.muted : "#F6F5F2",
                  color: C.foreground,
                }]}
              />
            </View>
          )}

          {/* Confirm CTA — disabled while moving or geocoding, text never changes */}
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
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1 },

  // Top bar — compact to give map more room
  topBar: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 20, paddingBottom: 7,
    borderBottomWidth: 1,
  },
  wordmark:   { fontSize: 18, fontWeight: "900", letterSpacing: -0.4, textAlign: "center" },
  topRight:   { alignItems: "flex-end" },
  topBtnText: { fontSize: 12, fontWeight: "500" },

  // Stepper — compact
  stepperBar: {
    flexDirection: "row",
    borderBottomWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 20,
  },
  stepItem:      { flexDirection: "column", alignItems: "center", flex: 1, position: "relative" },
  stepLine:      { position: "absolute", top: 13, left: "-50%", right: "50%", height: 2 },
  stepCircle:    { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  stepCheck:     { color: "#fff", fontSize: 10, fontWeight: "900" },
  stepActiveDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: "#fff" },
  stepFutureDot: { width: 7, height: 7, borderRadius: 3.5 },
  stepLabel:     { fontSize: 9, textTransform: "uppercase", letterSpacing: 0.5, textAlign: "center" },

  // Map
  mapContainer: { flex: 1, position: "relative" },

  // ── Fixed pin: centred at (50%, 50%) with tip of tail at that point ───────
  //   Total pin: head 30px + tail 14px − 2px overlap = 42px tall, 30px wide
  //   To place the TIP at screen centre: translateY by −42, translateX by −15
  pinContainer: {
    position: "absolute",
    top: "50%", left: "50%",
    transform: [{ translateX: -15 }, { translateY: -42 }],
    alignItems: "center",
    zIndex: 10,
  },
  pinHead: {
    width: 30, height: 30, borderRadius: 15,
    borderWidth: 3, borderColor: "#fff",
    ...Platform.select({
      ios: {
        shadowColor: "#000", shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.35, shadowRadius: 5,
      },
      android: { elevation: 6 },
    }),
  },
  pinTail: {
    // CSS-triangle pointing down
    width: 0, height: 0,
    borderLeftWidth: 8, borderRightWidth: 8, borderTopWidth: 14,
    borderLeftColor: "transparent", borderRightColor: "transparent",
    marginTop: -2,            // overlap slightly with head for a seamless join
  },
  pinShadowDot: {
    width: 10, height: 4, borderRadius: 5,
    backgroundColor: "rgba(0,0,0,0.18)",
    marginTop: 3,
  },

  // Search
  searchContainer: {
    position: "absolute",
    top: 12, left: 12, right: 12,
    zIndex: 100,
  },
  searchBox: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 14, paddingVertical: 12,
    borderRadius: 14,
    ...Platform.select({
      ios: {
        shadowColor: "#000", shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.14, shadowRadius: 10,
      },
    }),
  },
  searchPill: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 14, paddingVertical: 13,
    borderRadius: 14,
    ...Platform.select({
      ios: {
        shadowColor: "#000", shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.14, shadowRadius: 10,
      },
    }),
  },
  searchIcon:  { fontSize: 16, marginRight: 8 },
  searchInput: { flex: 1, fontSize: 14 },
  dropdown: {
    marginTop: 6, borderRadius: 14, overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#000", shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12, shadowRadius: 12,
      },
    }),
  },
  suggestion: {
    flexDirection: "row", alignItems: "flex-start",
    paddingHorizontal: 14, paddingVertical: 12,
  },

  // Bottom panel
  bottomPanel: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingTop: 14, paddingHorizontal: 16,
    ...Platform.select({
      ios: {
        shadowColor: "#000", shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.12, shadowRadius: 16,
      },
    }),
  },
  addressRow:  { flexDirection: "row", alignItems: "flex-start", marginBottom: 10 },
  pinBadge:    { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  addressHint: { fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2, fontWeight: "600" },
  addressText: { fontSize: 13, fontWeight: "600", lineHeight: 18 },
  divider:     { height: 1, marginBottom: 10 },

  extrasRow:  { flexDirection: "row", gap: 10, marginBottom: 8 },
  miniInput:  {
    flex: 1, borderWidth: 1.5, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 9, fontSize: 14,
  },
  confirmBtn: {
    paddingVertical: 14, borderRadius: 14,
    alignItems: "center", justifyContent: "center",
  },
  confirmBtnText: { fontSize: 15, fontWeight: "800", letterSpacing: 0.2 },
});
