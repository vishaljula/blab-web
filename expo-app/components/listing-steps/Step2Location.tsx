/**
 * Step2Location — Native (@rnmapbox/maps)
 *
 * Two-signal confirmation pattern:
 *  Signal 1: Pick from autocomplete → pin flies, locationConfirmed = true
 *  Signal 2: Tap anywhere on map → "Confirm this location" pill appears → tap it → confirmed
 *
 * Default Hyderabad center is NOT considered confirmed.
 */
import { useState, useRef } from "react";
import {
  View, Text, Pressable, TextInput, StyleSheet, ActivityIndicator,
} from "react-native";
import Mapbox from "@rnmapbox/maps";
import { useColorScheme } from "@/components/useColorScheme";
import { COLORS, MAP_STYLES, API_BASE_URL } from "@/lib/theme";
import { useListingFormStore } from "@/store/listingForm";
import WizardShell, { CtaButton } from "./WizardShell";

const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN || "";
Mapbox.setAccessToken(MAPBOX_TOKEN);

const DEFAULT_LAT = 17.385;
const DEFAULT_LNG = 78.4867;

export default function Step2Location() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const C = isDark ? COLORS.dark : COLORS.light;
  const mapStyle = isDark ? MAP_STYLES.dark : MAP_STYLES.light;

  const store = useListingFormStore();
  const { propertyType, confirmLocation, setStep2, setRealtorAvailability, goNext } = store;
  const isApartment = propertyType === "apartment";

  const [address, setAddress] = useState(store.address || "");
  const [floor, setFloor] = useState(store.floorNumber?.toString() ?? "");
  const [totalFloors, setTotalFloors] = useState(store.totalFloors?.toString() ?? "");
  const [society, setSociety] = useState(store.societyName ?? "");

  const [pinLat, setPinLat] = useState(store.latitude ?? DEFAULT_LAT);
  const [pinLng, setPinLng] = useState(store.longitude ?? DEFAULT_LNG);
  const [confirmed, setConfirmed] = useState(store.locationConfirmed);
  // When user taps the map but hasn't hit "Confirm" yet
  const [pendingConfirm, setPendingConfirm] = useState(false);

  const [suggestions, setSuggestions] = useState<{ place_name: string; center: [number, number] }[]>([]);
  const [searching, setSearching] = useState(false);
  const cameraRef = useRef<Mapbox.Camera>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const searchAddress = (q: string) => {
    setAddress(q);
    setConfirmed(false);
    if (q.length < 3) { setSuggestions([]); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?country=IN&limit=5&access_token=${MAPBOX_TOKEN}`;
        const res = await fetch(url);
        const data = await res.json();
        setSuggestions(data.features ?? []);
      } catch {}
      setSearching(false);
    }, 350);
  };

  /** Signal 1: picked from suggestions */
  const pickSuggestion = (sg: { place_name: string; center: [number, number] }) => {
    const lat = sg.center[1], lng = sg.center[0];
    setAddress(sg.place_name);
    setSuggestions([]);
    setPinLat(lat);
    setPinLng(lng);
    setConfirmed(true);     // autocomplete = confirmed
    setPendingConfirm(false);
    cameraRef.current?.setCamera({ centerCoordinate: [lng, lat], zoomLevel: 16, animationDuration: 800 });
  };

  /** Signal 2a: tap on map → show confirm pill */
  const handleMapPress = (e: { geometry?: { coordinates?: number[] } }) => {
    const coords = e?.geometry?.coordinates;
    if (!coords || coords.length < 2) return;
    const lng = coords[0], lat = coords[1];
    setPinLat(lat);
    setPinLng(lng);
    setPendingConfirm(true);
    setConfirmed(false);
  };

  /** Signal 2b: user taps confirm pill */
  const handleConfirmPill = () => {
    setConfirmed(true);
    setPendingConfirm(false);
  };

  const handleNext = async () => {
    if (!confirmed) return;
    setStep2({
      address,
      latitude: pinLat,
      longitude: pinLng,
      locationConfirmed: true,
      floorNumber: floor ? parseInt(floor, 10) : null,
      totalFloors: totalFloors ? parseInt(totalFloors, 10) : null,
      societyName: society.trim() || undefined,
    });
    // Prefetch: are there any realtors in the system?
    // Once geo-filter is live this will pass ?lat=&lng= and check the 5km radius.
    try {
      const res = await fetch(`${API_BASE_URL}/api/realtors/available`);
      if (res.ok) {
        const data = await res.json();
        setRealtorAvailability(Array.isArray(data) && data.length > 0 ? "available" : "unavailable");
      } else {
        setRealtorAvailability("unknown");
      }
    } catch {
      // Network error — don't block the flow
      setRealtorAvailability("unknown");
    }
    goNext();
  };

  return (
    <WizardShell
      heading="Where is the property?"
      hint="Pin the exact spot u2014 our photographer needs to find it."
      cta={
        <CtaButton
          label={confirmed ? "Continue →" : "Pin a location to continue"}
          onPress={handleNext}
          disabled={!confirmed}
        />
      }
    >
      {/* Address search */}
      <Text style={[s.label, { color: C.mutedForeground }]}>Search address</Text>
      <View style={{ position: "relative", zIndex: 100 }}>
        <View style={[s.inputWrap, { borderColor: C.border, backgroundColor: C.card }]}>
          <Text style={{ color: C.mutedForeground, marginRight: 8 }}>🔍</Text>
          <TextInput
            value={address}
            onChangeText={searchAddress}
            placeholder="Start typing your address..."
            placeholderTextColor={C.mutedForeground}
            style={[s.input, { color: C.foreground }]}
          />
          {searching && <ActivityIndicator size="small" color={C.mutedForeground} />}
          {confirmed && <Text style={{ color: "#16a34a", fontSize: 16 }}>✓</Text>}
        </View>
        {suggestions.length > 0 && (
          <View style={[s.dropdown, { backgroundColor: C.card, borderColor: C.border }]}>
            {suggestions.map((sg, i) => (
              <Pressable
                key={i}
                onPress={() => pickSuggestion(sg)}
                style={[s.suggestion, i < suggestions.length - 1 && { borderBottomWidth: 1, borderBottomColor: C.border }]}
              >
                <Text style={{ color: C.primary, marginRight: 8 }}>📍</Text>
                <Text style={{ color: C.foreground, fontSize: 13, lineHeight: 18, flex: 1 }} numberOfLines={2}>
                  {sg.place_name}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      {/* Map */}
      <Text style={[s.mapHint, { color: C.mutedForeground }]}>
        {confirmed
          ? "✓ Location pinned — drag map or tap to adjust"
          : "Or tap anywhere on the map to pin your property"}
      </Text>

      <View style={s.mapWrap}>
        <Mapbox.MapView
          style={s.map}
          styleURL={mapStyle}
          onPress={handleMapPress}
        >
          <Mapbox.Camera
            ref={cameraRef}
            centerCoordinate={[pinLng, pinLat]}
            zoomLevel={confirmed ? 15 : 11}
            animationMode="flyTo"
            animationDuration={600}
          />
          {/* Pin marker */}
          <Mapbox.PointAnnotation
            id="listing-pin"
            coordinate={[pinLng, pinLat]}
            onSelected={() => {}}
          >
            <View style={[s.pin, { borderColor: C.primary, backgroundColor: C.card }]}>
              <View style={[s.pinDot, { backgroundColor: C.primary }]} />
            </View>
          </Mapbox.PointAnnotation>
        </Mapbox.MapView>

        {/* Confirm pill */}
        {pendingConfirm && (
          <View style={s.confirmPillWrap}>
            <Pressable
              onPress={handleConfirmPill}
              style={[s.confirmPill, { backgroundColor: C.primary }]}
            >
              <Text style={[s.confirmPillText, { color: C.primaryForeground }]}>
                📍  Confirm this location
              </Text>
            </Pressable>
          </View>
        )}
      </View>

      {/* Apartment extras */}
      {isApartment && (
        <View style={s.extrasRow}>
          <View style={{ flex: 1 }}>
            <Text style={[s.label, { color: C.mutedForeground }]}>Floor no.</Text>
            <TextInput
              value={floor} onChangeText={setFloor}
              placeholder="e.g. 3" placeholderTextColor={C.mutedForeground}
              keyboardType="numeric"
              style={[s.fieldInput, { borderColor: C.border, backgroundColor: C.card, color: C.foreground }]}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.label, { color: C.mutedForeground }]}>Total floors</Text>
            <TextInput
              value={totalFloors} onChangeText={setTotalFloors}
              placeholder="e.g. 12" placeholderTextColor={C.mutedForeground}
              keyboardType="numeric"
              style={[s.fieldInput, { borderColor: C.border, backgroundColor: C.card, color: C.foreground }]}
            />
          </View>
        </View>
      )}

      <Text style={[s.label, { color: C.mutedForeground, marginTop: 16 }]}>
        Society / Project <Text style={{ fontWeight: "400", textTransform: "none" }}>(optional)</Text>
      </Text>
      <TextInput
        value={society} onChangeText={setSociety}
        placeholder="e.g. Prestige Lakeside Habitat"
        placeholderTextColor={C.mutedForeground}
        style={[s.fieldInput, { borderColor: C.border, backgroundColor: C.card, color: C.foreground }]}
      />
    </WizardShell>
  );
}

const s = StyleSheet.create({
  label:      { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 },
  inputWrap:  { flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 4 },
  input:      { flex: 1, fontSize: 14 },
  dropdown:   { position: "absolute", top: "100%", left: 0, right: 0, zIndex: 300, borderWidth: 1, borderRadius: 14, shadowColor: "#000", shadowOpacity: 0.14, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 10, overflow: "hidden" },
  suggestion: { flexDirection: "row", alignItems: "flex-start", paddingHorizontal: 14, paddingVertical: 11 },
  mapHint:    { fontSize: 12, marginBottom: 10, marginTop: 6 },
  mapWrap:    { height: 280, borderRadius: 18, overflow: "hidden", marginBottom: 16, position: "relative" },
  map:        { flex: 1 },
  pin:        { width: 28, height: 28, borderRadius: 14, borderWidth: 3, alignItems: "center", justifyContent: "center" },
  pinDot:     { width: 10, height: 10, borderRadius: 5 },
  confirmPillWrap: { position: "absolute", bottom: 14, left: 0, right: 0, alignItems: "center" },
  confirmPill:     { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 12, borderRadius: 50, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 6 },
  confirmPillText: { fontSize: 14, fontWeight: "800" },
  extrasRow:  { flexDirection: "row", gap: 12, marginBottom: 0 },
  fieldInput: { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14 },
});
