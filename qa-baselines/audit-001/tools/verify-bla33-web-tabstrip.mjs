/**
 * BLA-33 / Layer-2 — independent web re-verification of the dashboard tab-strip fix @ 5173092.
 *
 * This is NOT a re-run of `verify-ceo-visual-dyntype.mjs`. The implementer asked for his
 * assertions to be attacked rather than repeated, so every probe here differs from Layer-1's
 * in method, not just in code:
 *
 *   W0  PIN. The dev server on :8081 serves ONE shared working tree, and this workspace is
 *       concurrently held by the implementer's own run — an earlier review of mine already
 *       caught an edit landing mid-measurement. So the SHA and the sha256 of
 *       RealtorDashboard.tsx are captured before AND after the whole run and must match, and
 *       the served DOM must carry the post-fix ScrollView signature. Without W0 nothing below
 *       is attributable to 5173092.
 *
 *   W1  D2g RECONCILIATION, the regression claim the CEO's sign-off rests on. Layer-1 reports
 *       whole-pixel tab widths (121 at 390pt); my own BLA-25 pass banked 120.7. A 0.3px
 *       disagreement is either rounding or two different trees, and the difference matters
 *       because only one of them means we measured the same thing. Measured UNROUNDED here,
 *       to 3dp, so the two numbers can actually be reconciled instead of asserted equal.
 *
 *   W2  D2f by a DIFFERENT METHOD. Layer-1 reads `[role=tablist]` and `aria-selected` out of
 *       the DOM. DOM attributes are the input to accessibility, not the output: a role can be
 *       present and still not reach the platform tree. This reads Chromium's COMPUTED AX tree
 *       over CDP (`Accessibility.getFullAXTree`) — the same tree VoiceOver/NVDA consume — and
 *       asserts the tablist node really holds three tab nodes with exactly one selected. This
 *       is the method BLA-33 asked be re-pointed at the ScrollView.
 *
 *   W3  D2e by KEYBOARD, not by scrollLeft. Layer-1 drives `scrollLeft` from script, which
 *       proves the scroller CAN be scrolled but not that a user can get there. With
 *       `showsHorizontalScrollIndicator={false}` there is no visible affordance at AX sizes
 *       (issue #4), so the question is whether the off-screen tabs are reachable WITHOUT one.
 *       This tabs to each control with real key events and asserts the browser scrolls it
 *       into view and that it is fully visible once focused.
 *
 *   W4  THE GAP IN D2d. Layer-1's `overflowsTab` measures only the LABEL's right edge against
 *       the tab's right padding edge. The tab is a centred row of label + count badge, so a
 *       row that does not fit can manifest as the BADGE spilling, or as a spill to the LEFT,
 *       and either would pass D2d. This measures the whole row: every child's box against the
 *       tab's content box, both edges.
 *
 *   W5  ISSUE #5 — the active underline. `borderBottomWidth: 2` now sits on a content-sized
 *       tab, so its length tracks the label. Asserts it is present, that it is the only
 *       bottom-bordered tab, and that selection survives with colour removed — via the
 *       grayscale luminance delta of the underline against the strip's own hairline AND the
 *       independent fontWeight cue. Captures light/dark colour and grayscale frames.
 *
 * Usage: node qa-baselines/audit-001/tools/verify-bla33-web-tabstrip.mjs [--json]
 */
import { createRequire } from "module";
import fs from "fs";
import path from "path";
import { execFileSync } from "node:child_process";

const ROOT = "/Users/adi/Projects/blab-web-agents";
const require = createRequire(ROOT + "/package.json");
const { chromium } = require("playwright");

const WEB = process.env.QA_WEB || "http://localhost:8081";
const API = process.env.QA_API || "http://localhost:3000";
const OUT = process.env.QA_OUT ? path.resolve(process.env.QA_OUT) : path.join(ROOT, "qa-baselines/audit-001/t6-bla33-layer2");
const SUBJECT = "expo-app/components/realtor/RealtorDashboard.tsx";

const env = fs.readFileSync(ROOT + "/.env.local", "utf8");
const envGet = (k) => (env.match(new RegExp("^" + k + "=(.*)$", "m")) || [])[1]?.trim().replace(/^["']|["']$/g, "");
if (envGet("BLAB_ENV") === "production") {
  console.error("REFUSING: BLAB_ENV === 'production' (Marketplace Invariant #5)");
  process.exit(2);
}

const git = (...a) => execFileSync("git", a, { cwd: ROOT, encoding: "utf8" }).trim();
const pinOf = () => ({
  head: git("rev-parse", "HEAD"),
  subjectBlob: git("hash-object", SUBJECT),
  subjectDirty: git("status", "--porcelain", SUBJECT).length > 0,
});

const FIXTURE = "+919100000045"; // realtor_pro — same fixture as Layer-1, so numbers compare
const WIDTHS = [320, 360, 390, 1440];
/** iOS Dynamic Type body multipliers: Large(default)=17pt, xxxLarge=23pt, AX3=40pt, AX5=53pt. */
const SCALES = [
  { k: 1.0, name: "L-default" },
  { k: 23 / 17, name: "xxxLarge" },
  { k: 40 / 17, name: "AX3" },
  { k: 53 / 17, name: "AX5-max" },
];

/** Verbatim from verify-t3-qa.mjs / Layer-1, so the scale ladder is identical. */
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

const TAB_RE = /^(My Properties|Site Visits|Buyer Contacts),/;

/** W1 + W4 + W5: unrounded geometry of the strip, the tabs, and every child of each tab. */
const PROBE_GEOMETRY = () => {
  const r3 = (n) => Math.round(n * 1000) / 1000;
  const tabs = [...document.querySelectorAll('[role="tab"]')].filter((el) =>
    /^(My Properties|Site Visits|Buyer Contacts),/.test(el.getAttribute("aria-label") || ""));
  if (tabs.length !== 3) return { found: false, tabCount: tabs.length };

  let sc = tabs[0].parentElement;
  while (sc && !(tabs.every((t) => sc.contains(t)) && /auto|scroll/.test(getComputedStyle(sc).overflowX)))
    sc = sc.parentElement;

  const strip = sc ? sc.getBoundingClientRect() : null;
  // A scroll container clips at its padding box. For LTR the scrollable overflow region
  // never extends past the START edge, so anything left of clipLeft at scrollLeft 0 is
  // permanently unreachable — lost text, with no ellipsis to signal it.
  let clipLeft = null, clipRight = null, canScrollLeft = null;
  if (sc) {
    sc.scrollLeft = 0;
    const scs = getComputedStyle(sc);
    clipLeft = strip.left + (parseFloat(scs.borderLeftWidth) || 0);
    clipRight = clipLeft + sc.clientWidth;
    sc.scrollLeft = -500;
    canScrollLeft = sc.scrollLeft < -0.5;
    sc.scrollLeft = 0;
  }
  const tabBoxes = tabs.map((t) => t.getBoundingClientRect());
  const out = tabs.map((tab, ti) => {
    const r = tab.getBoundingClientRect();
    const cs = getComputedStyle(tab);
    const padL = parseFloat(cs.paddingLeft) || 0;
    const padR = parseFloat(cs.paddingRight) || 0;
    const contentL = r.left + padL;
    const contentR = r.right - padR;
    // Every rendered child box of the tab, not just the label leaf.
    const kids = [...tab.children].map((el) => {
      const kr = el.getBoundingClientRect();
      const txt = (el.innerText || "").trim();
      return {
        text: txt.slice(0, 20),
        width: r3(kr.width),
        spillRightPx: r3(Math.max(0, kr.right - contentR)),
        spillLeftPx: r3(Math.max(0, contentL - kr.left)),
        // Past the tab's own BORDER box, i.e. outside its hit target.
        pastTabBoxLeftPx: r3(Math.max(0, r.left - kr.left)),
        pastTabBoxRightPx: r3(Math.max(0, kr.right - r.right)),
        // Clipped by the strip's start edge at scrollLeft 0 — unreachable when
        // canScrollLeft is false.
        clippedByStripStartPx: clipLeft === null ? null : r3(Math.max(0, clipLeft - kr.left)),
        // Rendered inside the NEXT tab's hit target: a tap there activates the wrong tab.
        intoNextTabHitAreaPx:
          ti + 1 < tabBoxes.length ? r3(Math.max(0, kr.right - tabBoxes[ti + 1].left)) : 0,
      };
    });
    const label = [...tab.querySelectorAll("div,span")].find((el) => {
      const t = (el.innerText || "").trim();
      return /^(Properties|Visits|Contacts)$/.test(t);
    });
    const lcs = label ? getComputedStyle(label) : null;
    return {
      ariaLabel: (tab.getAttribute("aria-label") || "").slice(0, 60),
      ariaSelected: tab.getAttribute("aria-selected"),
      widthPx: r3(r.width),
      heightPx: r3(r.height),
      contentWidthPx: r3(contentR - contentL),
      kids,
      kidsSumPx: r3(kids.reduce((a, k) => a + k.width, 0) + Math.max(0, kids.length - 1) * (parseFloat(cs.columnGap) || 0)),
      labelText: label ? (label.innerText || "").trim() : null,
      labelWidthPx: label ? r3(label.getBoundingClientRect().width) : null,
      labelTruncatedPx: label ? r3(Math.max(0, label.scrollWidth - label.clientWidth)) : null,
      labelFontSizePx: lcs ? r3(parseFloat(lcs.fontSize)) : null,
      labelFontWeight: lcs ? lcs.fontWeight : null,
      labelColor: lcs ? lcs.color : null,
      borderBottomWidthPx: r3(parseFloat(cs.borderBottomWidth) || 0),
      borderBottomColor: cs.borderBottomColor,
    };
  });

  return {
    found: true,
    scrollerFound: !!sc,
    overflowX: sc ? getComputedStyle(sc).overflowX : null,
    stripWidthPx: strip ? r3(strip.width) : null,
    stripClientWidthPx: sc ? sc.clientWidth : null,
    stripScrollWidthPx: sc ? sc.scrollWidth : null,
    scrollableByPx: sc ? r3(sc.scrollWidth - sc.clientWidth) : null,
    canScrollLeft,
    stripBorderBottomColor: sc ? getComputedStyle(sc).borderBottomColor : null,
    tabs: out,
    // Widest-minus-narrowest: 0 means equal thirds, unrounded.
    tabWidthSpreadPx: r3(Math.max(...out.map((t) => t.widthPx)) - Math.min(...out.map((t) => t.widthPx))),
  };
};

/** W3: keyboard reachability of each tab, with no visible scrollbar to help. */
const PROBE_KEYBOARD = async (page) => {
  const res = await page.evaluate(() => {
    const tabs = [...document.querySelectorAll('[role="tab"]')].filter((el) =>
      /^(My Properties|Site Visits|Buyer Contacts),/.test(el.getAttribute("aria-label") || ""));
    let sc = tabs[0]?.parentElement;
    while (sc && !(tabs.every((t) => sc.contains(t)) && /auto|scroll/.test(getComputedStyle(sc).overflowX)))
      sc = sc.parentElement;
    if (sc) sc.scrollLeft = 0;
    return {
      tabCount: tabs.length,
      focusable: tabs.map((t) => t.tabIndex),
      resetScrollLeft: sc ? sc.scrollLeft : null,
    };
  });

  /**
   * CONTROL for W3. If this browser does not scroll ANY focused element into view, a null
   * result on the real strip would be a harness artifact rather than a defect. So a plain
   * overflow-x scroller is injected into the same page and focused the same way; it must
   * scroll, otherwise W3 reports inconclusive instead of FAIL.
   */
  const control = await page.evaluate(async () => {
    const host = document.createElement("div");
    host.setAttribute("style", "position:fixed;top:0;left:0;width:200px;overflow-x:auto;white-space:nowrap;z-index:99999;background:#fff");
    const inner = document.createElement("div");
    inner.setAttribute("style", "display:flex;width:900px");
    for (let i = 0; i < 3; i++) {
      const d = document.createElement("div");
      d.tabIndex = 0;
      d.textContent = "box" + i;
      d.setAttribute("style", "width:300px;flex:0 0 300px");
      inner.appendChild(d);
    }
    host.appendChild(inner);
    document.body.appendChild(host);
    host.scrollLeft = 0;
    inner.children[2].focus({ preventScroll: false });
    await new Promise((r) => setTimeout(r, 300));
    const scrolled = Math.round(host.scrollLeft);
    host.remove();
    return scrolled;
  });

  const perTab = [];
  for (let i = 0; i < 3; i++) {
    const r = await page.evaluate(async (idx) => {
      const tabs = [...document.querySelectorAll('[role="tab"]')].filter((el) =>
        /^(My Properties|Site Visits|Buyer Contacts),/.test(el.getAttribute("aria-label") || ""));
      let sc = tabs[0].parentElement;
      while (sc && !(tabs.every((t) => sc.contains(t)) && /auto|scroll/.test(getComputedStyle(sc).overflowX)))
        sc = sc.parentElement;
      const el = tabs[idx];
      // focus() triggers the UA's own scroll-into-view, which is exactly the path a
      // keyboard user takes when no scrollbar is visible.
      el.focus({ preventScroll: false });
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const tr = el.getBoundingClientRect();
      const sr = sc.getBoundingClientRect();
      return {
        index: idx,
        isFocused: document.activeElement === el || el.contains(document.activeElement),
        scrollLeft: Math.round(sc.scrollLeft),
        fullyVisible: tr.left >= sr.left - 1 && tr.right <= sr.right + 1,
        clippedLeftPx: Math.round(Math.max(0, sr.left - tr.left)),
        clippedRightPx: Math.round(Math.max(0, tr.right - sr.right)),
      };
    }, i);
    perTab.push(r);
  }
  // And the explicit comparison: scrollIntoView proves the scroller CAN reach the tab, so a
  // failure above is specifically the focus path, not an unscrollable strip.
  const viaScrollIntoView = await page.evaluate(async () => {
    const tabs = [...document.querySelectorAll('[role="tab"]')].filter((el) =>
      /^(My Properties|Site Visits|Buyer Contacts),/.test(el.getAttribute("aria-label") || ""));
    let sc = tabs[0].parentElement;
    while (sc && !(tabs.every((t) => sc.contains(t)) && /auto|scroll/.test(getComputedStyle(sc).overflowX)))
      sc = sc.parentElement;
    sc.scrollLeft = 0;
    tabs[2].scrollIntoView({ block: "nearest", inline: "nearest" });
    await new Promise((r) => setTimeout(r, 300));
    const tr = tabs[2].getBoundingClientRect(), sr = sc.getBoundingClientRect();
    const ok = tr.right <= sr.right + 1 && tr.left >= sr.left - 1;
    const reached = Math.round(sc.scrollLeft);
    sc.scrollLeft = 0;
    return { scrollLeft: reached, lastTabReachable: ok };
  });
  return { ...res, controlScrolledOnFocus: control, viaScrollIntoView, perTab };
};

/** W2: Chromium's COMPUTED accessibility tree, over CDP — not the DOM attributes. */
async function probeAxTree(page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Accessibility.enable");
  const { nodes } = await cdp.send("Accessibility.getFullAXTree");
  const byId = new Map(nodes.map((n) => [n.nodeId, n]));
  const roleOf = (n) => n?.role?.value ?? null;
  const prop = (n, name) => n?.properties?.find((p) => p.name === name)?.value?.value;

  // Scoped to THIS strip. The dashboard also renders the bottom router tab bar
  // (Explore/Post/Dashboard/Profile), which is a second, legitimate tablist and is the
  // out-of-scope F2 surface — so a global "exactly one tablist" assertion would be wrong.
  const allTablists = nodes.filter((n) => roleOf(n) === "tablist" && !n.ignored);
  const tabNodes = nodes.filter(
    (n) => roleOf(n) === "tab" && !n.ignored && TAB_RE_SRC.test(n.name?.value || ""),
  );
  const ancestorIsTablist = (n) => {
    let cur = n;
    const seen = new Set();
    while (cur && cur.parentId && !seen.has(cur.parentId)) {
      seen.add(cur.parentId);
      cur = byId.get(cur.parentId);
      if (roleOf(cur) === "tablist") return cur.nodeId;
    }
    return null;
  };
  const owners = tabNodes.map(ancestorIsTablist);
  await cdp.send("Accessibility.disable");
  await cdp.detach();
  return {
    tablistsOnPage: allTablists.length,
    stripTablistCount: new Set(owners.filter(Boolean)).size,
    tabCount: tabNodes.length,
    tabNames: tabNodes.map((n) => n.name?.value ?? null),
    tabSelected: tabNodes.map((n) => prop(n, "selected")),
    tabsUnderOneTablist: owners.every(Boolean) && new Set(owners).size === 1,
    selectedCount: tabNodes.filter((n) => prop(n, "selected") === true).length,
    // A tab that reports no accessible name would be a §H7 regression regardless of role.
    unnamed: tabNodes.filter((n) => !(n.name?.value || "").trim()).length,
  };
}
const TAB_RE_SRC = /^(My Properties|Site Visits|Buyer Contacts),/;

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

async function newCtx(browser, width, auth, scheme) {
  const ctx = await browser.newContext({
    viewport: { width, height: width >= 1440 ? 900 : 800 },
    colorScheme: scheme,
    deviceScaleFactor: 1,
  });
  await ctx.addInitScript(
    (a) => {
      try {
        localStorage.setItem("auth_token", a.token);
        localStorage.setItem("auth_user", JSON.stringify(a.user));
        localStorage.setItem("blab-theme", a.scheme);
      } catch {}
    },
    { ...auth, scheme },
  );
  return ctx;
}

const READY = () =>
  [...document.querySelectorAll('[role="tab"]')].some((el) =>
    /^Buyer Contacts,/.test(el.getAttribute("aria-label") || ""));

async function openDashboard(ctx) {
  const page = await ctx.newPage();
  await page.goto(WEB + "/dashboard", { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForFunction(READY, null, { timeout: 180000 });
  await page.waitForTimeout(1200);
  return page;
}

/** Relative luminance (WCAG 2.x), used for the W5 grayscale argument. */
function relLum(css) {
  const m = (css || "").match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const [r, g, b] = m[1].split(",").map((v) => parseFloat(v));
  const f = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
const contrastRatio = (a, b) => {
  const la = relLum(a), lb = relLum(b);
  if (la === null || lb === null) return null;
  return Math.round(((Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)) * 100) / 100;
};

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const pinBefore = pinOf();
  const auth = await login(FIXTURE);
  const browser = await chromium.launch();

  const geom = [];   // W1/W4/W5 geometry, light scheme, all widths x scales
  const kbd = [];    // W3
  const ax = [];     // W2
  const scheme = []; // W5 light/dark

  for (const width of WIDTHS) {
    const ctx = await newCtx(browser, width, auth, "light");
    const page = await openDashboard(ctx);
    for (const { k, name } of SCALES) {
      if (k !== 1.0) {
        await page.evaluate(APPLY_SCALE, k);
        await page.waitForTimeout(700);
      }
      geom.push({ width, scale: name, ...(await page.evaluate(PROBE_GEOMETRY)) });
      ax.push({ width, scale: name, ...(await probeAxTree(page)) });
      kbd.push({ width, scale: name, ...(await PROBE_KEYBOARD(page)) });
      if (k !== 1.0) {
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.waitForFunction(READY, null, { timeout: 180000 });
        await page.waitForTimeout(1200);
      }
    }
    await ctx.close();
    console.log(`probed w${width}`);
  }

  // W5 — light/dark colour + grayscale frames of the strip at default and AX3.
  for (const sch of ["light", "dark"]) {
    const ctx = await newCtx(browser, 390, auth, sch);
    const page = await openDashboard(ctx);
    for (const { k, name } of [SCALES[0], SCALES[2]]) {
      if (k !== 1.0) {
        await page.evaluate(APPLY_SCALE, k);
        await page.waitForTimeout(700);
      }
      const g = await page.evaluate(PROBE_GEOMETRY);
      scheme.push({ scheme: sch, scale: name, ...g });
      for (const gray of [false, true]) {
        if (gray) await page.evaluate(() => (document.documentElement.style.filter = "grayscale(1)"));
        await page.screenshot({ path: path.join(OUT, `bla33-strip-${sch}-${name}-${gray ? "grayscale" : "color"}.png`) });
        if (gray) await page.evaluate(() => (document.documentElement.style.filter = ""));
      }
      if (k !== 1.0) {
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.waitForFunction(READY, null, { timeout: 180000 });
        await page.waitForTimeout(1200);
      }
    }
    await ctx.close();
  }

  // Cropped strip frames at the scales where W4 bites, as visual proof rather than numbers.
  for (const width of [320, 390]) {
    const ctx = await newCtx(browser, width, auth, "light");
    for (const { k, name } of [SCALES[1], SCALES[2], SCALES[3]]) {
      const page = await openDashboard(ctx);
      await page.evaluate(APPLY_SCALE, k);
      await page.waitForTimeout(700);
      const clip = await page.evaluate(() => {
        const tabs = [...document.querySelectorAll('[role="tab"]')].filter((el) =>
          /^(My Properties|Site Visits|Buyer Contacts),/.test(el.getAttribute("aria-label") || ""));
        let sc = tabs[0].parentElement;
        while (sc && !(tabs.every((t) => sc.contains(t)) && /auto|scroll/.test(getComputedStyle(sc).overflowX)))
          sc = sc.parentElement;
        if (!sc) return null;
        sc.scrollLeft = 0;
        sc.scrollIntoView({ block: "center" });
        const r = sc.getBoundingClientRect();
        return { x: Math.max(0, r.left - 8), y: Math.max(0, r.top - 8), width: Math.min(r.width + 16, window.innerWidth), height: r.height + 16 };
      });
      if (clip && clip.height > 0 && clip.y + clip.height <= (width >= 1440 ? 900 : 800)) {
        await page.screenshot({ path: path.join(OUT, `bla33-stripcrop-w${width}-${name}.png`), clip });
      } else {
        await page.screenshot({ path: path.join(OUT, `bla33-stripcrop-w${width}-${name}.png`) });
      }
      await page.close();
    }
    await ctx.close();
  }

  await browser.close();
  const pinAfter = pinOf();

  // ── Scoring ──────────────────────────────────────────────────────────────────
  const checks = [];
  const add = (id, what, pass, detail) => checks.push({ id, what, verdict: pass ? "PASS" : "FAIL", detail });

  // W0 — pin.
  {
    const same =
      pinBefore.head === pinAfter.head &&
      pinBefore.subjectBlob === pinAfter.subjectBlob &&
      !pinBefore.subjectDirty &&
      !pinAfter.subjectDirty;
    const served = geom.every((g) => g.found && g.scrollerFound && /auto|scroll/.test(g.overflowX || ""));
    add(
      "W0",
      "PIN: HEAD and the subject file are byte-identical before and after the run, the subject is not dirty, and the served DOM carries the post-fix ScrollView signature",
      same && served,
      `HEAD ${pinBefore.head.slice(0, 7)}${pinBefore.head === pinAfter.head ? " stable" : " CHANGED to " + pinAfter.head.slice(0, 7)}; ` +
        `blob ${pinBefore.subjectBlob.slice(0, 7)}${pinBefore.subjectBlob === pinAfter.subjectBlob ? " stable" : " CHANGED"}; ` +
        `dirty ${pinBefore.subjectDirty || pinAfter.subjectDirty}; ` +
        `overflow-x scroller present in ${geom.filter((g) => g.scrollerFound).length}/${geom.length} measurements`,
    );
  }

  // W1 — D2g, unrounded. Equal thirds, no scrollability, at the reviewed scales.
  {
    const reviewed = geom.filter((g) => g.found && ["L-default", "xxxLarge"].includes(g.scale));
    const unequal = reviewed.filter((g) => g.tabWidthSpreadPx > 0.5)
      .map((g) => `w${g.width}/${g.scale} spread ${g.tabWidthSpreadPx}px (${g.tabs.map((t) => t.widthPx).join("/")})`);
    const scrolls = reviewed.filter((g) => g.scrollableByPx > 0.5).map((g) => `w${g.width}/${g.scale} +${g.scrollableByPx}px`);
    add(
      "W1a",
      "D2g unrounded: at L-default and xxxLarge the three tabs are equal thirds and the strip offers no scroll (the reviewed layout the CEO signed off)",
      unequal.length === 0 && scrolls.length === 0,
      [...unequal, ...scrolls].join(" | ") ||
        reviewed.map((g) => `w${g.width}/${g.scale} ${g.tabs[0].widthPx}px x3`).join(", "),
    );

    // The reconciliation BLA-33 explicitly asked for: 120.7 (BLA-25) vs 121 (Layer-1).
    const at390 = reviewed.find((g) => g.width === 390 && g.scale === "L-default");
    const w = at390 ? at390.tabs[0].widthPx : null;
    add(
      "W1b",
      "The 390pt tab width reconciles BLA-25's 120.7pt against Layer-1's 121px — same tree, different rounding, not a disagreement",
      w !== null && Math.abs(w - 120.7) < 0.75 && Math.round(w) === 121,
      w === null ? "not measured" : `unrounded ${w}px -> rounds to ${Math.round(w)}; BLA-25 banked 120.7, Layer-1 banked 121`,
    );
  }

  // W2 — AX tree, not DOM attributes.
  {
    const bad = ax.filter(
      (a) => a.stripTablistCount !== 1 || a.tabCount !== 3 || !a.tabsUnderOneTablist || a.selectedCount !== 1 || a.unnamed > 0,
    );
    add(
      "W2",
      "D2f by Chromium's COMPUTED AX tree: the dashboard strip's three named tab nodes sit under exactly ONE tablist node with exactly one reporting selected=true — at every width x scale. The role survived moving onto a ScrollView",
      bad.length === 0,
      bad.length === 0
        ? `${ax.length}/${ax.length} measurements: 1 strip tablist, 3 tabs, 1 selected, 0 unnamed (names: ${ax[0].tabNames.map((n) => (n || "").slice(0, 18)).join(" / ")}). ` +
          `Page carries ${ax[0].tablistsOnPage} tablists in total — the second is the bottom router bar, the out-of-scope F2 surface.`
        : bad
            .slice(0, 6)
            .map((a) => `w${a.width}/${a.scale} stripTablists=${a.stripTablistCount} tabs=${a.tabCount} oneParent=${a.tabsUnderOneTablist} selected=${a.selectedCount} unnamed=${a.unnamed}`)
            .join(" | "),
    );
  }

  // W3 — keyboard reachability, the real path when no scrollbar is shown.
  {
    const controlWorks = kbd.every((m) => m.controlScrolledOnFocus > 0);
    const canScroll = kbd.every((m) => m.viaScrollIntoView.lastTabReachable);
    const unfocusable = kbd.filter((m) => m.perTab.some((t) => !t.isFocused))
      .map((m) => `w${m.width}/${m.scale} tabs ${m.perTab.filter((t) => !t.isFocused).map((t) => t.index).join(",")} not focusable`);
    const notScrolled = kbd.filter((m) => m.perTab.some((t) => !t.fullyVisible))
      .map((m) => {
        const t = m.perTab.find((x) => !x.fullyVisible);
        return `w${m.width}/${m.scale} tab${t.index} still clipped by ${t.clippedRightPx}px after focus, scrollLeft ${t.scrollLeft}`;
      });
    add(
      "W3",
      "D2e by focus, not by scrollLeft: focusing an off-screen tab scrolls it into view — the only reachability path a keyboard/switch user has once showsHorizontalScrollIndicator={false} removes the visible affordance",
      unfocusable.length === 0 && notScrolled.length === 0,
      !controlWorks
        ? "INCONCLUSIVE — the injected control scroller did not scroll on focus either, so this browser does not exercise focus-scroll"
        : [...unfocusable, ...notScrolled].slice(0, 6).join(" | ") ||
          `${kbd.length * 3} focus moves, all scrolled fully into view`,
    );
    add(
      "W3ctl",
      "W3 control: the same browser DOES scroll a plain injected overflow-x scroller on focus, and scrollIntoView() does reach the strip's last tab — so any W3 failure is the strip's focus path, not the harness and not an unscrollable strip",
      controlWorks && canScroll,
      `injected control scrolled ${kbd[0]?.controlScrolledOnFocus}px on focus (all ${kbd.length} runs > 0: ${controlWorks}); ` +
        `scrollIntoView reaches the last tab in ${kbd.filter((m) => m.viaScrollIntoView.lastTabReachable).length}/${kbd.length} runs ` +
        `(max scrollLeft ${Math.max(...kbd.map((m) => m.viaScrollIntoView.scrollLeft))}px)`,
    );
  }

  // W4 — the gap in D2d. D2d measures only the LABEL's right edge against the tab's right
  // padding edge. The tab is a CENTRED row of label + count badge, so a row that does not fit
  // overflows symmetrically: the label leftwards and the badge rightwards. Neither is visible
  // to D2d, and D2c cannot see it either because flexShrink: 0 means there is no ellipsis to
  // detect. These three checks are the ones that gap hides.
  {
    // W4a — the serious one. Text clipped by the strip's START edge is unreachable.
    const lost = geom.filter((g) => g.found).flatMap((g) =>
      g.tabs.flatMap((t) =>
        t.kids
          .filter((k) => k.clippedByStripStartPx > 0.5)
          .map((k) => `w${g.width}/${g.scale} "${t.labelText}" child "${k.text}" clipped ${k.clippedByStripStartPx}px by the strip's start edge (canScrollLeft=${g.canScrollLeft}, scrollableBy=${g.scrollableByPx})`),
      ),
    );
    add(
      "W4a",
      "No tab content is clipped by the strip's START edge — which for LTR is outside the scrollable overflow region and therefore UNREACHABLE lost text, with no ellipsis to signal it",
      lost.length === 0,
      lost.length === 0 ? `${geom.length * 3} tabs, 0 clipped` : `${lost.length} clipped: ` + lost.slice(0, 6).join(" | "),
    );

    // W4b — mis-targeting: content rendered inside the NEXT tab's pressable.
    const intrude = geom.filter((g) => g.found).flatMap((g) =>
      g.tabs.flatMap((t) =>
        t.kids
          .filter((k) => k.intoNextTabHitAreaPx > 0.5)
          .map((k) => `w${g.width}/${g.scale} "${t.labelText}" child "${k.text}" ${k.intoNextTabHitAreaPx}px inside the next tab's hit area`),
      ),
    );
    add(
      "W4b",
      "No tab's content renders inside the NEXT tab's hit target — a tap on the visible glyph must not select the adjacent tab",
      intrude.length === 0,
      intrude.length === 0 ? "0 intrusions" : `${intrude.length} intrusions: ` + intrude.slice(0, 6).join(" | "),
    );

    // W4c — the row simply does not fit its tab, both edges, which is the root of W4a/W4b.
    const overRow = geom.filter((g) => g.found).flatMap((g) =>
      g.tabs
        .filter((t) => t.kidsSumPx - t.contentWidthPx > 0.5)
        .map((t) => `w${g.width}/${g.scale} "${t.labelText}" needs ${t.kidsSumPx} in ${t.contentWidthPx}`),
    );
    const trunc = geom.filter((g) => g.found).flatMap((g) =>
      g.tabs.filter((t) => t.labelTruncatedPx > 0.5).map((t) => `w${g.width}/${g.scale} "${t.labelText}" -${t.labelTruncatedPx}px`),
    );
    add(
      "W4c",
      "Every tab's label + badge row fits inside its own tab content box, and no label is ellipsised",
      overRow.length === 0 && trunc.length === 0,
      [...overRow, ...trunc].slice(0, 6).join(" | ") ||
        `${geom.length * 3} tabs measured, 0 row overflows, 0 truncations`,
    );
  }

  // W5 — the active underline, and selection without colour.
  {
    const bad = [], grayCues = [];
    for (const g of [...geom, ...scheme].filter((x) => x.found)) {
      const at = `${g.scheme ? g.scheme + "/" : "w" + g.width + "/"}${g.scale}`;
      const underlined = g.tabs.filter((t) => t.borderBottomWidthPx >= 1.5);
      const selected = g.tabs.filter((t) => t.ariaSelected === "true");
      if (underlined.length !== 1) bad.push(`${at} ${underlined.length} tabs underlined`);
      else if (selected.length !== 1 || underlined[0].ariaLabel !== selected[0].ariaLabel)
        bad.push(`${at} underline is not on the selected tab`);
      // Colour-free cues: the underline's luminance against the strip hairline, and weight.
      const ratio = underlined[0] ? contrastRatio(underlined[0].borderBottomColor, g.stripBorderBottomColor) : null;
      const weightDiff =
        underlined[0] &&
        g.tabs.some((t) => t.ariaSelected !== "true" && t.labelFontWeight !== underlined[0].labelFontWeight);
      grayCues.push({ at, underlineVsHairline: ratio, weightDiffersFromInactive: !!weightDiff, activeWeight: underlined[0]?.labelFontWeight });
      if (!weightDiff) bad.push(`${at} active label weight does not differ from inactive`);
      if (ratio !== null && ratio < 1.5) bad.push(`${at} underline vs hairline luminance ratio only ${ratio}`);
    }
    add(
      "W5",
      "Issue #5: exactly one tab carries the 2px underline, it is the selected one, and selection survives colour removal (underline luminance vs the strip hairline + an independent fontWeight cue) in light AND dark",
      bad.length === 0,
      bad.length === 0
        ? `${grayCues.length} measurements; underline-vs-hairline ratio ${Math.min(...grayCues.map((c) => c.underlineVsHairline ?? 99))}–${Math.max(...grayCues.map((c) => c.underlineVsHairline ?? 0))}, active weight ${grayCues[0].activeWeight} vs inactive, in both schemes`
        : [...new Set(bad)].slice(0, 6).join(" | "),
    );
    var grayCuesOut = grayCues;
  }

  const failed = checks.filter((c) => c.verdict === "FAIL");
  const report = {
    generatedFor: "BLA-33 — independent Layer-2 web re-verification of the dashboard tab strip",
    subject: SUBJECT,
    pin: { before: pinBefore, after: pinAfter },
    web: WEB,
    widths: WIDTHS,
    scales: SCALES.map((s) => s.name),
    fixture: FIXTURE,
    verdict: failed.length === 0 ? "ALL_PASS" : "FAIL",
    checks,
    colourFreeCues: grayCuesOut,
    raw: { geometry: geom, axTree: ax, keyboard: kbd, scheme },
  };
  fs.writeFileSync(path.join(OUT, "bla33-web-tabstrip.json"), JSON.stringify(report, null, 2));

  if (process.argv.includes("--json")) console.log(JSON.stringify(report, null, 2));
  else {
    for (const c of checks) console.log(`${c.verdict}  ${c.id}  ${c.what}\n        ${c.detail}\n`);
    console.log(`VERDICT ${report.verdict}  (${checks.length - failed.length}/${checks.length})`);
    console.log(`out ${path.join(OUT, "bla33-web-tabstrip.json")}`);
  }
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
