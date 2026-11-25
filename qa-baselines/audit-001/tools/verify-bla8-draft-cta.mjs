/**
 * BLA-8 (T5) — post-fix proof for BLA-14: the accept-handoff CTA is hoisted OUT of the
 * `cardHeader` Pressable in RealtorDashboard.tsx and is now a sibling of it.
 *
 * Asserts, at 320 / 360 / 390pt, that the hoist did not trade a layout regression for the
 * a11y win: the CTA still renders, is NOT inside a role="button" ancestor, holds the 44pt
 * floor, and neither overflows its card/viewport, wraps, nor induces horizontal scroll.
 * The 98pt left inset (cardThumb 88 + cardInfo padding 10) is the squeeze under test.
 *
 * Exits non-zero on FAIL, and on VACUOUS (CTA absent) so an auth/fixture break cannot
 * masquerade as a pass.
 *
 * Usage: node qa-baselines/audit-001/tools/verify-bla8-draft-cta.mjs
 * Requires: `npm run dev` (3000) and `expo start --port 8081` already up.
 *
 * SAFETY: the publish mutation is aborted at the network layer - no UAT data is touched.
 */
import { createRequire } from "module";
import fs from "fs";
const ROOT = "/Users/adi/Projects/blab-web-agents";
const require = createRequire(ROOT + "/package.json");
const { chromium } = require("playwright");

const env = fs.readFileSync(ROOT + "/.env.local", "utf8");
const envGet = (k) => (env.match(new RegExp("^" + k + "=(.*)$", "m")) || [])[1]?.trim().replace(/^["']|["']$/g, "");
if (envGet("BLAB_ENV") === "production") { console.error("REFUSING: production (Invariant #5)"); process.exit(2); }

const res = await fetch("http://localhost:3000/api/mobile-auth/verify-otp", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ phone: "+919100000045", code: "123456" }),
});
const auth = await res.json();
if (!auth.success) throw new Error("login failed");

const browser = await chromium.launch();
const out = [];
for (const width of [320, 360, 390]) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  await ctx.addInitScript((a) => {
    try {
      localStorage.setItem("auth_token", a.token);
      localStorage.setItem("auth_user", JSON.stringify(a.user));
      localStorage.setItem("blab-theme", "light");
    } catch {}
  }, { token: auth.token, user: auth.user });
  // Never let the publish mutation reach the server.
  const page = await ctx.newPage();
  await page.route("**/api/realtors/dashboard", async (route) => {
    const r = route.request();
    if (r.method() === "POST" && (r.postData() || "").includes("publish_and_schedule")) return route.abort();
    return route.continue();
  });
  await page.goto("http://localhost:8081/dashboard", { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForFunction(() => [...document.querySelectorAll('[role="button"]')]
    .some(b => (b.getAttribute("aria-label") || "").startsWith("Accept handoff")), null, { timeout: 60000 });
  const data = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('[role="button"]')]
      .filter(b => (b.getAttribute("aria-label") || "").startsWith("Accept handoff"));
    return btns.map(b => {
      const r = b.getBoundingClientRect();
      // nearest ancestor that is the card (has the 16px radius)
      let card = b.parentElement;
      while (card && getComputedStyle(card).borderTopLeftRadius !== "16px") card = card.parentElement;
      const cr = (card || b.parentElement).getBoundingClientRect();
      return {
        w: Math.round(r.width), h: Math.round(r.height),
        left: Math.round(r.left - cr.left), right: Math.round(r.right), cardRight: Math.round(cr.right),
        overflowsCard: r.right > cr.right + 0.5,
        overflowsViewport: r.right > window.innerWidth + 0.5,
        textWrapped: b.scrollHeight > r.height + 1,
        nestedInButton: !!b.parentElement.closest('[role="button"]'),
      };
    });
  });
  const hScroll = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  out.push({ width, count: data.length, hScroll,
    minH: data.length ? Math.min(...data.map(d => d.h)) : null,
    anyBelow44: data.some(d => d.h < 44),
    anyOverflowCard: data.some(d => d.overflowsCard),
    anyOverflowViewport: data.some(d => d.overflowsViewport),
    anyWrapped: data.some(d => d.textWrapped),
    anyNested: data.some(d => d.nestedInButton),
    sample: data[0] });
  await ctx.close();
}
await browser.close();
const vacuous = out.some((o) => o.count === 0);
const pass = !vacuous && out.every((o) =>
  !o.anyBelow44 && !o.anyOverflowCard && !o.anyOverflowViewport && !o.anyWrapped && !o.anyNested && !o.hScroll);
const report = {
  generatedFor: "BLA-8 (T5) — hoisted draft CTA, post-BLA-14 fix",
  fixture: "realtor_pro / +919100000045 (1 draft listing = repro condition)",
  widths: out,
  vacuous,
  verdict: pass
    ? "PASS - CTA is a sibling (not nested), 44pt floor holds, no overflow/wrap/h-scroll at 320/360/390"
    : vacuous ? "VACUOUS - CTA did not render; result proves nothing" : "FAIL",
};
fs.mkdirSync(ROOT + "/qa-baselines/audit-001/t5-evidence", { recursive: true });
fs.writeFileSync(ROOT + "/qa-baselines/audit-001/t5-evidence/bla8-draft-cta-hoist.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(pass ? 0 : 1);
