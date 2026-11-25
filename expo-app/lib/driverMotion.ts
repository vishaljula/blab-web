/**
 * driverMotion — Uber/Rapido-style smooth vehicle motion on a route.
 *
 * Architecture (the standard ride-hailing pattern):
 *   1. Driver app sends a GPS ping every ~2-4 s.
 *   2. Client holds the ROUTE polyline (Mapbox Directions geometry).
 *   3. Each ping is MAP-MATCHED (snapped) onto the route → a distance-along-route
 *      value. Position is always derived from the polyline, so the vehicle can
 *      only ever travel on the road and naturally follows left/right turns.
 *   4. A 60fps animation loop moves the marker along the polyline from where it
 *      currently is toward the new snapped distance, taking exactly one ping
 *      interval (constant velocity, continues at last speed if a ping is late).
 *   5. Heading = bearing of the route segment a few metres AHEAD of the vehicle,
 *      smoothed with shortest-angle exponential easing (smooth cornering).
 *   6. Route drawn = remaining part only (vehicle → destination), like Uber.
 *
 * Pure TypeScript, no platform imports — shared by native and web.
 */

export type LngLat = [number, number];

export interface Ping {
  lat: number;
  lng: number;
  /** Server timestamp (ms) of the GPS fix */
  ts: number;
}

export interface Frame {
  pos: LngLat;
  /** Compass bearing, degrees clockwise from north, smoothed */
  bearing: number;
  /** How far along the route the visible "front tire" is, 0..1 (use with line-trim-offset) */
  fraction: number;
  remainingMeters: number;
  /** Smoothed speed estimate in m/s */
  speedMps: number;
  arrived: boolean;
}

const R = 6371008.8;
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

export function haversine(a: LngLat, b: LngLat): number {
  const dLat = rad(b[1] - a[1]);
  const dLng = rad(b[0] - a[0]);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function bearingBetween(a: LngLat, b: LngLat): number {
  const dLng = rad(b[0] - a[0]);
  const y = Math.sin(dLng) * Math.cos(rad(b[1]));
  const x =
    Math.cos(rad(a[1])) * Math.sin(rad(b[1])) -
    Math.sin(rad(a[1])) * Math.cos(rad(b[1])) * Math.cos(dLng);
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

/** Shortest signed angular difference b - a in (-180, 180] */
function angleDiff(a: number, b: number) {
  return ((b - a + 540) % 360) - 180;
}

export async function fetchRoute(
  from: LngLat,
  to: LngLat,
  token: string
): Promise<LngLat[] | null> {
  try {
    const url =
      `https://api.mapbox.com/directions/v5/mapbox/driving/` +
      `${from[0]},${from[1]};${to[0]},${to[1]}` +
      `?geometries=geojson&overview=full&access_token=${token}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const coords = data?.routes?.[0]?.geometry?.coordinates;
    return Array.isArray(coords) && coords.length > 1 ? (coords as LngLat[]) : null;
  } catch {
    return null;
  }
}

export class DriverMotion {
  private route: LngLat[] = [];
  private cum: number[] = [];
  private total = 0;

  private from = 0;
  private to = 0;
  private t0 = 0;
  private dur = 2000;
  private speed = 0; // m/s smoothed
  private lastPing: { dist: number; ts: number } | null = null;
  private rawBeforeRoute: Ping | null = null;
  private searchFrom = 0; // segment index hint (monotonic progress)

  private bearing = 0;
  private bearingReady = false;
  private lastTick = 0;
  private raf: any = 0;
  private subs = new Set<(f: Frame) => void>();
  private routeSubs = new Set<() => void>();
  /** Metres the route should start AHEAD of the vehicle pivot (front tire contact). Set per frame by the UI. */
  leadMeters = 0;
  /** Park this many metres BEFORE the end of the route (so the vehicle stops on the street, clear of the house pin) */
  stopBeforeMeters = 0;

  private get stopAt() {
    return Math.max(0, this.total - this.stopBeforeMeters);
  }

  /** Where the FRONT TYRE touches the road when parked (pivot + lead along the route) */
  frontTirePosition(): LngLat {
    return this.hasRoute() ? this.positionAt(Math.min(this.total, this.stopAt + this.leadMeters)) : [0, 0];
  }

  /** Where the vehicle will park */
  parkPosition(): LngLat {
    return this.hasRoute() ? this.positionAt(this.stopAt) : [0, 0];
  }

  /** Called when a ping is far from the route (driver took another road) */
  onOffRoute?: (p: LngLat) => void;

  hasRoute() {
    return this.route.length > 1;
  }

  getRoute(): LngLat[] {
    return this.route;
  }

  /** Fires when a (new) route geometry is set — draw the full line once, then only trim it */
  subscribeRoute(cb: () => void) {
    this.routeSubs.add(cb);
    return () => {
      this.routeSubs.delete(cb);
    };
  }

  /** Driver reached the destination (server says completed): glide the rest of the way */
  finish(ms = 1400) {
    if (!this.hasRoute()) return;
    const now = Date.now();
    this.from = this.currentDist(now);
    this.to = this.stopAt;
    this.t0 = now;
    this.dur = ms;
  }

  /** Reset route and progress so a fresh simulation run starts cleanly from 0 */
  reset() {
    this.route = [];
    this.cum = [];
    this.total = 0;
    this.from = 0;
    this.to = 0;
    this.t0 = 0;
    this.speed = 0;
    this.lastPing = null;
    this.rawBeforeRoute = null;
    this.searchFrom = 0;
    this.bearingReady = false;
  }

  subscribe(cb: (f: Frame) => void) {
    this.subs.add(cb);
    return () => {
      this.subs.delete(cb);
    };
  }

  start() {
    if (this.raf) return;
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      this.tick(Date.now());
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  setRoute(coords: LngLat[]) {
    this.route = coords;
    this.cum = [0];
    for (let i = 1; i < coords.length; i++) {
      this.cum.push(this.cum[i - 1] + haversine(coords[i - 1], coords[i]));
    }
    this.total = this.cum[this.cum.length - 1];
    this.stopBeforeMeters = this.total > 80 ? 22 : 0;
    this.searchFrom = 0;
    this.lastPing = null;
    // Re-seed from the most recent raw ping so the vehicle starts on the new route
    const p = this.rawBeforeRoute;
    if (p) {
      const snap = this.project([p.lng, p.lat]);
      this.from = this.to = snap.dist;
      this.t0 = Date.now();
      this.lastPing = { dist: snap.dist, ts: p.ts };
    }
    this.routeSubs.forEach((cb) => cb());
  }

  pushPing(p: Ping) {
    this.rawBeforeRoute = p;
    if (!this.hasRoute()) return;

    const now = Date.now();
    const snap = this.project([p.lng, p.lat]);
    if (snap.offset > 60 && this.onOffRoute) this.onOffRoute([p.lng, p.lat]);

    // Progress is monotonic — never slide backwards because of GPS noise
    const target = Math.max(snap.dist, this.to);

    if (!this.lastPing) {
      this.from = this.to = target;
      this.t0 = now;
      this.lastPing = { dist: target, ts: p.ts };
      return;
    }

    const gap = p.ts - this.lastPing.ts || 2000;
    if (gap > 30_000) {
      // App was in the background for a long time: jump to where the driver really is
      this.from = this.to = target;
      this.t0 = now;
      this.lastPing = { dist: target, ts: p.ts };
      return;
    }
    // Returning after a while: glide quickly to the real position instead of a slow crawl
    const dtMs = gap > 8_000 ? 2500 : Math.min(6000, Math.max(800, gap));
    const instSpeed = (target - this.lastPing.dist) / (dtMs / 1000);
    this.speed = this.speed === 0 ? instSpeed : this.speed * 0.6 + instSpeed * 0.4;

    // Continue from wherever the marker is NOW (no jump), arrive when next ping is due
    this.from = this.currentDist(now);
    this.to = target;
    this.t0 = now;
    this.dur = dtMs;
    this.lastPing = { dist: target, ts: p.ts };
  }

  // ── internals ────────────────────────────────────────────────────────────

  private currentDist(now: number): number {
    const el = now - this.t0;
    if (el <= this.dur) {
      return Math.min(this.stopAt, this.from + (this.to - this.from) * (el / this.dur));
    }
    // Ping is late → keep going at the last speed, but only for a short time
    const extra = Math.min(el - this.dur, this.dur * 0.75) / 1000;
    return Math.min(this.stopAt, this.to + Math.max(0, this.speed) * extra);
  }

  /** Snap a point onto the route → distance along route + lateral offset */
  private project(pt: LngLat): { dist: number; offset: number } {
    const cosLat = Math.cos(rad(pt[1]));
    let best = { dist: 0, offset: Infinity };
    const startSeg = Math.max(0, this.searchFrom - 3);
    for (let i = startSeg; i < this.route.length - 1; i++) {
      const a = this.route[i];
      const b = this.route[i + 1];
      // local equirectangular metres
      const ax = rad(a[0]) * cosLat * R;
      const ay = rad(a[1]) * R;
      const bx = rad(b[0]) * cosLat * R;
      const by = rad(b[1]) * R;
      const px = rad(pt[0]) * cosLat * R;
      const py = rad(pt[1]) * R;
      const dx = bx - ax;
      const dy = by - ay;
      const len2 = dx * dx + dy * dy;
      let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
      t = Math.max(0, Math.min(1, t));
      const cx = ax + t * dx;
      const cy = ay + t * dy;
      const off = Math.hypot(px - cx, py - cy);
      if (off < best.offset) {
        best = { dist: this.cum[i] + t * (this.cum[i + 1] - this.cum[i]), offset: off };
        this.searchFrom = i;
      }
    }
    return best;
  }

  private segIndexAt(d: number): number {
    let lo = 0;
    let hi = this.cum.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (this.cum[mid] <= d) lo = mid;
      else hi = mid;
    }
    return lo;
  }

  private positionAt(d: number): LngLat {
    const dd = Math.max(0, Math.min(this.total, d));
    const i = this.segIndexAt(dd);
    const segLen = this.cum[i + 1] - this.cum[i];
    const t = segLen === 0 ? 0 : (dd - this.cum[i]) / segLen;
    const a = this.route[i];
    const b = this.route[i + 1] ?? a;
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  }

  private tick(now: number) {
    if (!this.hasRoute() || !this.lastPing) return;
    const dt = this.lastTick ? Math.min(0.25, (now - this.lastTick) / 1000) : 0.016;
    this.lastTick = now;

    const d = Math.min(this.stopAt, this.currentDist(now));
    const arrived = this.stopAt - d < 3;
    const pos = this.positionAt(d);

    // Look ~18 m ahead so the scooter starts turning slightly before the corner
    const ahead = this.positionAt(Math.min(this.total, d + 18));
    const targetBearing =
      haversine(pos, ahead) > 0.5
        ? bearingBetween(pos, ahead)
        : this.bearingReady
        ? this.bearing
        : 0;

    if (!this.bearingReady) {
      this.bearing = targetBearing;
      this.bearingReady = true;
    } else {
      const k = 1 - Math.exp(-dt / 0.18); // ~180 ms time constant
      this.bearing = (this.bearing + angleDiff(this.bearing, targetBearing) * k + 360) % 360;
    }

    const frame: Frame = {
      pos,
      bearing: this.bearing,
      fraction: arrived ? 1 : Math.min(1, (d + this.leadMeters) / Math.max(1, this.total)),
      remainingMeters: Math.max(0, this.stopAt - d),
      speedMps: Math.max(0, this.speed),
      arrived,
    };
    this.subs.forEach((cb) => cb(frame));
  }
}
