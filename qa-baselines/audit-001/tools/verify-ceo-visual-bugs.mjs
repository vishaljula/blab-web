/**
 * AUDIT-001 — CEO visual-bug sweep (wake comment on BLA-6, 2026-11-26).
 *
 * Three defects the CEO called out from the T3 Layer-2 frames, all measured here from
 * live rendered geometry rather than asserted from source:
 *
 *   V1  Profile — the RERA field (`TSRERA/AGT/00045`) overflows the partner card's
 *       content box on a 360pt device. On web a `TextInput` is an `<input>`, whose
 *       `min-width: auto` resolves to its intrinsic ~20-character width, so two
 *       `flex: 1` inputs cannot shrink below ~400px inside a ~306px card.
 *       Asserted: no field extends past the card's content box, the page gains no
 *       horizontal overflow, and at 1440pt the two fields still share one row.
 *
 *   V2  Dashboard — the segmented tab labels ellipsise to `My Prope…` / `Buyer Cont…`
 *       at DEFAULT type size. Asserted: no tab label is ellipsised at 320/360/390,
 *       and every tab still exposes its full accessible name.
 *
 *   V3  Router tab bar (BLA-19) — each of the four tabs measured 97.5x43 (one point
 *       under the WCAG 2.2 §2.5.8 / HIG 44pt floor) and the labels rendered in a 5px
 *       box against a 12px scrollHeight. Asserted: every tab is >= 44x44 and no label
 *       is vertically clipped.
 *
 * Usage: node qa-baselines/audit-001/tools/verify-ceo-visual-bugs.mjs [--json]
 */
import { createRequire } from "module";
import fs from "fs";
import path from "path";

const ROOT = "/Users/adi/Projects/blab-web-agents";
const require = createRequire(ROOT + "/package.json");
const { chromium } = require("playwright");

const WEB = process.env.QA_WEB || "http://localhost:8081";
const API = process.env.QA_API || "http://localhost:3000";
const OUT = process.env.QA_OUT
  ? path.resolve(process.env.QA_OUT)
  : path.join(ROOT, "qa-baselines/audit-001/ceo-visual-bugs");

const env = fs.readFileSync(ROOT + "/.env.local", "utf8");
const envGet = (k) =>
  (env.match(new RegExp("^" + k + "=(.*)$", "m")) || [])[1]?.trim().replace(/^["']|["']$/g, "");
if (envGet("BLAB_ENV") === "production") {
  console.error("REFUSING: BLAB_ENV === 'production' (Marketplace Invariant #5)");
  process.exit(2);
}

/** realtor_pro — Harish Sharma. The fixture whose RERA id is in the CEO's screenshot. */
const FIXTURE = "+919100000045";
const PHONE_WIDTHS = [320, 360, 390];
const ALL_WIDTHS = [...PHONE_WIDTHS, 1440];

async function login(phone) {
  const r = await fetch(`${API}/api/mobile-auth/verify-otp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, code: "123456" }),
  });
  const j = await r.json();
  if (!j.success) throw new Error(`login failed ${phone}: ${JSON.stringify(j).slice(0, 200)}`);
  return { token: j.token, user: j.user };
}

// ── V1 probe: the Profile partner card (RERA + agency fields) ────────────────
const PROBE_FIELDS = () => {
  const inputs = [...document.querySelectorAll("input")].filter((el) => {
    const a = el.getAttribute("aria-label") || "";
    return /agency or builder name/i.test(a) || /RERA registration ID/i.test(a);
  });
  if (inputs.length < 2) return { found: false, inputCount: inputs.length };

  // The partner card is the nearest ancestor that holds both fields and paints a border.
  let card = inputs[0].parentElement;
  while (card && !(card.contains(inputs[1]) && parseFloat(getComputedStyle(card).borderTopWidth) > 0))
    card = card.parentElement;
  if (!card) return { found: false, inputCount: inputs.length, reason: "card not found" };

  const ccs = getComputedStyle(card);
  const cr = card.getBoundingClientRect();
  const contentLeft = cr.left + (parseFloat(ccs.borderLeftWidth) || 0) + (parseFloat(ccs.paddingLeft) || 0);
  const contentRight = cr.left + (parseFloat(ccs.borderLeftWidth) || 0) + card.clientWidth - (parseFloat(ccs.paddingRight) || 0);

  const fields = inputs.map((el) => {
    const r = el.getBoundingClientRect();
    return {
      ariaLabel: (el.getAttribute("aria-label") || "").slice(0, 50),
      value: (el.value || "").slice(0, 30),
      box: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
      overflowRightPx: Math.round((r.right - contentRight) * 10) / 10,
      overflowLeftPx: Math.round((contentLeft - r.left) * 10) / 10,
      minWidth: getComputedStyle(el).minWidth,
    };
  });

  // Same row? (regression guard: the desktop side-by-side layout must survive)
  const [a, b] = fields;
  const sameRow = Math.abs((a.box[1] + a.box[3] / 2) - (b.box[1] + b.box[3] / 2)) <= Math.max(a.box[3], b.box[3]) / 2;

  return {
    found: true,
    cardBox: [Math.round(cr.x), Math.round(cr.y), Math.round(cr.width), Math.round(cr.height)],
    contentWidth: Math.round((contentRight - contentLeft) * 10) / 10,
    fields,
    sameRow,
    docOverflowPx: Math.round((document.documentElement.scrollWidth - window.innerWidth) * 10) / 10,
  };
};

// ── V2 probe: the Dashboard segmented tab bar ────────────────────────────────
const PROBE_DASH_TABS = () => {
  const tabs = [...document.querySelectorAll('[role="tab"]')].filter((el) => {
    const a = el.getAttribute("aria-label") || "";
    return /^(My Properties|Site Visits|Buyer Contacts),/.test(a);
  });
  if (tabs.length !== 3) return { found: false, tabCount: tabs.length };

  const out = tabs.map((tab) => {
    const r = tab.getBoundingClientRect();
    // The label is the text leaf that is neither the numeric badge nor the icon.
    //
    // The icon exclusion matters: `Ionicons` renders as a text node holding a single
    // Unicode private-use glyph, and it is the FIRST text leaf in the tab. An earlier
    // revision of this probe took `leaves.find(not-all-digits)`, which selected that
    // glyph node — so V2b measured the 13px icon for ellipsis and V2d reported the
    // icon's 13px font as if it were the label's. Both passed without ever testing the
    // label the CEO actually called out. Private-use text leaves are dropped here.
    const GLYPH_ONLY = /^[\uE000-\uF8FF\s]+$/;
    const leaves = [...tab.querySelectorAll("div,span")].filter((el) => {
      const t = (el.innerText || "").trim();
      return t.length > 0 && !GLYPH_ONLY.test(t)
        && ![...el.children].some((k) => (k.innerText || "").trim().length > 0);
    });
    const label = leaves.find((el) => !/^\d+$/.test((el.innerText || "").trim()));
    const lr = label ? label.getBoundingClientRect() : null;
    const lcs = label ? getComputedStyle(label) : null;
    return {
      ariaLabel: (tab.getAttribute("aria-label") || "").slice(0, 60),
      tabBox: [Math.round(r.width), Math.round(r.height)],
      labelText: label ? (label.innerText || "").trim() : null,
      labelBox: lr ? [Math.round(lr.width), Math.round(lr.height)] : null,
      // react-native-web renders numberOfLines={1} as -webkit-line-clamp: 1, so an
      // ellipsis shows up as scrollWidth exceeding clientWidth on the text node.
      scrollWidth: label ? label.scrollWidth : null,
      clientWidth: label ? label.clientWidth : null,
      truncatedPx: label ? Math.max(0, label.scrollWidth - label.clientWidth) : null,
      fontSizePx: lcs ? Math.round(parseFloat(lcs.fontSize) * 10) / 10 : null,
      overflowsTab: lr ? Math.round(Math.max(0, lr.right - (r.right - (parseFloat(getComputedStyle(tab).paddingRight) || 0))) * 10) / 10 : null,
    };
  });
  return { found: true, tabs: out };
};

// ── V3 probe: the Expo Router bottom tab bar ─────────────────────────────────
const PROBE_ROUTER_TABS = () => {
  // Expo Router renders each bottom tab as <a role="tab">. Its innerText also carries the
  // Ionicons private-use glyph, so match on `includes`, not equality. The Dashboard's own
  // segmented tabs are <div role="tab"> with a "<label>, N items" aria-label — excluded
  // by the tag check.
  const items = [...document.querySelectorAll('a[role="tab"]')].filter((el) =>
    /(Explore|Post|Dashboard|Profile)/.test(el.innerText || ""));
  if (items.length < 2) return { found: false, itemCount: items.length };
  const out = items.map((el) => {
    const r = el.getBoundingClientRect();
    // Same icon-glyph exclusion as PROBE_DASH_TABS — the label must be real text, not
    // the Ionicons private-use codepoint.
    const GLYPH_ONLY = /^[\uE000-\uF8FF\s]+$/;
    const leaves = [...el.querySelectorAll("div,span")].filter((n) => {
      const t = (n.innerText || "").trim();
      return t.length > 0 && !GLYPH_ONLY.test(t)
        && ![...n.children].some((k) => (k.innerText || "").trim().length > 0);
    });
    const label = leaves[leaves.length - 1] || null;
    const lcs = label ? getComputedStyle(label) : null;
    return {
      text: label ? (label.innerText || "").trim() : (el.innerText || "").trim(),
      box: [Math.round(r.width * 10) / 10, Math.round(r.height * 10) / 10],
      labelClientHeight: label ? label.clientHeight : null,
      labelScrollHeight: label ? label.scrollHeight : null,
      clippedPx: label ? Math.max(0, label.scrollHeight - label.clientHeight) : null,
      fontSizePx: lcs ? Math.round(parseFloat(lcs.fontSize) * 10) / 10 : null,
      lineHeight: lcs ? lcs.lineHeight : null,
    };
  });
  return { found: true, items: out };
};

/**
 * The bottom bar is a navigator chrome element that mounts after the screen's own
 * content, so probing it immediately after the screen's data-ready signal raced it and
 * measured zero tabs. Waiting on the bar itself makes V3 deterministic; a timeout here
 * surfaces as a V3a FAIL rather than a silently empty measurement set.
 */
async function waitForRouterBar(page) {
  await page.waitForFunction(
    () => [...document.querySelectorAll('a[role="tab"]')]
      .filter((el) => /(Explore|Post|Dashboard|Profile)/.test(el.innerText || "")).length >= 2,
    null, { timeout: 60000 },
  ).catch(() => {});
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const auth = await login(FIXTURE);
  const browser = await chromium.launch();
  const profileM = [], dashM = [], routerM = [];

  for (const width of ALL_WIDTHS) {
    const ctx = await browser.newContext({
      viewport: { width, height: width >= 1440 ? 900 : 800 },
      colorScheme: "light",
      deviceScaleFactor: 1,
    });
    await ctx.addInitScript((a) => {
      try {
        localStorage.setItem("auth_token", a.token);
        localStorage.setItem("auth_user", JSON.stringify(a.user));
        localStorage.setItem("blab-theme", "light");
      } catch {}
    }, auth);

    // ── Profile (V1) + router tab bar (V3, phone widths only — hidden >= 768) ──
    {
      const page = await ctx.newPage();
      await page.goto(WEB + "/profile", { waitUntil: "domcontentloaded", timeout: 180000 });
      await page.waitForFunction(
        () => !!document.querySelector('input[aria-label*="RERA registration ID" i]'),
        null, { timeout: 180000 },
      );
      await page.waitForTimeout(1200);
      profileM.push({ width, ...(await page.evaluate(PROBE_FIELDS)) });
      if (PHONE_WIDTHS.includes(width)) {
        await waitForRouterBar(page);
        routerM.push({ width, route: "/profile", ...(await page.evaluate(PROBE_ROUTER_TABS)) });
      }
      await page.screenshot({ path: path.join(OUT, `after-profile-rera-w${width}.png`) });
      await page.close();
    }

    // ── Dashboard segmented tabs (V2) ──
    {
      const page = await ctx.newPage();
      await page.goto(WEB + "/dashboard", { waitUntil: "domcontentloaded", timeout: 180000 });
      await page.waitForFunction(
        () => [...document.querySelectorAll('[role="tab"]')].some((el) =>
          /^Buyer Contacts,/.test(el.getAttribute("aria-label") || "")),
        null, { timeout: 180000 },
      );
      await page.waitForTimeout(1200);
      dashM.push({ width, ...(await page.evaluate(PROBE_DASH_TABS)) });
      if (PHONE_WIDTHS.includes(width)) {
        await waitForRouterBar(page);
        routerM.push({ width, route: "/dashboard", ...(await page.evaluate(PROBE_ROUTER_TABS)) });
      }
      await page.screenshot({ path: path.join(OUT, `after-dashboard-tabs-w${width}.png`) });
      await page.close();
    }
    await ctx.close();
  }
  await browser.close();

  const TOL = 0.5;
  const checks = [];
  const push = (id, pass, detail) => checks.push({ id, verdict: pass ? "PASS" : "FAIL", detail });

  // ── V1 ──
  const pFound = profileM.filter((m) => m.found);
  push("V1a_profile_fields_rendered", pFound.length === profileM.length,
    pFound.length === profileM.length ? `both fields measured at ${profileM.length} widths`
      : `not found at ${profileM.filter((m) => !m.found).map((m) => "w" + m.width).join(", ")}`);

  const fieldOver = pFound.flatMap((m) => m.fields
    .filter((f) => Math.max(f.overflowRightPx, f.overflowLeftPx) > TOL)
    .map((f) => `w${m.width}: ${f.ariaLabel} +${Math.max(f.overflowRightPx, f.overflowLeftPx)}px`));
  push("V1b_fields_within_card_content_box", fieldOver.length === 0,
    fieldOver.length ? fieldOver.join(" | ") : "no field extends past the partner card's content box");

  const pScroll = pFound.filter((m) => m.docOverflowPx > 1);
  push("V1c_no_horizontal_page_overflow", pScroll.length === 0,
    pScroll.length ? pScroll.map((m) => `w${m.width}: +${m.docOverflowPx}px`).join(" | ")
                   : "Profile never exceeds the viewport width");

  const desktop = pFound.find((m) => m.width === 1440);
  push("V1d_desktop_row_preserved", !!desktop?.sameRow,
    desktop ? `1440pt: fields ${desktop.sameRow ? "share one row (intended design intact)" : "stacked — desktop layout regressed"}`
            : "1440pt not measured");

  // ── V2 ──
  const dFound = dashM.filter((m) => m.found);
  push("V2a_dashboard_tabs_rendered", dFound.length === dashM.length,
    dFound.length === dashM.length ? `3 tabs measured at ${dashM.length} widths`
      : `tab bar not found at ${dashM.filter((m) => !m.found).map((m) => "w" + m.width).join(", ")}`);

  // Resolve-gate, before any label assertion: a probe that fails to find the label leaf
  // reports `null` metrics, and `(t.truncatedPx ?? 0) > 1` reads null as "not truncated".
  // Every label-based check below would then pass by measuring nothing. Fail here first.
  const noLabel = dFound.flatMap((m) => m.tabs.filter((t) => !t.labelText || t.fontSizePx == null)
    .map((t) => `w${m.width}: "${t.ariaLabel}" -> labelText=${JSON.stringify(t.labelText)} font=${t.fontSizePx}`));
  push("V2a2_label_leaf_resolved", noLabel.length === 0,
    noLabel.length ? noLabel.join(" | ") : "the text label leaf resolved for every tab at every width");

  const trunc = dFound.flatMap((m) => m.tabs.filter((t) => (t.truncatedPx ?? 0) > 1)
    .map((t) => `w${m.width}: "${t.labelText}" clipped ${t.truncatedPx}px (${t.clientWidth}/${t.scrollWidth})`));
  push("V2b_no_tab_label_truncated", trunc.length === 0,
    trunc.length ? trunc.join(" | ") : "no segmented tab label is ellipsised at any width");

  const names = dFound.flatMap((m) => m.tabs.filter((t) => !/^(My Properties|Site Visits|Buyer Contacts),/.test(t.ariaLabel))
    .map((t) => `w${m.width}: "${t.ariaLabel}"`));
  push("V2c_full_accessible_names_kept", names.length === 0,
    names.length ? names.join(" | ") : "every tab still announces its full name + count");

  const floorFails = dFound.flatMap((m) => m.tabs.filter((t) => (t.fontSizePx ?? 0) < 11)
    .map((t) => `w${m.width}: "${t.labelText}" ${t.fontSizePx}px`));
  push("V2d_label_font_at_or_above_11px", floorFails.length === 0,
    floorFails.length ? floorFails.join(" | ") : "every segmented tab label is >= the 11px §F3 floor");

  // ── V3 ──
  const rFound = routerM.filter((m) => m.found);
  push("V3a_router_tabs_rendered", rFound.length === routerM.length,
    rFound.length === routerM.length ? `router tab bar measured ${routerM.length} times`
      : `not found at ${routerM.filter((m) => !m.found).map((m) => `w${m.width}${m.route}`).join(", ")}`);

  // rFound-derived checks are gated on rFound being non-empty so a probe that finds
  // nothing fails loudly instead of passing over an empty list.
  const small = rFound.flatMap((m) => m.items.filter((i) => i.box[0] < 44 - TOL || i.box[1] < 44 - TOL)
    .map((i) => `w${m.width}${m.route}: "${i.text}" ${i.box[0]}x${i.box[1]}`));
  push("V3b_router_tabs_44pt", rFound.length > 0 && small.length === 0,
    small.length ? small.join(" | ") : "every router tab meets the 44x44 WCAG 2.2 §2.5.8 floor");

  // Same resolve-gate as V2a2, for the router bar.
  const rNoLabel = rFound.flatMap((m) => m.items.filter((i) => i.labelClientHeight == null || i.fontSizePx == null)
    .map((i) => `w${m.width}${m.route}: "${i.text}" labelClientHeight=${i.labelClientHeight} font=${i.fontSizePx}`));
  push("V3a2_router_label_leaf_resolved", rFound.length > 0 && rNoLabel.length === 0,
    rNoLabel.length ? rNoLabel.join(" | ") : "the text label leaf resolved for every router tab");

  const clipped = rFound.flatMap((m) => m.items.filter((i) => (i.clippedPx ?? 0) > 1)
    .map((i) => `w${m.width}${m.route}: "${i.text}" clipped ${i.clippedPx}px (${i.labelClientHeight}/${i.labelScrollHeight})`));
  push("V3c_router_labels_not_clipped", rFound.length > 0 && clipped.length === 0,
    clipped.length ? clipped.join(" | ") : "no router tab label is vertically clipped at DEFAULT type size");

  const rFloor = rFound.flatMap((m) => m.items.filter((i) => (i.fontSizePx ?? 0) < 11)
    .map((i) => `w${m.width}${m.route}: "${i.text}" ${i.fontSizePx}px`));
  push("V3d_router_label_font_at_or_above_11px", rFound.length > 0 && rFloor.length === 0,
    rFloor.length ? rFloor.join(" | ") : "every router tab label is >= the 11px §F3 floor");

  const verdict = checks.every((c) => c.verdict === "PASS") ? "ALL_PASS" : "FAIL";
  const report = {
    source: "CEO wake comment on BLA-6 (2026-11-26) — visual bugs in the T3 Layer-2 frames",
    web: WEB, widths: ALL_WIDTHS, verdict, checks,
    measurements: { profile: profileM, dashboardTabs: dashM, routerTabs: routerM },
  };
  fs.writeFileSync(path.join(OUT, "ceo-visual-bugs.json"), JSON.stringify(report, null, 2));

  for (const c of checks) console.log(`${c.id.padEnd(38)} ${c.verdict}  ${c.detail}`);
  console.log(`\n${verdict}  (raw: ${path.join(OUT, "ceo-visual-bugs.json")})`);
  if (process.argv.includes("--json")) console.log(JSON.stringify(report.measurements, null, 2));
  process.exit(verdict === "ALL_PASS" ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(2); });
