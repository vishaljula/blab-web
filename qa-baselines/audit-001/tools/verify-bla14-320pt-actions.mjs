/**
 * BLA-14 (Layer-2 QA), secondary check — the one device-free item on the issue's
 * "also worth covering" list:
 *
 *   "the now-44pt `actionBtn` pair inside `FlatBuyerContactCard` at 320pt viewport width,
 *    where the row is tight"
 *
 * T3 raised those two icon buttons from 30x30 to HIT (44pt) via `withHitFloor`. The worry is
 * that at the narrowest supported width the row — avatar + flex:1 name column + two 44pt
 * buttons — overflows or clips, trading an a11y win for a layout regression.
 *
 * This measures the RENDERED geometry rather than eyeballing a screenshot: actual size,
 * containment within the card, and overlap against the name column. Run at 320px and, for
 * contrast, at 390px.
 *
 * Usage:
 *   node qa-baselines/audit-001/tools/verify-bla14-320pt-actions.mjs
 * Requires: `npm run dev` (3000) and `expo start --port 8081` already up.
 */
import { createRequire } from "module";
import fs from "fs";
import path from "path";

const ROOT = "/Users/adi/Projects/blab-web-agents";
const require = createRequire(ROOT + "/package.json");
const { chromium } = require("playwright");

const WEB = "http://localhost:8081";
const API = "http://localhost:3000";
const OUT = path.join(ROOT, "qa-baselines/audit-001/t3-qa-layer2");
const HIT = 44;

const env = fs.readFileSync(ROOT + "/.env.local", "utf8");
const envGet = (k) =>
  (env.match(new RegExp("^" + k + "=(.*)$", "m")) || [])[1]?.trim().replace(/^["']|["']$/g, "");
if (envGet("BLAB_ENV") === "production") {
  console.error("REFUSING: BLAB_ENV === 'production' (Marketplace Invariant #5)");
  process.exit(2);
}

// realtor_pro — Harish Sharma. Buyer Contacts tab is populated for this fixture.
const PHONE = "+919100000045";

async function login(phone) {
  const res = await fetch(`${API}/api/mobile-auth/verify-otp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, code: "123456" }),
  });
  const j = await res.json();
  if (!j.success) throw new Error(`login failed: ${JSON.stringify(j)}`);
  return { token: j.token, user: j.user };
}

async function measure(browser, auth, width, fontScalePct) {
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: 2 });
  await ctx.addInitScript((a) => {
    try {
      localStorage.setItem("auth_token", a.token);
      localStorage.setItem("auth_user", JSON.stringify(a.user));
      localStorage.setItem("blab-theme", "light");
    } catch {}
  }, auth);
  const page = await ctx.newPage();

  // Never let the real WhatsApp/tel handlers fire, and never mark a contact responded.
  await page.route("**/api/realtors/leads**", (r) =>
    r.request().method() === "POST" ? r.abort() : r.continue()
  );

  await page.goto(WEB + "/dashboard", { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForFunction(() => document.body && document.body.innerText.trim().length > 20, null, {
    timeout: 120000,
  });
  await page.waitForTimeout(3500);

  if (fontScalePct !== 100) {
    // Dynamic-Type stand-in on web: scale the root font size, which is what RNW's
    // font scaling keys off for `allowFontScaling` text.
    await page.addStyleTag({ content: `html { font-size: ${fontScalePct}% !important; }` });
    await page.waitForTimeout(1200);
  }

  const clicked = await page.evaluate((label) => {
    // The dashboard tab labels were shortened to "Properties" / "Visits" / "Contacts"
    // (CEO copy mandate, 2026-11-26); the full name survives on `aria-label` as
    // "<label>, N items". Match that first, and keep the legacy visible-text heuristic
    // below as a fallback so this probe still works against pre-rename builds.
    const byAria = [...document.querySelectorAll('[role="tab"]')].find((el) =>
      (el.getAttribute("aria-label") || "").startsWith(label));
    if (byAria) { byAria.click(); return true; }
    const hit = [...document.querySelectorAll("div,span")].filter((el) => {
      const t = (el.innerText || "").trim();
      if (!t.startsWith(label) || t.length > label.length + 4) return false;
      let n = el;
      for (let i = 0; i < 4 && n; i++, n = n.parentElement) {
        if (getComputedStyle(n).cursor === "pointer") return true;
      }
      return false;
    });
    const el = hit[hit.length - 1];
    if (!el) return false;
    let target = el;
    while (target && getComputedStyle(target).cursor !== "pointer") target = target.parentElement;
    (target || el).click();
    return true;
  }, "Buyer Contacts");
  if (!clicked) throw new Error("could not reach the Buyer Contacts tab");
  await page.waitForTimeout(2500);

  const data = await page.evaluate((HIT) => {
    // The two action buttons carry these accessible-name prefixes (RealtorDashboard.tsx).
    const btns = [...document.querySelectorAll('[role="button"][aria-label]')].filter((b) => {
      const l = b.getAttribute("aria-label") || "";
      return l.startsWith("WhatsApp ") || l.startsWith("Call ");
    });
    if (!btns.length) return { error: "no WhatsApp/Call action buttons found — tab may be empty" };

    const rows = btns.map((b) => {
      const r = b.getBoundingClientRect();
      // the enclosing card: climb to the widest ancestor that still looks like the card
      let card = b.parentElement;
      for (let i = 0; i < 6 && card?.parentElement; i++) card = card.parentElement;
      const cr = card.getBoundingClientRect();
      // the flex:1 name column is the sibling group holding the buyer name
      const row = b.closest('[role="button"]') === b ? b.parentElement?.parentElement : null;
      const nameEl = row
        ? [...row.querySelectorAll("div,span")].find((e) => (e.innerText || "").trim().length > 0)
        : null;
      const nr = nameEl?.getBoundingClientRect();
      return {
        label: (b.getAttribute("aria-label") || "").slice(0, 45),
        width: +r.width.toFixed(1),
        height: +r.height.toFixed(1),
        meets44: r.width >= HIT - 0.5 && r.height >= HIT - 0.5,
        rightEdge: +r.right.toFixed(1),
        cardRightEdge: +cr.right.toFixed(1),
        overflowsCardRight: r.right > cr.right + 0.5,
        overflowsViewport: r.right > window.innerWidth + 0.5,
        clippedHorizontally: r.width < HIT - 0.5,
        overlapsNameColumn: nr ? r.left < nr.right - 0.5 : null,
      };
    });
    return {
      viewportWidth: window.innerWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      horizontalScrollPresent: document.documentElement.scrollWidth > window.innerWidth + 0.5,
      buttons: rows,
    };
  }, HIT);

  await page.screenshot({
    path: path.join(OUT, "frames", `bla14-buyercontacts-w${width}-fs${fontScalePct}.png`),
    fullPage: true,
  });
  await ctx.close();
  return data;
}

async function main() {
  fs.mkdirSync(path.join(OUT, "frames"), { recursive: true });
  const auth = await login(PHONE);
  console.log(`auth -> ${auth.user.name} / ${auth.user.role}`);
  const browser = await chromium.launch();

  const cases = [
    { width: 320, fontScalePct: 100 },
    { width: 320, fontScalePct: 200 }, // largest-Dynamic-Type stand-in
    { width: 390, fontScalePct: 100 },
  ];
  const out = {};
  for (const c of cases) {
    const key = `w${c.width}_fs${c.fontScalePct}`;
    out[key] = await measure(browser, auth, c.width, c.fontScalePct);
    console.log(`\n== ${key} ==`);
    console.log(JSON.stringify(out[key], null, 2));
  }

  const allBtns = Object.values(out).flatMap((v) => v.buttons || []);
  const summary = {
    casesRun: Object.keys(out).length,
    buttonsMeasured: allBtns.length,
    anyBelow44: allBtns.some((b) => !b.meets44),
    anyOverflowCard: allBtns.some((b) => b.overflowsCardRight),
    anyOverflowViewport: allBtns.some((b) => b.overflowsViewport),
    anyClipped: allBtns.some((b) => b.clippedHorizontally),
    anyOverlapName: allBtns.some((b) => b.overlapsNameColumn === true),
    anyHorizontalScroll: Object.values(out).some((v) => v.horizontalScrollPresent),
  };
  summary.verdict =
    allBtns.length === 0
      ? "INCONCLUSIVE — no action buttons rendered"
      : !summary.anyBelow44 &&
        !summary.anyOverflowCard &&
        !summary.anyOverflowViewport &&
        !summary.anyClipped &&
        !summary.anyHorizontalScroll
      ? "PASS — 44pt targets hold at 320pt with no overflow, clipping or h-scroll"
      : "FAIL — see flags above";
  console.log("\n== SUMMARY ==");
  console.log(JSON.stringify(summary, null, 2));

  fs.writeFileSync(
    path.join(OUT, "bla14-320pt-actions.json"),
    JSON.stringify({ generatedFor: "BLA-14", fixture: PHONE, cases: out, summary }, null, 2)
  );
  console.log(`\nwrote ${path.join(OUT, "bla14-320pt-actions.json")}`);
  await browser.close();
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
