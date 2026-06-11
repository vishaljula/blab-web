/**
 * Blab — Centralized Theme Constants
 * Mirrors the web app's theme.ts + globals.css design tokens
 */

// ── Brand colors ─────────────────────────────────────────────────
export const COLORS = {
  light: {
    background: "#FAFAF8",
    foreground: "#1A1A1A",
    card: "#FFFFFF",
    cardForeground: "#1A1A1A",
    primary: "#8B2500",
    primaryForeground: "#FFFFFF",
    secondary: "#F0EEEA",
    secondaryForeground: "#1A1A1A",
    muted: "#F5F3EF",
    mutedForeground: "#6B6B6B",
    border: "#E8E6E1",
    destructive: "#9B1B30",
    markerBg: "#6B1A00",
    markerBgActive: "#C4501A",
    markerText: "#FFFFFF",
  },
  dark: {
    background: "#0F0F0F",
    foreground: "#F5F5F3",
    card: "#1A1A1A",
    cardForeground: "#F5F5F3",
    primary: "#C4501A",
    primaryForeground: "#FFFFFF",
    secondary: "#242424",
    secondaryForeground: "#F5F5F3",
    muted: "#242424",
    mutedForeground: "#A0A0A0",
    border: "#2A2A2A",
    destructive: "#C41B30",
    markerBg: "#8B2500",
    markerBgActive: "#C4501A",
    markerText: "#FFFFFF",
  },
} as const;

// ── Draw / overlay color ─────────────────────────────────────────
export const DRAW_COLOR = "#8B2500";

// ── Map styles per theme ─────────────────────────────────────────
export const MAP_STYLES = {
  light: "mapbox://styles/mapbox/streets-v12",
  dark: "mapbox://styles/mapbox/standard",
} as const;

// ── Standard (dark) style config overrides ────────────────────────
// Applied via <Mapbox.StyleImport> on native (mirrors web app's setConfigProperty calls).
// Sync with src/lib/theme.ts → DARK_MAP_CONFIG when changing.
export const DARK_MAP_CONFIG = {
  lightPreset: "dusk",
  colorMotorways: "#fff04a",
  colorTrunks: "#fff04a",
} as const;

// ── Lister type badge colors ─────────────────────────────────────
export const LISTER_COLORS = {
  owner: {
    light: { bg: "#ECFDF5", text: "#047857", border: "#A7F3D0" },
    dark: { bg: "#064E3B", text: "#6EE7B7", border: "#065F46" },
  },
  broker: {
    light: { bg: "#EFF6FF", text: "#1D4ED8", border: "#BFDBFE" },
    dark: { bg: "#1E3A5F", text: "#93C5FD", border: "#1E40AF" },
  },
  developer: {
    light: { bg: "#FAF5FF", text: "#7C3AED", border: "#DDD6FE" },
    dark: { bg: "#3B0764", text: "#C4B5FD", border: "#5B21B6" },
  },
} as const;

// ── API base URL ─────────────────────────────────────────────────
// In development, point to the Next.js backend running locally.
// In production, this will be the deployed Vercel URL.
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000";
