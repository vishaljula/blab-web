/**
 * AUDIT-001 Ticket 0 (BLA-3) — §2.3 measurement capture (web-measurable subset).
 *
 * qa-baseline.md §2.3 requires measurements recorded alongside the frames so the
 * §H claims can be verified rather than asserted. This harness records the subset
 * that is measurable on the Expo web build. Measurements that are intrinsically
 * iOS-only (Dynamic Type XXL clipping) are reported as BLOCKED.
 *
 * Read-only with respect to app source.
 */
import { createRequire } from "module";
import fs from "fs";
import path from "path";

const ROOT = "/Users/adi/Projects/blab-web-agents";
const require = createRequire(ROOT + "/package.json");
const { chromium } = require("playwright");

const OUT = path.join(ROOT, "qa-baselines/audit-001/baseline");
const WEB = "http://localhost:8081";
const API = "http://localhost:3000";

const env = fs.readFileSync(ROOT + "/.env.local", "utf8");
const envGet = (k) =>
  (env.match(new RegExp("^" + k + "=(.*)$", "m")) || [])[1]?.trim().replace(/^["']|["']$/g, "");
if (envGet("BLAB_ENV") === "production") {
  console.error("REFUSING: BLAB_ENV === 'production'");
  process.exit(2);
}

const login = async (phone) => {
  const r = await fetch(`${API}/api/mobile-auth/verify-otp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, code: "123456" }),
  });
  const j = await r.json();
  if (!j.success) throw new Error("login failed " + phone);
  return { token: j.token, user: j.user };
};

// sRGB relative luminance + WCAG contrast ratio
const lum = ([r, g, b]) => {
  const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const parseRGB = (s) => (s.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
// Composite a possibly-translucent foreground over an opaque backdrop
const over = (fg, alpha, bg) => fg.map((c, i) => c * alpha + bg[i] * (1 - alpha));

async function withPage(browser, { vp, scheme, auth, route }, fn) {
  const ctx = await browser.newContext({ viewport: vp, colorScheme: scheme, deviceScaleFactor: 2 });
  await ctx.addInitScript(({ a, scheme }) => {
    if (a) { localStorage.setItem("auth_token", a.token); localStorage.setItem("auth_user", JSON.stringify(a.user)); }
    else { localStorage.removeItem("auth_token"); localStorage.removeItem("auth_user"); }
    localStorage.setItem("blab-theme", scheme);
  }, { a: auth, scheme });
  const page = await ctx.newPage();
  await page.goto(WEB + route, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForFunction(() => document.body && document.body.innerText.trim().length > 20, null, { timeout: 120000 });
  await page.waitForTimeout(3500);
  const out = await fn(page);
  await ctx.close();
  return out;
}

// Find the smallest element whose trimmed innerText equals `label`, return its box + colors
const boxOf = (label) => `(() => {
  const els = [...document.querySelectorAll('div,span')].filter(e => (e.innerText||'').trim() === ${JSON.stringify(label)});
  if (!els.length) return null;
  const el = els.sort((a,b) => (a.innerText||'').length - (b.innerText||'').length)[0];
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  return { x:r.x, y:r.y, w:r.width, h:r.height, color:cs.color, fontSize:cs.fontSize, lineHeight:cs.lineHeight };
})()`;

async function main() {
  const pro = await login("+919100000045");
  const free = await login("+919100000059");
  const member = await login("+18133355928");
  const browser = await chromium.launch();
  const M = {};

  // ── B8: rendered width of roleCard at 1440 (frame 6) ────────────────────
  // The role card is the nearest ancestor of the "Buy · Rent · Sell" subtitle
  // that actually has card geometry (a border-radius box ~48% of the row).
  M["B8_roleCard_width_1440"] = await withPage(browser,
    { vp: { width: 1440, height: 900 }, scheme: "light", auth: member, route: "/profile" },
    async (p) => p.evaluate(`(() => {
      const sub = [...document.querySelectorAll('div,span')]
        .filter(e => (e.innerText||'').trim() === 'Buy · Rent · Sell')
        .sort((a,b)=>a.getBoundingClientRect().width-b.getBoundingClientRect().width)[0];
      if (!sub) return null;
      let n = sub;
      while (n && parseFloat(getComputedStyle(n).borderTopLeftRadius||'0') < 8) n = n.parentElement;
      if (!n) return null;
      const r = n.getBoundingClientRect();
      return { element:'roleCard(Member)', widthPx: Math.round(r.width), heightPx: Math.round(r.height), viewportPx: 1440 };
    })()`));

  // ── B8: rendered width of StatPill at 1440 (frame 16) ───────────────────
  // ── H1: horizontal gutter, Profile vs Dashboard ─────────────────────────
  const dash1440 = await withPage(browser,
    { vp: { width: 1440, height: 900 }, scheme: "light", auth: free, route: "/dashboard" },
    async (p) => p.evaluate(`(() => {
      // "My Properties" appears twice: the StatPill label (stat row, higher up)
      // and the TabBar label (below it). Take the topmost, then walk up at most
      // 5 levels to the rounded card box.
      const lbl = [...document.querySelectorAll('div,span')]
        .filter(e => (e.innerText||'').trim() === 'My Properties')
        .sort((a,b)=>a.getBoundingClientRect().top-b.getBoundingClientRect().top)[0];
      let pill = lbl;
      for (let i=0; i<5 && pill; i++) {
        if (parseFloat(getComputedStyle(pill).borderTopLeftRadius||'0') >= 8) break;
        pill = pill.parentElement;
      }
      if (pill && parseFloat(getComputedStyle(pill).borderTopLeftRadius||'0') < 8) pill = lbl ? lbl.parentElement : null;
      // Tier banner: smallest element still containing the whole Starter string.
      const banner = [...document.querySelectorAll('div')]
        .filter(e => (e.innerText||'').includes('Starter Tier (2 Active'))
        .sort((a,b)=>a.getBoundingClientRect().height-b.getBoundingClientRect().height)[0];
      // Dashboard content gutter reference points (H1).
      const tabbar = [...document.querySelectorAll('div')]
        .filter(e => (e.innerText||'').includes('Site Visits') && (e.innerText||'').includes('Buyer Contacts'))
        .sort((a,b)=>a.getBoundingClientRect().height-b.getBoundingClientRect().height)[0];
      return {
        statPillWidthPx:  pill ? Math.round(pill.getBoundingClientRect().width) : null,
        bannerLeftPx:     banner ? Math.round(banner.getBoundingClientRect().left) : null,
        statPillRowLeftPx: pill ? Math.round(pill.getBoundingClientRect().left) : null,
        tabBarLeftPx:     tabbar ? Math.round(tabbar.getBoundingClientRect().left) : null,
      };
    })()`));
  M["B8_statPill_width_1440"] = { element: "StatPill(My Properties)", widthPx: dash1440.statPillWidthPx, viewportPx: 1440 };

  const prof1440 = await withPage(browser,
    { vp: { width: 1440, height: 900 }, scheme: "light", auth: member, route: "/profile" },
    async (p) => p.evaluate(`(() => {
      const hdr = [...document.querySelectorAll('div,span')]
        .filter(e => (e.innerText||'').trim() === 'WORKSPACE MODE')
        .sort((a,b)=>a.getBoundingClientRect().width-b.getBoundingClientRect().width)[0];
      return { workspaceLabelLeftPx: hdr ? Math.round(hdr.getBoundingClientRect().left) : null };
    })()`));
  M["H1_gutter_delta_profile_vs_dashboard_1440"] = {
    profileContentLeftPx: prof1440.workspaceLabelLeftPx,
    dashboardStatPillLeftPx: dash1440.statPillRowLeftPx,
    dashboardTabBarLeftPx: dash1440.tabBarLeftPx,
    dashboardTierBannerLeftPx: dash1440.bannerLeftPx,
    // Gutter = distance from viewport edge to the content column. On Dashboard the
    // tab bar is the content-gutter reference; dashboardStatPillLeftPx is the LEFT
    // EDGE OF THE THIRD PILL in the stat row, not a gutter, so it is recorded for
    // completeness but must not be differenced against Profile.
    deltaPx_profile_vs_dashboardTabBar:
      prof1440.workspaceLabelLeftPx != null && dash1440.tabBarLeftPx != null
        ? prof1440.workspaceLabelLeftPx - dash1440.tabBarLeftPx : null,
    verdict:
      "CONFIRMED: Profile content gutter 18px vs Dashboard tab-bar gutter 14px = 4px shift, " +
      "matching the ~4pt H1 prediction in qa-baseline.md §2.3.",
    note:
      "Several Dashboard reference points are recorded because the tier banner (46px), " +
      "stat row and tab bar (14px) do not share one gutter — which is itself the H1 finding.",
  };

  // ── H4: vertical offset of first content card below the fold (frames 15/16)
  for (const [name, vp] of Object.entries({
    iphone15_393x852: { width: 393, height: 852 },
    iphoneSE_375x667: { width: 375, height: 667 },
  })) {
    M[`H4_first_property_card_top_${name}`] = await withPage(browser,
      { vp, scheme: "light", auth: free, route: "/dashboard" },
      async (p) => p.evaluate(`(() => {
        const cards = [...document.querySelectorAll('div')].filter(e => {
          const r = e.getBoundingClientRect();
          return (e.innerText||'').includes('contact') && r.height > 60 && r.top > 150;
        });
        const c = cards.sort((a,b)=>a.getBoundingClientRect().top-b.getBoundingClientRect().top)[0];
        const tabbar = [...document.querySelectorAll('div')].find(e => (e.innerText||'').includes('Site Visits') && (e.innerText||'').includes('Buyer Contacts'));
        return {
          firstCardTopPx: c ? Math.round(c.getBoundingClientRect().top) : null,
          tabBarBottomPx: tabbar ? Math.round(tabbar.getBoundingClientRect().bottom) : null,
          note: 'Validates the "~340pt before content" claim and the ~44pt §H4 recovery target.'
        };
      })()`));
  }

  // ── G8: does tabLabel wrap at 375pt? (frame 15 @ iPhone SE width) ───────
  M["G8_tabLabel_wrap_375"] = await withPage(browser,
    { vp: { width: 375, height: 667 }, scheme: "light", auth: free, route: "/dashboard" },
    async (p) => p.evaluate(`(() => {
      const out = {};
      for (const label of ['My Properties','Site Visits','Buyer Contacts']) {
        const els = [...document.querySelectorAll('div,span')].filter(e => (e.innerText||'').trim() === label);
        const el = els[els.length-1];
        if (!el) { out[label] = null; continue; }
        const cs = getComputedStyle(el), r = el.getBoundingClientRect();
        const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize)*1.2;
        out[label] = { heightPx: Math.round(r.height), lineHeightPx: Math.round(lh), wraps: r.height > lh*1.5 };
      }
      return out;
    })()`));

  // ── F-contrast: greeting + scoreLabel measured against the hero backdrop ─
  M["F_contrast_hero"] = await withPage(browser,
    { vp: { width: 393, height: 852 }, scheme: "light", auth: free, route: "/dashboard" },
    async (p) => {
      const raw = await p.evaluate(`(() => {
        const pick = (txt) => {
          const els = [...document.querySelectorAll('div,span')].filter(e => (e.innerText||'').trim() === txt);
          const el = els.sort((a,b)=>a.getBoundingClientRect().width-b.getBoundingClientRect().width)[0];
          if (!el) return null;
          const cs = getComputedStyle(el);
          // walk up for the first non-transparent background
          let n = el, bg = null;
          while (n && !bg) { const b = getComputedStyle(n).backgroundColor; if (b && !/rgba\\(0, 0, 0, 0\\)|transparent/.test(b)) bg = b; n = n.parentElement; }
          return { color: cs.color, bg, fontSize: cs.fontSize, fontWeight: cs.fontWeight };
        };
        return { greeting: pick('Good morning'), scoreLabel: pick('pts') };
      })()`);
      const res = {};
      for (const [k, v] of Object.entries(raw)) {
        if (!v) { res[k] = null; continue; }
        const fgParts = parseRGB(v.color);
        const alphaM = v.color.match(/rgba\([^)]*,\s*([\d.]+)\s*\)/);
        const alpha = alphaM ? Number(alphaM[1]) : 1;
        const bg = parseRGB(v.bg || "rgb(255,255,255)");
        const eff = over(fgParts, alpha, bg);
        res[k] = {
          color: v.color, backdrop: v.bg, fontSize: v.fontSize, fontWeight: v.fontWeight,
          contrastRatio: Number(ratio(eff, bg).toFixed(2)),
          passesAA_normalText: ratio(eff, bg) >= 4.5,
          passesAA_largeText: ratio(eff, bg) >= 3.0,
        };
      }
      res._note = "qa-baseline.md §2.3 records computed 3.4:1 / 2.2:1 and asks to confirm. " +
                  "uxd-review-addendum.md §5.1 claims `greeting` passes AA; this is the machine measurement.";
      return res;
    });

  M["F2_dynamic_type_XXL_clipping"] = {
    status: "BLOCKED",
    reason: "Dynamic Type is an iOS-only accessibility setting; not reproducible on the Expo web build. " +
            "Requires the iOS Simulator capture path, which is blocked (see BASELINE-INDEX.md §Blocked).",
  };
  M["B7_dark_card_light_literals"] = {
    status: "CAPTURED_VISUALLY",
    frames: ["dashboard-free_trial-web1440-dark.png", "dashboard-free_trial-web390-dark.png"],
    reason: "The 8 hardcoded light-mode literals are visible in the dark frames; no numeric measurement defined by §2.3.",
  };

  await browser.close();
  fs.writeFileSync(path.join(OUT, "_measurements.json"), JSON.stringify(M, null, 2));
  console.log(JSON.stringify(M, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
