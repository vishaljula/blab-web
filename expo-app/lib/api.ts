/**
 * API client for the Blab Next.js backend.
 * All listing/search requests go through these functions.
 */

import { API_BASE_URL } from "./theme";
import type { Listing } from "@/store/listings";

/**
 * Fetch listings within a viewport bounding box.
 */
export async function fetchViewportListings(
  bounds: [number, number, number, number],
  listingType: "sale" | "rent",
  signal?: AbortSignal
): Promise<Listing[]> {
  const [swLng, swLat, neLng, neLat] = bounds;
  const url = `${API_BASE_URL}/api/listings/viewport?sw_lng=${swLng}&sw_lat=${swLat}&ne_lng=${neLng}&ne_lat=${neLat}&type=${listingType}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

/**
 * Fetch listings within a polygon boundary.
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
  const url = `${API_BASE_URL}/api/auth/send-otp`;
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
  const url = `${API_BASE_URL}/api/auth/verify-otp`;
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
  const url = `${API_BASE_URL}/api/auth/onboarding`;
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
