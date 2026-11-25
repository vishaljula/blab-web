/**
 * BLA-14 (Layer-2 QA) — confirm or clear: is the `publishDraftBtn` CTA, nested inside the
 * `cardHeader` Pressable, reachable to a screen reader?
 *
 * Target: expo-app/components/realtor/RealtorDashboard.tsx
 *   :554  cardHeader      A11yPressable  (accessible defaults true)
 *   :594  publishDraftBtn A11yPressable  (accessible defaults true)  <-- CHILD of the above
 *
 * This file proves the WEB half empirically (Expo web is a first-class platform per
 * CLAUDE.md §1). The iOS/Android halves are argued from vendored native source in the
 * report, because VoiceOver cannot be enabled in the iOS Simulator at all and BLA-3
 * established the host cannot deliver a synthetic tap to a simulator.
 *
 * SAFETY: the CTA's real handler POSTs {action:"publish_and_schedule"} to
 * /api/realtors/dashboard, which would publish a draft listing and book a shoot against UAT
 * fixtures. C4 below ABORTS that request at the network layer, so handler routing is
 * observed without ever mutating data.
 *
 * Usage:
 *   node qa-baselines/audit-001/tools/verify-bla14-nested-cta.mjs
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

const env = fs.readFileSync(ROOT + "/.env.local", "utf8");
const envGet = (k) =>
  (env.match(new RegExp("^" + k + "=(.*)$", "m")) || [])[1]?.trim().replace(/^["']|["']$/g, "");

// ── Invariant #5: never run against production ─────────────────────────────
if (envGet("BLAB_ENV") === "production") {
  console.error("REFUSING: BLAB_ENV === 'production' (Marketplace Invariant #5)");
  process.exit(2);
}

// realtor_pro — Harish Sharma, 5 listings, 1 draft (the draft is the repro condition).
const PHONE = "+919100000045";
const CTA_TEXT = "Accept & Schedule Shoot";
const PUBLISH_POST = "action=publish_and_schedule";

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

/** Compact a CDP AXNode to the fields that decide this ticket. */
function axBrief(n) {
  return {
    role: n.role?.value,
    name: (n.name?.value || "").slice(0, 120),
    ignored: n.ignored === true,
    ignoredReasons: (n.ignoredReasons || []).map((r) => r.name),
  };
}

const results = {};
const note = (k, v) => {
  results[k] = v;
  console.log(`\n== ${k} ==`);
  console.log(typeof v === "string" ? v : JSON.stringify(v, null, 2));
};

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const auth = await login(PHONE);
  console.log(`auth -> ${auth.user.name} / ${auth.user.role}`);

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript((a) => {
    try {
      localStorage.setItem("auth_token", a.token);
      localStorage.setItem("auth_user", JSON.stringify(a.user));
      localStorage.setItem("blab-theme", "light");
    } catch {}
  }, auth);

  const page = await ctx.newPage();

  // Record every attempt at the publish mutation, then abort it so UAT data is untouched.
  const publishAttempts = [];
  await page.route("**/api/realtors/dashboard", async (route) => {
    const req = route.request();
    if (req.method() === "POST") {
      const body = req.postData() || "";
      if (body.includes("publish_and_schedule")) {
        publishAttempts.push(body.slice(0, 200));
        return route.abort(); // <-- no mutation ever reaches the server
      }
    }
    return route.continue();
  });

  await page.goto(WEB + "/dashboard", { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForFunction(() => document.body && document.body.innerText.trim().length > 20, null, {
    timeout: 120000,
  });
  await page.waitForTimeout(3500);

  // Switch to "My Properties" (same disambiguation as capture-web.mjs: the TabBar
  // Pressable is the one carrying cursor:pointer).
  const clicked = await page.evaluate((label) => {
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
  }, "My Properties");
  if (!clicked) throw new Error("could not reach the My Properties tab");
  await page.waitForTimeout(2500);

  const ctaPresent = await page.evaluate((t) => document.body.innerText.includes(t), CTA_TEXT);
  note("C0_repro_state", {
    ctaRenderedOnPage: ctaPresent,
    detail: ctaPresent
      ? `"${CTA_TEXT}" is on screen — draft card present, repro state reached`
      : `"${CTA_TEXT}" NOT found — no draft listing for this fixture; everything below is void`,
  });
  if (!ctaPresent) {
    fs.writeFileSync(path.join(OUT, "bla14-nested-cta.json"), JSON.stringify({ results }, null, 2));
    await browser.close();
    process.exit(3);
  }

  await page.screenshot({ path: path.join(OUT, "frames", "bla14-draft-card.png"), fullPage: true });

  // ── C1: DOM nesting + ARIA, straight from the rendered tree ──────────────
  note(
    "C1_dom_nesting",
    await page.evaluate((t) => {
      const span = [...document.querySelectorAll("div,span")]
        .filter((el) => (el.innerText || "").trim() === t)
        .pop();
      if (!span) return { error: "CTA text node not found" };
      // climb to the CTA's own Pressable (the element carrying button semantics)
      let cta = span;
      while (cta && cta.getAttribute("role") !== "button") cta = cta.parentElement;
      const chain = [];
      let n = cta;
      for (let i = 0; i < 12 && n && n !== document.body; i++, n = n.parentElement) {
        chain.push({
          tag: n.tagName.toLowerCase(),
          role: n.getAttribute("role"),
          tabindex: n.getAttribute("tabindex"),
          ariaHidden: n.getAttribute("aria-hidden"),
          ariaLabel: (n.getAttribute("aria-label") || "").slice(0, 70) || null,
          ariaExpanded: n.getAttribute("aria-expanded"),
        });
      }
      const buttons = chain.filter((c) => c.role === "button");
      return {
        // only the semantically interesting rungs — the chain is mostly layout divs
        ancestorChainFromCTA: chain.filter(
          (c) => c.role || c.tabindex || c.ariaHidden || c.ariaLabel || c.ariaExpanded
        ),
        layoutOnlyRungsOmitted: chain.length - chain.filter(
          (c) => c.role || c.tabindex || c.ariaHidden || c.ariaLabel || c.ariaExpanded
        ).length,
        buttonRolesInChain: buttons.length,
        nestedButtonInsideButton: buttons.length >= 2,
        ctaAriaLabel: chain[0]?.ariaLabel,
        headerAriaLabel: buttons[1]?.ariaLabel ?? null,
      };
    }, CTA_TEXT)
  );

  // ── C2: the real Chromium accessibility tree, via CDP ────────────────────
  // Accessibility.getFullAXTree returns the computed tree a screen reader consumes,
  // including nodes marked `ignored` (i.e. present in DOM but NOT exposed to AT).
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Accessibility.enable");
  const { nodes } = await cdp.send("Accessibility.getFullAXTree");

  const ctaNodes = nodes.filter((n) =>
    (n.name?.value || "").includes("Accept handoff and schedule shoot")
  );
  const headerNodes = nodes.filter((n) => (n.name?.value || "").includes("new owner handoff"));
  const ctaTextNodes = nodes.filter((n) => (n.name?.value || "").includes(CTA_TEXT));

  // Is the CTA a descendant of the header node in the AX tree, or was it dropped?
  const byId = new Map(nodes.map((n) => [n.nodeId, n]));
  const ancestorRolesOf = (n) => {
    const out = [];
    let cur = n;
    for (let i = 0; i < 25 && cur?.parentId; i++) {
      cur = byId.get(cur.parentId);
      if (!cur) break;
      if (cur.role?.value && cur.role.value !== "none" && cur.role.value !== "generic") {
        out.push(cur.role.value);
      }
    }
    return out;
  };

  note("C2_ax_tree_cdp", {
    totalAxNodes: nodes.length,
    ctaByAccessibleName: ctaNodes.map(axBrief),
    ctaByVisibleText: ctaTextNodes.map(axBrief),
    ctaExposedToAT: ctaNodes.some((n) => n.ignored !== true),
    ctaAncestorRoles: ctaNodes.map((n) => ancestorRolesOf(n)),
    headerByAccessibleName: headerNodes.map(axBrief),
    headerExposedToAT: headerNodes.some((n) => n.ignored !== true),
  });

  // ── C3: keyboard traversal — the web stand-in for VoiceOver swipe order ──
  note(
    "C3_keyboard_reachability",
    await page.evaluate((t) => {
      const span = [...document.querySelectorAll("div,span")]
        .filter((el) => (el.innerText || "").trim() === t)
        .pop();
      let cta = span;
      while (cta && cta.getAttribute("role") !== "button") cta = cta.parentElement;
      const focusables = [...document.querySelectorAll('[tabindex]:not([tabindex="-1"]),button,a[href]')];
      return {
        ctaHasTabindex: cta?.getAttribute("tabindex") ?? null,
        ctaIsInFocusableSet: focusables.includes(cta),
        focusableCountOnPage: focusables.length,
      };
    }, CTA_TEXT)
  );

  // ── C4: handler routing — does pressing the CTA publish, or toggle the card? ──
  const beforeText = await page.evaluate(() => document.body.innerText);
  await page.evaluate((t) => {
    const span = [...document.querySelectorAll("div,span")]
      .filter((el) => (el.innerText || "").trim() === t)
      .pop();
    let cta = span;
    while (cta && cta.getAttribute("role") !== "button") cta = cta.parentElement;
    cta?.click();
  }, CTA_TEXT);
  await page.waitForTimeout(2500);
  const afterText = await page.evaluate(() => document.body.innerText);

  note("C4_handler_routing", {
    publishAttemptsIntercepted: publishAttempts.length,
    verdict:
      publishAttempts.length > 0
        ? "CTA handler fired (publish_and_schedule attempted, then ABORTED — no UAT mutation)"
        : "CTA handler did NOT fire — the press was taken by the parent cardHeader",
    pageTextChanged: beforeText !== afterText,
    navigatedAway: !(await page.evaluate(() => document.body.innerText.includes("My Properties"))),
  });

  // ── C5: iOS source trace, asserted against the vendored RN we actually ship ──
  // VoiceOver cannot be enabled in the iOS Simulator, and BLA-3 established the host
  // cannot deliver a synthetic tap to one. So the iOS half is argued from source — but
  // asserted here rather than prose, so an RN upgrade that changes any link in the chain
  // fails this check instead of silently invalidating the verdict.
  const RN = path.join(ROOT, "expo-app/node_modules/react-native");
  const read = (p) => fs.readFileSync(path.join(RN, p), "utf8");
  const rnVersion = JSON.parse(read("package.json")).version;
  const pressable = read("Libraries/Components/Pressable/Pressable.js");
  const fabric = read("React/Fabric/Mounting/ComponentViews/View/RCTViewComponentView.mm");

  const links = {
    "1_pressable_defaults_accessible_true": /accessible:\s*accessible\s*!==\s*false/.test(pressable),
    "2_accessible_maps_to_isAccessibilityElement":
      /self\.accessibilityElement\.isAccessibilityElement\s*=\s*newViewProps\.accessible/.test(fabric),
    "3_accessibilityElement_is_self": /-\s*\(NSObject \*\)accessibilityElement\s*\{\s*return self;/.test(
      fabric.replace(/\n/g, " ").replace(/\s+/g, " ")
    ),
    "4_explicit_label_short_circuits_child_label_aggregation":
      /NSString \*label = super\.accessibilityLabel;\s*if \(label\) \{\s*return label;/.test(
        fabric.replace(/\s+/g, " ")
      ),
    "5_children_only_reexposed_via_opt_in_accessibilityOrder":
      /if \(\[_accessibilityOrderNativeIDs count\] == 0\) \{ self\.accessibilityElements = nil;/.test(
        fabric.replace(/\s+/g, " ")
      ),
  };

  note("C5_ios_source_trace", {
    reactNativeVersion: rnVersion,
    links,
    allLinksHold: Object.values(links).every(Boolean),
    inference: Object.values(links).every(Boolean)
      ? "cardHeader renders isAccessibilityElement=YES. UIKit treats such a view as a LEAF, so " +
        "the nested CTA is not a separate VoiceOver element; and because cardHeader sets an " +
        "explicit accessibilityLabel, RCTRecursiveAccessibilityLabel is never called, so the " +
        "CTA's label is not folded into the parent announcement either. Doubly unreachable."
      : "SOURCE CHANGED — re-derive the iOS verdict before trusting it.",
  });

  fs.writeFileSync(
    path.join(OUT, "bla14-nested-cta.json"),
    JSON.stringify({ generatedFor: "BLA-14", fixture: PHONE, results }, null, 2)
  );
  console.log(`\nwrote ${path.join(OUT, "bla14-nested-cta.json")}`);
  await browser.close();
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
