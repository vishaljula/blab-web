/**
 * Blab — Centralized Theme Constants
 * Mirrors the web app's theme.ts + globals.css design tokens
 */
import { Platform } from "react-native";

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
    drawColor: "#8B2500",
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
    markerBg: "rgb(255, 253, 0)",
    markerBgActive: "rgb(230, 228, 0)",
    markerText: "rgb(0, 0, 0)",
    drawColor: "rgb(255, 253, 0)",
  },
} as const;

// ── Draw / overlay color ─────────────────────────────────────────
// Kept as a convenience alias for COLORS.light.drawColor.
// Mapbox paint props can't read CSS vars, so this is the JS fallback.
export const DRAW_COLOR = COLORS.light.drawColor;

// ── Map styles per theme ─────────────────────────────────────────
export const MAP_STYLES = {
  light: "mapbox://styles/mapbox/streets-v12",
  // Custom Navigation Night style with settlement-major-label text-field fixed
  // in Mapbox Studio to use `name` instead of `coalesce(name_en, name)`.
  // This bakes in correct Indian place spellings (Secunderabad, Tirumalagiri etc.)
  // at the style level, so no runtime patching is needed for dark mode labels.
  dark: "mapbox://styles/purchases-moneymic/cmqbrfwec000701qw1lu90qvg",
} as const;

// ── Lister type badge colors ─────────────────────────────────────
export const LISTER_COLORS = {
  owner: {
    light: { bg: "#ECFDF5", text: "#047857", border: "#A7F3D0" },
    dark: { bg: "#064E3B", text: "#6EE7B7", border: "#065F46" },
  },
  realtor: {
    light: { bg: "#EFF6FF", text: "#1D4ED8", border: "#BFDBFE" },
    dark: { bg: "#1E3A5F", text: "#93C5FD", border: "#1E40AF" },
  },
  developer: {
    light: { bg: "#FAF5FF", text: "#7C3AED", border: "#DDD6FE" },
    dark: { bg: "#3B0764", text: "#C4B5FD", border: "#5B21B6" },
  },
} as const;

/** Subscription tier badge colours for the realtor dashboard. */
export const TIER_COLORS = {
  free_trial: {
    bg: "#F1F5F9",
    text: "#475569",
    border: "#CBD5E1",
    label: "Trial",
  },
  soft_cap: {
    bg: "#FFFBEB",
    text: "#92400E",
    border: "#FDE68A",
    label: "Free",
  },
  pro: {
    bg: "#EFF6FF",
    text: "#1D4ED8",
    border: "#BFDBFE",
    label: "Pro",
  },
  pro_plus: {
    bg: "#FEF3C7",
    text: "#92400E",
    border: "#F59E0B",
    label: "Pro+",
  },
} as const;

// ── API base URL ─────────────────────────────────────────────────
// Web (browser on Mac): use localhost to avoid WiFi hairpin routing.
// Native (iPhone): use the LAN IP so the device can reach the Mac's server.
export const API_BASE_URL =
  Platform.OS === "web"
    ? (process.env.EXPO_PUBLIC_WEB_API_URL || "http://localhost:3000")
    : (process.env.EXPO_PUBLIC_API_URL    || "http://localhost:3000");
