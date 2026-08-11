#!/usr/bin/env node
/**
 * generate-light-style.js
 *
 * Fetches the Mapbox streets-v12 style and applies:
 *   1. Label spelling fix — settlement-major-label → ["get", "name"]
 *                           settlement-subdivision-label → ["get", "name_en"]
 *   2. Global color darkening — reduces lightness of EVERY color in EVERY layer
 *      by DARKEN_PERCENT. Handles hsl(), rgb(), and hex colors, including inside
 *      zoom/data expressions. Label/icon colors are excluded so text stays crisp.
 *
 * Tune DARKEN_PERCENT (0–30) to taste, regenerate, preview in Studio.
 *
 * Usage:
 *   node scripts/generate-light-style.js
 */

const fs = require("fs");
const path = require("path");

// ── ✏️  TUNE THIS ──────────────────────────────────────────────────────────────
// How many lightness % points to subtract from every background/fill/line color.
// 0  = no change (same as streets-v12)
// 8  = subtle dim (recommended starting point)
// 15 = noticeably darker
// 25 = quite dark
const DARKEN_PERCENT = 25;

// Paint property types that are "background/fill" colors we want to dim.
// Text/icon colors are explicitly excluded so labels stay readable.
const DIM_PROPS = new Set([
  "background-color",
  "fill-color",
  "fill-outline-color",
  "fill-extrusion-color",
  "line-color",
  "circle-color",
  "heatmap-color",
]);

// Layer types that render text/icons — we leave their colors alone.
const LABEL_TYPES = new Set(["symbol"]);
// ─────────────────────────────────────────────────────────────────────────────

// ── Load token from .env.local ───────────────────────────────────────────────
const envFile = path.join(__dirname, "../.env.local");
const envContent = fs.readFileSync(envFile, "utf8");
const tokenMatch = envContent.match(/NEXT_PUBLIC_MAPBOX_TOKEN=(.+)/);
if (!tokenMatch) {
  console.error("❌  NEXT_PUBLIC_MAPBOX_TOKEN not found in .env.local");
  process.exit(1);
}
const TOKEN = tokenMatch[1].trim();

// ── Label layer targets ──────────────────────────────────────────────────────
const MAJOR_LABEL_LAYERS = new Set([
  "settlement-major-label",
  "state-label",
  "country-label",
  "continent-label",
]);
const SUBDIVISION_LABEL_LAYERS = new Set([
  "settlement-minor-label",
  "settlement-subdivision-label",
]);

// ── Color utilities ──────────────────────────────────────────────────────────

/** Parse "hsl(H, S%, L%)" → {h, s, l} or null */
function parseHsl(str) {
  const m = str.match(/hsl\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*\)/i);
  if (!m) return null;
  return { h: +m[1], s: +m[2], l: +m[3] };
}

/** Parse "#RRGGBB" or "#RGB" → {r, g, b} 0-255, or null */
function parseHex(str) {
  const s = str.trim();
  if (s.length === 7 && s[0] === "#") {
    return {
      r: parseInt(s.slice(1, 3), 16),
      g: parseInt(s.slice(3, 5), 16),
      b: parseInt(s.slice(5, 7), 16),
    };
  }
  if (s.length === 4 && s[0] === "#") {
    return {
      r: parseInt(s[1] + s[1], 16),
      g: parseInt(s[2] + s[2], 16),
      b: parseInt(s[3] + s[3], 16),
    };
  }
  return null;
}

/** Parse "rgb(R, G, B)" → {r, g, b} 0-255, or null */
function parseRgb(str) {
  const m = str.match(/rgb\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/i);
  if (!m) return null;
  return { r: +m[1], g: +m[2], b: +m[3] };
}

/** Convert {r,g,b} 0-255 → {h,s,l} */
function rgbToHsl({ r, g, b }) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

/**
 * Darken any color string by reducing its HSL lightness.
 * Handles hsl(), rgb(), and hex. Returns the original string if unrecognised.
 */
function darkenColor(colorStr, pct) {
  if (typeof colorStr !== "string") return colorStr;
  const trimmed = colorStr.trim();

  // HSL — easiest, just subtract from L
  const hsl = parseHsl(trimmed);
  if (hsl) {
    const newL = Math.max(0, hsl.l - pct);
    return `hsl(${hsl.h}, ${hsl.s}%, ${newL}%)`;
  }

  // Hex or RGB — convert to HSL first
  const rgb = parseHex(trimmed) || parseRgb(trimmed);
  if (rgb) {
    const { h, s, l } = rgbToHsl(rgb);
    const newL = Math.max(0, l - pct);
    return `hsl(${h}, ${s}%, ${newL}%)`;
  }

  return colorStr; // pass through unchanged (e.g. "transparent", "none")
}

/**
 * Recursively walk a Mapbox GL expression (nested arrays/objects) and
 * darken any color string found at a leaf node.
 */
function darkenExpression(value, pct) {
  if (typeof value === "string") return darkenColor(value, pct);
  if (Array.isArray(value)) return value.map((v) => darkenExpression(v, pct));
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = darkenExpression(v, pct);
    return out;
  }
  return value;
}

// ── Patch a single layer ─────────────────────────────────────────────────────
function patchLayer(layer) {
  let result = layer;

  // 1. Label spelling fix (takes priority, skip color changes on label layers)
  if (MAJOR_LABEL_LAYERS.has(layer.id)) {
    return { ...layer, layout: { ...layer.layout, "text-field": ["get", "name"] } };
  }
  if (SUBDIVISION_LABEL_LAYERS.has(layer.id)) {
    return { ...layer, layout: { ...layer.layout, "text-field": ["get", "name_en"] } };
  }

  // 2. Global color dimming — skip symbol (text/icon) layers entirely
  if (DARKEN_PERCENT > 0 && !LABEL_TYPES.has(layer.type) && layer.paint) {
    const newPaint = { ...layer.paint };
    let changed = false;
    for (const prop of Object.keys(newPaint)) {
      if (!DIM_PROPS.has(prop)) continue;
      const original = newPaint[prop];
      const darkened = darkenExpression(original, DARKEN_PERCENT);
      if (JSON.stringify(darkened) !== JSON.stringify(original)) {
        newPaint[prop] = darkened;
        changed = true;
      }
    }
    if (changed) result = { ...result, paint: newPaint };
  }

  return result;
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const url = `https://api.mapbox.com/styles/v1/mapbox/streets-v12?access_token=${TOKEN}`;

  console.log(`⬇  Fetching mapbox://styles/mapbox/streets-v12 …`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  const style = await res.json();
  console.log(`   Got "${style.name}" — ${style.layers.length} layers`);
  console.log(`   Darken: ${DARKEN_PERCENT}% lightness reduction on all fill/line/bg colors`);

  let labelFixes = 0, colorLayers = 0;

  style.layers = style.layers.map((layer) => {
    const patched = patchLayer(layer);
    if (patched === layer) return patched;
    if (MAJOR_LABEL_LAYERS.has(layer.id) || SUBDIVISION_LABEL_LAYERS.has(layer.id)) {
      labelFixes++;
    } else {
      colorLayers++;
    }
    return patched;
  });

  style.name = `Blab Light (dim ${DARKEN_PERCENT}%)`;

  const outPath = path.join(__dirname, "blab-light.json");
  fs.writeFileSync(outPath, JSON.stringify(style, null, 2));
  const sizeKB = Math.round(fs.statSync(outPath).size / 1024);

  console.log("");
  console.log(`✅  Label layers fixed  : ${labelFixes}`);
  console.log(`✅  Color layers dimmed : ${colorLayers}`);
  console.log(`✅  Saved → scripts/blab-light.json (${sizeKB} KB)`);
  console.log("");
  console.log("── To adjust darkness ────────────────────────────────────────");
  console.log("   Edit DARKEN_PERCENT at the top of this file, re-run,");
  console.log("   preview blab-light.json in Studio, repeat until happy.");
  console.log("");
  console.log("── Upload steps ──────────────────────────────────────────────");
  console.log("1. console.mapbox.com/studio → New style → Upload → blab-light.json");
  console.log("2. Tweak any colors in Studio if needed, then Publish");
  console.log("3. Copy:  mapbox://styles/purchases-moneymic/<id>");
  console.log("4. Set MAP_STYLES.light to that URL in both theme.ts files");
  console.log("──────────────────────────────────────────────────────────────");
}

main().catch((err) => {
  console.error("❌ ", err.message);
  process.exit(1);
});
