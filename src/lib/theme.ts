/**
 * Blab — Centralized Theme Constants (Web / Next.js)
 *
 * CSS variables (--primary, --background, etc.) live in globals.css.
 * This file holds the JS-side mirrors needed for Mapbox GL paint props,
 * which cannot read CSS variables at runtime.
 *
 * To retheme: change a color in BOTH globals.css AND the matching slot below.
 */

// ── JS color tokens (light + dark) ──────────────────────────────────────────
// Web uses CSS variables for most UI colors (Tailwind picks them up).
// The entries here are the ones Mapbox GL paint props need explicitly.
export const COLORS = {
  light: {
    drawColor:   "#8B2500",         // polygon fill + stroke — matches --primary
    markerBg:    "#6B1A00",
    markerBgActive: "#C4501A",
    markerText:  "#FFFFFF",
  },
  dark: {
    drawColor:   "rgb(255, 253, 0)", // yellow — matches marker + card border in dark mode
    markerBg:    "rgb(255, 253, 0)",
    markerBgActive: "rgb(230, 228, 0)",
    markerText:  "rgb(0, 0, 0)",
  },
} as const;

// ── Convenience aliases (used by older imports) ──────────────────────────────
export const DRAW_COLOR      = COLORS.light.drawColor;
export const DRAW_COLOR_DARK = COLORS.dark.drawColor;

// ── Map styles per theme ─────────────────────────────────────────────────────
// Both are classic Mapbox styles — all layers directly accessible.
// Labels fixed in Studio to use `name` for major, `name_en` for subdivisions.
export const MAP_STYLES = {
  light: "mapbox://styles/mapbox/streets-v12",
  dark:  "mapbox://styles/purchases-moneymic/cmqbrfwec000701qw1lu90qvg",
} as const;
