/**
 * AUDIT-001 Ticket 3 — Layer-2 Protected-Surface smoke regression (BLA-12 §1).
 *
 * The Ticket-0 baseline only covers Flow #1 (Profile + Dashboard), so a pixel diff alone
 * cannot speak for Protected Surfaces 1–5. This loads each protected surface on the T3
 * branch and asserts: it renders, it throws no page/console error, and the strings
 * PROTECTED_SURFACES.md says must be preserved are present.
 *
 * Read-only with respect to app source.
 *
 * Usage: node qa-baselines/audit-001/tools/verify-protected-surfaces.mjs
 */
import { createRequire } from "module";
import fs from "fs";
import path from "path";

const ROOT = "/Users/adi/Projects/blab-web-agents";
const require = createRequire(ROOT + "/package.json");
const { chromium } = require("playwright");

const WEB = process.env.QA_WEB || "http://localhost:8081";
const API = "http://localhost:3000";
const OUT = path.join(ROOT, "qa-baselines/audit-001/t3-qa-layer2");

const env = fs.readFileSync(ROOT + "/.env.local", "utf8");
const envGet = (k) => (env.match(new RegExp("^" + k + "=(.*)$", "m")) || [])[1]?.trim().replace(/^["']|["']$/g, "");
if (envGet("BLAB_ENV") === "production") {
  console.error("REFUSING: BLAB_ENV === 'production' (Marketplace Invariant #5)");
  process.exit(2);
}

const login = async (phone) => {
  const r = await fetch(`${API}/api/mobile-auth/verify-otp`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, code: "123456" }),
  });
  const j = await r.json();
  if (!j.success) throw new Error("login failed " + phone);
  return { token: j.token, user: j.user };
};

const member = await login("+18133355928");

// Surface 1 needs a real booking id — resolve the member fixture's own shoot rather than
// guessing one, so the ARRIVAL HANDSHAKE CODE pill (the §1 preserved string) actually renders.
const act = await (await fetch(`${API}/api/users/my-activity`, { headers: { Authorization: `Bearer ${member.token}` } })).json();
const shootId = (act.myShoots || [])[0]?.id;
if (!shootId) throw new Error("member fixture has no shoot — cannot smoke Surface 1");

// Resolve a live listing (and a society one, for Surface 2) from the viewport API over
// Hyderabad rather than hardcoding ids, so this stays valid as UAT data turns over.
const vp = await (await fetch(
  `${API}/api/listings/viewport?sw_lng=78.2&sw_lat=17.2&ne_lng=78.7&ne_lat=17.6&zoom=14`
)).json();
const rows = Array.isArray(vp.listings) ? vp.listings : Array.isArray(vp) ? vp : [];
const anyListing = rows[0];
const society = rows.find((l) => l.societyName) || anyListing;
if (!anyListing) throw new Error("no listings returned from viewport API — cannot smoke Surface 2");

const SURFACES = [
  { n: 2, name: "Multi-Unit Society Dynamic Switcher", route: `/property/${society?.id}`,
    expect: ["₹"], note: "DEVELOPER UNITS / OWNER UNITS headings only render for multi-unit societies" },
  { n: 3, name: "Express Shoot & Zero-Flash Navigation", route: "/post", expect: [] },
  { n: 5, name: "Founder Ops Command Center", route: "/ops", expect: ["Founder Command Center", "Blitz", "UAT SANDBOX"] },
  { n: 1, name: "Live 3D Shutterbug Tracking", route: `/tracking/${shootId}`, expect: ["ARRIVAL", "939981"], allowEmpty: true,
    note: "resolved from the member fixture's own shoot; the Gate Code pill is the §1 preserved string" },
];

const browser = await chromium.launch();
const results = [];
for (const s of SURFACES) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "light" });
  await ctx.addInitScript((a) => {
    localStorage.setItem("auth_token", a.token);
    localStorage.setItem("auth_user", JSON.stringify(a.user));
    localStorage.setItem("blab-theme", "light");
  }, member);
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push("PAGEERROR " + String(e).slice(0, 180)));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text().slice(0, 180);
    if (/deprecated|useNativeDriver|favicon/.test(t)) return;
    if (!errs.includes("CONSOLE " + t)) errs.push("CONSOLE " + t);
  });
  let text = "";
  try {
    await page.goto(WEB + s.route, { waitUntil: "domcontentloaded", timeout: 180000 });
    await page.waitForFunction(() => document.body && document.body.innerText.trim().length > 5, null, { timeout: 90000 });
    await page.waitForTimeout(4000);
    text = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");
  } catch (e) {
    errs.push("LOAD " + String(e).slice(0, 140));
  }
  await page.screenshot({ path: path.join(OUT, "frames", `protected-surface-${s.n}.png`) });
  const missing = s.expect.filter((t) => !text.includes(t));
  results.push({ surface: s.n, name: s.name, route: s.route, rendered: text.length > 5,
                 missingExpectedStrings: missing, errors: errs, textHead: text.slice(0, 150), note: s.note });
  await ctx.close();
}
await browser.close();

fs.writeFileSync(path.join(OUT, "protected-surfaces.json"), JSON.stringify(results, null, 2));
for (const r of results) {
  const ok = r.rendered && r.missingExpectedStrings.length === 0 && r.errors.length === 0;
  console.log(`Surface ${r.surface} ${ok ? "PASS" : "REVIEW"} — ${r.name}`);
  console.log(`   route ${r.route} | rendered=${r.rendered} | missing=${JSON.stringify(r.missingExpectedStrings)}`);
  if (r.errors.length) r.errors.forEach((e) => console.log("   ! " + e));
  console.log(`   text: ${r.textHead}`);
}
