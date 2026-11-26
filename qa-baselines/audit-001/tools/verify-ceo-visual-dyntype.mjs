/**
 * AUDIT-001 / BLA-24 — Dynamic Type extension of the CEO visual-bug sweep.
 *
 * `verify-ceo-visual-bugs.mjs` (Layer-1) measures the two BLA-24 defects at 320/360/390/1440
 * at DEFAULT type size only. But the CEO's original reports were confirmed at 360pt /
 * xxxLarge, not at default — so a green default-type sweep can coexist with the reported
 * defect still being live. This tool closes exactly that gap and nothing else:
 *
 *   D1  Profile — the agency/RERA field row must not overflow the partner card's content
 *       box at ANY of L-default / xxxLarge / AX3 / AX5-max, across 320/360/390/1440.
 *       The fix is `minWidth: 0` + `flexBasis: 200` + `flexWrap` on the row, which is a
 *       scale-independent mechanism (it removes the `<input>` `min-width: auto` intrinsic
 *       floor), so this is expected to hold at every scale. Asserted, not assumed.
 *
 *   D2  Dashboard — the segmented tab labels (Properties / Visits / Contacts) must not
 *       ellipsise. This fix trades width for a shorter word at a FIXED 11px font, so it
 *       has a genuine scaling ceiling that Layer-1 never measured. This tool reports the
 *       highest scale that holds per width rather than emitting a bare pass/fail, so the
 *       ceiling is a recorded number instead of an unknown.
 *
 * Both probes are lifted verbatim from `verify-ceo-visual-bugs.mjs` so the two tools
 * measure the same geometry and their verdicts are directly comparable. The scale ladder
 * and APPLY_SCALE are lifted verbatim from `verify-t3-qa.mjs` for the same reason.
 *
 * Usage: node qa-baselines/audit-001/tools/verify-ceo-visual-dyntype.mjs [--json]
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
  : path.join(ROOT, "qa-baselines/audit-001/ceo-visual-bugs/dyntype");

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

/** iOS Dynamic Type body multipliers: Large(default)=17pt, xxxLarge=23pt, AX3=40pt, AX5=53pt. */
const SCALES = [
  { k: 1.0, name: "L-default" },
  { k: 23 / 17, name: "xxxLarge" },
  { k: 40 / 17, name: "AX3" },
  { k: 53 / 17, name: "AX5-max" },
];

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

/**
 * Verbatim from verify-t3-qa.mjs. Inline-scales every element's rendered fontSize and
 * lineHeight, which is how a react-native-web build responds to OS Dynamic Type (the RN
 * `fontScale` multiplier has no web implementation).
 */
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

// ── D1 probe: the Profile partner card (RERA + agency fields) — verbatim from Layer-1 ──
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
    return {
      ariaLabel: (el.getAttribute("aria-label") || "").slice(0, 50),
      value: (el.value || "").slice(0, 30),
      box: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
      overflowRightPx: Math.round((r.right - contentRight) * 10) / 10,
      overflowLeftPx: Math.round((contentLeft - r.left) * 10) / 10,
      minWidth: getComputedStyle(el).minWidth,
    };
  });

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

// ── D2 probe: the Dashboard segmented tab bar — verbatim from Layer-1 ──────────────────
const PROBE_DASH_TABS = () => {
  const tabs = [...document.querySelectorAll('[role="tab"]')].filter((el) => {
    const a = el.getAttribute("aria-label") || "";
    return /^(My Properties|Site Visits|Buyer Contacts),/.test(a);
  });
  if (tabs.length !== 3) return { found: false, tabCount: tabs.length };

  const out = tabs.map((tab) => {
    const r = tab.getBoundingClientRect();
    // Ionicons renders as a text leaf holding a single Unicode private-use codepoint,
    // and it is the FIRST leaf in the tab, so it must be excluded or D2 measures the icon.
    const GLYPH_ONLY = /^[-\s]+$/;
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
      scrollWidth: label ? label.scrollWidth : null,
      clientWidth: label ? label.clientWidth : null,
      truncatedPx: label ? Math.max(0, label.scrollWidth - label.clientWidth) : null,
      fontSizePx: lcs ? Math.round(parseFloat(lcs.fontSize) * 10) / 10 : null,
      overflowsTab: lr ? Math.round(Math.max(0, lr.right - (r.right - (parseFloat(getComputedStyle(tab).paddingRight) || 0))) * 10) / 10 : null,
    };
  });
  return { found: true, tabs: out };
};

/**
 * D2e/D2f probe. The fix makes the strip a horizontal ScrollView, which introduces two
 * ways to be worse than the truncation it replaced:
 *   - if the overflow were `hidden` rather than `auto`, the third tab would be clipped and
 *     UNREACHABLE at AX sizes — strictly worse than an ellipsis;
 *   - `accessibilityRole="tablist"` is now on a ScrollView rather than a View, so §H7's
 *     tablist semantics have to be re-proved rather than assumed to have carried over.
 * Both are measured by driving the scroller to its end, not inferred from style.
 */
const PROBE_STRIP = () => {
  const tabs = [...document.querySelectorAll('[role="tab"]')].filter((el) =>
    /^(My Properties|Site Visits|Buyer Contacts),/.test(el.getAttribute("aria-label") || ""));
  if (tabs.length !== 3) return { found: false, tabCount: tabs.length };

  let sc = tabs[0].parentElement;
  while (sc && !(tabs.every((t) => sc.contains(t)) && /auto|scroll/.test(getComputedStyle(sc).overflowX)))
    sc = sc.parentElement;

  const list = document.querySelector('[role="tablist"]');
  const res = {
    found: true,
    tablistPresent: !!list,
    tablistHoldsAllTabs: list ? tabs.every((t) => list.contains(t)) : false,
    selectedCount: tabs.filter((t) => t.getAttribute("aria-selected") === "true").length,
    scrollerFound: !!sc,
    overflowX: sc ? getComputedStyle(sc).overflowX : null,
    scrollableBy: sc ? sc.scrollWidth - sc.clientWidth : null,
  };
  if (sc) {
    sc.scrollLeft = sc.scrollWidth;
    const last = tabs[tabs.length - 1].getBoundingClientRect();
    const box = sc.getBoundingClientRect();
    res.scrolledTo = Math.round(sc.scrollLeft);
    res.lastTabFullyVisible = last.right <= box.right + 1 && last.left >= box.left - 1;
    sc.scrollLeft = 0;
  }
  return res;
};

async function newCtx(browser, width, auth) {
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
  return ctx;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const auth = await login(FIXTURE);
  const browser = await chromium.launch();
  const profileM = [], dashM = [], stripM = [];

  for (const width of ALL_WIDTHS) {
    // ── D1: Profile field row at each scale ──
    {
      const ctx = await newCtx(browser, width, auth);
      const page = await ctx.newPage();
      await page.goto(WEB + "/profile", { waitUntil: "domcontentloaded", timeout: 180000 });
      await page.waitForFunction(
        () => !!document.querySelector('input[aria-label*="RERA registration ID" i]'),
        null, { timeout: 180000 },
      );
      await page.waitForTimeout(1200);
      for (const { k, name } of SCALES) {
        if (k !== 1.0) { await page.evaluate(APPLY_SCALE, k); await page.waitForTimeout(700); }
        profileM.push({ width, scale: name, k: Math.round(k * 1000) / 1000, ...(await page.evaluate(PROBE_FIELDS)) });
        await page.screenshot({ path: path.join(OUT, `dyntype-profile-rera-w${width}-${name}.png`) });
        // A scale is applied on top of the previous one unless the DOM is reset, so each
        // non-default scale reloads back to a pristine tree before the next multiplier.
        if (k !== 1.0) {
          await page.reload({ waitUntil: "domcontentloaded" });
          await page.waitForFunction(
            () => !!document.querySelector('input[aria-label*="RERA registration ID" i]'),
            null, { timeout: 180000 },
          );
          await page.waitForTimeout(1200);
        }
      }
      await ctx.close();
    }

    // ── D2: Dashboard segmented tabs at each scale (phone widths + 1440) ──
    {
      const ctx = await newCtx(browser, width, auth);
      const page = await ctx.newPage();
      const ready = () => [...document.querySelectorAll('[role="tab"]')].some((el) =>
        /^Buyer Contacts,/.test(el.getAttribute("aria-label") || ""));
      await page.goto(WEB + "/dashboard", { waitUntil: "domcontentloaded", timeout: 180000 });
      await page.waitForFunction(ready, null, { timeout: 180000 });
      await page.waitForTimeout(1200);
      for (const { k, name } of SCALES) {
        if (k !== 1.0) { await page.evaluate(APPLY_SCALE, k); await page.waitForTimeout(700); }
        dashM.push({ width, scale: name, k: Math.round(k * 1000) / 1000, ...(await page.evaluate(PROBE_DASH_TABS)) });
        await page.screenshot({ path: path.join(OUT, `dyntype-dash-tabs-w${width}-${name}.png`) });
        // PROBE_STRIP mutates scrollLeft, so it runs after the frame is captured.
        stripM.push({ width, scale: name, ...(await page.evaluate(PROBE_STRIP)) });
        if (k !== 1.0) {
          await page.reload({ waitUntil: "domcontentloaded" });
          await page.waitForFunction(ready, null, { timeout: 180000 });
          await page.waitForTimeout(1200);
        }
      }
      await ctx.close();
    }
    console.log(`probed w${width}`);
  }

  await browser.close();

  // ── Scoring ──────────────────────────────────────────────────────────────────
  const checks = [];
  const add = (id, what, pass, detail) => checks.push({ id, what, verdict: pass ? "PASS" : "FAIL", detail });

  // D1 — no field may overflow the card content box, at any width x scale.
  {
    const notFound = profileM.filter((m) => !m.found);
    add("D1a", "Profile partner card + both fields resolved at every width x scale",
      notFound.length === 0,
      notFound.length === 0 ? `${profileM.length} measurements` : notFound.map((m) => `w${m.width}/${m.scale}`).join(", "));

    const over = profileM.filter((m) => m.found)
      .flatMap((m) => m.fields.filter((f) => f.overflowRightPx > 0.5 || f.overflowLeftPx > 0.5)
        .map((f) => `w${m.width}/${m.scale} ${f.ariaLabel.slice(0, 24)} +${f.overflowRightPx}px`));
    add("D1b", "No agency/RERA field extends past the card content box at any scale",
      over.length === 0, over.length === 0 ? "0 overflows" : over.join(" | "));

    const doc = profileM.filter((m) => m.found && m.docOverflowPx > 0.5)
      .map((m) => `w${m.width}/${m.scale} +${m.docOverflowPx}px`);
    add("D1c", "Profile page gains no horizontal document overflow at any scale",
      doc.length === 0, doc.length === 0 ? "0 overflows" : doc.join(" | "));

    // Regression guard: the desktop side-by-side row must survive every scale.
    const desk = profileM.filter((m) => m.found && m.width === 1440);
    add("D1d", "At 1440pt the two fields still share one row at every scale",
      desk.length > 0 && desk.every((m) => m.sameRow),
      desk.map((m) => `${m.scale}:${m.sameRow ? "row" : "STACKED"}`).join(" "));

    // The fix's mechanism, asserted directly: min-width must be 0px, not `auto`.
    const mw = profileM.filter((m) => m.found)
      .flatMap((m) => m.fields.filter((f) => parseFloat(f.minWidth) > 0.5 || f.minWidth === "auto")
        .map((f) => `w${m.width}/${m.scale} ${f.minWidth}`));
    add("D1e", "Both inputs resolve min-width: 0 (the intrinsic-width floor is removed)",
      mw.length === 0, mw.length === 0 ? "all 0px" : mw.join(" | "));
  }

  // D2 — no tab label may ellipsise, at any width x scale.
  {
    const notFound = dashM.filter((m) => !m.found);
    add("D2a", "All three dashboard tabs resolved at every width x scale",
      notFound.length === 0,
      notFound.length === 0 ? `${dashM.length} measurements` : notFound.map((m) => `w${m.width}/${m.scale}(${m.tabCount})`).join(", "));

    // Guard against the Layer-1 icon-glyph trap: the label must be the real word.
    const WORDS = ["Properties", "Visits", "Contacts"];
    const badLabel = dashM.filter((m) => m.found)
      .flatMap((m) => m.tabs.filter((t) => !WORDS.includes(t.labelText))
        .map((t) => `w${m.width}/${m.scale} "${t.labelText}"`));
    add("D2b", "The measured leaf is the rendered word, not the icon glyph or the badge",
      badLabel.length === 0, badLabel.length === 0 ? "Properties/Visits/Contacts" : badLabel.join(" | "));

    const trunc = dashM.filter((m) => m.found)
      .flatMap((m) => m.tabs.filter((t) => t.truncatedPx > 0.5)
        .map((t) => `w${m.width}/${m.scale} "${t.labelText}" -${t.truncatedPx}px @${t.fontSizePx}px`));
    add("D2c", "No dashboard tab label is ellipsised at any width x scale",
      trunc.length === 0, trunc.length === 0 ? "0 truncations" : trunc.join(" | "));

    const spill = dashM.filter((m) => m.found)
      .flatMap((m) => m.tabs.filter((t) => t.overflowsTab > 0.5)
        .map((t) => `w${m.width}/${m.scale} "${t.labelText}" +${t.overflowsTab}px`));
    add("D2d", "No dashboard tab label spills past its tab's content box at any scale",
      spill.length === 0, spill.length === 0 ? "0 spills" : spill.join(" | "));
  }

  // D2e/D2f — the scrollable strip must not trade truncation for an unreachable tab, and
  // must keep §H7's tablist semantics now that the role sits on a ScrollView.
  {
    const noScroller = stripM.filter((m) => m.found && !m.scrollerFound)
      .map((m) => `w${m.width}/${m.scale}`);
    const clipped = stripM.filter((m) => m.found && m.scrollerFound && m.overflowX === "hidden")
      .map((m) => `w${m.width}/${m.scale} overflowX:hidden`);
    const unreachable = stripM.filter((m) => m.found && m.scrollerFound && m.lastTabFullyVisible === false)
      .map((m) => `w${m.width}/${m.scale} scrollableBy=${m.scrollableBy} scrolledTo=${m.scrolledTo}`);
    add("D2e", "The strip scrolls rather than clipping — the last tab is reachable at every scale",
      noScroller.length === 0 && clipped.length === 0 && unreachable.length === 0,
      [...noScroller.map((s) => "no scroller " + s), ...clipped, ...unreachable].join(" | ")
        || `${stripM.length} measurements, max scrollableBy=${Math.max(...stripM.map((m) => m.scrollableBy || 0))}px`);

    const badRole = stripM.filter((m) => m.found && (!m.tablistPresent || !m.tablistHoldsAllTabs || m.selectedCount !== 1))
      .map((m) => `w${m.width}/${m.scale} tablist=${m.tablistPresent} holdsAll=${m.tablistHoldsAllTabs} selected=${m.selectedCount}`);
    add("D2f", "§H7 tablist semantics survive on the ScrollView (one tablist, all 3 tabs, exactly 1 selected)",
      badRole.length === 0, badRole.length === 0 ? "tablist + 1 selected at every scale" : badRole.join(" | "));

    // Regression guard: no scroll affordance may appear at the sizes the CEO reviewed.
    const earlyScroll = stripM.filter((m) => m.found && m.scrollableBy > 0.5 && ["L-default", "xxxLarge"].includes(m.scale))
      .map((m) => `w${m.width}/${m.scale} +${m.scrollableBy}px`);
    add("D2g", "The strip does NOT scroll at L-default or xxxLarge (reviewed layout unchanged)",
      earlyScroll.length === 0, earlyScroll.length === 0 ? "0 scroll at default/xxxLarge" : earlyScroll.join(" | "));
  }

  // Per-width scaling ceiling for D2 — a recorded number, not an unknown.
  const ceiling = {};
  for (const width of ALL_WIDTHS) {
    const held = SCALES.filter(({ name }) => {
      const m = dashM.find((x) => x.width === width && x.scale === name);
      return m && m.found && m.tabs.every((t) => t.truncatedPx <= 0.5 && t.overflowsTab <= 0.5);
    }).map((s) => s.name);
    // The ladder is monotonic in font size, so the ceiling is the last contiguous hold.
    let top = null;
    for (const s of SCALES) { if (held.includes(s.name)) top = s.name; else break; }
    ceiling[`w${width}`] = { highestScaleHeld: top, allHeld: held };
  }

  const failed = checks.filter((c) => c.verdict === "FAIL");
  const report = {
    generatedFor: "BLA-24 — Dynamic Type extension of the CEO visual-bug sweep",
    web: WEB, widths: ALL_WIDTHS, scales: SCALES.map((s) => s.name), fixture: FIXTURE,
    verdict: failed.length === 0 ? "ALL_PASS" : "FAIL",
    checks,
    d2ScalingCeiling: ceiling,
    raw: { profile: profileM, dashboard: dashM, strip: stripM },
  };
  fs.writeFileSync(path.join(OUT, "ceo-visual-dyntype.json"), JSON.stringify(report, null, 2));

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    for (const c of checks) console.log(`${c.verdict === "PASS" ? "PASS" : "FAIL"}  ${c.id}  ${c.what}\n        ${c.detail}`);
    console.log("\nD2 scaling ceiling:");
    for (const [w, v] of Object.entries(ceiling)) console.log(`  ${w}: highest scale held = ${v.highestScaleHeld}`);
    console.log(`\nVERDICT ${report.verdict}  (${checks.length - failed.length}/${checks.length})`);
    console.log(`out ${path.join(OUT, "ceo-visual-dyntype.json")}`);
  }
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(2); });
