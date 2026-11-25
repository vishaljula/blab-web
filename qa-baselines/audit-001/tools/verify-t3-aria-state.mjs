/**
 * AUDIT-001 / T3 — proof for the two BLA-12 Layer-2 QA FAILs, re-runnable.
 *
 * Written by the implementer (Lead Mobile/Web Engineer) in response to BLA-12, which
 * confirmed both of these by measurement. This file is the *remedy* proof. It deliberately
 * re-derives everything from the live rendered DOM / Chromium's computed accessibility
 * tree rather than restating source, so it fails if either fix regresses.
 *
 *   FAIL #1 — nested <button> on the Realtor Dashboard.
 *     accessibilityRole="button" makes react-native-web render a real <button>
 *     (roleComponents in AccessibilityUtil/propsToAccessibilityComponent), so the
 *     publish-draft CTA nested inside the cardHeader A11yPressable produced
 *     <button> inside <button> — invalid HTML plus React's "cannot be a descendant of"
 *     hydration warning on every dashboard render.
 *     FIX: the CTA is hoisted to a SIBLING of the header (BLA-14 §6 option 1).
 *     CHECKED HERE: A1 (no button has a button ancestor) + A2 (no DOM-nesting console
 *     error, which is how the defect actually surfaced — it is a console.error, not a
 *     pageerror).
 *
 *   FAIL #2 — accessibilityState silently dropped on web.
 *     react-native-web 0.21.2 forwards only the flattened aria-* props; the
 *     accessibilityState *object* appears nowhere in modules/forwardedProps. So
 *     selected / expanded / busy never reached the AX tree.
 *     FIX: A11yPressable translates accessibilityState -> aria-* on web, role-gated.
 *     CHECKED HERE: A3 (active tab announces selected=true), A4 (accordion header
 *     exposes expanded and it flips on activate), A5 (role-gating — the profile radio
 *     announces checked and must NOT carry aria-selected, which is invalid on that role).
 *
 * Read-only with respect to app source. Mutates no UAT data: A4 toggles an accordion
 * (client-side only) and nothing here presses the publish CTA.
 *
 * Usage: node qa-baselines/audit-001/tools/verify-t3-aria-state.mjs
 * Requires: `npm run dev` (3000) and `expo start --port 8081` already up.
 */
import { createRequire } from "module";
import fs from "fs";
import path from "path";

const ROOT = "/Users/adi/Projects/blab-web-agents";
const require = createRequire(ROOT + "/package.json");
const { chromium } = require("playwright");

const WEB = process.env.QA_WEB || "http://localhost:8081";
const API = "http://localhost:3000";
const OUT = path.join(ROOT, "qa-baselines/audit-001/t3-qa-layer2");

const env = fs.readFileSync(ROOT + "/.env.local", "utf8");
const envGet = (k) =>
  (env.match(new RegExp("^" + k + "=(.*)$", "m")) || [])[1]?.trim().replace(/^["']|["']$/g, "");

// ── Marketplace Invariant #5: never run against production ───────────────────
if (envGet("BLAB_ENV") === "production") {
  console.error("REFUSING: BLAB_ENV === 'production' (Marketplace Invariant #5)");
  process.exit(2);
}

// realtor_pro — Harish Sharma. 5 listings incl. 1 draft, and enough activity that at
// least one PropertyActivityCard renders an accordion header. Both are repro conditions.
const PHONE = "+919100000045";

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

/** Chromium's computed AX tree, flattened, with the state properties we care about. */
async function axNodes(page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Accessibility.enable");
  const { nodes } = await cdp.send("Accessibility.getFullAXTree");
  const prop = (n, name) => (n.properties || []).find((p) => p.name === name)?.value?.value;
  return nodes.map((n) => ({
    role: n.role?.value,
    name: (n.name?.value || "").slice(0, 70),
    ignored: n.ignored,
    selected: prop(n, "selected"),
    expanded: prop(n, "expanded"),
    checked: prop(n, "checked"),
    busy: prop(n, "busy"),
    disabled: prop(n, "disabled"),
  }));
}

async function boot(ctx, route) {
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on("pageerror", (e) => consoleErrors.push("PAGEERROR " + String(e).slice(0, 240)));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text().slice(0, 300);
    if (/deprecated|useNativeDriver/.test(t)) return;
    if (!consoleErrors.includes(t)) consoleErrors.push(t);
  });
  await page.goto(WEB + route, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForFunction(() => document.body && document.body.innerText.trim().length > 20, null, {
    timeout: 180000,
  });
  await page.waitForTimeout(3500);
  return { page, consoleErrors };
}

const R = { generatedFor: "BLA-5 / T3 — remedy proof for BLA-12 FAIL #1 and FAIL #2", checks: {} };
const fails = [];
function record(id, pass, detail) {
  R.checks[id] = { pass, ...detail };
  if (!pass) fails.push(id);
  console.log(`${pass ? "PASS" : "FAIL"}  ${id}`);
}

async function main() {
  const auth = await login(PHONE);
  console.log(`auth -> ${auth.user.name} / ${auth.user.role}\n`);

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript((a) => {
    try {
      localStorage.setItem("auth_token", a.token);
      localStorage.setItem("auth_user", JSON.stringify(a.user));
      localStorage.setItem("blab-theme", "light");
    } catch {}
  }, auth);

  // ───────────────────────── Dashboard ─────────────────────────
  const { page, consoleErrors } = await boot(ctx, "/dashboard");

  // A1 — FAIL #1: no <button> may have a <button> ancestor.
  const nestedButtons = await page.evaluate(() =>
    [...document.querySelectorAll("button")]
      .filter((el) => el.parentElement?.closest("button"))
      .map((el) => ({
        label: (el.getAttribute("aria-label") || el.innerText || "").slice(0, 60),
        ancestor: (el.parentElement.closest("button").getAttribute("aria-label") || "").slice(0, 60),
      }))
  );
  // Also cover the ARIA-role form, in case a future role maps to a div with role=button.
  const nestedRoleButtons = await page.evaluate(() =>
    [...document.querySelectorAll('[role="button"]')].filter((el) =>
      el.parentElement?.closest('[role="button"]')
    ).length
  );
  record("A1_no_nested_button", nestedButtons.length === 0 && nestedRoleButtons === 0, {
    nestedButtonCount: nestedButtons.length,
    nestedRoleButtonCount: nestedRoleButtons,
    offenders: nestedButtons,
  });

  // A2 — FAIL #1: React's DOM-nesting validation must not fire.
  const nestingErrors = consoleErrors.filter((t) => /cannot be a descendant of|validateDOMNesting/i.test(t));
  record("A2_no_dom_nesting_console_error", nestingErrors.length === 0, {
    nestingErrors,
    allConsoleErrors: consoleErrors,
  });

  // A3 — FAIL #2: the active DASHBOARD tab must announce selected=true.
  //
  // Scoped to the dashboard's own tablist on purpose. Expo Router's bottom tab bar also
  // renders role="tab" and already announces selected=true correctly — it is the control
  // BLA-12 used, not the subject. An unscoped "some tab is selected" assertion passes with
  // the fix reverted (verified by A/B), i.e. it is vacuous. Matching on the dashboard tab
  // labels is what makes this check able to fail.
  const DASH_TABS = ["My Properties", "Site Visits", "Buyer Contacts"];
  const tabsDom = await page.evaluate(
    (names) =>
      [...document.querySelectorAll('[role="tab"]')]
        .map((el) => ({
          label: (el.getAttribute("aria-label") || el.innerText || "").replace(/\s+/g, " ").trim().slice(0, 60),
          ariaSelected: el.getAttribute("aria-selected"),
        }))
        .filter((t) => names.some((n) => t.label.startsWith(n))),
    DASH_TABS
  );
  let ax = await axNodes(page);
  const axTabs = ax.filter(
    (n) => n.role === "tab" && !n.ignored && DASH_TABS.some((d) => n.name.startsWith(d))
  );
  const selectedTabs = axTabs.filter((n) => n.selected === true);
  // "My Properties" is the default activeTab, so exactly one dashboard tab must be selected.
  record(
    "A3_active_dashboard_tab_announces_selected",
    axTabs.length === DASH_TABS.length && selectedTabs.length === 1,
    {
      note: "Read from the computed AX tree, not from the prop we set. Scoped to the dashboard tablist.",
      expectedTabCount: DASH_TABS.length,
      axTabCount: axTabs.length,
      axSelectedTabCount: selectedTabs.length,
      selectedTabName: selectedTabs[0]?.name,
      axTabs,
      tabsDom,
    }
  );

  // A4 — FAIL #2: the accordion header must expose `expanded`, and it must flip.
  const expandedBefore = await page.evaluate(() =>
    [...document.querySelectorAll("[aria-expanded]")].map((el) => ({
      label: (el.getAttribute("aria-label") || "").slice(0, 60),
      expanded: el.getAttribute("aria-expanded"),
    }))
  );
  let axExpandedBefore = ax.filter((n) => n.expanded !== undefined && !n.ignored).length;
  let expandedAfter = [];
  let axExpandedAfterVal;
  if (expandedBefore.length > 0) {
    await page.evaluate(() => document.querySelector("[aria-expanded]").click());
    await page.waitForTimeout(900);
    expandedAfter = await page.evaluate(() =>
      [...document.querySelectorAll("[aria-expanded]")].map((el) => ({
        label: (el.getAttribute("aria-label") || "").slice(0, 60),
        expanded: el.getAttribute("aria-expanded"),
      }))
    );
    const ax2 = await axNodes(page);
    axExpandedAfterVal = ax2.filter((n) => n.expanded === true && !n.ignored).length;
    // restore
    await page.evaluate(() => document.querySelector("[aria-expanded]").click());
  }
  const flipped =
    expandedBefore.length > 0 &&
    expandedAfter.length > 0 &&
    expandedBefore[0].expanded !== expandedAfter[0].expanded;
  record("A4_accordion_exposes_expanded_and_flips", expandedBefore.length > 0 && flipped, {
    domNodesWithAriaExpanded: expandedBefore.length,
    axNodesWithExpanded: axExpandedBefore,
    axNodesExpandedTrueAfterActivate: axExpandedAfterVal,
    expandedBefore,
    expandedAfter,
  });
  await page.close();

  // ───────────────────────── Profile (role gating) ─────────────────────────
  const { page: pp } = await boot(ctx, "/profile");
  // A5 — the role-gate: radio announces `checked`; `aria-selected` is invalid on
  // role="radio" (WAI-ARIA 1.2 §6.6.8) and must NOT be emitted even though the call
  // site sets accessibilityState={{ selected, checked }}.
  const radios = await pp.evaluate(() =>
    [...document.querySelectorAll('[role="radio"]')].map((el) => ({
      label: (el.getAttribute("aria-label") || el.innerText || "").slice(0, 50),
      ariaChecked: el.getAttribute("aria-checked"),
      ariaSelected: el.getAttribute("aria-selected"),
    }))
  );
  const axP = await axNodes(pp);
  const axRadios = axP.filter((n) => n.role === "radio" && !n.ignored);
  const anyChecked = axRadios.some((n) => n.checked === "true" || n.checked === true);
  const leakedSelected = radios.filter((r) => r.ariaSelected !== null);
  record(
    "A5_radio_checked_not_selected",
    radios.length > 0 && anyChecked && leakedSelected.length === 0,
    {
      note: "Proves the aria mapping is role-gated: checked is emitted, selected is suppressed.",
      radioCount: radios.length,
      axCheckedPresent: anyChecked,
      leakedAriaSelectedCount: leakedSelected.length,
      radios,
      axRadios,
    }
  );
  await pp.close();

  await browser.close();

  R.verdict = fails.length === 0 ? "PASS" : `FAIL (${fails.join(", ")})`;
  fs.mkdirSync(OUT, { recursive: true });
  const dest = path.join(OUT, "t3-aria-state.json");
  fs.writeFileSync(dest, JSON.stringify(R, null, 2));
  console.log(`\n${"=".repeat(78)}\n${R.verdict}\nwrote ${dest}`);
  process.exit(fails.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
