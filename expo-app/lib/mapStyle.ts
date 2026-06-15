/**
 * mapStyle.ts — Fetch, patch, and cache Mapbox style JSON
 *
 * Problem: Mapbox's name_en field has wrong transliterations for Indian places
 * (e.g. "Sikandarabad" instead of "Secunderabad"). The correct spellings exist
 * in other fields depending on the label type:
 *
 *   settlement-major-label  → `name` field is correct
 *   settlement-subdivision-label, settlement-minor-label → `name_en` is correct
 *
 * This module fetches the raw style JSON from the Mapbox API, patches the
 * text-field expressions for the affected layers, and returns the result as
 * a JSON string that can be passed to Mapbox.MapView's `styleJSON` prop.
 *
 * The patched style is cached in memory (keyed by style URL) so subsequent
 * calls (e.g. dark↔light mode switches) return instantly.
 *
 * Verified against live tile data at Secunderabad + Kachiguda, June 2026.
 */

/** Layer IDs where the `name` field holds the correct English spelling */
const MAJOR_LABEL_LAYERS = new Set([
  "settlement-major-label",
  "state-label",
  "country-label",
  "continent-label",
]);

/** Layer IDs where the `name_en` field holds the correct English spelling */
const SUBDIVISION_LABEL_LAYERS = new Set([
  "settlement-minor-label",
  "settlement-subdivision-label",
]);

// Module-level cache: mapboxStyleUrl → patched JSON string
const _cache: Record<string, string> = {};

/**
 * Converts a mapbox:// style URL to its HTTP equivalent.
 * e.g. mapbox://styles/mapbox/streets-v12 → https://api.mapbox.com/styles/v1/mapbox/streets-v12
 */
function toHttpUrl(mapboxUrl: string, accessToken: string): string {
  return (
    mapboxUrl.replace("mapbox://styles/", "https://api.mapbox.com/styles/v1/") +
    `?access_token=${accessToken}`
  );
}

/**
 * Patches a single layer's text-field layout property based on its ID.
 * Returns the layer unchanged if it's not a label layer we're targeting.
 */
function patchLayer(layer: any): any {
  if (!layer?.id || !layer?.layout?.["text-field"]) return layer;

  if (MAJOR_LABEL_LAYERS.has(layer.id)) {
    return {
      ...layer,
      layout: { ...layer.layout, "text-field": ["get", "name"] },
    };
  }

  if (SUBDIVISION_LABEL_LAYERS.has(layer.id)) {
    return {
      ...layer,
      layout: { ...layer.layout, "text-field": ["get", "name_en"] },
    };
  }

  return layer;
}

/**
 * Fetches the Mapbox style JSON for `mapboxStyleUrl`, applies label spelling
 * fixes, and returns the patched JSON string. Results are cached by URL.
 *
 * Returns `null` on network failure — callers should fall back to styleURL.
 */
export async function fetchPatchedStyle(
  mapboxStyleUrl: string,
  accessToken: string
): Promise<string | null> {
  // Return from cache if available
  if (_cache[mapboxStyleUrl]) {
    return _cache[mapboxStyleUrl];
  }

  try {
    const httpUrl = toHttpUrl(mapboxStyleUrl, accessToken);
    const res = await fetch(httpUrl);
    if (!res.ok) {
      console.warn(`[mapStyle] Fetch failed (${res.status}) for ${mapboxStyleUrl}`);
      return null;
    }

    const style = await res.json();

    if (Array.isArray(style.layers)) {
      style.layers = style.layers.map(patchLayer);
    }

    const patched = JSON.stringify(style);
    _cache[mapboxStyleUrl] = patched;
    return patched;
  } catch (err) {
    console.warn("[mapStyle] Failed to fetch/patch style, will fall back to URL:", err);
    return null;
  }
}

/** Clear the cache (useful for testing or token rotation) */
export function clearStyleCache(): void {
  Object.keys(_cache).forEach((k) => delete _cache[k]);
}
