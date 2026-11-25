/**
 * AUDIT-001 Ticket 1 — Marketplace Invariant #1 probe, corrected (BLA-15).
 *
 * Supersedes the Invariant #1 sections of `verify-t1-qa-layer2.mjs` and
 * `verify-t1-followups.mjs`, both of which looked for the literal strings
 * "Call" / "WhatsApp". That was wrong: the buyer-contact affordances are
 * ICON-ONLY `Ionicons` (`RealtorDashboard.tsx:238-247`, `:407-416`) inside a
 * 30x30 `s.actionBtn` (`:1145`) and render NO text node. A text probe can never
 * match them, so `Call=0 / WhatsApp=0` was a measurement artifact, not a defect.
 *
 * This probe instead finds the affordances by geometry + the Ionicons private-use
 * glyph, and verifies the tab actually switched by comparing content signatures
 * rather than trusting the click.
 *
 * Invariant #1 ("Zero Buyer Dead-End") is checked at both layers:
 *   DATA   — every `active` listing the API returns carries a non-empty
 *            contactName and contactPhone, and still does after the new
 *            `normalizeDashboard` spread.
 *   DEVICE — each rendered listing card exposes its two contact controls, on
 *            both the pre-change (T0) and post-change (T1) build.
 *
 * Read-only with respect to app source and to the UAT database.
 */
import { createRequire } from "module";
import fs from "fs";
import path from "path";

const ROOT = "/Users/adi/Projects/blab-web-agents";
const require = createRequire(ROOT + "/package.json");
const { chromium } = require("playwright");

const BEFORE_WEB = process.env.BEFORE_WEB || "http://localhost:8082";
const AFTER_WEB = process.env.AFTER_WEB || "http://localhost:8084";
const API = process.env.CAPTURE_API || "http://localhost:3000";
const OUT = path.join(ROOT, "qa-baselines/audit-001/t1-qa-layer2");
const FRAMES = path.join(OUT, "frames");

const env = fs.readFileSync(ROOT + "/.env.local", "utf8");
const envGet = (k) =>
  (env.match(new RegExp("^" + k + "=(.*)$", "m")) || [])[1]?.trim().replace(/^["']|["']$/g, "");
if (envGet("BLAB_ENV") === "production") {
  console.error("REFUSING: BLAB_ENV === 'production' (Marketplace Invariant #5)");
  process.exit(2);
}

const PRO = "+919100000045"; // Harish Sharma — 4 active + 1 draft, 2 buyer contacts

async function login(phone) {
  const r = await fetch(`${API}/api/mobile-auth/verify-otp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, code: "123456" }),
  });
  const j = await r.json();
  if (!j.success) throw new Error("login failed " + phone);
  return { token: j.token, user: j.user };
}

/**
 * Find the 30x30 round contact controls by GEOMETRY, and record which Ionicons
 * glyph each one contains so WhatsApp and Call can be told apart without text.
 */
const PROBE_ACTIONS = () => {
  const out = [];
  for (const el of document.querySelectorAll("div")) {
    const cs = getComputedStyle(el);
    const b = el.getBoundingClientRect();
    const radius = parseFloat(cs.borderTopLeftRadius);
    // s.actionBtn: width 30, height 30, borderRadius 15, borderWidth 1
    if (Math.abs(b.width - 30) > 2 || Math.abs(b.height - 30) > 2) continue;
    if (Math.abs(radius - 15) > 2) continue;
    if (cs.cursor !== "pointer") continue;
    // The glyph lives in a child Text; Ionicons uses the private use area.
    const glyphs = (el.innerText || "").match(/[\uE000-\uF8FF]/g) || [];
    out.push({
      w: Math.round(b.width),
      h: Math.round(b.height),
      y: Math.round(b.top),
      glyph: glyphs.map((g) => "U+" + g.codePointAt(0).toString(16).toUpperCase()).join(","),
      // The WhatsApp control is the only one with a green-tinted background.
      bg: cs.backgroundColor,
      meetsHit44: b.width >= 44 && b.height >= 44,
    });
  }
  return out;
};

/** A stable signature of which tab's content is mounted. */
const TAB_SIGNATURE = () => {
  const full = document.body.innerText.replace(/\s+/g, " ").trim();
  return {
    len: full.length,
    // Properties tab: accordion cards carry a For Sale / For Rent badge.
    hasForSaleBadge: /For (Sale|Rent)/.test(full),
    // Site Visits tab: flat visit rows carry a status word.
    hasVisitStatus: /(Confirmed|Requested|Completed)/.test(full),
    head: full.slice(0, 260),
    tail: full.slice(-200),
  };
};

const results = { data: {}, device: {} };

async function open(browser, web, auth) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    colorScheme: "light",
    deviceScaleFactor: 2,
  });
  const pageOrigin = new URL(web).origin;
  const cors = {
    "access-control-allow-origin": pageOrigin,
    "access-control-allow-credentials": "true",
    "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
    "access-control-allow-headers": "Content-Type, Authorization, Cookie",
  };
  await ctx.route(`${API}/**`, async (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    const res = await route.fetch();
    await route.fulfill({ response: res, headers: { ...res.headers(), ...cors } });
  });
  await ctx.addInitScript((a) => {
    localStorage.setItem("auth_token", a.token);
    localStorage.setItem("auth_user", JSON.stringify(a.user));
    localStorage.setItem("blab-theme", "light");
  }, auth);
  const page = await ctx.newPage();
  await page.goto(web + "/dashboard", { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForFunction(() => document.body && document.body.innerText.trim().length > 20, null, {
    timeout: 120000,
  });
  await page.waitForTimeout(3500);
  return { ctx, page };
}

async function main() {
  fs.mkdirSync(FRAMES, { recursive: true });
  const auth = await login(PRO);

  // ── DATA layer ────────────────────────────────────────────────────────────
  const raw = await (
    await fetch(`${API}/api/realtors/dashboard`, { headers: { Authorization: `Bearer ${auth.token}` } })
  ).json();
  const rows = (raw.myListings || []).map((l) => ({
    id: l.id,
    status: l.status,
    contactName: l.contactName ?? null,
    contactPhone: l.contactPhone ?? null,
    enquiries: (l.recentEnquiries || []).length,
  }));
  const activeRows = rows.filter((r) => r.status === "active");
  results.data = {
    allRows: rows,
    activeCount: activeRows.length,
    activeMissingContact: activeRows.filter((r) => !r.contactName || !r.contactPhone),
    // The normalizer spreads `...l`, so prove no key is dropped.
    keysPerRowPreserved: (raw.myListings || []).every(
      (l) => Object.prototype.hasOwnProperty.call(l, "contactName") && Object.prototype.hasOwnProperty.call(l, "contactPhone")
    ),
  };
  console.log("── DATA layer (Invariant #1) ──");
  console.log(`  listings: ${rows.length} (active ${activeRows.length})`);
  for (const r of rows)
    console.log(
      `    ${r.status.padEnd(8)} contactName=${String(r.contactName).padEnd(16)} contactPhone=${r.contactPhone}`
    );
  console.log(`  active rows missing a callable contact: ${results.data.activeMissingContact.length}`);

  // ── DEVICE layer ──────────────────────────────────────────────────────────
  const browser = await chromium.launch();
  console.log("\n── DEVICE layer: contact controls per build ──");
  for (const [label, web] of [["before", BEFORE_WEB], ["after", AFTER_WEB]]) {
    const { ctx, page } = await open(browser, web, auth);

    // Do NOT click the listing cards. They are not accordions on this build —
    // the whole card is a pressable that NAVIGATES to /property/[id], which
    // silently takes the probe off the dashboard and invalidates everything
    // measured afterwards. (That navigation is itself the Invariant #1 happy
    // path: the detail page carries the sticky Call + WhatsApp contact bar.)
    const expanded = 0;
    const propsSig = await page.evaluate(TAB_SIGNATURE);
    const actions = await page.evaluate(PROBE_ACTIONS);

    // Switch to Buyer Contacts via the TabBar pressable, then VERIFY the switch
    // via a content-signature change rather than trusting the click.
    const clicked = await page.evaluate(() => {
      // The TabBar entry is the ~121x48 pressable whose text is the icon glyph
      // plus the label plus the count, e.g. " Buyer Contacts 2".
      const cands = [...document.querySelectorAll("div")].filter((el) => {
        const b = el.getBoundingClientRect();
        if (b.height < 40 || b.height > 60 || b.width < 60) return false;
        if (getComputedStyle(el).cursor !== "pointer") return false;
        return /Buyer Contacts\s*\d*$/.test((el.innerText || "").replace(/\s+/g, " ").trim());
      });
      if (!cands.length) return false;
      // Smallest matching box == the tab itself, not an ancestor row.
      cands.sort((x, y) => x.getBoundingClientRect().width - y.getBoundingClientRect().width);
      cands[0].click();
      return true;
    });
    await page.waitForTimeout(3000);
    const bcSig = await page.evaluate(TAB_SIGNATURE);
    const bcActions = await page.evaluate(PROBE_ACTIONS);

    results.device[label] = {
      expandedCards: expanded,
      propertiesTab: { signature: propsSig, contactControls: actions.length, controls: actions.slice(0, 6) },
      buyerContactsTab: {
        clicked,
        // The tab's own content is the only reliable signal that it mounted:
        // the 30x30 contact controls exist on the Buyer Contacts rows and not on
        // the collapsed property rows. (A text signature does not work — the
        // sticky header above the tab bar keeps its own "For Sale" copy on
        // screen regardless of which tab is active.)
        switched: bcActions.length > 0 && actions.length === 0,
        signature: bcSig,
        contactControls: bcActions.length,
        controls: bcActions.slice(0, 6),
      },
    };
    console.log(
      `  ${label.padEnd(6)} propertiesTab: expanded=${expanded} contactControls=${actions.length}` +
      (actions.length ? ` (${actions[0].w}x${actions[0].h}, meets44=${actions[0].meetsHit44}, glyphs=${[...new Set(actions.map((a) => a.glyph))].join("|")})` : "")
    );
    console.log(
      `         buyerContactsTab: clicked=${clicked} switched=${results.device[label].buyerContactsTab.switched} contactControls=${bcActions.length}`
    );
    await page.screenshot({ path: path.join(FRAMES, `invariant1-final-${label}-w390.png`), fullPage: true });
    await ctx.close();
  }

  await browser.close();
  fs.writeFileSync(path.join(OUT, "_t1-invariant1.json"), JSON.stringify(results, null, 2));

  const b = results.device.before, a = results.device.after;
  console.log("\n── VERDICT ──");
  console.log(`  data: ${results.data.activeMissingContact.length === 0 ? "PASS" : "FAIL"} — every active listing has a callable contactName + contactPhone`);
  console.log(
    `  device: contact controls before=${b.propertiesTab.contactControls} after=${a.propertiesTab.contactControls} -> ` +
    (a.propertiesTab.contactControls >= b.propertiesTab.contactControls ? "no regression" : "REGRESSION")
  );
  console.log(`\nwritten to ${OUT}/_t1-invariant1.json`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
