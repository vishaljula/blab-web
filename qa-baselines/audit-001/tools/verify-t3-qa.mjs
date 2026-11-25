/**
 * AUDIT-001 Ticket 3 — Layer-2 independent QA harness (BLA-12).
 *
 * Written by Independent Mobile/Web QA. Deliberately does NOT reuse the implementer's
 * numbers or the implementer's assertions: every claim in BLA-12 is re-derived from the
 * live rendered DOM of the Expo web build.
 *
 * Sections (mapped to BLA-12):
 *   §2  hit targets   — getBoundingClientRect() on every interactive element, >= 44x44
 *   §3  Dynamic Type  — font-scale emulation sweep, clip + overlap detection
 *   §4  screen reader — Chromium's computed accessibility tree (role + name + state)
 *   §5  colour-only   — status dots must have a text equivalent in the same subtree
 *   §6  contrast      — live computed colours, composited, WCAG 2.1 AA
 *
 * Read-only with respect to app source.
 *
 * Usage: node qa-baselines/audit-001/tools/verify-t3-qa.mjs [--only <frameId>] [--quick]
 */
import { createRequire } from "module";
import fs from "fs";
import path from "path";

const ROOT = "/Users/adi/Projects/blab-web-agents";
const require = createRequire(ROOT + "/package.json");
const { chromium } = require("playwright");

// `QA_OUT` / `QA_WEB` let the identical harness be pointed at a second Expo server
// serving the pre-T3 commit (853cba7), which is how a pre-existing defect is told apart
// from a T3 regression instead of being guessed at.
const OUT = process.env.QA_OUT
  ? path.resolve(process.env.QA_OUT)
  : path.join(ROOT, "qa-baselines/audit-001/t3-qa-layer2");
const SHOTS = path.join(OUT, "frames");
const WEB = process.env.QA_WEB || "http://localhost:8081";
const API = "http://localhost:3000";

const env = fs.readFileSync(ROOT + "/.env.local", "utf8");
const envGet = (k) =>
  (env.match(new RegExp("^" + k + "=(.*)$", "m")) || [])[1]?.trim().replace(/^["']|["']$/g, "");
if (envGet("BLAB_ENV") === "production") {
  console.error("REFUSING: BLAB_ENV === 'production' (Marketplace Invariant #5)");
  process.exit(2);
}

const HIT = 44;
/** iOS Dynamic Type body multipliers: Large(default)=17pt, xxxLarge=23pt, AX3=40pt, AX5=53pt. */
const SCALES = [
  { k: 1.0, name: "L-default" },
  { k: 23 / 17, name: "xxxLarge" },
  { k: 40 / 17, name: "AX3" },
  { k: 53 / 17, name: "AX5-max" },
];

const FIXTURES = {
  realtor_free_trial: "+919100000059",
  realtor_soft_cap: "+919100000034",
  realtor_pro: "+919100000045",
  realtor_pro_plus: "+919100000050",
  member_rich: "+18133355928",
  member_empty: "+91910000003",
};

const FRAMES = [
  { id: "profile-signedout", route: "/profile", auth: null },
  { id: "profile-member-listings", route: "/profile", auth: "member_rich" },
  { id: "profile-member-shoots", route: "/profile", auth: "member_rich", tab: "My Shoots" },
  { id: "profile-realtor-rera", route: "/profile", auth: "realtor_pro", role: "realtor" },
  { id: "profile-empty", route: "/profile", auth: "member_empty" },
  { id: "dashboard-free_trial", route: "/dashboard", auth: "realtor_free_trial" },
  { id: "dashboard-pro", route: "/dashboard", auth: "realtor_pro" },
  { id: "dashboard-soft_cap", route: "/dashboard", auth: "realtor_soft_cap" },
  { id: "dashboard-pro_plus", route: "/dashboard", auth: "realtor_pro_plus" },
  { id: "dashboard-properties-draft", route: "/dashboard", auth: "realtor_pro", tab: "My Properties" },
  { id: "dashboard-sitevisits", route: "/dashboard", auth: "realtor_pro", tab: "Site Visits" },
  { id: "dashboard-buyercontacts", route: "/dashboard", auth: "realtor_pro", tab: "Buyer Contacts" },
];

const VIEWPORTS = {
  // 360pt is explicitly called out in BLA-12 §3 for the tab-bar labels.
  w360: { width: 360, height: 800 },
  w390: { width: 390, height: 844 },
  w1440: { width: 1440, height: 900 },
};

// ── WCAG maths (independent implementation) ───────────────────────────────────
const srgb = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const lum = ([r, g, b]) => 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

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

// ═════════════════════════════════════════════════════════════════════════════
// Browser-side probes (stringified; run via page.evaluate)
// ═════════════════════════════════════════════════════════════════════════════

/** §2 — every interactive element, measured. */
const PROBE_TARGETS = (legacy) => {
  // Pre-T3 the controls carried no accessibilityRole, so they render as plain <div> with
  // no role and no tabindex. On that build the only machine-visible interactivity marker
  // is the web-guarded `cursor: pointer` the call sites set inline, so the "before"
  // column has to be measured through that instead.
  const SEL = legacy
    ? "input,textarea,select,div,span"
    : '[role="button"],[role="tab"],[role="radio"],[role="link"],[role="switch"],' +
      '[role="checkbox"],[role="menuitem"],input,textarea,select,[tabindex="0"]';
  const vis = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none" &&
           Number(cs.opacity) > 0.01;
  };
  const label = (el) =>
    el.getAttribute("aria-label") || (el.innerText || el.value || el.placeholder || "").trim().replace(/\s+/g, " ");
  const legacyInteractive = (el) =>
    el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" ||
    (getComputedStyle(el).cursor === "pointer" &&
     // keep only the outermost pointer element of a nest — the control itself
     !(el.parentElement && getComputedStyle(el.parentElement).cursor === "pointer"));
  return [...document.querySelectorAll(SEL)]
    .filter(vis)
    .filter((el) => (legacy ? legacyInteractive(el) : true))
    .map((el, i) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    // Nested interactive controls (e.g. publish CTA inside the accordion header) must be
    // measured on their own box, not the parent's, so record nesting explicitly.
    const nestedIn = (() => {
      let n = el.parentElement;
      while (n) {
        if (n.matches && n.matches(SEL)) return label(n).slice(0, 60);
        n = n.parentElement;
      }
      return null;
    })();
    return {
      i,
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute("role") || (el.tagName === "INPUT" ? "textbox(native)" : null),
      label: label(el).slice(0, 110),
      w: Math.round(r.width * 100) / 100,
      h: Math.round(r.height * 100) / 100,
      cssMinW: cs.minWidth,
      cssMinH: cs.minHeight,
      cursor: cs.cursor,
      nestedIn,
      ariaSelected: el.getAttribute("aria-selected"),
      ariaExpanded: el.getAttribute("aria-expanded"),
      ariaChecked: el.getAttribute("aria-checked"),
      ariaBusy: el.getAttribute("aria-busy"),
      ariaDisabled: el.getAttribute("aria-disabled"),
      parentRole: (() => {
        let n = el.parentElement;
        while (n) { const rr = n.getAttribute && n.getAttribute("role"); if (rr) return rr; n = n.parentElement; }
        return null;
      })(),
    };
  });
};

/** §2 regression hunt — the accordion header's intended 90pt floor. */
const PROBE_CARDHEADER = () => {
  // cardHeader = the A11yPressable whose label contains the activity summary and which
  // declares minHeight 90 in RealtorDashboard.tsx s.cardHeader.
  return [...document.querySelectorAll('[role="button"]')]
    .filter((el) => getComputedStyle(el).minHeight === "90px" ||
                    (el.firstElementChild && getComputedStyle(el.firstElementChild).minHeight === "90px"))
    .map((el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        label: (el.getAttribute("aria-label") || "").slice(0, 80),
        cssMinHeight: cs.minHeight,
        renderedH: Math.round(r.height * 100) / 100,
        renderedW: Math.round(r.width * 100) / 100,
      };
    });
};

/** text leaves = elements that render text directly (no element child carrying text). */
const TEXT_LEAVES = `(() => {
  const out = [];
  const walk = (el) => {
    const kids = [...el.children];
    const kidHasText = kids.some(k => (k.innerText || '').trim().length > 0);
    const own = (el.innerText || '').trim();
    if (own.length > 0 && !kidHasText) { out.push(el); return; }
    kids.forEach(walk);
  };
  walk(document.body);
  return out;
})()`;

/** §3 — apply a uniform font scale, emulating iOS Dynamic Type. */
const APPLY_SCALE = (k) => {
  const all = [...document.querySelectorAll("*")];
  const read = all.map((el) => {
    const cs = getComputedStyle(el);
    return { el, fs: parseFloat(cs.fontSize), lh: cs.lineHeight };
  });
  for (const { el, fs, lh } of read) {
    if (!fs) continue;
    // `allowFontScaling={false}` is a no-op on react-native-web, so the decorative
    // initials are scaled here too; they are tagged and excluded by the analyser.
    el.style.fontSize = fs * k + "px";
    const lhPx = parseFloat(lh);
    if (!Number.isNaN(lhPx)) el.style.lineHeight = lhPx * k + "px";
  }
  return read.length;
};

/** §3 — find clipped / overlapping text after scaling. */
const PROBE_CLIP = () => {
  const leaves = (() => {
    const out = [];
    const walk = (el) => {
      const kids = [...el.children];
      const kidHasText = kids.some((k) => (k.innerText || "").trim().length > 0);
      const own = (el.innerText || "").trim();
      if (own.length > 0 && !kidHasText) { out.push(el); return; }
      kids.forEach(walk);
    };
    walk(document.body);
    return out;
  })();

  // `allowFontScaling={false}` is a no-op on react-native-web, so the three decorative
  // initials strings are scaled here when iOS would not scale them. Recognise them by
  // shape (1–2 uppercase letters inside a circular fixed-size box) and exempt them,
  // matching the native behaviour this emulation is standing in for.
  const isDecorativeInitials = (el, txt) => {
    if (!/^[A-Z]{1,2}$/.test(txt)) return false;
    let n = el.parentElement, hops = 0;
    while (n && hops < 3) {
      const r = n.getBoundingClientRect();
      const cs = getComputedStyle(n);
      if (Math.abs(r.width - r.height) < 3 && parseFloat(cs.borderTopLeftRadius) >= r.width / 2 - 1) return true;
      n = n.parentElement; hops++;
    }
    return false;
  };

  const clipped = [];
  const boxes = [];
  for (const el of leaves) {
    const txt = (el.innerText || "").trim().replace(/\s+/g, " ");
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) continue;
    const cs = getComputedStyle(el);
    const decorative = isDecorativeInitials(el, txt);
    // The Expo Router bottom tab bar is a fixed overlay: scrolled content passing under
    // it is geometric overlap by design, not a Dynamic Type defect. Tag it so the two
    // can be told apart in the report.
    // Expo Router renders its tab bar items as <a role="tab">; app-level tab bars are
    // <div role="tab">. closest() on the anchor therefore identifies the router bar exactly.
    const fixedOverlay = !!(el.closest && el.closest('a[role="tab"]'));
    boxes.push({ t: txt.slice(0, 50), x: r.x, y: r.y, w: r.width, h: r.height, decorative, fixedOverlay });
    if (decorative) continue;

    // Truncation that the author asked for is not a defect: numberOfLines={1} renders as
    // text-overflow:ellipsis on web, numberOfLines>1 as -webkit-line-clamp.
    const intentional = (e) => {
      const c = getComputedStyle(e);
      return (c.webkitLineClamp && c.webkitLineClamp !== "none") ||
             (c.textOverflow && c.textOverflow !== "clip");
    };
    if (intentional(el)) continue;

    // Direct geometric test: is THIS text's box actually outside a cropping ancestor's
    // visible area? Testing the ancestor's scrollHeight instead would also fire on a
    // scroll container (content still reachable) and on `hero`, whose overflow:hidden
    // exists to crop two decorative absolutely-positioned circles, not the text.
    let n = el.parentElement, hops = 0;
    // Once a scrollable ancestor is passed on an axis, anything beyond it on that axis is
    // reachable by scrolling and is not clipped — so stop checking that axis.
    let scrollableX = false, scrollableY = false;
    while (n && hops < 8) {
      const ncs = getComputedStyle(n);
      const scrollish = (v) => v === "auto" || v === "scroll";
      if (scrollish(ncs.overflowX)) scrollableX = true;
      if (scrollish(ncs.overflowY)) scrollableY = true;
      const cropsX = !scrollableX && (ncs.overflowX === "hidden" || ncs.overflowX === "clip");
      const cropsY = !scrollableY && (ncs.overflowY === "hidden" || ncs.overflowY === "clip");
      if ((cropsX || cropsY) && !intentional(n)) {
        const nr = n.getBoundingClientRect();
        // Visible (padding) box of the cropper, excluding its own border.
        const bl = parseFloat(ncs.borderLeftWidth) || 0, bt = parseFloat(ncs.borderTopWidth) || 0;
        const vx = nr.left + bl, vy = nr.top + bt;
        const vr = vx + n.clientWidth, vb = vy + n.clientHeight;
        const outR = cropsX ? r.right - vr : 0;
        const outL = cropsX ? vx - r.left : 0;
        const outB = cropsY ? r.bottom - vb : 0;
        const outT = cropsY ? vy - r.top : 0;
        const cutPx = Math.max(outR, outL, outB, outT);
        if (cutPx > 1) {
          clipped.push({
            text: txt.slice(0, 60),
            axis: Math.max(outR, outL) > Math.max(outB, outT) ? "horizontal" : "vertical",
            cutPx: Math.round(cutPx * 10) / 10,
            fontSizePx: Math.round(parseFloat(cs.fontSize) * 10) / 10,
            textBox: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
            cropperBox: [Math.round(vx), Math.round(vy), n.clientWidth, n.clientHeight],
            cropperTag: n.tagName.toLowerCase(),
            cropperAriaLabel: (n.getAttribute("aria-label") || "").slice(0, 60),
            overflowX: ncs.overflowX, overflowY: ncs.overflowY,
            cropperStyleMinH: ncs.minHeight, cropperStyleH: ncs.height,
          });
          break;
        }
      }
      n = n.parentElement; hops++;
    }
  }

  // Overlap between two real text boxes. Icon-font glyphs (Ionicons live in the Unicode
  // private use area) are excluded: a badge deliberately sitting on an icon is by design,
  // and decorative initials are excluded for the allowFontScaling reason above.
  const real = boxes.filter((b) => !b.decorative && /[A-Za-z0-9₹]/.test(b.t));
  const overlaps = [];
  for (let a = 0; a < real.length; a++) {
    for (let b = a + 1; b < real.length; b++) {
      const A = real[a], B = real[b];
      const ix = Math.min(A.x + A.w, B.x + B.w) - Math.max(A.x, B.x);
      const iy = Math.min(A.y + A.h, B.y + B.h) - Math.max(A.y, B.y);
      if (ix <= 1 || iy <= 1) continue;
      const area = ix * iy;
      const small = Math.min(A.w * A.h, B.w * B.h);
      if (area / small > 0.2)
        overlaps.push({ a: A.t, b: B.t, overlapFrac: Math.round((area / small) * 100) / 100,
                        aBox: [Math.round(A.x), Math.round(A.y), Math.round(A.w), Math.round(A.h)],
                        bBox: [Math.round(B.x), Math.round(B.y), Math.round(B.w), Math.round(B.h)],
                        // true => one side is the fixed router tab bar (content scrolling
                        // under a floating bar), which is by design.
                        fixedOverlayInvolved: A.fixedOverlay || B.fixedOverlay });
    }
  }
  return { clipped, overlaps, leafCount: boxes.length, decorativeExempt: boxes.filter((b) => b.decorative).map((b) => b.t) };
};

/** §5 — every coloured status dot must have text in its own subtree. */
const PROBE_STATUS_DOTS = () => {
  // RN renders the 8pt dot as a 8x8 div with a border-radius and a solid background.
  const dots = [...document.querySelectorAll("div")].filter((el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width >= 6 && r.width <= 12 && Math.abs(r.width - r.height) < 2 &&
           parseFloat(cs.borderTopLeftRadius) >= r.width / 2 - 0.6 &&
           cs.backgroundColor && !/rgba\(0, 0, 0, 0\)/.test(cs.backgroundColor) &&
           (el.innerText || "").trim() === "";
  });
  return dots.map((el) => {
    const cs = getComputedStyle(el);
    // Nearest ancestor that carries text — the text equivalent for the hue.
    let n = el.parentElement, text = "", hops = 0;
    while (n && hops < 4 && !text) { text = (n.innerText || "").trim().replace(/\s+/g, " "); n = n.parentElement; hops++; }
    const sib = [...(el.parentElement ? el.parentElement.children : [])]
      .filter((c) => c !== el).map((c) => (c.innerText || "").trim()).filter(Boolean).join(" | ");
    const r = el.getBoundingClientRect();
    return {
      color: cs.backgroundColor,
      sizePx: Math.round(r.width * 10) / 10,
      siblingText: sib.slice(0, 80),
      subtreeText: text.slice(0, 90),
      hasTextEquivalent: sib.length > 0,
    };
  });
};

/** §6 — live composited contrast for every text leaf. */
const PROBE_CONTRAST = () => {
  const parse = (s) => {
    const m = (s || "").match(/[\d.]+/g) || [];
    return { rgb: m.slice(0, 3).map(Number), a: m.length > 3 ? Number(m[3]) : 1 };
  };
  const leaves = (() => {
    const out = [];
    const walk = (el) => {
      const kids = [...el.children];
      const kidHasText = kids.some((k) => (k.innerText || "").trim().length > 0);
      if ((el.innerText || "").trim().length > 0 && !kidHasText) { out.push(el); return; }
      kids.forEach(walk);
    };
    walk(document.body);
    return out;
  })();
  const seen = new Set();
  const out = [];
  for (const el of leaves) {
    const txt = (el.innerText || "").trim().replace(/\s+/g, " ");
    if (!txt) continue;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) continue;
    const cs = getComputedStyle(el);
    // Composite every translucent background from the element upward onto the page base.
    const stack = [];
    let n = el;
    while (n) {
      const b = parse(getComputedStyle(n).backgroundColor);
      if (b.a > 0) stack.push(b);
      n = n.parentElement;
    }
    stack.push({ rgb: [255, 255, 255], a: 1 });
    let bg = stack[stack.length - 1].rgb;
    for (let i = stack.length - 2; i >= 0; i--) {
      const l = stack[i];
      bg = l.rgb.map((c, j) => c * l.a + bg[j] * (1 - l.a));
    }
    const fg = parse(cs.color);
    const eff = fg.rgb.map((c, j) => c * fg.a + bg[j] * (1 - fg.a));
    const key = cs.color + "|" + bg.map(Math.round).join(",") + "|" + cs.fontSize + "|" + cs.fontWeight;
    if (seen.has(key)) continue;
    seen.add(key);
    const px = parseFloat(cs.fontSize);
    const bold = Number(cs.fontWeight) >= 700;
    const large = px >= 24 || (bold && px >= 18.66);
    out.push({
      sample: txt.slice(0, 44),
      color: cs.color,
      backdrop: "rgb(" + bg.map((c) => Math.round(c)).join(", ") + ")",
      fontSizePx: px, fontWeight: cs.fontWeight, largeText: large,
      threshold: large ? 3.0 : 4.5,
    });
  }
  return out;
};

// ═════════════════════════════════════════════════════════════════════════════

async function newCtx(browser, { vp, scheme, auth }) {
  const ctx = await browser.newContext({ viewport: vp, colorScheme: scheme, deviceScaleFactor: 1 });
  await ctx.addInitScript(({ a, scheme }) => {
    try {
      if (a) { localStorage.setItem("auth_token", a.token); localStorage.setItem("auth_user", JSON.stringify(a.user)); }
      else { localStorage.removeItem("auth_token"); localStorage.removeItem("auth_user"); }
      localStorage.setItem("blab-theme", scheme);
    } catch {}
  }, { a: auth, scheme });
  return ctx;
}

async function clickByLabelish(page, label) {
  return page.evaluate((lbl) => {
    const cands = [...document.querySelectorAll('[role="tab"],[role="button"],[tabindex="0"]')]
      .filter((el) => {
        const al = el.getAttribute("aria-label") || "";
        const t = (el.innerText || "").trim();
        return al.startsWith(lbl) || t === lbl || t.startsWith(lbl);
      });
    const el = cands.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)[0];
    if (!el) return false;
    el.click();
    return true;
  }, label);
}

async function bootPage(ctx, route) {
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push("PAGEERROR " + String(e).slice(0, 240)));
  // React's DOM-nesting validation surfaces as console.error, not as a page error, so a
  // pageerror-only listener would have missed the nested-<button> defect entirely.
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text().slice(0, 240);
    if (/deprecated|useNativeDriver/.test(t)) return;
    if (!errors.includes("CONSOLE " + t)) errors.push("CONSOLE " + t);
  });
  await page.goto(WEB + route, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForFunction(() => document.body && document.body.innerText.trim().length > 20, null, { timeout: 180000 });
  await page.waitForTimeout(3200);
  return { page, errors };
}

async function main() {
  const args = process.argv.slice(2);
  const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;
  const quick = args.includes("--quick");

  fs.mkdirSync(SHOTS, { recursive: true });

  const tokens = {};
  for (const [k, p] of Object.entries(FIXTURES)) {
    tokens[k] = await login(p);
    console.log(`auth ${k.padEnd(20)} -> ${tokens[k].user.name || "(anon)"} / ${tokens[k].user.role}`);
  }

  // The pre-T3 comparison server runs on a second port, which the API's CORS allowlist
  // does not cover. Only the comparison run needs this; the T3 run never sets it.
  const browser = await chromium.launch(
    process.env.QA_DISABLE_WEB_SECURITY
      ? { args: ["--disable-web-security", "--disable-site-isolation-trials"] }
      : {}
  );
  const R = { targets: [], cardHeader: [], dynamicType: [], a11yTree: [], statusDots: [], contrast: [], pageErrors: [] };

  const frames = only ? FRAMES.filter((f) => f.id === only) : FRAMES;

  for (const frame of frames) {
    const auth = frame.auth ? tokens[frame.auth] : null;

    // ── §2 + §4 + §5: geometry & semantics (scheme-independent) @ 3 viewports ──
    for (const [vpName, vp] of Object.entries(quick ? { w390: VIEWPORTS.w390 } : VIEWPORTS)) {
      const ctx = await newCtx(browser, { vp, scheme: "light", auth });
      const { page, errors } = await bootPage(ctx, frame.route);
      if (frame.role) { await clickByLabelish(page, frame.role === "realtor" ? "Realtor mode" : frame.role); await page.waitForTimeout(1500); }
      if (frame.tab) { const ok = await clickByLabelish(page, frame.tab); if (!ok) console.log(`  !! tab MISS ${frame.id}/${frame.tab}`); await page.waitForTimeout(2200); }

      const targets = await page.evaluate(PROBE_TARGETS, !!process.env.QA_LEGACY_TARGETS);
      R.targets.push({ frame: frame.id, viewport: vpName, targets });

      if (frame.route === "/dashboard") {
        const ch = await page.evaluate(PROBE_CARDHEADER);
        if (ch.length) R.cardHeader.push({ frame: frame.id, viewport: vpName, headers: ch });
      }

      if (vpName === "w390") {
        // §4 — Chromium's *computed* accessibility tree (CDP Accessibility domain),
        // i.e. what a screen reader actually receives, not the attributes the author
        // wrote. page.accessibility was removed in Playwright 1.65, so go via CDP.
        const flat = await (async () => {
          const cdp = await page.context().newCDPSession(page);
          await cdp.send("Accessibility.enable");
          const { nodes } = await cdp.send("Accessibility.getFullAXTree");
          const KEEP = ["button", "tab", "radio", "link", "textbox", "tablist", "radiogroup", "switch", "checkbox"];
          const byId = new Map(nodes.map((n) => [n.nodeId, n]));
          const prop = (n, k) => (n.properties || []).find((p) => p.name === k)?.value?.value;
          const out = nodes
            .filter((n) => KEEP.includes(n.role?.value) && !n.ignored)
            .map((n) => {
              // Nearest non-generic ancestor role — proves tab ∈ tablist, radio ∈ radiogroup.
              let p = n.parentId ? byId.get(n.parentId) : null, pr = null;
              while (p && !pr) {
                const r = p.role?.value;
                if (r && !["generic", "none", "GenericContainer", "StaticText"].includes(r)) pr = r;
                p = p.parentId ? byId.get(p.parentId) : null;
              }
              return {
                role: n.role.value,
                name: (n.name?.value || "").slice(0, 110),
                parentRole: pr,
                selected: prop(n, "selected"),
                expanded: prop(n, "expanded"),
                checked: prop(n, "checked"),
                disabled: prop(n, "disabled"),
                busy: prop(n, "busy"),
              };
            });
          await cdp.detach();
          return out;
        })();
        R.a11yTree.push({ frame: frame.id, tree: flat });

        R.statusDots.push({ frame: frame.id, scheme: "light", dots: await page.evaluate(PROBE_STATUS_DOTS) });

        // Accordion expand/collapse flip (§4)
        if (frame.route === "/dashboard") {
          const before = await page.evaluate(() =>
            [...document.querySelectorAll('[aria-expanded]')].map((el) => ({
              label: (el.getAttribute("aria-label") || "").slice(0, 60), expanded: el.getAttribute("aria-expanded") })));
          if (before.length) {
            await page.evaluate(() => document.querySelector('[aria-expanded]').click());
            await page.waitForTimeout(1200);
            const after = await page.evaluate(() =>
              [...document.querySelectorAll('[aria-expanded]')].map((el) => ({
                label: (el.getAttribute("aria-label") || "").slice(0, 60), expanded: el.getAttribute("aria-expanded") })));
            R.a11yTree.push({ frame: frame.id, accordionFlip: { before: before[0], after: after[0] } });
            // cardHeader height while expanded — the minHeight:90 regression hunt
            const chx = await page.evaluate(PROBE_CARDHEADER);
            R.cardHeader.push({ frame: frame.id, viewport: "w390-expanded", headers: chx });
            await page.evaluate(() => document.querySelector('[aria-expanded]').click());
            await page.waitForTimeout(800);
          }
        }
      }

      if (errors.length) R.pageErrors.push({ frame: frame.id, viewport: vpName, errors });
      await ctx.close();
    }

    // ── §3: Dynamic Type sweep @ 360 and 390 (geometry is scheme-independent) ──
    for (const [vpName, vp] of Object.entries(quick ? { w360: VIEWPORTS.w360 } : { w360: VIEWPORTS.w360, w390: VIEWPORTS.w390 })) {
      const ctx = await newCtx(browser, { vp, scheme: "light", auth });
      const { page } = await bootPage(ctx, frame.route);
      if (frame.role) { await clickByLabelish(page, "Realtor mode"); await page.waitForTimeout(1500); }
      if (frame.tab) { await clickByLabelish(page, frame.tab); await page.waitForTimeout(2200); }
      for (const { k, name } of SCALES) {
        if (k !== 1.0) { await page.evaluate(APPLY_SCALE, k); await page.waitForTimeout(700); }
        const res = await page.evaluate(PROBE_CLIP);
        R.dynamicType.push({ frame: frame.id, viewport: vpName, scale: name, k: Math.round(k * 1000) / 1000, ...res });
        await page.screenshot({ path: path.join(SHOTS, `${frame.id}-${vpName}-${name}.png`), fullPage: true });
        if (k !== 1.0) { await page.reload({ waitUntil: "domcontentloaded" });
          await page.waitForFunction(() => document.body && document.body.innerText.trim().length > 20, null, { timeout: 180000 });
          await page.waitForTimeout(3000);
          if (frame.role) { await clickByLabelish(page, "Realtor mode"); await page.waitForTimeout(1500); }
          if (frame.tab) { await clickByLabelish(page, frame.tab); await page.waitForTimeout(2200); }
        }
      }
      await ctx.close();
    }

    // ── §5 + §6: both colour schemes @ 390 ────────────────────────────────────
    for (const scheme of ["light", "dark"]) {
      const ctx = await newCtx(browser, { vp: VIEWPORTS.w390, scheme, auth });
      const { page } = await bootPage(ctx, frame.route);
      if (frame.role) { await clickByLabelish(page, "Realtor mode"); await page.waitForTimeout(1500); }
      if (frame.tab) { await clickByLabelish(page, frame.tab); await page.waitForTimeout(2200); }
      R.contrast.push({ frame: frame.id, scheme, pairs: await page.evaluate(PROBE_CONTRAST) });
      if (scheme === "dark") R.statusDots.push({ frame: frame.id, scheme, dots: await page.evaluate(PROBE_STATUS_DOTS) });
      // Grayscale proof for §5 — colour-only state must survive desaturation.
      await page.screenshot({ path: path.join(SHOTS, `${frame.id}-${scheme}-color.png`), fullPage: true });
      await page.addStyleTag({ content: "html{filter:grayscale(1) !important}" });
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(SHOTS, `${frame.id}-${scheme}-grayscale.png`), fullPage: true });
      await ctx.close();
    }

    console.log(`probed ${frame.id}`);
  }

  await browser.close();

  // ── Scoring ────────────────────────────────────────────────────────────────
  const report = { generatedFor: "BLA-12 Layer-2 QA", hit: HIT, sections: {} };

  // §2
  const tooSmall = [];
  for (const g of R.targets) for (const t of g.targets) {
    if (t.w < HIT - 0.5 || t.h < HIT - 0.5)
      tooSmall.push({ frame: g.frame, viewport: g.viewport, ...t });
  }
  const unlabelled = [];
  for (const g of R.targets) for (const t of g.targets)
    if (!t.label || t.label.length === 0) unlabelled.push({ frame: g.frame, viewport: g.viewport, ...t });
  report.sections.s2_hitTargets = {
    measuredControls: R.targets.reduce((n, g) => n + g.targets.length, 0),
    distinctLabels: new Set(R.targets.flatMap((g) => g.targets.map((t) => t.label))).size,
    below44: tooSmall,
    verdict: tooSmall.length === 0 ? "PASS" : "FAIL",
    cardHeaderFloor: R.cardHeader,
    cardHeaderVerdict: R.cardHeader.length === 0 ? "NOT_OBSERVED"
      : R.cardHeader.every((g) => g.headers.every((h) => h.cssMinHeight === "90px" && h.renderedH >= 89.5)) ? "PASS" : "FAIL",
  };

  // §3
  const clips = R.dynamicType.flatMap((d) => d.clipped.map((c) => ({ frame: d.frame, viewport: d.viewport, scale: d.scale, ...c })));
  const ovl = R.dynamicType.flatMap((d) => d.overlaps.map((o) => ({ frame: d.frame, viewport: d.viewport, scale: d.scale, ...o })));
  report.sections.s3_dynamicType = { scalesTested: SCALES.map((s) => s.name), clipped: clips, overlaps: ovl,
    verdict: clips.length === 0 && ovl.length === 0 ? "PASS" : "REVIEW" };

  // §4
  report.sections.s4_screenReader = {
    tree: R.a11yTree,
    emptyNames: R.a11yTree.flatMap((g) => (g.tree || []).filter((n) => !n.name || !n.name.trim())
      .map((n) => ({ frame: g.frame, ...n }))),
    unlabelledDom: unlabelled,
  };

  // §5
  const dotsNoText = R.statusDots.flatMap((g) => g.dots.filter((d) => !d.hasTextEquivalent)
    .map((d) => ({ frame: g.frame, scheme: g.scheme, ...d })));
  report.sections.s5_colourOnly = { dotsObserved: R.statusDots.reduce((n, g) => n + g.dots.length, 0),
    dotsWithoutTextEquivalent: dotsNoText, detail: R.statusDots,
    verdict: dotsNoText.length === 0 ? "PASS" : "FAIL" };

  // §6
  const fails = [];
  for (const g of R.contrast) for (const p of g.pairs) {
    const fg = (p.color.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
    const a = (p.color.match(/[\d.]+/g) || []).length > 3 ? Number((p.color.match(/[\d.]+/g) || [])[3]) : 1;
    const bgv = (p.backdrop.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
    const eff = fg.map((c, i) => c * a + bgv[i] * (1 - a));
    const cr = Math.round(ratio(eff, bgv) * 100) / 100;
    const rec = { frame: g.frame, scheme: g.scheme, ...p, contrast: cr, passes: cr >= p.threshold };
    if (!rec.passes) fails.push(rec);
  }
  report.sections.s6_contrast = {
    pairsMeasured: R.contrast.reduce((n, g) => n + g.pairs.length, 0),
    failures: fails,
    lightFailures: fails.filter((f) => f.scheme === "light").length,
    darkFailures: fails.filter((f) => f.scheme === "dark").length,
    all: R.contrast,
  };

  report.pageErrors = R.pageErrors;

  fs.writeFileSync(path.join(OUT, "t3-qa-raw.json"), JSON.stringify(R, null, 2));
  fs.writeFileSync(path.join(OUT, "t3-qa-report.json"), JSON.stringify(report, null, 2));

  console.log("\n================ LAYER-2 SUMMARY ================");
  console.log(`§2 hit targets : ${report.sections.s2_hitTargets.verdict}  (${report.sections.s2_hitTargets.measuredControls} measured, ${tooSmall.length} below 44)`);
  console.log(`§2 cardHeader  : ${report.sections.s2_hitTargets.cardHeaderVerdict}`);
  console.log(`§3 dynamic type: ${report.sections.s3_dynamicType.verdict}  (${clips.length} clips, ${ovl.length} overlaps)`);
  console.log(`§4 a11y tree   : ${report.sections.s4_screenReader.emptyNames.length} empty names, ${unlabelled.length} unlabelled DOM nodes`);
  console.log(`§5 colour-only : ${report.sections.s5_colourOnly.verdict}  (${report.sections.s5_colourOnly.dotsObserved} dots, ${dotsNoText.length} textless)`);
  console.log(`§6 contrast    : ${fails.length} failures (${report.sections.s6_contrast.lightFailures} light / ${report.sections.s6_contrast.darkFailures} dark) of ${report.sections.s6_contrast.pairsMeasured} pairs`);
  console.log(`page errors    : ${R.pageErrors.length}`);
  console.log(`written -> ${OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
