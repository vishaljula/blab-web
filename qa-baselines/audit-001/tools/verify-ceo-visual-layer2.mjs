/**
 * AUDIT-001 / BLA-25 — Layer-2 (independent QA) for the CEO visual-bug sweep @ 0cdada0.
 *
 * Layer-1 (`verify-ceo-visual-bugs.mjs`) asserts the three fixes at DEFAULT type size only.
 * This tool covers the five gaps BLA-25 names, and is deliberately written to REPORT the
 * breaking point rather than to pass:
 *
 *   L1  Dynamic Type sweep — L(default) / xxxLarge / AX3 / AX5-max on all three surfaces
 *       at 320/360/390 (+1440 for Profile). The tab-label fix trades width for a shorter
 *       word and the router-bar fix is a fixed 68pt height budget, so both have a scaling
 *       ceiling Layer-1 never measured. Each scale is also measured against a DOM mutated
 *       back to the PRE-rename label text, so the verdict is "did the fix raise or lower
 *       the ceiling", not just "does it break somewhere".
 *
 *   L2  The icon removal is a visual delta. Asserts the 3-item segmented control still
 *       reads as a tab bar in BOTH schemes: exactly one `aria-selected="true"`, a >=2px
 *       active underline in the primary colour, and active/inactive label colours that
 *       still differ after grayscale (state is not carried by hue alone).
 *
 *   L3  Accessible names survived — from Chromium's real AX tree (not the DOM attribute):
 *       every dashboard tab must compute to "<full label>, N items" and every router tab
 *       to its title.
 *
 *   L4  Harness fallback correctness. The same commit rewrote the tab locator in seven
 *       tools to prefer the accessible name. Each locator is replayed here against four
 *       DOM shapes — post-rename, pre-rename, and each with `aria-label` stripped to force
 *       the legacy branch — to prove the rewrite is ADDITIVE and that neither branch can
 *       resolve-to-nothing and be read as a pass.
 *
 *   L5  The iOS `insets.bottom > 0` branch is unchanged by design. Rather than assert that
 *       from source, the label's REQUIRED line box is measured at every scale and checked
 *       against both branches' computed content budget, so the untouched branch is covered
 *       by the same measurement.
 *
 * Usage: node qa-baselines/audit-001/tools/verify-ceo-visual-layer2.mjs [--json]
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
  : path.join(ROOT, "qa-baselines/audit-001/t5-ceo-visual-layer2");

const env = fs.readFileSync(ROOT + "/.env.local", "utf8");
const envGet = (k) =>
  (env.match(new RegExp("^" + k + "=(.*)$", "m")) || [])[1]?.trim().replace(/^["']|["']$/g, "");
if (envGet("BLAB_ENV") === "production") {
  console.error("REFUSING: BLAB_ENV === 'production' (Marketplace Invariant #5)");
  process.exit(2);
}

/** realtor_pro — Harish Sharma, the fixture in the CEO's screenshot. */
const FIXTURE = "+919100000045";
const PHONE_WIDTHS = [320, 360, 390];
/** iOS Dynamic Type body multipliers: Large(default)=17pt, xxxLarge=23pt, AX3=40pt, AX5=53pt. */
const SCALES = [
  { k: 1.0, name: "L-default" },
  { k: 23 / 17, name: "xxxLarge" },
  { k: 40 / 17, name: "AX3" },
  { k: 53 / 17, name: "AX5-max" },
];
const TOL = 0.5;
const FULL_LABELS = ["My Properties", "Site Visits", "Buyer Contacts"];
const SHORT_LABELS = { "My Properties": "Properties", "Site Visits": "Visits", "Buyer Contacts": "Contacts" };

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

// ── shared page helpers ──────────────────────────────────────────────────────

/** Same uniform font-scale emulation T3 established (verify-t3-qa.mjs §3). */
const APPLY_SCALE = (k) => {
  const all = [...document.querySelectorAll("*")];
  const read = all.map((el) => {
    const cs = getComputedStyle(el);
    return { el, fs: parseFloat(cs.fontSize), lh: cs.lineHeight };
  });
  for (const { el, fs, lh } of read) {
    if (!fs) continue;
    el.style.fontSize = fs * k + "px";
    const lhPx = parseFloat(lh);
    if (!Number.isNaN(lhPx)) el.style.lineHeight = lhPx * k + "px";
  }
  return read.length;
};

const GLYPH_SRC = `/^[\\uE000-\\uF8FF\\s]+$/`;

/** Text leaves of an element, excluding Ionicons private-use glyph nodes. */
const LEAF_FN = `(root) => {
  const GLYPH_ONLY = ${GLYPH_SRC};
  return [...root.querySelectorAll("div,span")].filter((el) => {
    const t = (el.innerText || "").trim();
    return t.length > 0 && !GLYPH_ONLY.test(t)
      && ![...el.children].some((k) => (k.innerText || "").trim().length > 0);
  });
}`;

/**
 * Dashboard segmented tabs: geometry, truncation, state affordances.
 *
 * Probes are string IIFEs rather than functions so `page.evaluate` gets a plain
 * expression — the leaf helper is shared by interpolation and nothing depends on
 * Playwright's function serialisation.
 */
const PROBE_DASH = `(() => {
  const leavesOf = ${LEAF_FN};
  const tabs = [...document.querySelectorAll('[role="tab"]')].filter((el) =>
    /^(My Properties|Site Visits|Buyer Contacts),/.test(el.getAttribute("aria-label") || ""));
  if (tabs.length !== 3) return { found: false, tabCount: tabs.length };
  const list = tabs[0].closest('[role="tablist"]');
  const out = tabs.map((tab) => {
    const r = tab.getBoundingClientRect();
    const tcs = getComputedStyle(tab);
    const leaves = leavesOf(tab);
    const label = leaves.find((el) => !/^\\d+$/.test((el.innerText || "").trim()));
    const lr = label ? label.getBoundingClientRect() : null;
    const lcs = label ? getComputedStyle(label) : null;
    const badge = leaves.find((el) => /^\\d+$/.test((el.innerText || "").trim()));
    return {
      ariaLabel: (tab.getAttribute("aria-label") || "").slice(0, 60),
      ariaSelected: tab.getAttribute("aria-selected"),
      tabBox: [Math.round(r.width * 10) / 10, Math.round(r.height * 10) / 10],
      underlinePx: Math.round((parseFloat(tcs.borderBottomWidth) || 0) * 10) / 10,
      underlineColor: tcs.borderBottomColor,
      labelText: label ? (label.innerText || "").trim() : null,
      labelColor: lcs ? lcs.color : null,
      labelFontWeight: lcs ? lcs.fontWeight : null,
      labelBox: lr ? [Math.round(lr.width * 10) / 10, Math.round(lr.height * 10) / 10] : null,
      scrollWidth: label ? label.scrollWidth : null,
      clientWidth: label ? label.clientWidth : null,
      truncatedPx: label ? Math.max(0, label.scrollWidth - label.clientWidth) : null,
      labelScrollHeight: label ? label.scrollHeight : null,
      labelClientHeight: label ? label.clientHeight : null,
      vClippedPx: label ? Math.max(0, label.scrollHeight - label.clientHeight) : null,
      fontSizePx: lcs ? Math.round(parseFloat(lcs.fontSize) * 10) / 10 : null,
      hasIconGlyph: [...tab.querySelectorAll("div,span")].some((el) =>
        ${GLYPH_SRC}.test((el.innerText || "").trim()) && (el.innerText || "").trim().length > 0),
      badgeText: badge ? (badge.innerText || "").trim() : null,
      badgeTruncPx: badge ? Math.max(0, badge.scrollWidth - badge.clientWidth) : null,
      overflowsTabPx: lr ? Math.round(Math.max(0, lr.right - (r.right - (parseFloat(tcs.paddingRight) || 0))) * 10) / 10 : null,
    };
  });
  const lb = list ? list.getBoundingClientRect() : null;
  return {
    found: true,
    tabs: out,
    tablistBox: lb ? [Math.round(lb.width * 10) / 10, Math.round(lb.height * 10) / 10] : null,
    // A wrapped/overflowing tablist is as much a defect as a clipped label.
    tablistOverflowPx: list ? Math.max(0, list.scrollWidth - list.clientWidth) : null,
    selectedCount: out.filter((t) => t.ariaSelected === "true").length,
    docOverflowPx: Math.round((document.documentElement.scrollWidth - window.innerWidth) * 10) / 10,
  };
})()`;

/** Expo Router bottom tab bar: geometry + label line box + the bar's height budget. */
const PROBE_ROUTER = `(() => {
  const leavesOf = ${LEAF_FN};
  const items = [...document.querySelectorAll('a[role="tab"]')].filter((el) =>
    /(Explore|Post|Dashboard|Profile)/.test(el.innerText || ""));
  if (items.length < 2) return { found: false, itemCount: items.length };
  // The bar is the nearest common ancestor that paints the top border.
  let bar = items[0].parentElement;
  while (bar && !(bar.contains(items[items.length - 1]) && (parseFloat(getComputedStyle(bar).borderTopWidth) || 0) > 0))
    bar = bar.parentElement;
  const bcs = bar ? getComputedStyle(bar) : null;
  const br = bar ? bar.getBoundingClientRect() : null;
  const out = items.map((el) => {
    const r = el.getBoundingClientRect();
    const ecs = getComputedStyle(el);
    const leaves = leavesOf(el);
    const label = leaves[leaves.length - 1] || null;
    const lcs = label ? getComputedStyle(label) : null;
    const lr = label ? label.getBoundingClientRect() : null;
    return {
      text: label ? (label.innerText || "").trim() : (el.innerText || "").trim(),
      box: [Math.round(r.width * 10) / 10, Math.round(r.height * 10) / 10],
      labelClientHeight: label ? label.clientHeight : null,
      labelScrollHeight: label ? label.scrollHeight : null,
      clippedPx: label ? Math.max(0, label.scrollHeight - label.clientHeight) : null,
      hTruncPx: label ? Math.max(0, label.scrollWidth - label.clientWidth) : null,
      fontSizePx: lcs ? Math.round(parseFloat(lcs.fontSize) * 10) / 10 : null,
      lineHeightPx: lcs ? Math.round((parseFloat(lcs.lineHeight) || 0) * 10) / 10 : null,
      // L5: what the label actually needs vs what the bar's content box offers.
      labelNeedsPx: label ? Math.round(label.scrollHeight * 10) / 10 : null,
      // Does the item's painted box escape the bar?
      escapesBarPx: br ? Math.round(Math.max(0, r.bottom - br.bottom) * 10) / 10 : null,
      itemMinHeight: ecs.minHeight,
    };
  });
  return {
    found: true,
    items: out,
    barBox: br ? [Math.round(br.width * 10) / 10, Math.round(br.height * 10) / 10] : null,
    barPaddingTopPx: bcs ? Math.round((parseFloat(bcs.paddingTop) || 0) * 10) / 10 : null,
    barPaddingBottomPx: bcs ? Math.round((parseFloat(bcs.paddingBottom) || 0) * 10) / 10 : null,
    barBorderTopPx: bcs ? Math.round((parseFloat(bcs.borderTopWidth) || 0) * 10) / 10 : null,
    // The no-inset branch is 'height: 68'; the untouched iOS branch is '56 + inset' with
    // 'inset/2' bottom padding. Both content budgets are derived from the live bar's own
    // border + padding so L5 measures the same geometry the device branch would produce.
    contentBudgetNoInsetPx: bcs
      ? 68 - (parseFloat(bcs.borderTopWidth) || 0) - (parseFloat(bcs.paddingTop) || 0) - 8
      : null,
    contentBudgetInset34Px: bcs
      ? (56 + 34) - (parseFloat(bcs.borderTopWidth) || 0) - (parseFloat(bcs.paddingTop) || 0) - 17
      : null,
    barOverflowPx: bar ? Math.max(0, bar.scrollHeight - bar.clientHeight) : null,
    barCssHeightPx: bcs ? bcs.height : null,
  };
})()`;

/** Profile partner-card fields — same contract Layer-1 V1 asserts, re-measured under scale. */
const PROBE_FIELDS = () => {
  const inputs = [...document.querySelectorAll("input")].filter((el) => {
    const a = el.getAttribute("aria-label") || "";
    return /agency or builder name/i.test(a) || /RERA registration ID/i.test(a);
  });
  if (inputs.length < 2) return { found: false, inputCount: inputs.length };
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
    const cs = getComputedStyle(el);
    return {
      ariaLabel: (el.getAttribute("aria-label") || "").slice(0, 50),
      value: (el.value || "").slice(0, 30),
      box: [Math.round(r.x), Math.round(r.y), Math.round(r.width * 10) / 10, Math.round(r.height * 10) / 10],
      overflowRightPx: Math.round((r.right - contentRight) * 10) / 10,
      overflowLeftPx: Math.round((contentLeft - r.left) * 10) / 10,
      minWidth: cs.minWidth,
      fontSizePx: Math.round(parseFloat(cs.fontSize) * 10) / 10,
      // The field's own text must not be clipped either — an <input> scrolls rather
      // than ellipsises, so a value wider than the box is still a legibility defect.
      valueTruncPx: Math.max(0, el.scrollWidth - el.clientWidth),
    };
  });
  const [a, b] = fields;
  const sameRow = Math.abs((a.box[1] + a.box[3] / 2) - (b.box[1] + b.box[3] / 2)) <= Math.max(a.box[3], b.box[3]) / 2;
  return {
    found: true,
    cardBox: [Math.round(cr.x), Math.round(cr.y), Math.round(cr.width * 10) / 10, Math.round(cr.height * 10) / 10],
    contentWidth: Math.round((contentRight - contentLeft) * 10) / 10,
    fields,
    sameRow,
    docOverflowPx: Math.round((document.documentElement.scrollWidth - window.innerWidth) * 10) / 10,
  };
};

/**
 * L1 before/after: rewrite the rendered label back to the PRE-rename full text (and
 * re-insert a 13px icon glyph box) so the same scale can be measured on both builds.
 * Only the rendered text node is touched; `aria-label` is already the full label on both
 * commits, so the AX contract is identical and is not disturbed here.
 */
const MUTATE_TO_PRERENAME = (map) => {
  const GLYPH_ONLY = /^[-\s]+$/;
  const tabs = [...document.querySelectorAll('[role="tab"]')].filter((el) =>
    /^(My Properties|Site Visits|Buyer Contacts),/.test(el.getAttribute("aria-label") || ""));
  let n = 0;
  for (const tab of tabs) {
    const full = (tab.getAttribute("aria-label") || "").split(",")[0];
    const leaves = [...tab.querySelectorAll("div,span")].filter((el) => {
      const t = (el.innerText || "").trim();
      return t.length > 0 && !GLYPH_ONLY.test(t)
        && ![...el.children].some((k) => (k.innerText || "").trim().length > 0);
    });
    const label = leaves.find((el) => !/^\d+$/.test((el.innerText || "").trim()));
    if (!label) continue;
    label.textContent = full;
    // Re-create the dropped 13px leading icon: a fixed 13x13 box + the 4pt row gap.
    if (!tab.querySelector("[data-prerename-icon]")) {
      const ico = document.createElement("div");
      ico.setAttribute("data-prerename-icon", "1");
      ico.style.cssText = "width:13px;height:13px;flex-shrink:0;margin-right:4px";
      tab.insertBefore(ico, tab.firstChild);
    }
    n++;
  }
  return n;
};

// ── L4: the seven rewritten locators, replayed verbatim ──────────────────────
//
// Each entry is the locator as it exists at 0cdada0, split into its `aria` branch and
// its legacy `text` branch, so each branch can be resolved independently. They are
// transcribed rather than imported because the tools inline them inside page.evaluate.
const LOCATORS = {
  // capture-web.mjs, verify-bla14-320pt-actions.mjs, verify-bla14-nested-cta.mjs
  aria_startsWith: `(label) => !![...document.querySelectorAll('[role="tab"]')]
      .find((el) => (el.getAttribute("aria-label") || "").startsWith(label))`,
  // Transcribed faithfully, INCLUDING the cursor:pointer disambiguation — without it
  // this branch also matches the KPI stat tiles, which carry the same literal text, and
  // the replay would overstate how well the fallback resolves.
  legacy_text_prefix: `(label) => {
      const hit = [...document.querySelectorAll("div,span")].filter((el) => {
        const t = (el.innerText || "").trim();
        if (!t.startsWith(label) || t.length > label.length + 4) return false;
        let n = el;
        for (let i = 0; i < 4 && n; i++, n = n.parentElement) {
          if (getComputedStyle(n).cursor === "pointer") return true;
        }
        return false;
      });
      return hit.length > 0;
    }`,
  // measure-web.mjs — tablist locator
  measure_tablist_has: `() => !!document.querySelector('[role="tablist"]:has([role="tab"][aria-label^="Buyer Contacts"])')`,
  measure_tablist_legacy: `() => !![...document.querySelectorAll('div')]
      .filter((e) => (e.innerText||'').includes('Site Visits') && (e.innerText||'').includes('Buyer Contacts'))
      .sort((a,b)=>a.getBoundingClientRect().height-b.getBoundingClientRect().height)[0]`,
  // measure-web.mjs — per-label leaf locator
  measure_leaf: `(label) => {
      const tab = document.querySelector('[role="tab"][aria-label^="' + label + '"]');
      const leaf = tab && [...tab.querySelectorAll('div,span')].find((n) => {
        const t = (n.innerText||'').trim();
        return t.length > 0 && !/^\\d+$/.test(t) && ![...n.children].some((k) => (k.innerText||'').trim());
      });
      const els = [...document.querySelectorAll('div,span')].filter((e) => (e.innerText||'').trim() === label);
      return !!(leaf || els[els.length-1]);
    }`,
  // verify-t1-followups.mjs — MEASURE_PANEL tab locator
  followups_panel_tab: `() => {
      const nodes = [...document.querySelectorAll("div,span")];
      return !!(document.querySelector('[role="tab"][aria-label^="My Properties"]') ||
        nodes.find((el) => (el.innerText || "").trim().startsWith("My Properties")));
    }`,
  // verify-t1-followups.mjs — Buyer Contacts click locator
  followups_click: `() => {
      const byAria = [...document.querySelectorAll('[role="tab"]')].find((el) =>
        (el.getAttribute("aria-label") || "").startsWith("Buyer Contacts"));
      if (byAria) return true;
      const cands = [...document.querySelectorAll("div,span")].filter((el) => {
        const t = (el.innerText || "").trim();
        if (!/^(Buyer Contacts|Contacts)\\s*\\d*$/.test(t)) return false;
        let n = el;
        for (let i = 0; i < 5 && n; i++, n = n.parentElement)
          if (getComputedStyle(n).cursor === "pointer") return true;
        return false;
      });
      return cands.length > 0;
    }`,
  // verify-t1-invariant1.mjs — geometric fallback
  invariant1_click: `() => {
      const byAria = [...document.querySelectorAll('[role="tab"]')].find((el) =>
        (el.getAttribute("aria-label") || "").startsWith("Buyer Contacts"));
      if (byAria) return true;
      const cands = [...document.querySelectorAll("div")].filter((el) => {
        const b = el.getBoundingClientRect();
        if (b.height < 40 || b.height > 60 || b.width < 60) return false;
        return /Buyer Contacts|Contacts/.test((el.innerText || "").trim());
      });
      return cands.length > 0;
    }`,
};

const RUN_LOCATORS = (src) => {
  const out = {};
  for (const [name, body] of Object.entries(src.locators)) {
    const fn = eval(body);
    const needsLabel = /^\(label\)/.test(body);
    try {
      out[name] = needsLabel
        ? Object.fromEntries(src.labels.map((l) => [l, !!fn(l)]))
        : !!fn();
    } catch (e) {
      out[name] = "THREW: " + String(e.message).slice(0, 80);
    }
  }
  return out;
};

/** Force the legacy branch by removing the accessible name the rewrite prefers. */
const STRIP_ARIA = () => {
  const tabs = [...document.querySelectorAll('[role="tab"]')].filter((el) =>
    /^(My Properties|Site Visits|Buyer Contacts),/.test(el.getAttribute("aria-label") || ""));
  tabs.forEach((el) => { el.setAttribute("data-stripped", el.getAttribute("aria-label")); el.removeAttribute("aria-label"); });
  return tabs.length;
};
const RESTORE_ARIA = () => {
  const tabs = [...document.querySelectorAll('[role="tab"][data-stripped]')];
  tabs.forEach((el) => { el.setAttribute("aria-label", el.getAttribute("data-stripped")); el.removeAttribute("data-stripped"); });
  return tabs.length;
};

// ── drivers ──────────────────────────────────────────────────────────────────

async function newCtx(browser, width, scheme) {
  const ctx = await browser.newContext({
    viewport: { width, height: width >= 1440 ? 900 : 800 },
    colorScheme: scheme,
    deviceScaleFactor: 1,
  });
  return ctx;
}

async function seedAuth(ctx, auth, scheme) {
  await ctx.addInitScript((a) => {
    try {
      localStorage.setItem("auth_token", a.token);
      localStorage.setItem("auth_user", JSON.stringify(a.user));
      localStorage.setItem("blab-theme", a.scheme);
    } catch {}
  }, { ...auth, scheme });
}

async function openDashboard(ctx) {
  const page = await ctx.newPage();
  await page.goto(WEB + "/dashboard", { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForFunction(
    () => [...document.querySelectorAll('[role="tab"]')].some((el) =>
      /^Buyer Contacts,/.test(el.getAttribute("aria-label") || "")),
    null, { timeout: 180000 },
  );
  await page.waitForTimeout(1200);
  return page;
}

async function openProfile(ctx) {
  const page = await ctx.newPage();
  await page.goto(WEB + "/profile", { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForFunction(
    () => !!document.querySelector('input[aria-label*="RERA registration ID" i]'),
    null, { timeout: 180000 },
  );
  await page.waitForTimeout(1200);
  return page;
}

async function waitForRouterBar(page) {
  await page.waitForFunction(
    () => [...document.querySelectorAll('a[role="tab"]')]
      .filter((el) => /(Explore|Post|Dashboard|Profile)/.test(el.innerText || "")).length >= 2,
    null, { timeout: 60000 },
  ).catch(() => {});
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const SHOTS = path.join(OUT, "frames");
  fs.mkdirSync(SHOTS, { recursive: true });

  const R = { dynamicType: { dashboard: [], router: [], profile: [] }, darkMode: [], axTree: [], locators: [] };

  /**
   * `QA_RESCORE=<report.json>` re-derives every verdict from a banked measurement set
   * instead of re-measuring. Needed because this repo's dev server serves ONE shared
   * working tree: when a concurrent ticket edits a subject file mid-run, re-measuring
   * silently retargets the probe at the other ticket's code. Re-scoring keeps the
   * verdict pinned to the commit the measurements were taken against. Every check below
   * is a pure function of `R`, so the two paths cannot drift.
   */
  const RESCORE = process.env.QA_RESCORE;
  if (RESCORE) {
    const prev = JSON.parse(fs.readFileSync(path.resolve(RESCORE), "utf8"));
    Object.assign(R, prev.measurements);
    console.log(`re-scoring banked measurements from ${path.resolve(RESCORE)} (no browser)\n`);
  } else {
  const auth = await login(FIXTURE);
  const browser = await chromium.launch();

  // ── L1 — Dynamic Type sweep ────────────────────────────────────────────────
  for (const width of PHONE_WIDTHS) {
    const ctx = await newCtx(browser, width, "light");
    await seedAuth(ctx, auth, "light");

    // Dashboard: after (short labels) and the pre-rename simulation, at each scale.
    for (const variant of ["after", "before-sim"]) {
      for (const { k, name } of SCALES) {
        const page = await openDashboard(ctx);
        if (variant === "before-sim") await page.evaluate(MUTATE_TO_PRERENAME);
        if (k !== 1) await page.evaluate(APPLY_SCALE, k);
        await page.waitForTimeout(250);
        R.dynamicType.dashboard.push({ width, variant, scale: name, k: Math.round(k * 1000) / 1000, ...(await page.evaluate(PROBE_DASH)) });
        if (width === 360) {
          await page.screenshot({ path: path.join(SHOTS, `dash-tabs-${variant}-w${width}-${name}.png`) });
        }
        await page.close();
      }
    }

    // Router bar: measured on /dashboard (bar is hidden >= 768pt).
    for (const { k, name } of SCALES) {
      const page = await openDashboard(ctx);
      await waitForRouterBar(page);
      if (k !== 1) await page.evaluate(APPLY_SCALE, k);
      await page.waitForTimeout(250);
      R.dynamicType.router.push({ width, scale: name, k: Math.round(k * 1000) / 1000, ...(await page.evaluate(PROBE_ROUTER)) });
      if (width === 360) await page.screenshot({ path: path.join(SHOTS, `router-bar-w${width}-${name}.png`) });
      await page.close();
    }

    // Profile fields.
    for (const { k, name } of SCALES) {
      const page = await openProfile(ctx);
      if (k !== 1) await page.evaluate(APPLY_SCALE, k);
      await page.waitForTimeout(250);
      R.dynamicType.profile.push({ width, scale: name, k: Math.round(k * 1000) / 1000, ...(await page.evaluate(PROBE_FIELDS)) });
      if (width === 360) await page.screenshot({ path: path.join(SHOTS, `profile-rera-w${width}-${name}.png`) });
      await page.close();
    }
    await ctx.close();
  }

  // Profile at desktop — the side-by-side row must survive scaling too.
  {
    const ctx = await newCtx(browser, 1440, "light");
    await seedAuth(ctx, auth, "light");
    for (const { k, name } of SCALES) {
      const page = await openProfile(ctx);
      if (k !== 1) await page.evaluate(APPLY_SCALE, k);
      await page.waitForTimeout(250);
      R.dynamicType.profile.push({ width: 1440, scale: name, k: Math.round(k * 1000) / 1000, ...(await page.evaluate(PROBE_FIELDS)) });
      await page.close();
    }
    await ctx.close();
  }

  // ── L2 — the icon removal in both schemes, plus grayscale ──────────────────
  for (const scheme of ["light", "dark"]) {
    const ctx = await newCtx(browser, 390, scheme);
    await seedAuth(ctx, auth, scheme);
    const page = await openDashboard(ctx);
    const base = await page.evaluate(PROBE_DASH);
    await page.screenshot({ path: path.join(SHOTS, `dash-tabs-${scheme}-w390.png`) });
    // Colour-only state must survive desaturation (T3 §5 proof, reapplied to the
    // now-iconless control: without the icon, hue + underline are all that is left).
    await page.addStyleTag({ content: "html{filter:grayscale(1) !important}" });
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(SHOTS, `dash-tabs-${scheme}-w390-grayscale.png`) });
    R.darkMode.push({ scheme, ...base });

    // Switch to each tab and confirm the selected state tracks.
    const track = [];
    for (const label of FULL_LABELS) {
      await page.evaluate((l) => {
        const el = [...document.querySelectorAll('[role="tab"]')]
          .find((e) => (e.getAttribute("aria-label") || "").startsWith(l));
        if (el) el.click();
      }, label);
      await page.waitForTimeout(350);
      const m = await page.evaluate(PROBE_DASH);
      track.push({
        clickedLabel: label,
        selectedCount: m.selectedCount,
        selectedAria: (m.tabs.find((t) => t.ariaSelected === "true") || {}).ariaLabel || null,
        underlines: m.tabs.map((t) => ({ aria: t.ariaLabel.split(",")[0], underlinePx: t.underlinePx, color: t.labelColor, weight: t.labelFontWeight })),
      });
    }
    R.darkMode[R.darkMode.length - 1].stateTracking = track;
    await page.close();
    await ctx.close();
  }

  // ── L3 — real AX tree ─────────────────────────────────────────────────────
  {
    const ctx = await newCtx(browser, 390, "light");
    await seedAuth(ctx, auth, "light");
    const page = await openDashboard(ctx);
    await waitForRouterBar(page);
    // `page.accessibility` was removed from Playwright; go straight to the CDP
    // Accessibility domain, which is the same tree Chromium hands VoiceOver/NVDA —
    // a COMPUTED name, not the `aria-label` attribute read back.
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Accessibility.enable");
    const { nodes } = await cdp.send("Accessibility.getFullAXTree");
    const tabsFromAx = nodes
      .filter((n) => n.role?.value === "tab" && !n.ignored)
      .map((n) => ({
        role: n.role.value,
        name: n.name?.value ?? null,
        // Where the name came from, so "the attribute is present" cannot be mistaken
        // for "the name computes to it".
        nameFrom: (n.name?.sources || []).find((s) => s.value?.value === n.name?.value)?.type ?? null,
        selected: (n.properties || []).find((p) => p.name === "selected")?.value?.value ?? null,
      }));
    R.axTree.push({ route: "/dashboard", width: 390, totalAxNodes: nodes.length, tabs: tabsFromAx });
    await page.close();
    await ctx.close();
  }

  // ── L4 — locator replay over four DOM shapes ──────────────────────────────
  {
    const ctx = await newCtx(browser, 390, "light");
    await seedAuth(ctx, auth, "light");
    for (const domShape of ["post-rename", "pre-rename"]) {
      const page = await openDashboard(ctx);
      if (domShape === "pre-rename") await page.evaluate(MUTATE_TO_PRERENAME);
      await page.waitForTimeout(200);
      for (const ariaState of ["aria-present", "aria-stripped"]) {
        if (ariaState === "aria-stripped") await page.evaluate(STRIP_ARIA);
        const res = await page.evaluate(RUN_LOCATORS, { locators: LOCATORS, labels: FULL_LABELS });
        R.locators.push({ domShape, ariaState, result: res });
        if (ariaState === "aria-stripped") await page.evaluate(RESTORE_ARIA);
      }
      await page.close();
    }
    await ctx.close();
  }

  await browser.close();
  } // end !RESCORE

  // ── verdicts ──────────────────────────────────────────────────────────────
  const checks = [];
  const push = (id, pass, detail, severity) => checks.push({ id, verdict: pass ? "PASS" : "FAIL", severity: pass ? null : (severity || "MEDIUM"), detail });

  // L1 — resolve gates first: a probe that finds nothing must fail, not pass silently.
  const dAll = R.dynamicType.dashboard;
  const dBad = dAll.filter((m) => !m.found || m.tabs.some((t) => !t.labelText || t.fontSizePx == null));
  push("L1a_dash_probe_resolved", dAll.length > 0 && dBad.length === 0,
    dBad.length ? dBad.map((m) => `w${m.width}/${m.variant}/${m.scale}`).join(", ")
      : `3 tabs + label leaf resolved in all ${dAll.length} dashboard measurements`, "HIGH");

  const after = dAll.filter((m) => m.variant === "after" && m.found);
  const before = dAll.filter((m) => m.variant === "before-sim" && m.found);
  const truncOf = (set) => set.map((m) => ({
    key: `w${m.width}/${m.scale}`,
    scale: m.scale, width: m.width,
    worstPx: Math.max(0, ...m.tabs.map((t) => t.truncatedPx ?? 0)),
    tabs: m.tabs.filter((t) => (t.truncatedPx ?? 0) > 1).map((t) => `"${t.labelText}" -${t.truncatedPx}px`),
  }));
  const aT = truncOf(after), bT = truncOf(before);

  push("L1b_dash_default_not_truncated",
    aT.filter((x) => x.scale === "L-default" && x.worstPx > 1).length === 0,
    aT.filter((x) => x.scale === "L-default").map((x) => `${x.key}: worst ${x.worstPx}px`).join(" | "), "HIGH");

  // The ceiling: the largest scale at which NO label is truncated, per width.
  const ceilingFor = (set, width) => {
    const order = SCALES.map((s) => s.name);
    let best = null;
    for (const name of order) {
      const m = set.find((x) => x.width === width && x.scale === name);
      if (!m) break;
      if (m.worstPx > 1) break;
      best = name;
    }
    return best;
  };
  const ceilings = PHONE_WIDTHS.map((w) => ({ width: w, after: ceilingFor(aT, w), before: ceilingFor(bT, w) }));
  const regressed = ceilings.filter((c) => {
    const idx = (n) => (n === null ? -1 : SCALES.findIndex((s) => s.name === n));
    return idx(c.after) < idx(c.before);
  });
  push("L1c_dash_dynamic_type_ceiling_not_lowered", regressed.length === 0,
    ceilings.map((c) => `w${c.width}: after=${c.after ?? "none"} before=${c.before ?? "none"}`).join(" | "), "HIGH");

  const dOverflow = after.filter((m) => (m.tablistOverflowPx ?? 0) > 1 || m.docOverflowPx > 1)
    .map((m) => `w${m.width}/${m.scale}: tablist +${m.tablistOverflowPx}px doc +${m.docOverflowPx}px`);
  push("L1d_dash_no_container_overflow_any_scale", dOverflow.length === 0,
    dOverflow.length ? dOverflow.join(" | ") : "the tablist and the page never overflow at any scale", "MEDIUM");

  // Router bar.
  const rAll = R.dynamicType.router;
  const rBad = rAll.filter((m) => !m.found || m.items.some((i) => i.labelClientHeight == null || i.fontSizePx == null));
  push("L1e_router_probe_resolved", rAll.length > 0 && rBad.length === 0,
    rBad.length ? rBad.map((m) => `w${m.width}/${m.scale}`).join(", ")
      : `router bar + label leaf resolved in all ${rAll.length} measurements`, "HIGH");
  const rFound = rAll.filter((m) => m.found);

  const rDefault = rFound.filter((m) => m.scale === "L-default");
  push("L1f_router_default_not_clipped_and_44pt",
    rDefault.length > 0 && rDefault.every((m) => m.items.every((i) => (i.clippedPx ?? 0) <= 1 && i.box[0] >= 44 - TOL && i.box[1] >= 44 - TOL)),
    rDefault.map((m) => `w${m.width}: ${m.items.map((i) => `${i.text} ${i.box[0]}x${i.box[1]} clip${i.clippedPx}`).join(", ")}`).join(" | "), "HIGH");

  const rClipScales = rFound.filter((m) => m.items.some((i) => (i.clippedPx ?? 0) > 1));
  push("L1g_router_label_linebox_not_self_clipped", rClipScales.length === 0,
    rClipScales.length
      ? rClipScales.map((m) => `w${m.width}/${m.scale}: ` + m.items.filter((i) => (i.clippedPx ?? 0) > 1)
          .map((i) => `"${i.text}" -${i.clippedPx}px (${i.labelClientHeight}/${i.labelScrollHeight})`).join(", ")).join(" | ")
      : "the label's own line box is never self-clipped — it grows with the type size", "HIGH");

  // L1g alone is NOT sufficient and reads as a false pass on its own: the bar is a fixed
  // `height: 68`, so when the label's line box grows the label is clipped by the BAR, and
  // `scrollHeight - clientHeight` on the label itself stays 0. The real signal is the
  // bar's own overflow. This is the check that finds the Dynamic Type ceiling BLA-25 asked
  // for, so it is stated separately rather than folded into L1g.
  const rBarOver = rFound.filter((m) => (m.barOverflowPx ?? 0) > 1);
  push("L1g2_router_bar_content_fits_any_scale", rBarOver.length === 0,
    rBarOver.length
      ? rBarOver.map((m) => `w${m.width}/${m.scale}: bar overflows +${m.barOverflowPx}px (fixed height ${m.barCssHeightPx}, label needs ${Math.max(...m.items.map((i) => i.labelNeedsPx ?? 0))}px)`).join(" | ")
      : "the router bar's fixed height absorbs icon + label at every scale", "MEDIUM");

  // The largest scale at which the bar still fits, which is the number to quote.
  const routerCeiling = PHONE_WIDTHS.map((w) => {
    let best = null;
    for (const s of SCALES) {
      const m = rFound.find((x) => x.width === w && x.scale === s.name);
      if (!m || (m.barOverflowPx ?? 0) > 1) break;
      best = s.name;
    }
    return { width: w, ceiling: best };
  });

  // L5 — the untouched iOS branch, derived from the same measurement.
  const l5 = rFound.map((m) => {
    const needed = Math.max(...m.items.map((i) => i.labelNeedsPx ?? 0));
    // Content budget must fit the 28pt icon box + 1pt gap + the label's own line box.
    const iconBox = 28 + 1;
    return {
      key: `w${m.width}/${m.scale}`, scale: m.scale, width: m.width,
      labelNeedsPx: needed,
      requiredPx: Math.round((iconBox + needed) * 10) / 10,
      noInsetBudgetPx: m.contentBudgetNoInsetPx,
      inset34BudgetPx: m.contentBudgetInset34Px,
      noInsetFits: m.contentBudgetNoInsetPx != null && iconBox + needed <= m.contentBudgetNoInsetPx + TOL,
      inset34Fits: m.contentBudgetInset34Px != null && iconBox + needed <= m.contentBudgetInset34Px + TOL,
    };
  });
  const l5Default = l5.filter((x) => x.scale === "L-default");
  push("L5a_ios_inset_branch_budget_at_default",
    l5Default.length > 0 && l5Default.every((x) => x.inset34Fits),
    l5Default.map((x) => `${x.key}: needs ${x.requiredPx} <= inset34 budget ${x.inset34BudgetPx} -> ${x.inset34Fits}`).join(" | "), "HIGH");
  const l5NoInsetWorseThanInset = l5.filter((x) => x.noInsetFits && !x.inset34Fits);
  push("L5b_inset_branch_never_tighter_than_fixed_branch", l5NoInsetWorseThanInset.length === 0,
    l5NoInsetWorseThanInset.length
      ? l5NoInsetWorseThanInset.map((x) => `${x.key}: no-inset fits but inset34 does not`).join(" | ")
      : `the 56+inset branch is >= the 68pt branch at every scale (budgets ${l5[0]?.inset34BudgetPx} vs ${l5[0]?.noInsetBudgetPx})`, "HIGH");

  // The per-branch ceiling. The untouched iOS branch carries ~13pt more content box, so
  // the two branches break at DIFFERENT type sizes — worth stating explicitly, because
  // "unchanged by design" is only safe if unchanged also means not-worse.
  const branchCeiling = (field) => {
    let best = null;
    for (const s of SCALES) {
      const row = l5.find((x) => x.width === 390 && x.scale === s.name);
      if (!row || !row[field]) break;
      best = s.name;
    }
    return best;
  };
  const noInsetCeil = branchCeiling("noInsetFits"), insetCeil = branchCeiling("inset34Fits");
  push("L5c_inset_branch_ceiling_at_least_fixed_branch",
    SCALES.findIndex((s) => s.name === insetCeil) >= SCALES.findIndex((s) => s.name === noInsetCeil),
    `Dynamic Type ceiling by branch @390pt — 68pt no-inset (CHANGED by 0cdada0): ${noInsetCeil ?? "none"} · 56+34 inset (UNCHANGED): ${insetCeil ?? "none"}`,
    "MEDIUM");

  // Profile.
  const pAll = R.dynamicType.profile;
  const pBad = pAll.filter((m) => !m.found);
  push("L1h_profile_probe_resolved", pAll.length > 0 && pBad.length === 0,
    pBad.length ? pBad.map((m) => `w${m.width}/${m.scale}`).join(", ") : `partner card resolved in all ${pAll.length} measurements`, "HIGH");
  const pFound = pAll.filter((m) => m.found);
  const pOver = pFound.flatMap((m) => m.fields
    .filter((f) => Math.max(f.overflowRightPx, f.overflowLeftPx) > TOL)
    .map((f) => `w${m.width}/${m.scale}: ${f.ariaLabel} +${Math.max(f.overflowRightPx, f.overflowLeftPx)}px`));
  push("L1i_profile_fields_within_card_any_scale", pOver.length === 0,
    pOver.length ? pOver.join(" | ") : "no field escapes the partner card at any scale or width", "HIGH");
  const pDoc = pFound.filter((m) => m.docOverflowPx > 1).map((m) => `w${m.width}/${m.scale}: +${m.docOverflowPx}px`);
  push("L1j_profile_no_page_overflow_any_scale", pDoc.length === 0,
    pDoc.length ? pDoc.join(" | ") : "Profile never exceeds the viewport width at any scale", "MEDIUM");
  const pDesk = pFound.filter((m) => m.width === 1440);
  push("L1k_profile_desktop_row_survives_scaling",
    pDesk.length > 0 && pDesk.every((m) => m.sameRow),
    pDesk.map((m) => `${m.scale}: ${m.sameRow ? "one row" : "STACKED"}`).join(" | "), "LOW");

  // L2 — the segmented control still reads as a tab bar, both schemes.
  for (const m of R.darkMode) {
    const S = m.scheme;
    push(`L2a_${S}_tablist_and_three_tabs`, m.found && m.tabs.length === 3,
      m.found ? `3 tabs, tablist ${m.tablistBox?.join("x")}` : `tabCount=${m.tabCount}`, "HIGH");
    push(`L2b_${S}_icon_actually_removed`, m.found && m.tabs.every((t) => !t.hasIconGlyph),
      m.found ? `no Ionicons glyph leaf in any tab (visual delta confirmed, not just copy)` : "not measured", "LOW");
    push(`L2c_${S}_exactly_one_aria_selected`, m.selectedCount === 1,
      `selectedCount=${m.selectedCount}; ${m.tabs.map((t) => `${t.ariaLabel.split(",")[0]}=${t.ariaSelected}`).join(", ")}`, "HIGH");
    const act = m.tabs.find((t) => t.ariaSelected === "true");
    push(`L2d_${S}_active_underline_2px`, !!act && act.underlinePx >= 2 - 0.01,
      act ? `active "${act.ariaLabel.split(",")[0]}" underline ${act.underlinePx}px ${act.underlineColor}` : "no active tab", "HIGH");
    const inact = m.tabs.filter((t) => t.ariaSelected !== "true");
    push(`L2e_${S}_inactive_have_no_underline`, inact.every((t) => t.underlinePx < 2),
      inact.map((t) => `${t.ariaLabel.split(",")[0]} ${t.underlinePx}px`).join(", "), "LOW");
    push(`L2f_${S}_state_not_colour_only`,
      !!act && inact.every((t) => t.labelFontWeight !== act.labelFontWeight) && act.underlinePx >= 2,
      act ? `active weight ${act.labelFontWeight} vs inactive ${inact.map((t) => t.labelFontWeight).join("/")} + ${act.underlinePx}px underline -> survives grayscale`
          : "no active tab", "MEDIUM");
    const tr = m.stateTracking || [];
    push(`L2g_${S}_selection_tracks_every_tab`,
      tr.length === 3 && tr.every((x) => x.selectedCount === 1 && (x.selectedAria || "").startsWith(x.clickedLabel)),
      tr.map((x) => `${x.clickedLabel} -> ${x.selectedAria} (n=${x.selectedCount})`).join(" | "), "HIGH");
  }

  // L3 — AX tree.
  const ax = R.axTree[0]?.tabs || [];
  const dashAx = ax.filter((t) => /,\s*\d+\s*items?$/.test(t.name || ""));
  // The router tabs have no `accessibilityLabel`, so their name is computed from contents
  // and is prefixed by the Ionicons private-use glyph. Match on the title being present at
  // the END of the name; L3e separately reports the glyph prefix.
  const routerAx = ax.filter((t) => /(Explore|Post|Dashboard|Profile)$/.test((t.name || "").trim()));
  push("L3a_ax_dashboard_names_full",
    dashAx.length === 3 && FULL_LABELS.every((l) => dashAx.some((t) => (t.name || "").startsWith(l + ","))),
    dashAx.map((t) => `"${t.name}"`).join(" | ") || `found ${dashAx.length}`, "HIGH");
  push("L3b_ax_dashboard_short_label_not_the_name",
    dashAx.length === 3 && !dashAx.some((t) => Object.values(SHORT_LABELS).some((s) => (t.name || "").trim() === s)),
    "no tab computes its accessible name from the shortened visible text", "HIGH");
  push("L3c_ax_router_titles_present", routerAx.length >= 4,
    routerAx.map((t) => `"${t.name}"`).join(", ") || "none", "HIGH");
  // Informational, and PRE-EXISTING: react-navigation gives the router tabs no
  // `accessibilityLabel`, so the name is computed from contents and carries the Ionicons
  // private-use glyph ahead of the title. 0cdada0 did not touch this.
  const glyphNames = routerAx.filter((t) => !/^(Explore|Post|Dashboard|Profile)$/.test(t.name || ""));
  push("L3e_ax_router_name_is_title_only", glyphNames.length === 0,
    glyphNames.length
      ? `name computed from contents, icon glyph included: ${glyphNames.map((t) => JSON.stringify(t.name)).join(", ")} (pre-existing — no accessibilityLabel on the router tabs)`
      : "every router tab's accessible name is exactly its title", "LOW");
  push("L3d_ax_selected_exposed", ax.some((t) => t.selected === true),
    `selected=true on ${ax.filter((t) => t.selected === true).map((t) => `"${t.name}"`).join(", ") || "nothing"}`, "MEDIUM");

  // L4 — additive?
  //
  // Gate on each TOOL, not on each branch. Three of the seven tools are
  // `byAria || legacy`, and `measure-web`'s tablist locator is `has() || legacy`, so a
  // false on one branch is only a defect if the OR as a whole fails. The per-branch
  // results stay in the JSON as diagnostics.
  const byShape = (shape, aria) => R.locators.find((x) => x.domShape === shape && x.ariaState === aria)?.result || {};
  const allTrue = (v) => (typeof v === "object" && v !== null ? Object.values(v).every(Boolean) : v === true);
  /** Per-label OR of two branch results, or a plain OR for boolean branches. */
  const orBranch = (a, b) => {
    if (typeof a === "object" && a !== null && typeof b === "object" && b !== null)
      return Object.fromEntries(Object.keys(a).map((k) => [k, !!a[k] || !!b[k]]));
    return !!a || !!b;
  };
  /** Collapse the raw branch map into one entry per tool call site. */
  const toTools = (res) => ({
    // capture-web.mjs + verify-bla14-320pt-actions.mjs + verify-bla14-nested-cta.mjs
    "capture-web/bla14x2_tabClick": orBranch(res.aria_startsWith, res.legacy_text_prefix),
    "measure-web_tablist": orBranch(res.measure_tablist_has, res.measure_tablist_legacy),
    "measure-web_labelLeaf": res.measure_leaf,
    "t1-followups_panelTab": res.followups_panel_tab,
    "t1-followups_contactsClick": res.followups_click,
    "t1-invariant1_contactsClick": res.invariant1_click,
  });
  const summarise = (res) => Object.entries(toTools(res))
    .filter(([, v]) => !allTrue(v))
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`);

  const postAria = byShape("post-rename", "aria-present");
  const preAria = byShape("pre-rename", "aria-present");
  const preLegacy = byShape("pre-rename", "aria-stripped");
  const postLegacy = byShape("post-rename", "aria-stripped");

  push("L4a_resolves_on_subject_build", Object.keys(postAria).length > 0 && summarise(postAria).length === 0,
    summarise(postAria).join(" | ") || `all 6 tool call sites resolve the tab on 0cdada0's DOM`, "HIGH");
  push("L4b_resolves_on_prerename_build", Object.keys(preAria).length > 0 && summarise(preAria).length === 0,
    summarise(preAria).join(" | ") || `all 6 tool call sites resolve on the pre-rename (b40b742) DOM — the rewrite is additive`, "HIGH");
  push("L4c_legacy_branch_still_works_prerename", Object.keys(preLegacy).length > 0 && summarise(preLegacy).length === 0,
    summarise(preLegacy).join(" | ") || "with the accessible name stripped, every legacy text/geometry branch still resolves on a pre-rename DOM — nothing was removed", "MEDIUM");
  // Informational: the legacy branch alone on the NEW DOM. Not a gate — the accessible
  // name is always present in reality — but it says how much real fallback there is.
  push("L4d_legacy_branch_alone_on_new_dom", summarise(postLegacy).length === 0,
    summarise(postLegacy).join(" | ") || "the legacy branch alone also resolves on the renamed DOM", "LOW");

  const verdict = checks.every((c) => c.verdict === "PASS") ? "ALL_PASS" : "FAIL";
  const report = {
    subject: "agent/uxd-audit @ 0cdada0 (BLA-24 §1/§2 + BLA-19)",
    layer: "Layer-2 independent QA (BLA-25)",
    web: WEB, widths: [...PHONE_WIDTHS, 1440], scales: SCALES.map((s) => s.name),
    verdict, checks,
    ceilings, routerCeiling, l5BudgetAnalysis: l5,
    measurements: R,
  };
  fs.writeFileSync(path.join(OUT, "_ceo-visual-layer2.json"), JSON.stringify(report, null, 2));

  for (const c of checks)
    console.log(`${c.id.padEnd(44)} ${c.verdict.padEnd(5)} ${c.severity ? "[" + c.severity + "] " : ""}${c.detail}`);
  console.log(`\nDynamic Type ceiling (dashboard tab labels, no truncation):`);
  for (const c of ceilings) console.log(`  w${c.width}: after=${c.after ?? "FAILS AT DEFAULT"}  before(pre-rename sim)=${c.before ?? "FAILS AT DEFAULT"}`);
  console.log(`\nDynamic Type ceiling (router tab bar, bar does not overflow):`);
  for (const c of routerCeiling) console.log(`  w${c.width}: ${c.ceiling ?? "FAILS AT DEFAULT"}`);
  console.log(`\n${verdict}  (raw: ${path.join(OUT, "_ceo-visual-layer2.json")})`);
  if (process.argv.includes("--json")) console.log(JSON.stringify(R, null, 2));
  process.exit(verdict === "ALL_PASS" ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(2); });
