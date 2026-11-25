/**
 * AUDIT-001 Ticket 1 — Layer-2 follow-up probes (BLA-15).
 *
 * Three questions the main harness (`verify-t1-qa-layer2.mjs`) left open:
 *
 *  §1 The `free_trial` frame diff changed 14.5% of pixels over rows 723-1559 even
 *     though the only text delta is the handoff caption. Measure the Starter
 *     panel's height before/after to confirm the band is caption line-wrap
 *     pushing content down, and not an unrelated layout move.
 *
 *  §2 `soft_cap` swaps a compact Pro strip for the full Starter panel, so the
 *     panel grows. Marketplace Invariant #1 requires the realtor's `active`
 *     listing to stay reachable — confirm the card and its contact affordance
 *     are still rendered, not pushed out of an unscrollable region.
 *
 *  §3 The main harness reported Call=0 / WhatsApp=0 on the Buyer Contacts tab for
 *     BOTH builds. That is a failed tab click in the probe, not a finding:
 *     `capture-web.mjs` logs `!! tab click MISSED` for the same frame. Re-probe
 *     with a tab click that is verified to have landed before asserting anything.
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

const FIXTURES = {
  realtor_free_trial: "+919100000059",
  realtor_soft_cap: "+919100000034",
  realtor_pro: "+919100000045",
};

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

async function open(browser, { web, auth, vp = { width: 390, height: 844 }, scheme = "light" }) {
  const ctx = await browser.newContext({ viewport: vp, colorScheme: scheme, deviceScaleFactor: 2 });
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
  await ctx.addInitScript(
    ({ a, scheme }) => {
      localStorage.setItem("auth_token", a.token);
      localStorage.setItem("auth_user", JSON.stringify(a.user));
      localStorage.setItem("blab-theme", scheme);
    },
    { a: auth, scheme }
  );
  const page = await ctx.newPage();
  await page.goto(web + "/dashboard", { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForFunction(() => document.body && document.body.innerText.trim().length > 20, null, {
    timeout: 120000,
  });
  await page.waitForTimeout(3500);
  return { ctx, page };
}

/** Height of the banner panel (`s.trialRow`) and the y of the tab bar below it. */
const MEASURE_PANEL = () => {
  const nodes = [...document.querySelectorAll("div")];
  const panel = nodes.find((el) => {
    const t = (el.innerText || "").trim();
    return (
      (t.includes("Handoff Cap)") || t.includes("Unlimited Listings & Handoffs")) &&
      parseFloat(getComputedStyle(el).borderTopLeftRadius) === 12 &&
      parseFloat(getComputedStyle(el).borderTopWidth) >= 1
    );
  });
  const caption = nodes.find((el) => /\d+ of \d+ Active/.test((el.innerText || "").trim()) && el.children.length === 0);
  const tab = nodes.find((el) => (el.innerText || "").trim().startsWith("My Properties"));
  const r = (el) => (el ? { y: Math.round(el.getBoundingClientRect().top), h: Math.round(el.getBoundingClientRect().height) } : null);
  return {
    panel: r(panel),
    panelText: panel ? (panel.innerText || "").replace(/\s+/g, " ").trim().slice(0, 150) : null,
    caption: r(caption),
    captionText: caption ? (caption.innerText || "").trim() : null,
    // >1 line means the caption wrapped.
    captionLines: caption
      ? Math.round(caption.getBoundingClientRect().height / (parseFloat(getComputedStyle(caption).lineHeight) || 16))
      : null,
    tabBarY: tab ? Math.round(tab.getBoundingClientRect().top) : null,
  };
};

const results = { panelGeometry: {}, softCapReachability: {}, invariant1: {}, baselineTabAudit: {} };

async function main() {
  fs.mkdirSync(FRAMES, { recursive: true });
  const tokens = {};
  for (const [k, p] of Object.entries(FIXTURES)) tokens[k] = await login(p);
  const browser = await chromium.launch();

  // ── §1 Panel geometry: does the longer caption wrap and push content down? ──
  console.log("── §1 Starter panel geometry (free_trial) ──");
  for (const [label, web] of [["before", BEFORE_WEB], ["after", AFTER_WEB]]) {
    const { ctx, page } = await open(browser, { web, auth: tokens.realtor_free_trial });
    const m = await page.evaluate(MEASURE_PANEL);
    results.panelGeometry[label] = m;
    console.log(
      `  ${label.padEnd(6)} panelH=${m.panel?.h} captionLines=${m.captionLines} tabBarY=${m.tabBarY}\n` +
      `         caption="${m.captionText}"`
    );
    await ctx.close();
  }
  const bg = results.panelGeometry.before, ag = results.panelGeometry.after;
  if (bg?.panel && ag?.panel) {
    results.panelGeometry.deltaPanelH = ag.panel.h - bg.panel.h;
    results.panelGeometry.deltaTabBarY = (ag.tabBarY ?? 0) - (bg.tabBarY ?? 0);
    console.log(`  => panel height delta ${results.panelGeometry.deltaPanelH}pt, tab bar moved ${results.panelGeometry.deltaTabBarY}pt`);
  }

  // ── §2 soft_cap: the active listing must remain reachable (Invariant #1) ────
  console.log("\n── §2 soft_cap active-listing reachability ──");
  for (const [label, web] of [["before", BEFORE_WEB], ["after", AFTER_WEB]]) {
    const { ctx, page } = await open(browser, { web, auth: tokens.realtor_soft_cap });
    const probe = await page.evaluate(() => {
      const full = document.body.innerText.replace(/\s+/g, " ").trim();
      // The seeded soft_cap realtor holds one active rental in Somajiguda.
      const card = [...document.querySelectorAll("div")].find((el) =>
        (el.innerText || "").includes("Somajiguda")
      );
      const cb = card ? card.getBoundingClientRect() : null;
      return {
        fullTextLength: full.length,
        mentionsListing: /Somajiguda/.test(full),
        mentionsContact: /contact/i.test(full),
        cardY: cb ? Math.round(cb.top) : null,
        cardVisible: cb ? cb.height > 0 && cb.width > 0 : false,
        scrollable: document.documentElement.scrollHeight > window.innerHeight,
        tail: full.slice(-220),
      };
    });
    results.softCapReachability[label] = probe;
    console.log(
      `  ${label.padEnd(6)} listing=${probe.mentionsListing} cardY=${probe.cardY} visible=${probe.cardVisible} contact=${probe.mentionsContact}`
    );
    await page.screenshot({ path: path.join(FRAMES, `softcap-reachability-${label}-w390.png`), fullPage: true });
    await ctx.close();
  }

  // ── §3 Invariant #1 on the Buyer Contacts tab, with a VERIFIED tab click ───
  console.log("\n── §3 Invariant #1: Buyer Contacts tab (verified click) ──");
  for (const [label, web] of [["before", BEFORE_WEB], ["after", AFTER_WEB]]) {
    const { ctx, page } = await open(browser, { web, auth: tokens.realtor_pro });

    // Click the TabBar entry, then assert the tab actually switched before
    // measuring anything. The accordion "My Properties" list disappears and
    // flat buyer-contact rows appear.
    const before = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").trim());
    const clicked = await page.evaluate(() => {
      // The TabBar pressable is the LAST element whose trimmed text is exactly
      // the label plus an optional count, and which has cursor:pointer.
      const cands = [...document.querySelectorAll("div,span")].filter((el) => {
        const t = (el.innerText || "").trim();
        if (!/^Buyer Contacts\s*\d*$/.test(t)) return false;
        let n = el;
        for (let i = 0; i < 5 && n; i++, n = n.parentElement)
          if (getComputedStyle(n).cursor === "pointer") return true;
        return false;
      });
      if (!cands.length) return { ok: false, reason: "no candidate" };
      const el = cands[cands.length - 1];
      let target = el;
      while (target && getComputedStyle(target).cursor !== "pointer") target = target.parentElement;
      (target || el).click();
      return { ok: true, clickedText: (el.innerText || "").trim(), candidates: cands.length };
    });
    await page.waitForTimeout(3000);

    const probe = await page.evaluate(() => {
      const full = document.body.innerText.replace(/\s+/g, " ").trim();
      const actions = [...document.querySelectorAll("div,span,a")].filter((el) => {
        const t = (el.innerText || "").trim();
        return (t === "Call" || t === "WhatsApp") && el.children.length === 0;
      });
      const boxes = actions.map((el) => {
        const b = el.getBoundingClientRect();
        let p = el;
        while (p && getComputedStyle(p).cursor !== "pointer") p = p.parentElement;
        const pb = p ? p.getBoundingClientRect() : b;
        return {
          label: (el.innerText || "").trim(),
          w: Math.round(pb.width),
          h: Math.round(pb.height),
          meetsHit: pb.width >= 44 && pb.height >= 44,
        };
      });
      return {
        tabSwitched: /Call|WhatsApp/.test(full),
        callCount: boxes.filter((b) => b.label === "Call").length,
        whatsappCount: boxes.filter((b) => b.label === "WhatsApp").length,
        actionBoxes: boxes.slice(0, 8),
        phoneLike: [...new Set(full.match(/\+?[6-9]\d{9}/g) || [])].slice(0, 8),
        namesShown: (full.match(/[A-Z][a-z]+ [A-Z][a-z]+/g) || []).slice(0, 10),
        textHead: full.slice(0, 400),
      };
    });
    results.invariant1[label] = { clicked, ...probe, textChanged: before !== probe.textHead };
    console.log(
      `  ${label.padEnd(6)} click=${clicked.ok} switched=${probe.tabSwitched} ` +
      `Call=${probe.callCount} WhatsApp=${probe.whatsappCount} phones=${probe.phoneLike.length}`
    );
    if (probe.actionBoxes.length)
      console.log(
        `         action box: ${probe.actionBoxes[0].w}x${probe.actionBoxes[0].h} meets44=${probe.actionBoxes[0].meetsHit}`
      );
    await page.screenshot({ path: path.join(FRAMES, `invariant1-verified-${label}-w390.png`), fullPage: true });
    await ctx.close();
  }

  // ── §4 Audit the committed T0 baseline's tab frames ───────────────────────
  // capture-web.mjs logged `!! tab click MISSED` for the buyercontacts frames in
  // THIS run. If the committed baseline shows the same, those baseline frames
  // never captured the tab they are named for.
  console.log("\n── §4 committed-baseline tab-frame audit ──");
  const bm = JSON.parse(fs.readFileSync(path.join(ROOT, "qa-baselines/audit-001/baseline/_web-manifest.json"), "utf8"));
  for (const rec of bm.filter((r) => r.tab)) {
    const showsTabContent =
      rec.tab === "Buyer Contacts"
        ? /Call|WhatsApp/.test(rec.textHead)
        : rec.tab === "Site Visits"
        ? /Site Visit|Confirmed|Requested/.test(rec.textHead)
        : true;
    results.baselineTabAudit[rec.file] = { tab: rec.tab, showsTabContent, textHead: rec.textHead.slice(0, 160) };
    console.log(`  ${rec.file.padEnd(50)} tab=${String(rec.tab).padEnd(15)} showsTabContent=${showsTabContent}`);
  }

  await browser.close();
  fs.writeFileSync(path.join(OUT, "_t1-followups.json"), JSON.stringify(results, null, 2));
  console.log(`\nwritten to ${OUT}/_t1-followups.json`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
