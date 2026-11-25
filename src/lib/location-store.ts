/**
 * Live shutterbug location store.
 *
 * Primary: Upstash Redis (key location:{bookingId}).
 * Dev-only fallback: in-process memory, used when Redis is unavailable
 * (e.g. Upstash rate-limited / not configured) so the tracking simulation
 * keeps working locally. Never used in production.
 */
import { redis } from "@/lib/redis";

export interface LiveLocation {
  lat: number;
  lng: number;
  heading: number;
  speed: number;
  ts: number;
}

const g = globalThis as unknown as {
  __devLocations?: Map<string, LiveLocation>;
  __devRoutes?: Map<string, [number, number][]>;
};
const mem = (g.__devLocations ??= new Map<string, LiveLocation>());
const routeMem = (g.__devRoutes ??= new Map<string, [number, number][]>());
const isDev = process.env.NODE_ENV !== "production";

export async function setBookingRoute(bookingId: string, route: [number, number][]) {
  if (redis) {
    try {
      await redis.set(`route:${bookingId}`, JSON.stringify(route), { ex: 3600 });
      if (!isDev) return;
    } catch {
      // ignore in dev
    }
  }
  if (isDev) routeMem.set(bookingId, route);
}

export async function getBookingRoute(bookingId: string): Promise<[number, number][] | null> {
  if (redis) {
    try {
      const raw = await redis.get<string | [number, number][]>(`route:${bookingId}`);
      if (raw) return typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch {
      if (!isDev) return null;
    }
  }
  return isDev ? routeMem.get(bookingId) ?? null : null;
}

export async function setLocation(bookingId: string, loc: LiveLocation) {
  if (redis) {
    try {
      await redis.set(`location:${bookingId}`, JSON.stringify(loc), { ex: 3600 });
      if (!isDev) return;
    } catch (e) {
      if (!isDev) throw e;
      console.warn("[location-store] Redis write failed, using dev memory fallback");
    }
  }
  if (isDev) mem.set(bookingId, loc);
}

export async function getLocation(bookingId: string): Promise<LiveLocation | null> {
  if (redis) {
    try {
      const raw = await redis.get<string | LiveLocation>(`location:${bookingId}`);
      if (raw) return typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch {
      if (!isDev) return null;
    }
  }
  return isDev ? mem.get(bookingId) ?? null : null;
}

export async function setShutterbugLocation(shutterbugId: string, loc: LiveLocation) {
  if (redis) {
    try {
      await redis.set(`shutterbug:loc:${shutterbugId}`, JSON.stringify(loc), { ex: 3600 });
      if (!isDev) return;
    } catch {
      // ignore in dev
    }
  }
  if (isDev) mem.set(`sb:${shutterbugId}`, loc);
}

export async function getShutterbugLocation(shutterbugId: string): Promise<LiveLocation | null> {
  if (redis) {
    try {
      const raw = await redis.get<string | LiveLocation>(`shutterbug:loc:${shutterbugId}`);
      if (raw) return typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch {
      if (!isDev) return null;
    }
  }
  return isDev ? mem.get(`sb:${shutterbugId}`) ?? null : null;
}


