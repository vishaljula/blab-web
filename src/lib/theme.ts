/**
 * Blab — Centralized Theme Constants
 *
 * All JS-side theme values live here. CSS variables live in globals.css.
 * To retheme the app, edit:
 *   1. globals.css  → CSS tokens (--primary, --background, etc.)
 *   2. This file    → Mapbox map styles, draw color, highway colors
 */

// ── Draw / overlay color ─────────────────────────────────────────────
// Must match --primary in globals.css.
// Mapbox GL paint props can't read CSS variables, so this is the JS mirror.
export const DRAW_COLOR = "#8B2500";

// ── Map styles per theme ─────────────────────────────────────────────
export const MAP_STYLES = {
  light: "mapbox://styles/mapbox/streets-v12",
  dark: "mapbox://styles/mapbox/standard",
} as const;

// ── Standard (dark) config overrides ─────────────────────────────────
// Applied imperatively via setConfigProperty after the style loads.
export const DARK_MAP_CONFIG = {
  lightPreset: "dusk",
  colorMotorways: "hsl(60, 100%, 50%)",
  colorTrunks: "hsl(60, 100%, 50%)",
} as const;
