/**
 * API client for the Blab Next.js backend.
 * All listing/search requests go through these functions.
 */

import { API_BASE_URL } from "./theme";
import type { Listing } from "@/store/listings";

// ── Viewport API response types (SCRUM-196) ──────────────────────────────────

/** One H3 hex cluster returned by the viewport API at low zoom levels. */
export type ClusterPoint = {
  h3index:   string;   // H3 resolution-7 cell ID (hex string)
  count:     number;   // total listing count in this cell
  min_price: number;   // cheapest listing price in this cell
  lat:       number;   // centroid latitude  (avg of listings in cell)
  lng:       number;   // centroid longitude (avg of listings in cell)
};

/** Union response shape from GET /api/listings/viewport */
export type ViewportResponse =
  | { type: "listings"; data: Listing[] }
  | { type: "clusters"; data: ClusterPoint[] };

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch listings within a viewport bounding box.
 *
 * The server branches on `zoom`:
 *   zoom < 12  → returns H3 hex aggregation clusters (low zoom, city view)
 *   zoom ≥ 12  → returns individual listing rows (high zoom, street view)
 */
export async function fetchViewportListings(
  bounds:      [number, number, number, number],
  listingType: "sale" | "rent",
  zoom:        number,
  signal?:     AbortSignal
): Promise<ViewportResponse> {
  const [swLng, swLat, neLng, neLat] = bounds;
  const zoomInt = Math.round(zoom);
  const url =
    `${API_BASE_URL}/api/listings/viewport` +
    `?sw_lng=${swLng}&sw_lat=${swLat}&ne_lng=${neLng}&ne_lat=${neLat}` +
    `&type=${listingType}&zoom=${zoomInt}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

/**
 * Fetch listings within a polygon boundary.
 * Always returns individual rows (zoom gating does not apply to polygon search).
 */
export async function fetchPolygonListings(
  payload: { coordinates?: number[][]; geometry?: any; listingType: string },
  signal?: AbortSignal
): Promise<Listing[]> {
  const url = `${API_BASE_URL}/api/listings/polygon`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

/**
 * Search places via Mappls API proxy.
 */
export async function searchPlaces(
  query: string,
  lat: string,
  lng: string
): Promise<Array<{
  name: string;
  address: string;
  lat: number;
  lng: number;
  eLoc: string;
  type: string;
}>> {
  const url = `${API_BASE_URL}/api/mappls/search?q=${encodeURIComponent(query)}&lat=${lat}&lng=${lng}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  return res.json();
}

/**
 * Send OTP via the Next.js backend.
 */
export async function sendOtp(phone: string): Promise<{ success: boolean; error?: string }> {
  const url = `${API_BASE_URL}/api/mobile-auth/send-otp`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone }),
  });
  return res.json();
}

/**
 * Verify OTP and get auth token.
 */
export async function verifyOtp(
  phone: string,
  code: string
): Promise<{ success: boolean; token?: string; user?: any; error?: string }> {
  const url = `${API_BASE_URL}/api/mobile-auth/verify-otp`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, code }),
  });
  return res.json();
}

/**
 * Complete onboarding profile.
 */
export async function completeOnboarding(
  token: string,
  data: { name: string; role: string; reraNumber?: string; companyName?: string; projectCount?: string }
): Promise<{ success: boolean; error?: string }> {
  const url = `${API_BASE_URL}/api/mobile-auth/onboarding`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });
  return res.json();
}
