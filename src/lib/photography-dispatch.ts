import crypto from "crypto";
import { getShutterbugLocation } from "@/lib/location-store";

export interface TimeWindowConfig {
  id: string;
  label: string;
  startHour: number;
  startMin: number;
  endHour: number;
  endMin: number;
}

export interface DurationProfile {
  onsiteMinutes: number;
  exteriorMinutes: number;
  setupMinutes: number;
}

export interface ShiftRow {
  id: string;
  shutterbug_id: string;
  display_name: string;
  shift_date: string;
  starts_at: string | Date;
  ends_at: string | Date;
  start_lat: number;
  start_lng: number;
  end_lat: number;
  end_lng: number;
  route_version: number;
  reliability_score: number;
}

export interface AllocationNeighbor {
  id: string;
  shift_id: string;
  shutterbug_id: string;
  status: string;
  onsite_start: string | Date;
  onsite_end: string | Date;
  actual_finished_at: string | Date | null;
  lat: number;
  lng: number;
}

export interface CandidateInsertion {
  shift: ShiftRow;
  candStart: Date;
  candEnd: Date;
  prevAlloc: AllocationNeighbor | null;
  nextAlloc: AllocationNeighbor | null;
  travelFromPrevMins: number;
  travelToNextMins: number;
  addedTravelMins: number;
}

// ── Cryptographic Helpers ────────────────────────────────────────────────────

export function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export function generateTrackingToken(): { token: string; tokenHash: string } {
  const token = crypto.randomBytes(32).toString("hex");
  return { token, tokenHash: sha256Hex(token) };
}

export function generateArrivalOtp(): { otp: string; otpHash: string } {
  const otp = String(crypto.randomInt(100000, 999999));
  return { otp, otpHash: sha256Hex(otp) };
}

// ── Geodesic & Solar Daylight Math ───────────────────────────────────────────

const R_EARTH_M = 6371008.8;
const toRad = (d: number) => (d * Math.PI) / 180;

export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R_EARTH_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Conservative urban scooter travel estimate (minutes) used for fast candidate
 * shortlisting across multi-day calendars before calling Mapbox Directions on the winner.
 * Uses 1.40x road-winding factor over straight-line distance at 24 km/h + 5m buffer.
 */
export function estimateConservativeTravelMins(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const distKm = (haversineMeters(lat1, lng1, lat2, lng2) / 1000) * 1.4;
  return Math.max(5, Math.ceil((distKm / 24) * 60) + 5);
}

/**
 * Queries Mapbox Directions API for real road driving duration (minutes) with a
 * safety buffer, falling back to the conservative geodesic estimate if unreachable.
 */
export async function fetchMapboxDriveMinutes(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number
): Promise<number> {
  const heuristic = estimateConservativeTravelMins(fromLat, fromLng, toLat, toLng);
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || process.env.EXPO_PUBLIC_MAPBOX_TOKEN;
  if (!token) return heuristic;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2200);
    const url = `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${fromLng},${fromLat};${toLng},${toLat}?overview=false&access_token=${token}`;
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return heuristic;
    const data = await res.json();
    const durSec = data?.routes?.[0]?.duration;
    if (typeof durSec !== "number" || durSec <= 0) return heuristic;
    // Add 5-minute parking/helmet buffer and never trust an impossibly low estimate
    const roadMins = Math.ceil(durSec / 60) + 5;
    return Math.max(roadMins, Math.floor(heuristic * 0.75));
  } catch {
    return heuristic;
  }
}

/**
 * Computes the exterior daylight cutoff timestamp (UTC Date) for a given YYYY-MM-DD
 * in India (Asia/Kolkata, UTC+05:30) and coordinates.
 * Exterior photos must finish at least 15 minutes before local sunset.
 */
export function getDaylightCutoffUtc(dateIso: string, lat = 17.385, lng = 78.4867): Date {
  const [y, m, d] = dateIso.split("-").map(Number);
  const startOfYear = Date.UTC(y, 0, 0);
  const targetUtc = Date.UTC(y, m - 1, d);
  const dayOfYear = Math.floor((targetUtc - startOfYear) / 86_400_000);

  // Solar declination (radians)
  const decl = toRad(23.44) * Math.sin(((2 * Math.PI) / 365) * (dayOfYear - 81));
  const latRad = toRad(lat);
  const cosH = Math.max(-0.99, Math.min(0.99, -Math.tan(latRad) * Math.tan(decl)));
  const hourAngleDeg = (Math.acos(cosH) * 180) / Math.PI;

  // Solar noon in UTC hours (longitude 78.4867E => ~5.23h ahead of Greenwich)
  const solarNoonUtcHours = 12 - lng / 15;
  const sunsetUtcHours = solarNoonUtcHours + hourAngleDeg / 15;
  // Exterior cutoff = 15 minutes before sunset
  const cutoffUtcMs = Date.UTC(y, m - 1, d) + (sunsetUtcHours * 60 - 15) * 60_000;
  return new Date(cutoffUtcMs);
}

/**
 * Converts a local IST (UTC+05:30) date + hour/minute into a UTC Date.
 */
export function istToUtcDate(dateIso: string, hour: number, min = 0): Date {
  const [y, m, d] = dateIso.split("-").map(Number);
  // IST is UTC + 5h 30m
  const utcMs = Date.UTC(y, m - 1, d, hour, min, 0) - (5 * 60 + 30) * 60_000;
  return new Date(utcMs);
}

// ── Property Type Duration Model ─────────────────────────────────────────────

export function getDurationProfile(
  propertyType?: string | null,
  unitCount = 1
): DurationProfile {
  const units = Math.max(1, Math.min(10, Number(unitCount) || 1));
  const pt = (propertyType ?? "apartment").toLowerCase();

  let perUnitShoot = 40;
  let exteriorMinutes = 15;
  const setupMinutes = 10;

  if (pt === "plot" || pt === "warehouse" || pt === "pg") {
    perUnitShoot = 20;
    exteriorMinutes = 15;
  } else if (pt === "villa") {
    perUnitShoot = 80;
    exteriorMinutes = 25;
  }

  const onsiteMinutes =
    setupMinutes + units * perUnitShoot + Math.max(0, units - 1) * 5;

  return { onsiteMinutes, exteriorMinutes, setupMinutes };
}

// ── Shift Auto-Seeding ───────────────────────────────────────────────────────

/**
 * Ensures all enabled shutterbug_profiles have committed shifts (08:30–18:30 IST)
 * for each date in `dates` so the rolling booking window is always staffed.
 */
export async function ensureDailyShifts(sql: any, dates: string[]): Promise<void> {
  if (!dates.length) return;
  await sql`
    INSERT INTO shutterbug_shifts (
      shutterbug_id, zone_code, shift_date, starts_at, ends_at, start_point, end_point
    )
    SELECT
      sp.user_id,
      'HYD_METRO',
      d.shift_date,
      ((d.shift_date || 'T08:30:00+05:30')::timestamptz),
      ((d.shift_date || 'T18:30:00+05:30')::timestamptz),
      ST_SetSRID(ST_MakePoint(sp.home_lng, sp.home_lat), 4326)::geography,
      ST_SetSRID(ST_MakePoint(sp.home_lng, sp.home_lat), 4326)::geography
    FROM shutterbug_profiles sp
    CROSS JOIN unnest(${dates}::text[]) AS d(shift_date)
    WHERE sp.enabled = true AND sp.dispatch_enabled = true
    ON CONFLICT (shutterbug_id, shift_date) WHERE status = 'committed' DO NOTHING
  `;
}

// ── Candidate Insertion Engine ───────────────────────────────────────────────

/**
 * Finds the best feasible 15-minute-grid insertion on `shift` inside `[windowStart, windowEnd]`
 * using `travelFn` (fast geodesic estimate for calendar matrix, or Mapbox road ETA for commit).
 */
export function findBestInsertionForShift(
  shift: ShiftRow,
  shiftAllocations: AllocationNeighbor[],
  windowStart: Date,
  windowEnd: Date,
  propLat: number,
  propLng: number,
  duration: DurationProfile,
  daylightCutoff: Date
): CandidateInsertion | null {
  const shiftStartMs = new Date(shift.starts_at).getTime();
  const shiftEndMs = new Date(shift.ends_at).getTime();
  const winStartMs = windowStart.getTime();
  const winEndMs = windowEnd.getTime();
  const onsiteMs = duration.onsiteMinutes * 60_000;
  const extCheckMs = (duration.setupMinutes + duration.exteriorMinutes) * 60_000;
  const daylightMs = daylightCutoff.getTime();

  // Sort active allocations by effective start
  const sorted = [...shiftAllocations].sort(
    (a, b) => new Date(a.onsite_start).getTime() - new Date(b.onsite_start).getTime()
  );

  let best: CandidateInsertion | null = null;
  const STEP_MS = 15 * 60_000;

  // Candidate arrival must start inside [windowStart, windowEnd]
  for (let candStartMs = winStartMs; candStartMs <= winEndMs; candStartMs += STEP_MS) {
    const candEndMs = candStartMs + onsiteMs;

    // 1. Daylight cutoff check for exterior photos
    if (duration.exteriorMinutes > 0 && candStartMs + extCheckMs > daylightMs) {
      continue;
    }

    // 2. Direct overlap check against all allocations on this shift
    let overlaps = false;
    for (const a of sorted) {
      const aStart = new Date(a.onsite_start).getTime();
      const aEnd = new Date(a.actual_finished_at ?? a.onsite_end).getTime();
      if (candStartMs < aEnd && candEndMs > aStart) {
        overlaps = true;
        break;
      }
    }
    if (overlaps) continue;

    // 3. Identify immediate preceding and following allocations
    let prevAlloc: AllocationNeighbor | null = null;
    let nextAlloc: AllocationNeighbor | null = null;

    for (const a of sorted) {
      const aEnd = new Date(a.actual_finished_at ?? a.onsite_end).getTime();
      const aStart = new Date(a.onsite_start).getTime();
      if (aEnd <= candStartMs) {
        prevAlloc = a;
      } else if (aStart >= candEndMs && !nextAlloc) {
        nextAlloc = a;
      }
    }

    const prevLat = prevAlloc ? prevAlloc.lat : shift.start_lat;
    const prevLng = prevAlloc ? prevAlloc.lng : shift.start_lng;
    const nextLat = nextAlloc ? nextAlloc.lat : shift.end_lat;
    const nextLng = nextAlloc ? nextAlloc.lng : shift.end_lng;

    const travelFromPrevMins = estimateConservativeTravelMins(prevLat, prevLng, propLat, propLng);
    const travelToNextMins = estimateConservativeTravelMins(propLat, propLng, nextLat, nextLng);

    // 4. Shift boundary check
    if (candStartMs - travelFromPrevMins * 60_000 < shiftStartMs) continue;
    if (candEndMs + travelToNextMins * 60_000 > shiftEndMs) continue;

    // 5. Neighbor travel inequalities
    if (prevAlloc) {
      const prevEndMs = new Date(prevAlloc.actual_finished_at ?? prevAlloc.onsite_end).getTime();
      if (prevEndMs + travelFromPrevMins * 60_000 > candStartMs) continue;
    }
    if (nextAlloc) {
      const nextStartMs = new Date(nextAlloc.onsite_start).getTime();
      if (candEndMs + travelToNextMins * 60_000 > nextStartMs) continue;
    }

    const addedTravelMins = travelFromPrevMins + travelToNextMins;
    if (!best || addedTravelMins < best.addedTravelMins) {
      best = {
        shift,
        candStart: new Date(candStartMs),
        candEnd: new Date(candEndMs),
        prevAlloc,
        nextAlloc,
        travelFromPrevMins,
        travelToNextMins,
        addedTravelMins,
      };
    }
  }

  return best;
}

/**
 * Fetches all committed shifts and active/finished allocations for `dates`.
 */
export async function loadShiftsAndAllocations(
  sql: any,
  dates: string[]
): Promise<{ shifts: ShiftRow[]; allocationsByShift: Map<string, AllocationNeighbor[]> }> {
  await ensureDailyShifts(sql, dates);

  // Expire any stale 'offered' allocations first
  await sql`
    UPDATE photography_allocations
       SET status = 'expired'
     WHERE status = 'offered'
       AND expires_at <= clock_timestamp()
  `;

  const shifts: ShiftRow[] = await sql`
    SELECT
      s.id,
      s.shutterbug_id,
      sp.display_name,
      s.shift_date,
      s.starts_at,
      s.ends_at,
      ST_Y(s.start_point::geometry) AS start_lat,
      ST_X(s.start_point::geometry) AS start_lng,
      ST_Y(s.end_point::geometry) AS end_lat,
      ST_X(s.end_point::geometry) AS end_lng,
      s.route_version,
      sp.reliability_score::float AS reliability_score
    FROM shutterbug_shifts s
    JOIN shutterbug_profiles sp ON sp.user_id = s.shutterbug_id
    WHERE s.shift_date = ANY(${dates}::text[])
      AND s.status = 'committed'
      AND sp.enabled = true
      AND sp.dispatch_enabled = true
  `;

  const shiftIds = shifts.map((s) => s.id);
  const allocationsByShift = new Map<string, AllocationNeighbor[]>();
  if (shiftIds.length === 0) return { shifts, allocationsByShift };

  const allocs: AllocationNeighbor[] = await sql`
    SELECT
      a.id,
      a.shift_id,
      a.shutterbug_id,
      a.status,
      a.onsite_start,
      a.onsite_end,
      a.actual_finished_at,
      ST_Y(a.point::geometry) AS lat,
      ST_X(a.point::geometry) AS lng
    FROM photography_allocations a
    WHERE a.shift_id = ANY(${shiftIds}::uuid[])
      AND a.status IN ('offered', 'committed', 'finished')
    ORDER BY a.onsite_start ASC
  `;

  for (const a of allocs) {
    const list = allocationsByShift.get(a.shift_id) ?? [];
    list.push(a);
    allocationsByShift.set(a.shift_id, list);
  }

  return { shifts, allocationsByShift };
}

/**
 * Checks if any online Shutterbug is eligible for an Opportunistic Express visit
 * (starts within 25-35 mins, fresh Redis location or nearby base within 8 km,
 * and fits before their next scheduled allocation).
 */
export async function checkExpressEligibility(
  shiftsToday: ShiftRow[],
  allocationsByShift: Map<string, AllocationNeighbor[]>,
  propLat: number,
  propLng: number,
  duration: DurationProfile,
  daylightCutoff: Date
): Promise<{ available: boolean; etaMinutes: number | null; candidateCount: number }> {
  const now = new Date();
  const expressWinStart = new Date(Math.ceil((now.getTime() + 20 * 60_000) / (15 * 60_000)) * (15 * 60_000));
  const expressWinEnd = new Date(expressWinStart.getTime() + 30 * 60_000);

  let bestEta: number | null = null;
  let candidateCount = 0;

  for (const shift of shiftsToday) {
    const liveLoc = await getShutterbugLocation(shift.shutterbug_id);
    // Use fresh Redis GPS if < 90s old; otherwise check if shift start / last finished visit is nearby
    const refLat = liveLoc && Date.now() - liveLoc.ts < 90_000 ? liveLoc.lat : shift.start_lat;
    const refLng = liveLoc && Date.now() - liveLoc.ts < 90_000 ? liveLoc.lng : shift.start_lng;
    const distM = haversineMeters(refLat, refLng, propLat, propLng);
    // Express requires worker within ~8 km
    if (distM > 8_500) continue;

    const allocs = allocationsByShift.get(shift.id) ?? [];
    const ins = findBestInsertionForShift(
      shift,
      allocs,
      expressWinStart,
      expressWinEnd,
      propLat,
      propLng,
      duration,
      daylightCutoff
    );
    if (ins) {
      candidateCount += 1;
      const eta = Math.max(15, Math.min(35, ins.travelFromPrevMins));
      if (bestEta === null || eta < bestEta) bestEta = eta;
    }
  }

  return {
    available: candidateCount > 0,
    etaMinutes: bestEta,
    candidateCount,
  };
}

export async function buildAvailabilityResponse(
  sql: any,
  params: {
    lat: number;
    lng: number;
    daysParam?: number;
    propertyType?: string | null;
    unitCount?: number;
  }
) {
  const { lat, lng, daysParam = 10, propertyType = "apartment", unitCount = 1 } = params;

  const [cfg] = await sql`
    SELECT zone_center_lat, zone_center_lng, zone_radius_km,
           time_windows, min_lead_time_hours, booking_window_days,
           COALESCE(launch_promo_active, true) AS launch_promo_active,
           COALESCE(launch_promo_label, 'Launch Offer · 100% Free') AS launch_promo_label,
           COALESCE(shoot_base_price_inr, 999) AS shoot_base_price_inr,
           COALESCE(express_surcharge_inr, 500) AS express_surcharge_inr
    FROM service_config WHERE id = 'default'
  `;
  if (!cfg) {
    throw new Error("Service config not found");
  }

  const radiusM = cfg.zone_radius_km * 1000;
  const bookingDays = Math.min(daysParam, cfg.booking_window_days);

  const [zoneCheck] = await sql`
    SELECT ST_DWithin(
      ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
      ST_SetSRID(ST_MakePoint(${cfg.zone_center_lng}, ${cfg.zone_center_lat}), 4326)::geography,
      ${radiusM}
    ) AS in_zone,
    h3_lat_lng_to_cell(point(${lat}, ${lng}), 7)::text AS h3_cell
  `;

  const inZone: boolean = zoneCheck.in_zone;
  const propertyH3Cell: string = zoneCheck.h3_cell;

  if (!inZone) {
    const [waitCount] = await sql`
      SELECT COUNT(*)::int AS count FROM photography_waitlist
      WHERE property_h3_cell = ${propertyH3Cell} AND status = 'waiting'
    `;
    return {
      success: true,
      inServiceZone: false,
      propertyH3Cell,
      waitlistQueuePosition: (waitCount?.count ?? 0) + 1,
      zoneCenter: { lat: cfg.zone_center_lat, lng: cfg.zone_center_lng },
      zoneRadiusKm: cfg.zone_radius_km,
    };
  }

  const windows: TimeWindowConfig[] = cfg.time_windows as any;
  const duration = getDurationProfile(propertyType, unitCount);

  const now = new Date();
  const minLeadMs = cfg.min_lead_time_hours * 60 * 60 * 1000;

  // Generate IST dates (UTC + 5h30m) for the next bookingDays days
  const dates: string[] = [];
  const istNowMs = now.getTime() + (5 * 60 + 30) * 60_000;
  for (let i = 0; i < bookingDays; i++) {
    const d = new Date(istNowMs + i * 86_400_000);
    dates.push(d.toISOString().slice(0, 10));
  }

  const { shifts, allocationsByShift } = await loadShiftsAndAllocations(sql, dates);
  const shiftsByDate = new Map<string, ShiftRow[]>();
  for (const s of shifts) {
    const arr = shiftsByDate.get(s.shift_date) ?? [];
    arr.push(s);
    shiftsByDate.set(s.shift_date, arr);
  }

  const availability = dates.map((date) => {
    const dayShifts = shiftsByDate.get(date) ?? [];
    const daylightCutoff = getDaylightCutoffUtc(date, lat, lng);

    const windowsForDate = windows.map((w) => {
      const winStart = istToUtcDate(date, w.startHour, w.startMin);
      const winEnd = istToUtcDate(date, w.endHour, w.endMin);
      const tooSoon = winEnd.getTime() - now.getTime() < minLeadMs;

      // Effective earliest start inside the window is max(winStart, now + minLeadMs rounded to 15m)
      const earliestMs = Math.max(
        winStart.getTime(),
        Math.ceil((now.getTime() + minLeadMs) / (15 * 60_000)) * (15 * 60_000)
      );

      let spotsLeft = 0;
      if (!tooSoon && earliestMs <= winEnd.getTime()) {
        for (const shift of dayShifts) {
          const allocs = allocationsByShift.get(shift.id) ?? [];
          const feasible = findBestInsertionForShift(
            shift,
            allocs,
            new Date(earliestMs),
            winEnd,
            lat,
            lng,
            duration,
            daylightCutoff
          );
          if (feasible) spotsLeft += 1;
        }
      }

      return {
        id: w.id,
        label: w.label,
        startHour: w.startHour,
        startMin: w.startMin,
        endHour: w.endHour,
        endMin: w.endMin,
        available: !tooSoon && spotsLeft > 0,
        spotsLeft,
        tooSoon,
      };
    });

    const hasAnySlot = windowsForDate.some((w) => w.available);
    return { date, hasAnySlot, windows: windowsForDate };
  });

  // Check Opportunistic Express on today's shifts
  const todayIso = dates[0];
  const todayShifts = shiftsByDate.get(todayIso) ?? [];
  const expressSlot = await checkExpressEligibility(
    todayShifts,
    allocationsByShift,
    lat,
    lng,
    duration,
    getDaylightCutoffUtc(todayIso, lat, lng)
  );

  const basePriceInr = Number(cfg.shoot_base_price_inr ?? 999);
  const promoActive = Boolean(cfg.launch_promo_active);
  const pricingQuote = {
    basePriceInr,
    expressSurchargeInr: Number(cfg.express_surcharge_inr ?? 500),
    discountInr: promoActive ? basePriceInr : 0,
    payableInr: promoActive ? 0 : basePriceInr,
    promoActive,
    promoLabel: String(cfg.launch_promo_label ?? "Launch Offer · 100% Free"),
  };

  return {
    success: true,
    inServiceZone: true,
    propertyH3Cell,
    capacity: todayShifts.length,
    durationProfile: duration,
    pricingQuote,
    expressSlot,
    availability,
    zoneCenter: { lat: cfg.zone_center_lat, lng: cfg.zone_center_lng },
    zoneRadiusKm: cfg.zone_radius_km,
  };
}

