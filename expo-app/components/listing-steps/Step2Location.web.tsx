/**
 * Step2Location — Web (react-map-gl/mapbox)
 * Two-signal confirmation:
 *  Signal 1: autocomplete pick → confirmed
 *  Signal 2: drag pin OR click map → confirm pill → confirmed
 */
import { useState, useRef } from "react";
import { View, Text, Pressable, TextInput, StyleSheet, ActivityIndicator } from "react-native";
import Map, { Marker, NavigationControl, type ViewState } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import { useColorScheme } from "@/components/useColorScheme";
import { COLORS, MAP_STYLES } from "@/lib/theme";
import { useListingFormStore } from "@/store/listingForm";
import WizardShell, { CtaButton } from "./WizardShell";

const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN || "";
const DEFAULT_LAT = 17.385;
const DEFAULT_LNG = 78.4867;

export default function Step2Location() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const C = isDark ? COLORS.dark : COLORS.light;
  const mapStyle = isDark ? MAP_STYLES.dark : MAP_STYLES.light;

  const store = useListingFormStore();
  const { propertyType, setStep2, goNext } = store;
  const isApartment = propertyType === "apartment";

  const [address, setAddress] = useState(store.address || "");
  const [floor, setFloor] = useState(store.floorNumber?.toString() ?? "");
  const [totalFloors, setTotalFloors] = useState(store.totalFloors?.toString() ?? "");
  const [society, setSociety] = useState(store.societyName ?? "");
  const [marker, setMarker] = useState({ lat: store.latitude ?? DEFAULT_LAT, lng: store.longitude ?? DEFAULT_LNG });
  const [viewport, setViewport] = useState<ViewState>({
    latitude: store.latitude ?? DEFAULT_LAT,
    longitude: store.longitude ?? DEFAULT_LNG,
    zoom: store.latitude ? 15 : 11,
    bearing: 0, pitch: 0, padding: { top: 0, bottom: 0, left: 0, right: 0 },
  });
  const [confirmed, setConfirmed] = useState(store.locationConfirmed);
  const [pendingConfirm, setPendingConfirm] = useState(false);
  const [suggestions, setSuggestions] = useState<{ place_name: string; center: [number, number] }[]>([]);
  const [searching, setSearching] = useState(false);
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

  /** Signal 1 */
  const pickSuggestion = (sg: { place_name: string; center: [number, number] }) => {
    const lat = sg.center[1], lng = sg.center[0];
    setAddress(sg.place_name);
    setSuggestions([]);
    setMarker({ lat, lng });
    setViewport((v) => ({ ...v, latitude: lat, longitude: lng, zoom: 16 }));
    setConfirmed(true);
    setPendingConfirm(false);
  };

  /** Signal 2a: pin dragged */
  const handleMarkerDrag = (e: { lngLat: { lat: number; lng: number } }) => {
    setMarker({ lat: e.lngLat.lat, lng: e.lngLat.lng });
    setPendingConfirm(true);
    setConfirmed(false);
  };

  /** Signal 2b: click on map */
  const handleMapClick = (e: { lngLat: { lat: number; lng: number } }) => {
    setMarker({ lat: e.lngLat.lat, lng: e.lngLat.lng });
    setPendingConfirm(true);
    setConfirmed(false);
  };

  /** Confirm pill tapped */
  const handleConfirmPill = () => {
    setConfirmed(true);
    setPendingConfirm(false);
  };

  const handleNext = () => {
    if (!confirmed) return;
    setStep2({
      address,
      latitude: marker.lat,
      longitude: marker.lng,
      locationConfirmed: true,
      floorNumber: floor ? parseInt(floor, 10) : null,
      totalFloors: totalFloors ? parseInt(totalFloors, 10) : null,
      societyName: society.trim() || undefined,
    });
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
                <Text style={{ color: C.foreground, fontSize: 13, flex: 1 }} numberOfLines={2}>{sg.place_name}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      <Text style={[s.mapHint, { color: C.mutedForeground }]}>
        {confirmed
          ? "✓ Location pinned — drag the pin to adjust"
          : "Click the map or drag the pin to select your property location"}
      </Text>

      {/* Map */}
      <View style={s.mapWrap}>
        <Map
          mapboxAccessToken={MAPBOX_TOKEN}
          mapStyle={mapStyle}
          {...viewport}
          onMove={(e) => setViewport(e.viewState)}
          onClick={handleMapClick}
          style={{ width: "100%", height: "100%" } as any}
        >
          <NavigationControl position="top-right" />
          <Marker
            latitude={marker.lat}
            longitude={marker.lng}
            draggable
            onDragEnd={(e: { lngLat: { lat: number; lng: number } }) => handleMarkerDrag(e)}
          >
            <View style={[s.pin, { borderColor: C.primary, backgroundColor: C.card }]}>
              <View style={[s.pinDot, { backgroundColor: C.primary }]} />
            </View>
          </Marker>
        </Map>

        {/* Confirm pill overlay */}
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
  mapWrap:    { height: 300, borderRadius: 18, overflow: "hidden", marginBottom: 16, position: "relative" },
  pin:        { width: 28, height: 28, borderRadius: 14, borderWidth: 3, alignItems: "center", justifyContent: "center" },
  pinDot:     { width: 10, height: 10, borderRadius: 5 },
  confirmPillWrap: { position: "absolute", bottom: 14, left: 0, right: 0, alignItems: "center" },
  confirmPill:     { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 50, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 6 },
  confirmPillText: { fontSize: 14, fontWeight: "800" },
  extrasRow:  { flexDirection: "row", gap: 12, marginBottom: 0 },
  fieldInput: { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, marginBottom: 8 },
});
