/**
 * NeighborhoodMap — Trulia-style "Explore the Area"
 * Uses the Mapbox Search Box API (category endpoint) — fast, reliable, same token.
 * No Overpass / third-party servers.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import {
  View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator,
} from "react-native";
import Map, { Marker, type MapRef } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";

const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN || "";
// Mapbox Search Box category endpoint — authenticated with existing project token
const SEARCH_BASE = "https://api.mapbox.com/search/searchbox/v1/category";

// ─── Category definitions ─────────────────────────────────────────────────────

export type CategoryId =
  | "highlights" | "restaurants" | "groceries" | "schools"
  | "transit" | "healthcare" | "shopping" | "cafes" | "parks";

interface Category {
  id: CategoryId;
  label: string;
  color: string;
  icon: string;          // Material-style SVG path (24×24 viewBox)
  mapboxCats: string[];  // Mapbox Search Box category slugs
}

const CATEGORIES: Category[] = [
  {
    id: "highlights",
    label: "Highlights",
    color: "#4A6FA5",
    icon: "M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z",
    mapboxCats: [], // handled specially — parallel fetch across all others
  },
  {
    id: "restaurants",
    label: "Restaurants",
    color: "#FF6B35",
    icon: "M18.06 22.99h1.66c.84 0 1.53-.64 1.63-1.46L23 5.05h-5V1h-1.97v4.05h-4.97l.3 2.34c1.71.47 3.31 1.32 4.27 2.26 1.44 1.42 2.43 2.89 2.43 5.29v8.05zM1 21.99V21h15.03v.99c0 .55-.45 1-1.01 1H2.01c-.56 0-1.01-.45-1.01-1zm15.03-7H1v-2h15.03v2zm0-4H1v-2h15.03v2z",
    mapboxCats: ["restaurant", "fast_food", "food"],
  },
  {
    id: "groceries",
    label: "Groceries",
    color: "#2D9D5A",
    icon: "M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zM1 2v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96C5 16.1 6.1 17 7 17h11v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12.9-1.63H19c.75 0 1.41-.41 1.75-1.03l3.58-6.49A1 1 0 0023.25 4H5.21l-.94-2H1zm16 16c-1.1 0-1.99.9-1.99 2s.89 2 1.99 2 2-.9 2-2-.9-2-2-2z",
    mapboxCats: ["grocery", "supermarket", "convenience_store"],
  },
  {
    id: "schools",
    label: "Schools",
    color: "#1565C0",
    icon: "M5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82zM12 3L1 9l11 6 9-4.91V17h2V9L12 3z",
    mapboxCats: ["school", "college", "university"],
  },
  {
    id: "transit",
    label: "Transit",
    color: "#6B2FD9",
    icon: "M12 2c-4 0-8 .5-8 4v9.5C4 17.43 5.57 19 7.5 19L6 20.5v.5h2.23l2-2H14l2 2H18v-.5L16.5 19c1.93 0 3.5-1.57 3.5-3.5V6c0-3.5-3.58-4-8-4zM7.5 17c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17zm3.5-7H6V6h5v4zm5.5 7c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM18 10h-5V6h5v4z",
    mapboxCats: ["transit", "bus_station", "railway_station"],
  },
  {
    id: "healthcare",
    label: "Healthcare",
    color: "#E53935",
    icon: "M19 3H5c-1.1 0-1.99.9-1.99 2L3 19c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-1 11h-4v4h-4v-4H6v-4h4V6h4v4h4v4z",
    mapboxCats: ["hospital", "pharmacy", "doctor", "medical"],
  },
  {
    id: "shopping",
    label: "Shopping",
    color: "#C2185B",
    icon: "M19 6h-2c0-2.76-2.24-5-5-5S7 3.24 7 6H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-7-3c1.66 0 3 1.34 3 3H9c0-1.66 1.34-3 3-3zm0 10c-2.76 0-5-2.24-5-5h2c0 1.66 1.34 3 3 3s3-1.34 3-3h2c0 2.76-2.24 5-5 5z",
    mapboxCats: ["shopping_mall", "clothing_store", "electronics_store"],
  },
  {
    id: "cafes",
    label: "Cafes",
    color: "#795548",
    icon: "M20 3H4v10c0 2.21 1.79 4 4 4h6c2.21 0 4-1.79 4-4v-3h2c1.11 0 2-.89 2-2V5c0-1.11-.89-2-2-2zm0 5h-2V5h2v3zM4 19h16v2H4z",
    mapboxCats: ["cafe", "coffee_shop"],
  },
  {
    id: "parks",
    label: "Parks",
    color: "#00897B",
    icon: "M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z",
    mapboxCats: ["park", "garden", "national_park"],
  },
];

// ─── Types ────────────────────────────────────────────────────────────────────

interface Poi {
  id: string;
  lat: number;
  lon: number;
  name: string;
  catId: CategoryId;   // which category this POI belongs to
}

// ─── Mapbox Search Box fetcher ────────────────────────────────────────────────

/** Fetch POIs for a list of Mapbox category slugs, near a point */
async function fetchMapboxCategory(
  cats: string[],
  lat: number,
  lng: number,
  limit = 10,
): Promise<Omit<Poi, "catId">[]> {
  const category = cats.join(",");
  const url =
    `${SEARCH_BASE}/${encodeURIComponent(category)}` +
    `?proximity=${lng},${lat}` +
    `&limit=${limit}` +
    `&language=en` +
    `&access_token=${MAPBOX_TOKEN}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return (data.features || []).map((f: any) => ({
    id: f.properties?.mapbox_id ?? String(Math.random()),
    lat: f.geometry.coordinates[1],
    lon: f.geometry.coordinates[0],
    name: f.properties?.name ?? "Unnamed",
  }));
}

/** Fetch a single category tab */
async function fetchCategory(cat: Category, lat: number, lng: number): Promise<Poi[]> {
  const raw = await fetchMapboxCategory(cat.mapboxCats, lat, lng, 10);
  return raw.map(p => ({ ...p, catId: cat.id }));
}

/**
 * Highlights: fire every non-highlights category in parallel, take up to 4 each.
 * Promise.allSettled — partial results shown even if some categories fail.
 */
async function fetchHighlights(lat: number, lng: number): Promise<Poi[]> {
  const cats = CATEGORIES.filter(c => c.id !== "highlights");
  const results = await Promise.allSettled(
    cats.map(cat =>
      fetchMapboxCategory(cat.mapboxCats, lat, lng, 4)
        .then(raw => raw.map(p => ({ ...p, catId: cat.id as CategoryId })))
    )
  );
  // Collect all, then deduplicate by poi.id (same place can appear across categories)
  const seen = new Map<string, Poi>();
  results.forEach(r => {
    if (r.status === "fulfilled") {
      r.value.forEach(poi => {
        if (!seen.has(poi.id)) seen.set(poi.id, poi);
      });
    }
  });
  return Array.from(seen.values());
}

// ─── SVG marker icon ──────────────────────────────────────────────────────────

function MarkerIcon({ color, iconPath, hovered }: {
  color: string; iconPath: string; hovered: boolean;
}) {
  const size = hovered ? 38 : 30;
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: color,
      display: "flex", alignItems: "center", justifyContent: "center",
      boxShadow: hovered
        ? `0 4px 16px ${color}80, 0 0 0 3px #fff`
        : "0 2px 6px rgba(0,0,0,0.3), 0 0 0 2px #fff",
      cursor: "pointer",
      transition: "all 140ms cubic-bezier(0.34,1.56,0.64,1)",
      flexShrink: 0,
    }}>
      <svg width={size * 0.54} height={size * 0.54} viewBox="0 0 24 24" fill="white">
        <path d={iconPath} />
      </svg>
    </div>
  );
}

// ─── Tab pill ─────────────────────────────────────────────────────────────────

function TabPill({ cat, active, onPress }: {
  cat: Category; active: boolean; onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        s.tab,
        active ? { backgroundColor: cat.color, borderColor: cat.color } : {},
      ]}
    >
      <Text style={[s.tabLabel, { color: active ? "#fff" : "#374151" }]}>
        {cat.label}
      </Text>
    </Pressable>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function NeighborhoodMap({
  latitude, longitude, mapStyle,
}: { latitude: number; longitude: number; mapStyle: string }) {
  const mapRef = useRef<MapRef>(null);
  const [activeCat, setActiveCat] = useState<CategoryId>("highlights");
  const [pois, setPois] = useState<Poi[]>([]);
  const [loading, setLoading] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const cache = useRef<Partial<Record<CategoryId, Poi[]>>>({});

  const catDef = CATEGORIES.find(c => c.id === activeCat)!;

  const load = useCallback(async (catId: CategoryId) => {
    if (cache.current[catId]) { setPois(cache.current[catId]!); return; }
    setLoading(true);
    try {
      const result = catId === "highlights"
        ? await fetchHighlights(latitude, longitude)
        : await fetchCategory(CATEGORIES.find(c => c.id === catId)!, latitude, longitude);
      cache.current[catId] = result;
      setPois(result);
    } catch { setPois([]); }
    finally { setLoading(false); }
  }, [latitude, longitude]);

  useEffect(() => { load("highlights"); }, [load]);

  return (
    <View style={s.root}>
      <Text style={s.heading}>Explore the Area</Text>

      {/* Category tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.tabRow}>
        {CATEGORIES.map(cat => (
          <TabPill key={cat.id} cat={cat}
            active={activeCat === cat.id}
            onPress={() => { setActiveCat(cat.id); load(cat.id); }}
          />
        ))}
      </ScrollView>

      {/* Map */}
      <View style={s.mapWrap}>
        <Map
          ref={mapRef}
          mapboxAccessToken={MAPBOX_TOKEN}
          initialViewState={{ latitude, longitude, zoom: 14 }}
          style={{ width: "100%", height: "100%" }}
          mapStyle={mapStyle}
          attributionControl={false}
          reuseMaps
        >
          {/* Property pin */}
          <Marker latitude={latitude} longitude={longitude} anchor="bottom">
            <div style={{ position: "relative" }}>
              <div style={{
                background: "#1F2937", color: "#fff", fontSize: 11, fontWeight: 800,
                padding: "5px 10px", borderRadius: 6,
                boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
                whiteSpace: "nowrap", border: "2px solid #fff",
              }}>📍 This property</div>
              <div style={{
                position: "absolute", bottom: -6, left: "50%",
                transform: "translateX(-50%)",
                width: 0, height: 0,
                borderLeft: "6px solid transparent", borderRight: "6px solid transparent",
                borderTop: "6px solid #1F2937",
              }} />
            </div>
          </Marker>

          {/* POI markers */}
          {pois.map((poi, idx) => {
            const cat = CATEGORIES.find(c => c.id === poi.catId) ?? catDef;
            const isHovered = hovered === poi.id;
            return (
              <Marker key={`${poi.catId}-${poi.id}-${idx}`} latitude={poi.lat} longitude={poi.lon} anchor="center">
                <div
                  onMouseEnter={() => setHovered(poi.id)}
                  onMouseLeave={() => setHovered(null)}
                  style={{ position: "relative" }}
                >
                  <MarkerIcon color={cat.color} iconPath={cat.icon} hovered={isHovered} />
                  {isHovered && (
                    <div style={{
                      position: "absolute",
                      bottom: "calc(100% + 10px)", left: "50%",
                      transform: "translateX(-50%)",
                      background: "#1F2937", color: "#fff",
                      fontSize: 12, fontWeight: 600,
                      padding: "5px 10px", borderRadius: 6,
                      whiteSpace: "nowrap",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.35)",
                      pointerEvents: "none", zIndex: 20,
                      maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis",
                    }}>
                      {poi.name}
                      <div style={{
                        position: "absolute", top: "100%", left: "50%",
                        transform: "translateX(-50%)",
                        width: 0, height: 0,
                        borderLeft: "5px solid transparent", borderRight: "5px solid transparent",
                        borderTop: "5px solid #1F2937",
                      }} />
                    </div>
                  )}
                </div>
              </Marker>
            );
          })}
        </Map>

        {/* Loading overlay */}
        {loading && (
          <View style={s.overlay}>
            <ActivityIndicator size="large" color={catDef.color} />
            <Text style={[s.overlayText, { color: catDef.color }]}>Loading…</Text>
          </View>
        )}

        {/* Empty state */}
        {!loading && pois.length === 0 && (
          <View style={s.overlay}>
            <Text style={s.emptyText}>No {catDef.label.toLowerCase()} found nearby</Text>
          </View>
        )}
      </View>

      {/* Count */}
      {!loading && pois.length > 0 && (
        <Text style={s.countText}>
          {pois.length} {catDef.label.toLowerCase()} near this property
        </Text>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { gap: 12 },
  heading: { fontSize: 18, fontWeight: "800", color: "#111827", letterSpacing: -0.3 },
  tabRow: { flexDirection: "row", gap: 8, paddingVertical: 4, paddingHorizontal: 2 },
  tab: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 999, borderWidth: 1.5, borderColor: "#E5E7EB",
    backgroundColor: "#fff",
  },
  tabLabel: { fontSize: 13, fontWeight: "700" },
  mapWrap: { height: 360, borderRadius: 12, overflow: "hidden", position: "relative" },
  overlay: {
    position: "absolute", inset: 0,
    backgroundColor: "rgba(255,255,255,0.65)",
    justifyContent: "center", alignItems: "center", gap: 8,
  } as any,
  overlayText: { fontSize: 13, fontWeight: "700" },
  emptyText: { fontSize: 14, color: "#6B7280", fontWeight: "600" },
  countText: { fontSize: 12, color: "#6B7280", fontWeight: "500" },
});
