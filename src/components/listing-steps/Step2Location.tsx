"use client";

import { useState, useCallback, useRef } from "react";
import Map, { Marker, NavigationControl, type ViewState } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import { useListingFormStore } from "@/store/listingForm";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

// Default center: Hyderabad
const DEFAULT_LAT = 17.385;
const DEFAULT_LNG = 78.4867;

interface MarkerPos { lat: number; lng: number }

export default function Step2Location() {
  const { address, latitude, longitude, floorNumber, totalFloors, societyName, propertyType, setStep2, goNext } = useListingFormStore();

  const [addressInput, setAddressInput] = useState(address || "");
  const [marker, setMarker] = useState<MarkerPos>({
    lat: latitude ?? DEFAULT_LAT,
    lng: longitude ?? DEFAULT_LNG,
  });
  const [floor, setFloor] = useState(floorNumber?.toString() ?? "");
  const [floors, setFloors] = useState(totalFloors?.toString() ?? "");
  const [society, setSociety] = useState(societyName ?? "");
  const [viewport, setViewport] = useState({
    latitude: latitude ?? DEFAULT_LAT,
    longitude: longitude ?? DEFAULT_LNG,
    zoom: latitude ? 15 : 11,
  });

  // Simple address suggestions using Mapbox Geocoding API
  const [suggestions, setSuggestions] = useState<{ place_name: string; center: [number, number] }[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const searchAddress = useCallback((q: string) => {
    if (!q || q.length < 3) { setSuggestions([]); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?country=IN&limit=5&access_token=${MAPBOX_TOKEN}`;
        const res = await fetch(url);
        const data = await res.json();
        setSuggestions(data.features ?? []);
        setShowSuggestions(true);
      } catch {}
    }, 350);
  }, []);

  const pickSuggestion = (s: { place_name: string; center: [number, number] }) => {
    setAddressInput(s.place_name);
    setMarker({ lat: s.center[1], lng: s.center[0] });
    setViewport((v) => ({ ...v, latitude: s.center[1], longitude: s.center[0], zoom: 16 }));
    setSuggestions([]);
    setShowSuggestions(false);
  };

  const isApartment = propertyType === "apartment";
  const canProceed = addressInput.trim().length > 5;

  const handleNext = () => {
    setStep2({
      address: addressInput.trim(),
      latitude: marker.lat,
      longitude: marker.lng,
      floorNumber: floor ? parseInt(floor, 10) : null,
      totalFloors: floors ? parseInt(floors, 10) : null,
      societyName: society.trim() || undefined,
    });
    goNext();
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">Where is the property?</h1>
        <p className="text-muted-foreground">Pin the exact location so our photographer can find it easily.</p>
      </div>

      {/* Address search */}
      <div className="mb-5 relative">
        <label className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
          Property address
        </label>
        <div className="relative">
          <input
            id="step2-address-input"
            type="text"
            value={addressInput}
            onChange={(e) => { setAddressInput(e.target.value); searchAddress(e.target.value); }}
            onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
            placeholder="Start typing your address..."
            className="w-full px-4 py-3.5 rounded-xl border border-border bg-card text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm"
          />
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-card border border-border rounded-xl shadow-xl overflow-hidden">
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => pickSuggestion(s)}
                  className="w-full flex items-start gap-3 px-4 py-3 hover:bg-accent/40 transition-colors text-left"
                >
                  <span className="text-muted-foreground mt-0.5 shrink-0">📍</span>
                  <span className="text-sm text-foreground leading-snug">{s.place_name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <p className="text-xs text-muted-foreground/60 mt-1.5">
          After selecting, drag the pin on the map to fine-tune the exact spot.
        </p>
      </div>

      {/* Map with draggable pin */}
      <div className="mb-5 rounded-2xl overflow-hidden border border-border shadow-sm" style={{ height: 280 }}>
        <Map
          mapboxAccessToken={MAPBOX_TOKEN}
          mapStyle="mapbox://styles/mapbox/streets-v12"
          latitude={viewport.latitude}
          longitude={viewport.longitude}
          zoom={viewport.zoom}
          onMove={(e: { viewState: ViewState }) => setViewport(e.viewState)}
          style={{ width: "100%", height: "100%" }}
        >
          <NavigationControl position="top-right" />
          <Marker
            latitude={marker.lat}
            longitude={marker.lng}
            draggable
            onDragEnd={(e: { lngLat: { lat: number; lng: number } }) => {
              const { lat, lng } = e.lngLat;
              setMarker({ lat, lng });
            }}
          >
            {/* Custom pin */}
            <div className="flex flex-col items-center" style={{ transform: "translateY(-100%)" }}>
              <div className="w-10 h-10 bg-primary rounded-full border-4 border-white shadow-lg flex items-center justify-center">
                <span className="text-base">📍</span>
              </div>
              <div className="w-0 h-0" style={{ borderLeft: "6px solid transparent", borderRight: "6px solid transparent", borderTop: "10px solid var(--primary)" }} />
            </div>
          </Marker>
        </Map>
      </div>

      <p className="text-xs text-muted-foreground/60 mb-6">
        Lat: {marker.lat.toFixed(5)}, Lng: {marker.lng.toFixed(5)} — drag the pin to adjust
      </p>

      {/* Floor / Society (apartment only) */}
      {isApartment && (
        <div className="grid grid-cols-2 gap-4 mb-5">
          <div>
            <label className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
              Floor no.
            </label>
            <input
              id="step2-floor-input"
              type="number"
              value={floor}
              onChange={(e) => setFloor(e.target.value)}
              placeholder="e.g. 3"
              min="0"
              className="w-full px-4 py-3.5 rounded-xl border border-border bg-card text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm"
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
              Total floors
            </label>
            <input
              id="step2-total-floors-input"
              type="number"
              value={floors}
              onChange={(e) => setFloors(e.target.value)}
              placeholder="e.g. 12"
              min="1"
              className="w-full px-4 py-3.5 rounded-xl border border-border bg-card text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm"
            />
          </div>
        </div>
      )}

      <div className="mb-8">
        <label className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
          Society / Project name <span className="text-muted-foreground/40 font-normal normal-case">(optional)</span>
        </label>
        <input
          id="step2-society-input"
          type="text"
          value={society}
          onChange={(e) => setSociety(e.target.value)}
          placeholder="e.g. Prestige Lakeside Habitat"
          className="w-full px-4 py-3.5 rounded-xl border border-border bg-card text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm"
        />
      </div>

      <button
        id="step2-next-btn"
        onClick={() => canProceed && handleNext()}
        disabled={!canProceed}
        className={`w-full py-4 rounded-2xl text-base font-bold transition-all duration-200
          ${canProceed
            ? "bg-primary text-primary-foreground hover:opacity-90 shadow-lg shadow-primary/20 hover:scale-[1.01]"
            : "bg-muted text-muted-foreground cursor-not-allowed"
          }`}
      >
        Continue →
      </button>
    </div>
  );
}
