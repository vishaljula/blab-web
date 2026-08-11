#!/usr/bin/env node
/**
 * generate-dark-style.js
 *
 * Generates a Zillow-inspired dark real estate map style from Mapbox streets-v12.
 *
 * Design goals (matching Zillow's dark map aesthetic):
 *   • Warm charcoal-navy base — not cold black, not harsh
 *   • Water clearly distinguishable in dark teal-blue
 *   • Road hierarchy visible but receding (map is a backdrop, not the star)
 *   • Parks/green in deep emerald — adds depth without brightness
 *   • Labels in warm muted gray — comfortable to read, not glaring white
 *   • Motorways have a subtle warm amber tint (matches Zillow exactly)
 *
 * Also bakes in Indian place-name label fix:
 *   settlement-major-label → ["get", "name"]       (Secunderabad ✓)
 *   settlement-subdivision-label → ["get", "name_en"]  (Kachiguda ✓)
 *
 * Usage:
 *   node scripts/generate-dark-style.js
 *   Then upload blab-dark.json to Mapbox Studio
 */

const fs   = require("fs");
const path = require("path");

// ── Token ────────────────────────────────────────────────────────────────────
const envFile    = path.join(__dirname, "../.env.local");
const envContent = fs.readFileSync(envFile, "utf8");
const tokenMatch = envContent.match(/NEXT_PUBLIC_MAPBOX_TOKEN=(.+)/);
if (!tokenMatch) { console.error("❌  NEXT_PUBLIC_MAPBOX_TOKEN not found"); process.exit(1); }
const TOKEN = tokenMatch[1].trim();

// ── Zillow-inspired palette ──────────────────────────────────────────────────
//
// Built by sampling Zillow's dark map and tuning for Indian city density.
// HSL values chosen so each element reads as part of the same color family
// (cool navy-slate with one warm accent: motorways).
//
const P = {
  // ── Land / base ──────────────────────────────────────────────────────────
  bg:              "hsl(224, 22%, 11%)",  // #191d2b  darkest — base canvas
  land:            "hsl(222, 18%, 13%)",  //          land areas over base
  urban:           "hsl(220, 16%, 15%)",  //          urban residential
  buildingFill:    "hsl(220, 18%, 16%)",  //          buildings
  structure:       "hsl(220, 18%, 13%)",  //          bridges / overpasses

  // ── Green ─────────────────────────────────────────────────────────────────
  park:            "hsl(148, 20%, 11%)",  //          parks / forests
  scrub:           "hsl(132, 14%, 11%)",  //          grass / scrub
  sportGround:     "hsl(148, 16%, 13%)",  //          pitches / tracks
  airport:         "hsl(220, 16%, 14%)",  //          airport apron

  // ── Water ─────────────────────────────────────────────────────────────────
  water:           "hsl(208, 42%, 16%)",  // #17283f  water bodies
  waterway:        "hsl(208, 38%, 14%)",  //          rivers / canals
  waterShadow:     "hsl(208, 35%, 12%)",  //          water depth / shadow
  waterLabel:      "hsl(208, 35%, 52%)",  //          water text color

  // ── Roads — hierarchy from barely-there to visible ───────────────────────
  casing:          "hsl(224, 30%,  8%)",  //          all road casings
  roadPath:        "hsl(220, 12%, 16%)",  //          paths / pedestrian
  roadMinor:       "hsl(220, 12%, 19%)",  //          service / residential
  roadStreet:      "hsl(220, 10%, 21%)",  //          local streets
  roadSecondary:   "hsl(218,  9%, 25%)",  //          secondary / tertiary
  roadPrimary:     "hsl(216,  8%, 30%)",  //          primary
  roadTrunk:       "hsl( 36, 20%, 27%)",  // WARM ←   trunk (amber tint, Zillow signature)
  roadMotorway:    "hsl( 36, 25%, 30%)",  // WARM ←   motorway
  motorwayCasing:  "hsl( 36, 22%, 17%)",  //          motorway casing

  // ── Labels ────────────────────────────────────────────────────────────────
  labelCity:       "hsl(220, 14%, 82%)",  //          major cities
  labelTown:       "hsl(220,  9%, 68%)",  //          towns / settlements
  labelNeighbour:  "hsl(220,  7%, 56%)",  //          neighbourhoods
  labelRoad:       "hsl(220,  6%, 52%)",  //          road names
  labelPoi:        "hsl(220,  6%, 52%)",  //          POI labels
  labelHalo:       "hsl(224, 25%,  8%)",  //          text halo / shadow
  shieldText:      "hsl(  0,  0%, 92%)",  //          highway shield text
};

// ── Label spelling fix ───────────────────────────────────────────────────────
const MAJOR_LABEL_LAYERS      = new Set(["settlement-major-label","state-label","country-label","continent-label"]);
const SUBDIVISION_LABEL_LAYERS = new Set(["settlement-minor-label","settlement-subdivision-label"]);

// ── Layer-by-layer paint overrides ───────────────────────────────────────────
// Covers every visually significant layer in streets-v12.
const PAINT = {
  // Base
  "background":                        { "background-color": P.bg },

  // Nature
  "national-park":                     { "fill-color": P.park },
  "landcover-wood":                    { "fill-color": P.park },
  "landcover-wood-medium":             { "fill-color": P.park },
  "landcover-wood-high":               { "fill-color": P.park },
  "landcover-grass":                   { "fill-color": P.scrub },
  "landcover-grass-medium":            { "fill-color": P.scrub },
  "landcover-grass-high":              { "fill-color": P.scrub },
  "landcover-scrub":                   { "fill-color": P.scrub },
  "landcover-scrub-medium":            { "fill-color": P.scrub },
  "landcover-snow-cap":                { "fill-color": "hsl(220, 20%, 26%)" },
  "landcover-permafrost":              { "fill-color": P.scrub },
  "park-polygon-fill":                 { "fill-color": P.park },

  // Land use
  "land-structure-polygon":            { "fill-color": P.structure },
  "airport-polygon":                   { "fill-color": P.airport },
  "pitch-and-track-polygon":           { "fill-color": P.sportGround },

  // Water
  "water-shadow":                      { "fill-color": P.waterShadow },
  "water-depth":                       { "fill-color": P.water },
  "water":                             { "fill-color": P.water },
  "waterway-shadow":                   { "line-color": P.waterShadow },
  "waterway":                          { "line-color": P.waterway },

  // Buildings
  "building-outline":                  { "line-color": P.casing },
  "building":                          { "fill-color": P.buildingFill, "fill-outline-color": P.casing },

  // ── Roads ─── tunnel / road / bridge (all three variants) ───────────────
  // Paths
  "tunnel-path":                       { "line-color": P.roadPath },
  "road-path":                         { "line-color": P.roadPath },
  "bridge-path":                       { "line-color": P.roadPath },
  "tunnel-steps":                      { "line-color": P.roadPath },
  "road-steps":                        { "line-color": P.roadPath },
  "bridge-steps":                      { "line-color": P.roadPath },
  "tunnel-steps-bg":                   { "line-color": P.casing },
  "road-steps-bg":                     { "line-color": P.casing },
  "bridge-steps-bg":                   { "line-color": P.casing },

  // Pedestrian
  "tunnel-pedestrian":                 { "line-color": P.roadMinor },
  "road-pedestrian":                   { "line-color": P.roadMinor },
  "bridge-pedestrian":                 { "line-color": P.roadMinor },
  "tunnel-pedestrian-case":            { "line-color": P.casing },
  "road-pedestrian-case":              { "line-color": P.casing },
  "bridge-pedestrian-case":            { "line-color": P.casing },

  // Minor / service
  "tunnel-minor-link":                 { "line-color": P.roadMinor },
  "road-minor":                        { "line-color": P.roadMinor },
  "road-minor-low":                    { "line-color": P.roadMinor },
  "bridge-minor":                      { "line-color": P.roadMinor },
  "tunnel-minor-link-case":            { "line-color": P.casing },
  "road-minor-case":                   { "line-color": P.casing },
  "bridge-minor-case":                 { "line-color": P.casing },

  // Streets
  "tunnel-street-minor":               { "line-color": P.roadStreet },
  "road-street":                       { "line-color": P.roadStreet },
  "road-street-low":                   { "line-color": P.roadStreet },
  "bridge-street":                     { "line-color": P.roadStreet },
  "tunnel-street-minor-case":          { "line-color": P.casing },
  "road-street-case":                  { "line-color": P.casing },
  "bridge-street-case":                { "line-color": P.casing },

  // Secondary / Tertiary
  "tunnel-secondary-tertiary":         { "line-color": P.roadSecondary },
  "road-secondary-tertiary":           { "line-color": P.roadSecondary },
  "bridge-secondary-tertiary":         { "line-color": P.roadSecondary },
  "tunnel-secondary-tertiary-case":    { "line-color": P.casing },
  "road-secondary-tertiary-case":      { "line-color": P.casing },
  "bridge-secondary-tertiary-case":    { "line-color": P.casing },

  // Primary
  "tunnel-primary":                    { "line-color": P.roadPrimary },
  "road-primary":                      { "line-color": P.roadPrimary },
  "bridge-primary":                    { "line-color": P.roadPrimary },
  "tunnel-primary-case":               { "line-color": P.casing },
  "road-primary-case":                 { "line-color": P.casing },
  "bridge-primary-case":               { "line-color": P.casing },
  "tunnel-primary-link":               { "line-color": P.roadPrimary },
  "road-primary-link":                 { "line-color": P.roadPrimary },

  // Trunk (warm amber — Zillow's signature road color)
  "tunnel-trunk":                      { "line-color": P.roadTrunk },
  "road-trunk":                        { "line-color": P.roadTrunk },
  "bridge-trunk":                      { "line-color": P.roadTrunk },
  "tunnel-trunk-case":                 { "line-color": P.motorwayCasing },
  "road-trunk-case":                   { "line-color": P.motorwayCasing },
  "bridge-trunk-case":                 { "line-color": P.motorwayCasing },
  "tunnel-trunk-link":                 { "line-color": P.roadTrunk },
  "road-trunk-link":                   { "line-color": P.roadTrunk },

  // Motorway (warm amber)
  "tunnel-motorway":                   { "line-color": P.roadMotorway },
  "road-motorway":                     { "line-color": P.roadMotorway },
  "bridge-motorway":                   { "line-color": P.roadMotorway },
  "tunnel-motorway-case":              { "line-color": P.motorwayCasing },
  "road-motorway-case":                { "line-color": P.motorwayCasing },
  "bridge-motorway-case":              { "line-color": P.motorwayCasing },
  "tunnel-motorway-link":              { "line-color": P.roadMotorway },
  "road-motorway-link":                { "line-color": P.roadMotorway },
  "tunnel-motorway-link-case":         { "line-color": P.motorwayCasing },
  "road-motorway-link-case":           { "line-color": P.motorwayCasing },

  // Major link (on/off ramps)
  "bridge-major-link":                 { "line-color": P.roadTrunk },
  "bridge-major-link-case":            { "line-color": P.motorwayCasing },

  // ── Base land / landuse / aeroway (missed in first pass) ─────────────────
  "land":                              { "background-color": P.land },
  "landcover":                         { "fill-color": P.scrub },
  "landuse":                           { "fill-color": P.urban },
  "landuse-residential":               { "fill-color": P.urban },
  "pitch-outline":                     { "line-color": P.casing },
  "land-structure-line":               { "line-color": P.structure },
  "aeroway-polygon":                   { "fill-color": P.airport, "fill-outline-color": P.casing },
  "aeroway-line":                      { "line-color": P.roadSecondary },
  "building-underground":              { "fill-color": P.bg, "fill-outline-color": P.casing },

  // ── Tunnel casings (missed variants) ─────────────────────────────────────
  "tunnel-minor-case":                 { "line-color": P.casing },
  "tunnel-street-case":                { "line-color": P.casing },
  "tunnel-major-link-case":            { "line-color": P.motorwayCasing },
  "tunnel-motorway-trunk-case":        { "line-color": P.motorwayCasing },
  "tunnel-motorway-trunk":             { "line-color": P.roadMotorway },
};

// ── Label paint overrides (symbol layers) ────────────────────────────────────
// text-color and text-halo-color only — layout.text-field handled separately.
const LABEL_PAINT = {
  "settlement-major-label":            { "text-color": P.labelCity,       "text-halo-color": P.labelHalo },
  "settlement-minor-label":            { "text-color": P.labelTown,       "text-halo-color": P.labelHalo },
  "settlement-subdivision-label":      { "text-color": P.labelNeighbour,  "text-halo-color": P.labelHalo },
  "state-label":                       { "text-color": P.labelCity,       "text-halo-color": P.labelHalo },
  "country-label":                     { "text-color": P.labelCity,       "text-halo-color": P.labelHalo },
  "continent-label":                   { "text-color": P.labelCity,       "text-halo-color": P.labelHalo },
  "natural-point-label":               { "text-color": P.labelNeighbour,  "text-halo-color": P.labelHalo },
  "natural-line-label":                { "text-color": P.labelNeighbour,  "text-halo-color": P.labelHalo },
  "water-point-label":                 { "text-color": P.waterLabel,      "text-halo-color": P.labelHalo },
  "water-line-label":                  { "text-color": P.waterLabel,      "text-halo-color": P.labelHalo },
  "waterway-label":                    { "text-color": P.waterLabel,      "text-halo-color": P.labelHalo },
  "poi-label":                         { "text-color": P.labelPoi,        "text-halo-color": P.labelHalo },
  "airport-label":                     { "text-color": P.labelTown,       "text-halo-color": P.labelHalo },
  "road-label":                        { "text-color": P.labelRoad,       "text-halo-color": P.labelHalo },
  "road-number-shield":                { "text-color": P.shieldText,      "text-halo-color": P.motorwayCasing },
  "road-exit-shield":                  { "text-color": P.shieldText,      "text-halo-color": P.motorwayCasing },
};

// ── Patch one layer ──────────────────────────────────────────────────────────
function patchLayer(layer) {
  // 1. Label text-field spelling fix
  if (MAJOR_LABEL_LAYERS.has(layer.id)) {
    return {
      ...layer,
      layout: { ...layer.layout, "text-field": ["get", "name"] },
      paint:  { ...layer.paint, ...LABEL_PAINT[layer.id] },
    };
  }
  if (SUBDIVISION_LABEL_LAYERS.has(layer.id)) {
    return {
      ...layer,
      layout: { ...layer.layout, "text-field": ["get", "name_en"] },
      paint:  { ...layer.paint, ...LABEL_PAINT[layer.id] },
    };
  }

  // 2. Any other symbol layer — apply label paint colors if listed
  if (layer.type === "symbol" && LABEL_PAINT[layer.id]) {
    return { ...layer, paint: { ...layer.paint, ...LABEL_PAINT[layer.id] } };
  }

  // 3. Non-symbol layers — apply paint overrides
  const overrides = PAINT[layer.id];
  if (overrides) {
    // Only replace properties that exist as plain strings in the original paint
    // (don't clobber zoom expressions with a flat value — too risky)
    const newPaint = { ...layer.paint };
    for (const [prop, value] of Object.entries(overrides)) {
      newPaint[prop] = value; // direct override (our values are correct for all zooms)
    }
    return { ...layer, paint: newPaint };
  }

  return layer;
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const url = `https://api.mapbox.com/styles/v1/mapbox/streets-v12?access_token=${TOKEN}`;

  console.log("⬇  Fetching mapbox://styles/mapbox/streets-v12 …");
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  const style = await res.json();
  console.log(`   Got "${style.name}" — ${style.layers.length} layers`);

  let overridden = 0, labelFixed = 0;
  style.layers = style.layers.map((layer) => {
    const patched = patchLayer(layer);
    if (patched !== layer) {
      if (MAJOR_LABEL_LAYERS.has(layer.id) || SUBDIVISION_LABEL_LAYERS.has(layer.id)) labelFixed++;
      else overridden++;
    }
    return patched;
  });

  style.name = "Blab Dark (Zillow-inspired)";

  const outPath = path.join(__dirname, "blab-dark.json");
  fs.writeFileSync(outPath, JSON.stringify(style, null, 2));
  const sizeKB = Math.round(fs.statSync(outPath).size / 1024);

  // List any layer IDs in streets-v12 we didn't cover (for info only)
  const allIds     = JSON.parse(fs.readFileSync(outPath, "utf8")).layers.map(l => l.id);
  const covered    = new Set([...Object.keys(PAINT), ...Object.keys(LABEL_PAINT),
                               ...MAJOR_LABEL_LAYERS, ...SUBDIVISION_LABEL_LAYERS]);
  const uncovered  = allIds.filter(id => !covered.has(id));

  console.log("");
  console.log(`✅  Label layers fixed    : ${labelFixed}`);
  console.log(`✅  Paint layers overridden: ${overridden}`);
  console.log(`ℹ   Uncovered layers (use generic dark): ${uncovered.length}`);
  if (uncovered.length) console.log(`    ${uncovered.slice(0, 12).join(", ")}${uncovered.length > 12 ? " …" : ""}`);
  console.log(`✅  Saved → scripts/blab-dark.json (${sizeKB} KB)`);
  console.log("");
  console.log("── Upload steps ──────────────────────────────────────────────");
  console.log("1. console.mapbox.com/studio → New style → Upload → blab-dark.json");
  console.log("2. Preview — tweak P.* constants in this file if needed, re-run");
  console.log("3. Publish → copy mapbox://styles/purchases-moneymic/<id>");
  console.log("4. Set MAP_STYLES.dark in both theme.ts files to the new URL");
  console.log("──────────────────────────────────────────────────────────────");
}

main().catch((err) => { console.error("❌ ", err.message); process.exit(1); });
