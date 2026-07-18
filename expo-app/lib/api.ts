/**
 * API client for the Blab Next.js backend.
 * All listing/search requests go through these functions.
 */

import { API_BASE_URL } from "./theme";
import type { Listing } from "@/store/listings";

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch listings within a viewport bounding box.
 *
 * Always returns Listing[] — the server uses H3 DISTINCT ON to return one
 * representative price pin per cell at low zoom, and all listings at street
 * level zoom. No cluster count objects are ever returned.
 *
 * Resolution ladder (server-side):
 *   zoom < 8   → returns [] (viewport too large)
 *   zoom 8-10  → one pin per res7 cell (~5 km²)
 *   zoom 11-13 → one pin per res9 cell (~0.1 km²)
 *   zoom ≥ 14  → all active listings in viewport, LIMIT 100
 */
export async function fetchViewportListings(
  bounds:      [number, number, number, number],
  listingType: "sale" | "rent",
  zoom:        number,
  signal?:     AbortSignal
): Promise<{ listings: Listing[]; total: number }> {
  const [swLng, swLat, neLng, neLat] = bounds;
  const zoomInt = Math.round(zoom);
  const url =
    `${API_BASE_URL}/api/listings/viewport` +
    `?sw_lng=${swLng}&sw_lat=${swLat}&ne_lng=${neLng}&ne_lat=${neLat}` +
    `&type=${listingType}&zoom=${zoomInt}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json(); // { listings: Listing[], total: number }
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
