/**
 * Customer Live Tracking Screen — /tracking/[id]
 *
 * Uber/Rapido-style live tracking:
 *  - Full-bleed map (no header) with a floating back button, address pill and recenter button
 *  - Modern bottom sheet: big ETA, progress, destination
 *  - Route line trimmed (line-trim-offset) so it shrinks smoothly and ends at the FRONT TYRE
 *  - Driver is a real 3D model moved along the road at 60fps (lib/driverMotion.ts),
 *    constant on-screen size at any zoom (closed-loop measured)
 *  - Returns from background → refetches immediately and glides to the real position
 *  - On arrival: scooter parks on the street, the house grows (as if parked outside it),
 *    dotted path street → door, cinematic camera move
 *
 * Web: mapbox-gl directly (raw div).  Native: @rnmapbox/maps.
 * Both subscribe to the SAME DriverMotion engine, so behaviour is identical.
 */
import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  ActivityIndicator,
  Image,
  AppState,
  Animated,
  Easing,
  LayoutChangeEvent,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useListingsStore } from "@/store/listings";
import { COLORS, MAP_STYLES, API_BASE_URL } from "@/lib/theme";
import { useColorScheme } from "@/components/useColorScheme";
import PropertyPin from "@/components/PropertyPin";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DriverMotion, fetchRoute, haversine, bearingBetween, type Frame, type LngLat } from "@/lib/driverMotion";

const POLL_INTERVAL_MS = 1_500;
const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? "";

// Real 3D model (rider + scooter + camera). One model, any heading — rotated by bearing.
const SCOOTER_MODEL = require("../../assets/models/shutterbug.glb");
// Calibrated in a real renderer: the model faces (rotation + 180°) clockwise from north.
const YAW_SIGN = 1;
const YAW_OFFSET = -180;
const modelYaw = (bearing: number) => (((YAW_SIGN * bearing + YAW_OFFSET) % 360) + 360) % 360;

// ── Constant on-screen size (GPU zoom expression) ───────────────────────────
// Map 3D models live in real-world metres, whereas MarkerView pins live in screen pixels.
// To keep the scooter locked to a fixed screen size (TARGET_PX) during pinch-zoom without
// any JS bridge lag or post-zoom resizing, we build a dense Mapbox ["zoom"] interpolation
// expression evaluated natively on the GPU on every render frame.
const TARGET_PX = 48; // on-screen length of the scooter
const MODEL_LENGTH_M = 1.9; // model length in model metres
const FRONT_TIRE_M = 0.64; // pivot (wheelbase midpoint) → front tyre contact, model metres
const metersPerPixel = (zoom: number, lat: number) =>
  (78271.517 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom); // 512px tiles
const formulaScale = (zoom: number, lat: number) =>
  (TARGET_PX * metersPerPixel(zoom, lat)) / MODEL_LENGTH_M;
function buildModelScaleExpr(lat: number): any {
  const expr: any[] = ["interpolate", ["linear"], ["zoom"]];
  for (let z = 3; z <= 22; z += 0.25) {
    const s = Number(formulaScale(z, lat).toFixed(4));
    expr.push(z, ["literal", [s, s, s]]);
  }
  return expr;
}

const MAP_PITCH = 50; // tilt so the rider is seen from an angle
const ARRIVAL_ZOOM = 17.6;
// Destination marker: the same pin as the listing flow, with a line icon per property type
// (see components/PropertyPin.tsx). Head diameter in px:
const HOUSE_PX = 38; // while the driver is on the way
const HOUSE_PX_ARRIVED = 62; // grows when the scooter parks outside it (clearly bigger than the avatar)
const DEFAULT_SHEET_H = 230;

const webCursor: any = Platform.OS === "web" ? { cursor: "pointer" } : null;
const floatShadow: any = Platform.select({
  ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 10 },
  android: { elevation: 6 },
  web: { boxShadow: "0 4px 14px rgba(0,0,0,0.18)" },
});

/** Theme-aware map + route colours (matches the main map's light/dark styles) */
function useTrackingTheme() {
  const isDark = useColorScheme() === "dark";
  return {
    isDark,
    colors: isDark ? COLORS.dark : COLORS.light,
    mapStyle: MAP_STYLES[isDark ? "dark" : "light"],
    routeCasing: isDark ? "#0A2540" : "#FFFFFF",
    routeLine: isDark ? "#4C8DFF" : "#2563EB",
  };
}

interface TrackData {
  status: string;
  lifecycleState?: string;
  deliveryState?: string;
  slotDate?: string | null;
  slotWindow?: string | null;
  shutterbugName?: string | null;
  accessMode?: string | null;
  onsiteName?: string | null;
  arrivalOtp?: string | null;
  privacySuppressed?: boolean;
  shutterbugLocation: { lat: number; lng: number; heading: number; ts: number } | null;
  route?: LngLat[] | null;
  etaMinutes: number | null;
  propertyLocation: { lat: number | string; lng: number | string } | null;
  propertyAddress?: string | null;
  propertyType?: string | null;
}

const SLOT_WINDOW_LABELS: Record<string, string> = {
  A: "Morning (9 AM – 12 PM)",
  B: "Midday (12 PM – 3 PM)",
  C: "Afternoon (3 PM – 5:30 PM)",
  E: "Express Shoot (~45 min)",
};

function getAdaptivePollMs(track: TrackData | null): number | null {
  if (!track) return POLL_INTERVAL_MS;
  const st = track.lifecycleState || track.status;
  if (st === "completed" || st === "cancelled") return null; // Stop polling
  if (st === "en_route") return 2_500;
  if (st === "arrived" || st === "shooting" || st === "uploading") return 8_000;
  return 15_000; // booked / assigned / pending / confirmed
}

// ── Adaptive Polling (+ instant refresh when the app comes back to foreground) ─
function useTracking(bookingId: string, shareToken?: string) {
  const { token, preloadedTrack } = useListingsStore();
  const [track, setTrack] = useState<TrackData | null>(() => preloadedTrack[bookingId] ?? null);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchTrack = useCallback(async () => {
    try {
      const qs = shareToken ? `?t=${encodeURIComponent(shareToken)}` : "";
      const res = await fetch(
        `${API_BASE_URL}/api/photography/bookings/${bookingId}/track${qs}`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} }
      );
      const data = await res.json();
      if (data.success) {
        setTrack(data);
        setError(null);
      } else {
        setError(data.error ?? "Failed to load tracking");
      }
    } catch {
      setError("Network error — retrying…");
    }
  }, [bookingId, shareToken, token]);

  useEffect(() => {
    fetchTrack();
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") fetchTrack();
    });
    return () => sub.remove();
  }, [fetchTrack]);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const delay = getAdaptivePollMs(track);
    if (delay === null) return;
    timerRef.current = setTimeout(fetchTrack, delay);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [track, fetchTrack]);

  return { track, error, refresh: fetchTrack };
}

// ── Motion engine wiring (shared by web + native) ────────────────────────────
function useDriverMotion(track: TrackData | null) {
  const motion = useRef<DriverMotion>(new DriverMotion()).current;
  const routeBusy = useRef(false);
  const lastTs = useRef(0);
  const lastReroute = useRef(0);

  const dest: LngLat | null = track?.propertyLocation
    ? [Number(track.propertyLocation.lng), Number(track.propertyLocation.lat)]
    : null;

  // Synchronous frame-0 seeding when route + location are preloaded from the server
  if (track?.route && track.route.length > 1 && !motion.hasRoute()) {
    motion.setRoute(track.route);
    if (track.shutterbugLocation) {
      lastTs.current = track.shutterbugLocation.ts;
      motion.pushPing({
        lat: track.shutterbugLocation.lat,
        lng: track.shutterbugLocation.lng,
        ts: track.shutterbugLocation.ts,
      });
    }
  }

  useEffect(() => {
    motion.start();
    return () => motion.stop();
  }, [motion]);

  const loadRoute = useCallback(
    async (from: LngLat, to: LngLat) => {
      if (routeBusy.current) return;
      routeBusy.current = true;
      const r = await fetchRoute(from, to, MAPBOX_TOKEN);
      routeBusy.current = false;
      if (r) motion.setRoute(r);
    },
    [motion]
  );

  const loc = track?.shutterbugLocation;
  const serverRoute = track?.route;
  const destKey = dest ? `${dest[0]},${dest[1]}` : "";
  useEffect(() => {
    if (!loc || !dest) return;
    if (!motion.hasRoute() && serverRoute && serverRoute.length > 1) {
      motion.setRoute(serverRoute);
    }
    if (loc.ts !== lastTs.current) {
      lastTs.current = loc.ts;
      motion.pushPing({ lat: loc.lat, lng: loc.lng, ts: loc.ts });
    }
    if (!motion.hasRoute()) loadRoute([loc.lng, loc.lat], dest);
    motion.onOffRoute = (p) => {
      if (Date.now() - lastReroute.current < 10_000) return;
      lastReroute.current = Date.now();
      loadRoute(p, dest);
    };
  }, [loc?.ts, destKey, serverRoute]);

  // Server says the trip is done but we missed the last pings (e.g. app was in the
  // background): glide to the destination instead of freezing mid-route.
  const effectiveState = track?.lifecycleState || track?.status;
  useEffect(() => {
    if (
      effectiveState === "completed" ||
      effectiveState === "arrived" ||
      effectiveState === "shooting" ||
      effectiveState === "uploading"
    ) {
      motion.finish();
    }
  }, [effectiveState, motion]);

  return { motion, dest };
}

/** ETA + progress from the live engine, refreshed once a second */
function useLiveEta(motion: DriverMotion) {
  const [eta, setEta] = useState<{ min: number | null; progress: number }>({ min: null, progress: 0 });
  useEffect(() => {
    let last = 0;
    return motion.subscribe((f: Frame) => {
      const now = Date.now();
      if (now - last < 1000) return;
      last = now;
      const speed = Math.max(f.speedMps, 6); // never divide by ~0
      setEta({ min: Math.max(1, Math.ceil(f.remainingMeters / speed / 60)), progress: f.fraction });
    });
  }, [motion]);
  return eta;
}

const lineFeature = (coords: LngLat[]) => ({
  type: "Feature" as const,
  properties: {},
  geometry: {
    type: "LineString" as const,
    coordinates: coords.length > 1 ? coords : [coords[0], coords[0]],
  },
});
const pointFeature = (pos: LngLat, bearing: number, uri?: string | null) => ({
  type: "Feature" as const,
  properties: {
    yaw: modelYaw(bearing),
    uri: uri ?? "",
    pxScale: TARGET_PX / MODEL_LENGTH_M,
  },
  geometry: { type: "Point" as const, coordinates: pos },
});
const midpoint = (a: LngLat, b: LngLat): LngLat => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

const modelUriCache: Record<string, string> = {};
let cachedMapbox: any = null;

/** iOS's map engine refuses plain-http model URLs (the dev server is http), so in dev we copy the
 *  bundled model into the app's cache once and give the map a file:// URL. Release builds already
 *  resolve the asset to a local file. */
function useLocalModel(asset: any, fileName: string) {
  const [uri, setUri] = useState<string | null>(() => modelUriCache[fileName] ?? null);
  useEffect(() => {
    if (modelUriCache[fileName]) {
      setUri(modelUriCache[fileName]);
      return;
    }
    let alive = true;
    (async () => {
      try {
        let u = Image.resolveAssetSource(asset).uri;
        if (/^https?:/.test(u)) {
          const FS = await import("expo-file-system/legacy");
          const dest = `${FS.cacheDirectory}${fileName}`;
          const info = await FS.getInfoAsync(dest);
          if (!info.exists) {
            await FS.downloadAsync(u, dest);
          }
          u = dest;
        }
        modelUriCache[fileName] = u;
        if (alive) setUri(u);
      } catch (e) {
        console.warn(`[tracking] could not prepare ${fileName}:`, e);
      }
    })();
    return () => { alive = false; };
  }, [asset, fileName]);
  return uri;
}

/** Eases the house's on-screen size (px) toward its target: small while driving, big on arrival */
function stepHousePx(cur: number, arrived: boolean) {
  const target = arrived ? HOUSE_PX_ARRIVED : HOUSE_PX;
  return cur + (target - cur) * 0.12;
}

// ── Floating chrome: back, address pill, recenter ────────────────────────────
function RoundButton({ icon, onPress, colors, style }: { icon: any; onPress: () => void; colors: any; style?: any }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [
        styles.roundBtn,
        { backgroundColor: colors.card, opacity: pressed ? 0.85 : 1 },
        floatShadow,
        webCursor,
        style,
      ]}
    >
      <Ionicons name={icon} size={22} color={colors.foreground} />
    </Pressable>
  );
}

function MapChrome({
  colors, insets, onBack, onRecenter, address, sheetH, children,
}: {
  colors: any; insets: { top: number; bottom: number }; onBack: () => void; onRecenter: () => void;
  address?: string | null; sheetH: number; children: React.ReactNode;
}) {
  return (
    <>
      <RoundButton icon="arrow-back" onPress={onBack} colors={colors} style={{ top: insets.top + 8, left: 16 }} />
      {!!address && (
        <View
          pointerEvents="none"
          style={[styles.addressPill, { top: insets.top + 8, backgroundColor: colors.card }, floatShadow]}
        >
          <View style={[styles.pillDot, { backgroundColor: colors.primary }]} />
          <Text numberOfLines={1} style={[styles.pillText, { color: colors.foreground }]}>
            {address}
          </Text>
        </View>
      )}
      <RoundButton icon="locate" onPress={onRecenter} colors={colors} style={{ right: 16, bottom: sheetH + 16 }} />
      {children}
    </>
  );
}

// ── Bottom sheet ─────────────────────────────────────────────────────────────
function ProgressBar({ value, color, track }: { value: number; color: string; track: string }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: Math.max(0, Math.min(1, value)), duration: 900, easing: Easing.linear, useNativeDriver: false }).start();
  }, [value]);
  return (
    <View style={[styles.progressTrack, { backgroundColor: track }]}>
      <Animated.View
        style={[styles.progressFill, { backgroundColor: color, width: anim.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }) }]}
      />
    </View>
  );
}

/** Small "Live" pill with a softly pulsing dot — signals real-time tracking */
function LivePill({ color, bg, text }: { color: string; bg: string; text: string }) {
  const pulse = useRef(new Animated.Value(0.35)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
        Animated.timing(pulse, { toValue: 0.35, duration: 800, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);
  return (
    <View style={[styles.livePill, { backgroundColor: bg }]}>
      <Animated.View style={[styles.liveDot, { backgroundColor: color, opacity: pulse }]} />
      <Text style={[styles.liveText, { color: text }]}>Live</Text>
    </View>
  );
}

function TrackingSheet({
  colors, status, lifecycleState, arrived, etaMin, progress, address,
  shutterbugName, slotDate, slotWindow, arrivalOtp, privacySuppressed,
  onSimulate, simulating, bottomInset, onLayout,
}: {
  colors: any; status?: string; lifecycleState?: string; arrived: boolean; etaMin: number | null; progress: number;
  address?: string | null; shutterbugName?: string | null; slotDate?: string | null; slotWindow?: string | null;
  arrivalOtp?: string | null; privacySuppressed?: boolean; onSimulate?: () => void; simulating?: boolean;
  bottomInset: number; onLayout: (e: LayoutChangeEvent) => void;
}) {
  const effective = lifecycleState || status;
  const isShooting = effective === "shooting";
  const isUploading = effective === "uploading";
  const isArrived = arrived || effective === "arrived" || isShooting || isUploading;
  const live = !isArrived && (effective === "en_route" || status === "en_route");
  const done = effective === "completed" || status === "completed";
  const scheduled = !live && !isArrived && !done;
  const green = "#16A34A";

  let big: React.ReactNode;
  let sub: string;
  if (done) {
    big = <Text style={[styles.bigText, { color: colors.foreground }]}>Shoot complete</Text>;
    sub = "Your HD property photos are being processed";
  } else if (isUploading) {
    big = <Text style={[styles.bigText, { color: colors.foreground }]}>Uploading photos</Text>;
    sub = "Shoot wrapped up — syncing HD media to Blab";
  } else if (isShooting) {
    big = (
      <View style={styles.arrivedRow}>
        <View style={[styles.checkBadge, { backgroundColor: colors.primary }]}>
          <Ionicons name="camera" size={16} color="#fff" />
        </View>
        <Text style={[styles.bigText, { color: colors.foreground }]}>Shooting now</Text>
      </View>
    );
    sub = `${shutterbugName || "Your Shutterbug"} is capturing your property`;
  } else if (isArrived) {
    big = (
      <View style={styles.arrivedRow}>
        <View style={[styles.checkBadge, { backgroundColor: green }]}>
          <Ionicons name="checkmark" size={18} color="#fff" />
        </View>
        <Text style={[styles.bigText, { color: colors.foreground }]}>Arrived</Text>
      </View>
    );
    sub = arrivalOtp
      ? "Share the 6-digit arrival code below to begin the shoot"
      : "Your Shutterbug is parked outside — the shoot is about to begin";
  } else if (live) {
    big = (
      <Text style={[styles.bigText, { color: colors.foreground }]}>
        {etaMin != null ? (etaMin <= 1 ? "Arriving now" : `${etaMin} min`) : "On the way"}
      </Text>
    );
    sub = privacySuppressed
      ? `${shutterbugName || "Your Shutterbug"} is wrapping up nearby and heading to you`
      : `${shutterbugName || "Your Shutterbug"} is on the way`;
  } else {
    big = <Text style={[styles.bigText, { color: colors.foreground }]}>Shoot scheduled</Text>;
    const winLabel = slotWindow ? (SLOT_WINDOW_LABELS[slotWindow] ?? slotWindow) : null;
    sub = winLabel
      ? `${slotDate ? `${slotDate} · ` : ""}${winLabel}${shutterbugName ? ` · ${shutterbugName}` : ""}`
      : "Live map tracking activates as soon as your Shutterbug starts their ride";
  }

  return (
    <View
      onLayout={onLayout}
      style={[
        styles.sheet,
        { backgroundColor: colors.card, paddingBottom: Math.max(bottomInset, 12) + 8 },
        Platform.select({
          ios: { shadowColor: "#000", shadowOffset: { width: 0, height: -6 }, shadowOpacity: 0.12, shadowRadius: 16 },
          android: { elevation: 16 },
          web: { boxShadow: "0 -8px 28px rgba(0,0,0,0.14)" },
        }) as any,
      ]}
    >
      <View style={[styles.handle, { backgroundColor: colors.border }]} />
      <View style={styles.sheetTop}>
        <View style={{ flex: 1 }}>
          {big}
          <Text style={[styles.subText, { color: colors.mutedForeground }]}>{sub}</Text>
        </View>
        {live && <LivePill color={colors.primary} bg={colors.muted} text={colors.foreground} />}
      </View>
      {!scheduled && !done && (
        <ProgressBar value={isArrived ? 1 : progress} color={isArrived ? green : colors.primary} track={colors.muted} />
      )}
      {!!arrivalOtp && !done && !isShooting && !isUploading && (
        <View style={[styles.otpBanner, { backgroundColor: colors.muted, borderColor: colors.border }]}>
          <View style={styles.otpLeft}>
            <Text style={[styles.otpLabel, { color: colors.mutedForeground }]}>ARRIVAL HANDSHAKE CODE</Text>
            <Text style={[styles.otpHint, { color: colors.mutedForeground }]}>
              Share with {shutterbugName || "your Shutterbug"} at the door
            </Text>
          </View>
          <View style={[styles.otpPill, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.otpValue, { color: colors.primary }]}>{arrivalOtp}</Text>
          </View>
        </View>
      )}
      {__DEV__ && scheduled && onSimulate && (
        <Pressable
          onPress={onSimulate}
          disabled={simulating}
          style={[styles.simBtn, { backgroundColor: colors.primary + "18", borderColor: colors.primary }, webCursor]}
        >
          <Ionicons name="flash" size={15} color={colors.primary} />
          <Text style={[styles.simBtnText, { color: colors.primary }]}>
            {simulating ? "Starting 3D Scooter Simulation…" : "DEV · Simulate Live Shutterbug Ride"}
          </Text>
        </Pressable>
      )}
      {!!address && (
        <>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <View style={styles.addressRow}>
            <View style={[styles.addrIcon, { backgroundColor: colors.muted }]}>
              <Ionicons name="location" size={16} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.addrLabel, { color: colors.mutedForeground }]}>Shoot location</Text>
              <Text numberOfLines={1} style={[styles.addrText, { color: colors.foreground }]}>{address}</Text>
            </View>
          </View>
        </>
      )}
    </View>
  );
}

// ── Web implementation ───────────────────────────────────────────────────────
function TrackingWeb({ bookingId, shareToken }: { bookingId: string; shareToken?: string }) {
  const router = useRouter();
  const { colors, mapStyle, routeCasing, routeLine } = useTrackingTheme();
  const insets = useSafeAreaInsets();
  const { track, refresh } = useTracking(bookingId, shareToken);
  const { motion, dest } = useDriverMotion(track);
  const eta = useLiveEta(motion);
  const [arrived, setArrived] = useState(false);
  const [sheetH, setSheetH] = useState(DEFAULT_SHEET_H);
  const [simulating, setSimulating] = useState(false);

  const handleSimulate = useCallback(async () => {
    setSimulating(true);
    try {
      motion.reset();
      drawnRoute.current = null;
      arrivedRef.current = false;
      setArrived(false);
      await fetch(`${API_BASE_URL}/api/dev/simulate-booking/${bookingId}`, { method: "POST" });
      await refresh();
    } finally {
      setSimulating(false);
    }
  }, [bookingId, motion, refresh]);

  const containerRef = useRef<any>(null);
  const mapRef = useRef<any>(null);
  const readyRef = useRef(false);
  const latest = useRef<Frame | null>(null);
  const arrivedRef = useRef(false);
  const scaleRef = useRef(1);
  const pinRootRef = useRef<any>(null);
  const pinPxRef = useRef(HOUSE_PX);
  const typeRef = useRef<string | null | undefined>(track?.propertyType);
  typeRef.current = track?.propertyType;
  const sheetHRef = useRef(DEFAULT_SHEET_H);
  sheetHRef.current = sheetH;
  const topPad = insets.top;
  const padRef = useRef({ top: 90, bottom: 280, left: 60, right: 60 });
  padRef.current = { top: topPad + 80, bottom: sheetH + 60, left: 60, right: 60 };

  const destKey = dest ? `${dest[0]},${dest[1]}` : "";
  useEffect(() => {
    if (!containerRef.current || !dest || mapRef.current) return;
    let cancelled = false;
    (async () => {
      if (!document.getElementById("mapbox-gl-css")) {
        const link = document.createElement("link");
        link.id = "mapbox-gl-css";
        link.rel = "stylesheet";
        link.href = "https://api.mapbox.com/mapbox-gl-js/v3.24.0/mapbox-gl.css";
        document.head.appendChild(link);
      }
      const mbgl: any = (await import("mapbox-gl")).default;
      const { createRoot } = await import("react-dom/client");
      if (cancelled || !containerRef.current || mapRef.current) return;
      mbgl.accessToken = MAPBOX_TOKEN;
      const initRoute = motion.getRoute();
      const initLoc = track?.shutterbugLocation;
      const initPos: LngLat = initLoc ? [initLoc.lng, initLoc.lat] : dest;
      const initBounds = initLoc
        ? [[Math.min(initPos[0], dest[0]), Math.min(initPos[1], dest[1])], [Math.max(initPos[0], dest[0]), Math.max(initPos[1], dest[1])]]
        : undefined;
      const map = new mbgl.Map({
        container: containerRef.current,
        style: mapStyle,
        ...(initBounds
          ? { bounds: initBounds, fitBoundsOptions: { padding: padRef.current, maxZoom: ARRIVAL_ZOOM, pitch: MAP_PITCH } }
          : { center: dest, zoom: 15, pitch: MAP_PITCH }),
      });
      mapRef.current = map;

      map.on("load", () => {
        const startLine = initRoute.length > 1 ? initRoute : [dest, dest];
        if (initRoute.length > 1) drawnRoute.current = initRoute;
        map.addSource("route", { type: "geojson", lineMetrics: true, data: lineFeature(startLine) });
        map.addLayer({
          id: "route-casing", type: "line", source: "route",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": routeCasing, "line-width": 11, "line-opacity": 0.85, "line-trim-offset": [0, 0] },
        });
        map.addLayer({
          id: "route-line", type: "line", source: "route",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": routeLine, "line-width": 6, "line-trim-offset": [0, 0] },
        });
        // Street → front door dotted path
        map.addSource("walk", { type: "geojson", data: lineFeature([dest, dest]) });
        map.addLayer({
          id: "walk-casing", type: "line", source: "walk",
          layout: { "line-cap": "round", visibility: "none" },
          paint: { "line-color": routeCasing, "line-width": 7, "line-opacity": 0.9 },
        });
        map.addLayer({
          id: "walk-line", type: "line", source: "walk",
          layout: { "line-cap": "round", visibility: "none" },
          paint: { "line-color": routeLine, "line-width": 4, "line-dasharray": [0.1, 2.2] },
        });

        map.addSource("driver", {
          type: "model",
          models: {
            scooter: {
              uri: "/models/shutterbug.glb",
              position: initPos,
              orientation: [0, 0, modelYaw(initLoc?.heading ?? 0)],
            },
          },
        } as any);
        map.addLayer({
          id: "driver-model", type: "model", source: "driver",
          layout: { "model-id": "scooter" },
          paint: {
            "model-type": "location-indicator",
            "model-scale": buildModelScaleExpr(dest[1]),
            "model-scale-transition": { duration: 0, delay: 0 },
            "model-emissive-strength": 0.9,
          } as any,
        });
        readyRef.current = true;
        map.on("error", (e: any) => console.warn("[tracking-map] error:", e?.error?.message ?? e));
        map.on("dragstart", (e: any) => { if (e?.originalEvent) userMovedWebRef.current = true; });
        map.on("zoomstart", (e: any) => { if (e?.originalEvent) userMovedWebRef.current = true; });

        const pin = document.createElement("div");
        pinRootRef.current = createRoot(pin);
        pinRootRef.current.render(<PropertyPin type={typeRef.current} size={HOUSE_PX} color={colors.primary} />);
        new mbgl.Marker({ element: pin, anchor: "bottom" }).setLngLat(dest).addTo(map);
      });
    })();
    return () => { cancelled = true; };
  }, [destKey]);

  const drawnRoute = useRef<LngLat[] | null>(null);
  const drawRoute = useCallback(() => {
    const map = mapRef.current;
    const r = motion.getRoute();
    if (!map || !readyRef.current || !dest || r.length < 2 || drawnRoute.current === r) return;
    drawnRoute.current = r;
    map.getSource("route")?.setData(lineFeature(r));
  }, [motion, destKey]);
  useEffect(() => motion.subscribeRoute(drawRoute), [motion, drawRoute]);

  const userMovedWebRef = useRef(false);
  const recenter = useCallback(() => {
    userMovedWebRef.current = false;
    const f = latest.current;
    const map = mapRef.current;
    if (!f || !dest || !map) return;
    if (arrivedRef.current) {
      map.easeTo({ center: midpoint(f.pos, dest), zoom: ARRIVAL_ZOOM, pitch: 58, bearing: 25, duration: 1200, padding: { top: topPad, bottom: sheetHRef.current, left: 0, right: 0 } });
    } else fitWeb(map, f.pos, dest, 800, padRef.current);
  }, [motion, destKey, topPad]);

  useEffect(() => {
    let lastDraw = 0;
    let fitted = false;
    const unsub = motion.subscribe((f: Frame) => {
      latest.current = f;
      const map = mapRef.current;
      if (!map || !readyRef.current || !dest) return;
      drawRoute();
      // GPU zoom expression on ModelSource handles model-scale instantaneously; leadMeters keeps route trim at front tyre
      scaleRef.current = formulaScale(map.getZoom(), f.pos[1]);
      motion.leadMeters = FRONT_TIRE_M * scaleRef.current;
      const now = Date.now();
      if (now - lastDraw < 33) return;
      lastDraw = now;
      (map.getSource("driver") as any)?.setModels?.({
        scooter: {
          uri: "/models/shutterbug.glb",
          position: f.pos,
          orientation: [0, 0, modelYaw(f.bearing)],
        },
      });
      map.setPaintProperty("route-line", "line-trim-offset", [0, f.fraction]);
      map.setPaintProperty("route-casing", "line-trim-offset", [0, f.fraction]);
      if (!fitted && !arrivedRef.current) {
        fitted = true;
        fitWeb(map, f.pos, dest, 0, padRef.current);
      }
      if (!f.arrived && arrivedRef.current && f.remainingMeters > 60) {
        arrivedRef.current = false;
        setArrived(false);
      }
      if (f.arrived && !arrivedRef.current) {
        arrivedRef.current = true;
        setArrived(true);
        map.easeTo({
          center: midpoint(f.pos, dest), zoom: ARRIVAL_ZOOM, pitch: 58, bearing: 25, duration: 3500,
          padding: { top: topPad, bottom: sheetHRef.current, left: 0, right: 0 },
        });
      }
    });
    const timer = setInterval(() => {
      const f = latest.current;
      if (f && dest && mapRef.current && !arrivedRef.current && !userMovedWebRef.current) {
        fitWeb(mapRef.current, f.pos, dest, 1000, padRef.current);
      }
    }, 4000);
    // Dotted path (front tyre → door): only after the scooter has parked
    const walkTimer = setInterval(() => {
      const map = mapRef.current;
      if (!map || !readyRef.current || !dest) return;
      // Pin: small while driving, eases bigger on arrival; re-render only while it is changing
      // (or once the property type arrives)
      const nextPx = stepHousePx(pinPxRef.current, arrivedRef.current);
      const typeNow = typeRef.current;
      if (pinRootRef.current && (Math.abs(nextPx - pinPxRef.current) > 0.15 || (pinPxRef.current === HOUSE_PX && typeNow))) {
        pinPxRef.current = nextPx;
        pinRootRef.current.render(<PropertyPin type={typeNow} size={nextPx} color={colors.primary} />);
      }
      if (!arrivedRef.current) return;
      if (map.getLayer("walk-line")) {
        map.setLayoutProperty("walk-line", "visibility", "visible");
        map.setLayoutProperty("walk-casing", "visibility", "visible");
      }
      map.getSource("walk")?.setData(lineFeature([motion.frontTirePosition(), dest]));
    }, 100);
    return () => { unsub(); clearInterval(timer); clearInterval(walkTimer); };
  }, [motion, destKey, drawRoute, topPad]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <div ref={containerRef} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 } as any} />
      <MapChrome
        colors={colors} insets={insets} onBack={() => router.back()} onRecenter={recenter}
        address={track?.propertyAddress} sheetH={sheetH}
      >
        <TrackingSheet
          colors={colors} status={track?.status} lifecycleState={track?.lifecycleState}
          arrived={arrived} etaMin={eta.min ?? track?.etaMinutes ?? null}
          progress={eta.progress} address={track?.propertyAddress}
          shutterbugName={track?.shutterbugName} slotDate={track?.slotDate} slotWindow={track?.slotWindow}
          arrivalOtp={track?.arrivalOtp} privacySuppressed={track?.privacySuppressed}
          onSimulate={handleSimulate} simulating={simulating}
          bottomInset={insets.bottom} onLayout={(e) => setSheetH(e.nativeEvent.layout.height)}
        />
      </MapChrome>
    </View>
  );
}

function fitWeb(map: any, a: LngLat, b: LngLat, duration: number, padding: { top: number; bottom: number; left: number; right: number }) {
  const cam = map.cameraForBounds(
    [[Math.min(a[0], b[0]), Math.min(a[1], b[1])], [Math.max(a[0], b[0]), Math.max(a[1], b[1])]],
    { padding, maxZoom: ARRIVAL_ZOOM }
  );
  if (!cam) return;
  map.easeTo({ center: cam.center, zoom: Math.min(ARRIVAL_ZOOM, cam.zoom - 0.35), pitch: MAP_PITCH, duration });
}

// ── Native implementation ────────────────────────────────────────────────────
function TrackingNative({ bookingId, shareToken }: { bookingId: string; shareToken?: string }) {
  const router = useRouter();
  const { colors, mapStyle, routeCasing, routeLine } = useTrackingTheme();
  const insets = useSafeAreaInsets();
  const { track, refresh } = useTracking(bookingId, shareToken);
  const { motion, dest } = useDriverMotion(track);
  const eta = useLiveEta(motion);
  const [simulating, setSimulating] = useState(false);

  const [Mapbox, setMapbox] = useState<any>(() => cachedMapbox);
  useEffect(() => {
    if (cachedMapbox) return;
    import("@rnmapbox/maps").then((m) => {
      m.default.setAccessToken(MAPBOX_TOKEN);
      cachedMapbox = m.default;
      setMapbox(m.default);
    }).catch(() => {});
  }, []);

  const modelUri = useLocalModel(SCOOTER_MODEL, "shutterbug.glb");
  const modelUriRef = useRef<string | null>(null);
  modelUriRef.current = modelUri;

  const cameraRef = useRef<any>(null);
  const latest = useRef<Frame | null>(null);
  const zoomRef = useRef(14);
  const mapRef = useRef<any>(null);
  const arrivedRef = useRef(false);
  const userMovedRef = useRef(false);
  const [driver, setDriver] = useState<any>(() => {
    const loc = track?.shutterbugLocation;
    return loc && modelUri ? pointFeature([loc.lng, loc.lat], loc.heading ?? 0, modelUri) : null;
  });
  const [frac, setFrac] = useState(0);
  const [routeShape, setRouteShape] = useState<any>(() => {
    const r = motion.getRoute();
    return r.length > 1 ? lineFeature(r) : null;
  });
  const [walkShape, setWalkShape] = useState<any>(null);
  const [housePx, setHousePx] = useState(HOUSE_PX);
  const [arrived, setArrived] = useState(false);
  const housePxRef = useRef(HOUSE_PX);

  const handleSimulate = useCallback(async () => {
    setSimulating(true);
    try {
      motion.reset();
      setRouteShape(null);
      setWalkShape(null);
      arrivedRef.current = false;
      setArrived(false);
      await fetch(`${API_BASE_URL}/api/dev/simulate-booking/${bookingId}`, { method: "POST" });
      await refresh();
    } finally {
      setSimulating(false);
    }
  }, [bookingId, motion, refresh]);
  const [sheetH, setSheetH] = useState(DEFAULT_SHEET_H);
  const sheetHRef = useRef(DEFAULT_SHEET_H);
  sheetHRef.current = sheetH;
  const topPad = insets.top;
  const padRef = useRef({ top: 90, bottom: 280 });
  padRef.current = { top: topPad + 80, bottom: sheetH + 60 };

  const destKey = dest ? `${dest[0]},${dest[1]}` : "";

  useEffect(() => {
    if (modelUri && latest.current) {
      setDriver(pointFeature(latest.current.pos, latest.current.bearing, modelUri));
    }
  }, [modelUri]);

  // Route geometry: set once per (re)route; the line is only trimmed afterwards
  useEffect(() => {
    const draw = () => {
      const r = motion.getRoute();
      if (r.length < 2) return;
      setRouteShape(lineFeature(r));
    };
    draw();
    return motion.subscribeRoute(draw);
  }, [motion, destKey]);

  const recenter = useCallback(() => {
    userMovedRef.current = false;
    const f = latest.current;
    if (!f || !dest) return;
    if (arrivedRef.current) {
      cameraRef.current?.setCamera?.({
        centerCoordinate: midpoint(f.pos, dest), zoomLevel: ARRIVAL_ZOOM, pitch: 58, heading: 25,
        padding: { paddingTop: topPad, paddingBottom: sheetHRef.current, paddingLeft: 0, paddingRight: 0 },
        animationDuration: 1200, animationMode: "easeTo",
      });
    } else fitNative(cameraRef.current, f.pos, dest, 800, padRef.current);
  }, [destKey, topPad]);

  useEffect(() => {
    let lastDraw = 0;
    let fitted = false;
    const unsub = motion.subscribe((f: Frame) => {
      latest.current = f;
      // ModelSource + .viewport mode renders at fixed screen pixel size on every frame;
      // formulaScale here is only used to keep the route-line trim right at the front tyre.
      const s = formulaScale(zoomRef.current, f.pos[1]);
      motion.leadMeters = FRONT_TIRE_M * s;
      const now = Date.now();
      if (now - lastDraw < 33) return; // 30fps native updates are plenty smooth
      lastDraw = now;
      setDriver(pointFeature(f.pos, f.bearing, modelUriRef.current));
      setFrac(f.fraction);
      if (!fitted && dest && !arrivedRef.current) {
        fitted = true;
        fitNative(cameraRef.current, f.pos, dest, 0, padRef.current);
      }
      if (!f.arrived && arrivedRef.current && f.remainingMeters > 60) {
        arrivedRef.current = false;
        setArrived(false);
        setWalkShape(null);
      }
      if (f.arrived && !arrivedRef.current && dest) {
        arrivedRef.current = true;
        setArrived(true);
        // Cinematic: ease to a street-level 3/4 view of scooter + house (above the sheet)
        cameraRef.current?.setCamera?.({
          centerCoordinate: midpoint(f.pos, dest),
          zoomLevel: ARRIVAL_ZOOM,
          pitch: 58,
          heading: 25,
          padding: { paddingTop: topPad, paddingBottom: sheetHRef.current, paddingLeft: 0, paddingRight: 0 },
          animationDuration: 3500,
          animationMode: "easeTo",
        });
      }
    });
    const timer = setInterval(() => {
      const f = latest.current;
      if (f && dest && !arrivedRef.current && !userMovedRef.current) {
        fitNative(cameraRef.current, f.pos, dest, 900, padRef.current);
      }
    }, 4000);
    // Property pin eases bigger on arrival; dotted path (front tyre → door) only after parking
    let lastWalk = "";
    const houseTimer = setInterval(() => {
      if (!dest) return;
      const next = stepHousePx(housePxRef.current, arrivedRef.current);
      if (Math.abs(next - housePxRef.current) > 0.15) {
        housePxRef.current = next;
        setHousePx(next);
      }
      if (arrivedRef.current && motion.hasRoute()) {
        const ft = motion.frontTirePosition();
        const key = `${ft[0].toFixed(6)},${ft[1].toFixed(6)}`;
        if (key !== lastWalk) {
          lastWalk = key;
          setWalkShape(lineFeature([ft, dest]));
        }
      }
    }, 40);
    return () => { unsub(); clearInterval(timer); clearInterval(houseTimer); };
  }, [motion, destKey, !!Mapbox, topPad]);

  if (!Mapbox || !dest) {
    return (
      <View style={[styles.nativeCenter, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const MapboxMap = Mapbox.MapView;
  const walkCoords = walkShape?.geometry?.coordinates;
  // Length of the street → door path (measured from where the scooter PARKS)
  const walkLen = walkCoords ? haversine(walkCoords[0], walkCoords[walkCoords.length - 1]) : 0;
  const initLoc = track?.shutterbugLocation;
  const initDriverPos: LngLat | null = initLoc ? [initLoc.lng, initLoc.lat] : null;
  const defaultCameraSettings = initDriverPos
    ? {
        bounds: {
          ne: [Math.max(initDriverPos[0], dest[0]), Math.max(initDriverPos[1], dest[1])],
          sw: [Math.min(initDriverPos[0], dest[0]), Math.min(initDriverPos[1], dest[1])],
          paddingTop: topPad + 80,
          paddingBottom: sheetH + 60,
          paddingLeft: 60,
          paddingRight: 60,
        },
        pitch: MAP_PITCH,
      }
    : {
        centerCoordinate: dest,
        zoomLevel: 15,
        pitch: MAP_PITCH,
      };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={StyleSheet.absoluteFill}>
        <MapboxMap
          ref={mapRef}
          style={{ flex: 1 }}
          styleURL={mapStyle}
          logoEnabled={false}
          attributionEnabled={false}
          compassEnabled={false}
          scaleBarEnabled={false}
          onCameraChanged={(s: any) => {
            const z = s?.properties?.zoom;
            if (typeof z === "number") zoomRef.current = z;
            if (s?.gestures?.isGestureActive) userMovedRef.current = true;
          }}
        >
          <Mapbox.Camera ref={cameraRef} defaultSettings={defaultCameraSettings} maxZoomLevel={19} />

          {/* Route: full geometry once; lineTrimOffset hides the part already driven */}
          {routeShape && (
            <Mapbox.ShapeSource id="route-src" shape={routeShape} lineMetrics>
              <Mapbox.LineLayer
                id="route-casing"
                style={{ lineColor: routeCasing, lineWidth: 11, lineOpacity: 0.85, lineCap: "round", lineJoin: "round", lineTrimOffset: [0, frac] }}
              />
              <Mapbox.LineLayer
                id="route-line"
                aboveLayerID="route-casing"
                style={{ lineColor: routeLine, lineWidth: 6, lineCap: "round", lineJoin: "round", lineTrimOffset: [0, frac] }}
              />
            </Mapbox.ShapeSource>
          )}

          {/* Street → front door dotted path */}
          {arrived && walkShape && walkLen > 2 && (
            <Mapbox.ShapeSource id="walk-src" shape={walkShape}>
              <Mapbox.LineLayer id="walk-casing" style={{ lineColor: routeCasing, lineWidth: 7, lineCap: "round", lineOpacity: 0.9 }} />
              <Mapbox.LineLayer
                id="walk-line"
                aboveLayerID="walk-casing"
                style={{ lineColor: routeLine, lineWidth: 4, lineCap: "round", lineDasharray: [0.1, 2.2] }}
              />
            </Mapbox.ShapeSource>
          )}

          {/* Property: pin (same as listing flow) with a type icon, bigger once the scooter has parked */}
          {dest && (
            <Mapbox.MarkerView id="property-pin" coordinate={dest} anchor={{ x: 0.5, y: 1 }} allowOverlap allowOverlapWithPuck>
              <PropertyPin type={track?.propertyType} size={housePx} color={colors.primary} />
            </Mapbox.MarkerView>
          )}

          {/* Driver: untiled ModelSource + .viewport ModelLayer (managed natively in RNMBXShapeSource for id="driver-src") */}
          {driver && modelUri && <Mapbox.ShapeSource id="driver-src" shape={driver} />}
        </MapboxMap>
      </View>

      <MapChrome
        colors={colors} insets={insets} onBack={() => router.back()} onRecenter={recenter}
        address={track?.propertyAddress} sheetH={sheetH}
      >
        <TrackingSheet
          colors={colors} status={track?.status} lifecycleState={track?.lifecycleState}
          arrived={arrived} etaMin={eta.min ?? track?.etaMinutes ?? null}
          progress={eta.progress} address={track?.propertyAddress}
          shutterbugName={track?.shutterbugName} slotDate={track?.slotDate} slotWindow={track?.slotWindow}
          arrivalOtp={track?.arrivalOtp} privacySuppressed={track?.privacySuppressed}
          onSimulate={handleSimulate} simulating={simulating}
          bottomInset={insets.bottom} onLayout={(e) => setSheetH(e.nativeEvent.layout.height)}
        />
      </MapChrome>
    </View>
  );
}

function fitNative(camera: any, a: LngLat, b: LngLat, duration: number, pad: { top: number; bottom: number }) {
  if (!camera?.setCamera) return;
  camera.setCamera({
    bounds: {
      ne: [Math.max(a[0], b[0]), Math.max(a[1], b[1])],
      sw: [Math.min(a[0], b[0]), Math.min(a[1], b[1])],
      paddingTop: pad.top, paddingBottom: pad.bottom, paddingLeft: 60, paddingRight: 60,
    },
    pitch: MAP_PITCH,
    animationDuration: duration,
    animationMode: duration ? "easeTo" : "none",
  });
}

// ── Entry ──────────────────────────────────────────────────────────────────────
export default function TrackingScreen() {
  const { id, t, run } = useLocalSearchParams<{ id: string; t?: string; run?: string }>();
  if (!id) return null;
  const instanceKey = `${id}:${run ?? "0"}`;
  return Platform.OS === "web"
    ? <TrackingWeb key={instanceKey} bookingId={id} shareToken={t} />
    : <TrackingNative key={instanceKey} bookingId={id} shareToken={t} />;
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  nativeCenter: { flex: 1, justifyContent: "center", alignItems: "center" },
  roundBtn: {
    position: "absolute", width: 44, height: 44, borderRadius: 22,
    alignItems: "center", justifyContent: "center", zIndex: 20,
  },
  addressPill: {
    position: "absolute", left: 72, right: 72, height: 44, borderRadius: 22,
    flexDirection: "row", alignItems: "center", paddingHorizontal: 16, gap: 10, zIndex: 20,
  },
  pillDot: { width: 8, height: 8, borderRadius: 4 },
  pillText: { flex: 1, fontSize: 14, fontWeight: "600" },
  sheet: {
    position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 30,
    borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 10,
  },
  handle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, marginBottom: 14 },
  sheetTop: { flexDirection: "row", alignItems: "center", gap: 16 },
  bigText: { fontSize: 30, fontWeight: "800", letterSpacing: -0.5 },
  subText: { fontSize: 14, marginTop: 4, lineHeight: 19 },
  arrivedRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  checkBadge: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  livePill: { flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16 },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  liveText: { fontSize: 13, fontWeight: "700", letterSpacing: 0.2 },
  progressTrack: { height: 5, borderRadius: 3, marginTop: 16, overflow: "hidden" },
  progressFill: { height: 5, borderRadius: 3 },
  otpBanner: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginTop: 14, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, borderWidth: 1,
  },
  otpLeft: { flex: 1, paddingRight: 12 },
  otpLabel: { fontSize: 10, fontWeight: "700", letterSpacing: 0.8 },
  otpHint: { fontSize: 12, marginTop: 2, lineHeight: 16 },
  otpPill: {
    flexShrink: 0, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, borderWidth: 1,
  },
  otpValue: { fontSize: 19, fontWeight: "900", letterSpacing: 2 },
  simBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    marginTop: 14, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1,
  },
  simBtnText: { fontSize: 13, fontWeight: "700" },
  divider: { height: 1, marginTop: 16, marginBottom: 14 },
  addressRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  addrIcon: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  addrLabel: { fontSize: 11, fontWeight: "600", letterSpacing: 0.4, textTransform: "uppercase" },
  addrText: { fontSize: 14, fontWeight: "600", marginTop: 2 },
});
