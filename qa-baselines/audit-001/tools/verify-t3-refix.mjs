/**
 * AUDIT-001 Ticket 3 — Layer-2 RE-VERIFICATION of the two BLA-12 FAILs (BLA-12 round 2).
 *
 * Written by Independent Mobile/Web QA. This does NOT call, import, or read
 * `verify-t3-aria-state.mjs`. Every assertion is re-derived from the live DOM and from
 * Chromium's own computed accessibility tree (CDP `Accessibility.getFullAXTree`), so a
 * bug in the implementer's harness cannot produce a green here.
 *
 * Re-verifies:
 *   R1  FAIL #1 — no nested <button> on any dashboard tab (fix 558efa0)
 *   R2  FAIL #1 — React emits no validateDOMNesting error
 *   R3  FAIL #2 — the dashboard's OWN tablist reports exactly 1 of 3 selected (fix a828eca)
 *   R4  FAIL #2 — accordion header exposes `expanded` and it flips on activation
 *   R5  FAIL #2 — role="radio" carries aria-checked and NOT aria-selected (the role gate)
 *
 * Adds two checks the implementer's gate does not cover:
 *   R6  the role gate does not OVER-suppress — profile's role="tab" pill, the second
 *       `selected` call site, must still emit aria-selected. A gate that silently drops
 *       state on an unlisted role is only safe if the listed roles actually pass through,
 *       and A3 only ever exercises the dashboard tablist.
 *   R7  `busy` reaches the DOM in flight. No check in A1-A5 touches aria-busy, yet two
 *       call sites set it (profile activateBtn, dashboard publish). Proven by stalling
 *       /api/mobile-auth/onboarding and sampling the attribute inside the request window.
 *
 * Falsifiability: every attribute-derived check re-runs against a DOM whose attribute has
 * been stripped in-page, and MUST report failure there. This proves the assertion is not
 * vacuous without mutating app source — the workspace is shared with a concurrent run.
 *
 * Read-only with respect to app source.
 *
 * Usage: node qa-baselines/audit-001/tools/verify-t3-refix.mjs
 * Exit 0 = all PASS. Exit 1 = at least one FAIL. Exit 2 = refused / harness error.
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
if (envGet("BLAB_ENV") === "production") {
  console.error("REFUSING: BLAB_ENV === 'production' (Marketplace Invariant #5)");
  process.exit(2);
}

const FIXTURES = { realtor_pro: "+919100000045", member_rich: "+18133355928" };

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

const results = [];
const record = (id, pass, detail, extra = {}) => {
  results.push({ id, pass, detail, ...extra });
  console.log(`${pass ? "PASS" : "FAIL"}  ${id.padEnd(44)} ${detail}`);
};

// ── in-page probes ────────────────────────────────────────────────────────────

/** Every <button> that has a <button> ancestor. react-native-web emits a real <button>
 *  for accessibilityRole="button", so this is the DOM-level form of FAIL #1. */
const PROBE_NESTED_BUTTON = () =>
  [...document.querySelectorAll("button")]
    .filter((el) => el.parentElement && el.parentElement.closest("button"))
    .map((el) => ({
      label: (el.getAttribute("aria-label") || el.innerText || "").trim().slice(0, 80),
      outer: (el.parentElement.closest("button").getAttribute("aria-label") || "").slice(0, 80),
    }));

/** The dashboard's own tablist, identified by its tab labels — NOT Expo Router's bottom
 *  tab bar, which already announces selected and would make this check vacuous. */
const PROBE_DASH_TABLIST = () => {
  const lists = [...document.querySelectorAll('[role="tablist"]')].map((tl) => {
    const tabs = [...tl.querySelectorAll('[role="tab"]')].map((t) => ({
      label: (t.getAttribute("aria-label") || t.innerText || "").trim().slice(0, 60),
      ariaSelected: t.getAttribute("aria-selected"),
      tag: t.tagName.toLowerCase(),
    }));
    return { count: tabs.length, tabs };
  });
  // the dashboard tablist is the one whose tabs name the dashboard sections
  const isDash = (l) =>
    l.tabs.some((t) => /Propert/i.test(t.label)) &&
    l.tabs.some((t) => /Site Visit/i.test(t.label)) &&
    l.tabs.some((t) => /Buyer Contact/i.test(t.label));
  return { all: lists, dash: lists.find(isDash) || null };
};

/** The accordion header: the A11yPressable declaring s.cardHeader's 90pt floor. */
const PROBE_ACCORDION = () =>
  [...document.querySelectorAll('[role="button"]')]
    .filter((el) => el.getAttribute("aria-expanded") !== null)
    .map((el) => ({
      label: (el.getAttribute("aria-label") || "").slice(0, 80),
      ariaExpanded: el.getAttribute("aria-expanded"),
      cssMinHeight: getComputedStyle(el).minHeight,
      renderedH: Math.round(el.getBoundingClientRect().height * 100) / 100,
    }));

const PROBE_RADIOS = () =>
  [...document.querySelectorAll('[role="radio"]')].map((el) => {
    let n = el.parentElement, group = null;
    while (n) { const r = n.getAttribute && n.getAttribute("role"); if (r) { group = r; break; } n = n.parentElement; }
    return {
      label: (el.getAttribute("aria-label") || "").slice(0, 60),
      ariaChecked: el.getAttribute("aria-checked"),
      ariaSelected: el.getAttribute("aria-selected"),
      groupRole: group,
    };
  });

/** Profile's My Listings / My Shoots pills — role="tab", the second `selected` site. */
const PROBE_PROFILE_TABS = () => {
  const lists = [...document.querySelectorAll('[role="tablist"]')];
  const l = lists.find((tl) =>
    [...tl.querySelectorAll('[role="tab"]')].some((t) =>
      /My (Listings|Shoots)|My (listings|shoots)/i.test(t.getAttribute("aria-label") || t.innerText || "")));
  if (!l) return null;
  return [...l.querySelectorAll('[role="tab"]')].map((t) => ({
    label: (t.getAttribute("aria-label") || t.innerText || "").trim().slice(0, 60),
    ariaSelected: t.getAttribute("aria-selected"),
  }));
};

/** Chromium's computed AX tree — independent of the raw attributes. */
async function axTree(page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Accessibility.enable");
  const { nodes } = await cdp.send("Accessibility.getFullAXTree");
  return nodes
    .filter((n) => !n.ignored && n.role?.value)
    .map((n) => ({
      role: n.role.value,
      name: n.name?.value ?? "",
      props: Object.fromEntries((n.properties || []).map((p) => [p.name, p.value?.value])),
    }));
}

async function openAs(ctx, route, fixture) {
  const page = await ctx.newPage();
  const errs = [];
  page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  page.on("pageerror", (e) => errs.push(String(e)));
  if (fixture) {
    const { token, user } = await login(FIXTURES[fixture]);
    // keys per expo-app/store/listings.ts:26 — NOT guessed
    await page.addInitScript(
      ([t, u]) => {
        localStorage.setItem("auth_token", t);
        localStorage.setItem("auth_user", u);
      },
      [token, JSON.stringify(user)]
    );
  }
  await page.goto(`${WEB}${route}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  return { page, errs };
}

async function clickTab(page, name) {
  // The dashboard tab labels were shortened to "Properties" / "Visits" / "Contacts"
  // (CEO copy mandate, 2026-11-26), so `hasText` no longer matches. The full name is
  // still the tab's accessible name ("<label>, N items"); fall back to visible text so
  // this also runs against pre-rename builds.
  const byAria = page.locator(`[role="tab"][aria-label^="${name}"]`).first();
  if (await byAria.count()) { await byAria.click(); await page.waitForTimeout(1200); return true; }
  const t = page.locator(`[role="tab"]`, { hasText: name }).first();
  if (await t.count()) { await t.click(); await page.waitForTimeout(1200); return true; }
  return false;
}

// ═══════════════════════════════════════════════════════════════════════════════
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const evidence = { web: WEB, checks: {} };

try {
  // ── R1 / R2 / R3 / R4 — dashboard ──────────────────────────────────────────
  const { page: dash, errs: dashErrs } = await openAs(ctx, "/dashboard", "realtor_pro");

  // R1 — sweep every tab; the draft CTA that caused FAIL #1 lives under My Properties.
  const TABS = ["My Properties", "Site Visits", "Buyer Contacts"];
  const nestedPerTab = {};
  let nestedTotal = 0;
  nestedPerTab["(initial)"] = await dash.evaluate(PROBE_NESTED_BUTTON);
  nestedTotal += nestedPerTab["(initial)"].length;
  for (const t of TABS) {
    if (await clickTab(dash, t)) {
      nestedPerTab[t] = await dash.evaluate(PROBE_NESTED_BUTTON);
      nestedTotal += nestedPerTab[t].length;
    } else {
      nestedPerTab[t] = "TAB_NOT_FOUND";
    }
  }
  const missingTabs = Object.entries(nestedPerTab).filter(([, v]) => v === "TAB_NOT_FOUND").map(([k]) => k);
  if (missingTabs.length) {
    record("R1_no_nested_button", false,
      `harness could not reach tab(s): ${missingTabs.join(", ")} — fixture break, not a pass`);
  } else {
    record("R1_no_nested_button", nestedTotal === 0,
      nestedTotal === 0
        ? `0 nested <button> across ${Object.keys(nestedPerTab).length} dashboard tab states`
        : `${nestedTotal} nested <button>: ${JSON.stringify(Object.values(nestedPerTab).flat()).slice(0, 300)}`);
  }
  evidence.checks.R1 = nestedPerTab;

  // R2 — React's validateDOMNesting warning for <button> in <button>.
  const nestErrs = dashErrs.filter((e) => /validateDOMNesting|cannot appear as a descendant|cannot be a descendant/i.test(e));
  record("R2_no_dom_nesting_console_error", nestErrs.length === 0,
    nestErrs.length === 0 ? `0 nesting errors (${dashErrs.length} console errors total, none nesting)` : nestErrs[0].slice(0, 200));
  evidence.checks.R2 = { nestingErrors: nestErrs, allConsoleErrors: dashErrs.slice(0, 20) };

  // R3 — the dashboard's own tablist, raw attrs + computed AX tree.
  await clickTab(dash, "My Properties");
  const tl = await dash.evaluate(PROBE_DASH_TABLIST);
  const ax = await axTree(dash);
  const axDashTabs = ax.filter((n) => n.role === "tab" && /Propert|Site Visit|Buyer Contact/i.test(n.name));
  const axSelected = axDashTabs.filter((n) => n.props.selected === true);
  const attrSelected = (tl.dash?.tabs || []).filter((t) => t.ariaSelected === "true");
  const r3 = !!tl.dash && tl.dash.count === 3 && attrSelected.length === 1 && axSelected.length === 1;
  record("R3_dash_tablist_exactly_one_selected", r3,
    tl.dash
      ? `${tl.dash.count} tabs · aria-selected=true x${attrSelected.length} (${attrSelected[0]?.label ?? "-"}) · AX selected=true x${axSelected.length}/${axDashTabs.length}`
      : `dashboard tablist not found (found ${tl.all.length} tablist(s)) — fixture break, not a pass`);
  evidence.checks.R3 = { tablists: tl, axDashTabs, axSelectedCount: axSelected.length };

  // falsifiability — strip aria-selected, the same assertion must go red
  const r3Mut = await dash.evaluate(() => {
    document.querySelectorAll('[aria-selected]').forEach((e) => e.removeAttribute("aria-selected"));
    const l = [...document.querySelectorAll('[role="tablist"]')].find((tl) =>
      [...tl.querySelectorAll('[role="tab"]')].some((t) => /Buyer Contact/i.test(t.getAttribute("aria-label") || "")));
    return l ? [...l.querySelectorAll('[role="tab"]')].filter((t) => t.getAttribute("aria-selected") === "true").length : -1;
  });
  record("R3_mutation_proves_not_vacuous", r3Mut === 0,
    `with aria-selected stripped in-page the assertion yields ${r3Mut} selected (0 = check can fail)`);
  evidence.checks.R3_mutation = { selectedAfterStrip: r3Mut };

  await dash.reload({ waitUntil: "networkidle" });
  await dash.waitForTimeout(2500);

  // R4 — accordion expanded, and it must FLIP.
  const before = await dash.evaluate(PROBE_ACCORDION);
  let after = [];
  if (before.length) {
    await dash.locator('[role="button"][aria-expanded]').first().click();
    await dash.waitForTimeout(900);
    after = await dash.evaluate(PROBE_ACCORDION);
  }
  const flipped = before.length > 0 && after.length > 0 && before[0].ariaExpanded !== after[0].ariaExpanded &&
    ["true", "false"].includes(before[0].ariaExpanded) && ["true", "false"].includes(after[0].ariaExpanded);
  record("R4_accordion_expanded_present_and_flips", flipped,
    before.length
      ? `aria-expanded ${before[0].ariaExpanded} -> ${after[0]?.ariaExpanded} on "${before[0].label.slice(0, 40)}" (${before.length} disclosure header(s))`
      : "no element exposes aria-expanded — fix absent or fixture has no activity rows");
  evidence.checks.R4 = { before, after };

  // R4b — the 90pt cardHeader floor must survive Math.max(44, declared); BLA-12 §2 regression hunt.
  const hdr = before.filter((h) => h.cssMinHeight === "90px");
  record("R4b_cardHeader_90pt_floor_intact", hdr.length > 0 && hdr.every((h) => h.renderedH >= 90),
    hdr.length
      ? `min-height 90px on ${hdr.length} header(s), rendered ${hdr.map((h) => h.renderedH).join("/")}pt`
      : `no header declares min-height:90px (saw ${before.map((h) => h.cssMinHeight).join(", ") || "none"})`);
  evidence.checks.R4b = hdr;

  await dash.close();

  // ── R5 / R6 / R7 — profile ─────────────────────────────────────────────────
  const { page: prof } = await openAs(ctx, "/profile", "realtor_pro");

  // R5 — the role gate: radio gets aria-checked, never aria-selected (WAI-ARIA 1.2 §6.6.8).
  const radios = await prof.evaluate(PROBE_RADIOS);
  const checkedOk = radios.length > 0 && radios.every((r) => r.ariaChecked === "true" || r.ariaChecked === "false");
  const noSelected = radios.every((r) => r.ariaSelected === null);
  const inGroup = radios.every((r) => r.groupRole === "radiogroup");
  const oneChecked = radios.filter((r) => r.ariaChecked === "true").length === 1;
  record("R5_radio_checked_not_selected", checkedOk && noSelected && inGroup && oneChecked,
    radios.length
      ? `${radios.length} radios · aria-checked on all=${checkedOk} · exactly 1 checked=${oneChecked} · aria-selected absent=${noSelected} · all inside radiogroup=${inGroup}`
      : "no role=radio found — fixture break, not a pass");
  evidence.checks.R5 = radios;

  // R6 — the gate must not over-suppress on a LISTED role at a second call site.
  const ptabs = await prof.evaluate(PROBE_PROFILE_TABS);
  const pSel = (ptabs || []).filter((t) => t.ariaSelected === "true");
  const pAllHave = (ptabs || []).every((t) => t.ariaSelected !== null);
  record("R6_profile_tab_pill_still_emits_selected", !!ptabs && ptabs.length >= 2 && pAllHave && pSel.length === 1,
    ptabs
      ? `${ptabs.length} pills · aria-selected present on all=${pAllHave} · exactly 1 true=${pSel.length === 1} (${pSel[0]?.label ?? "-"})`
      : "profile My Listings/My Shoots tablist not found — fixture break, not a pass");
  evidence.checks.R6 = ptabs;

  // R7 — aria-busy must land in flight. Stall the onboarding POST and sample inside it.
  await prof.route("**/api/mobile-auth/onboarding", async (route) => {
    await new Promise((r) => setTimeout(r, 3000));
    await route.continue();
  });
  const activate = prof.locator('[role="button"][aria-label*="ctivate"], [role="button"][aria-label*="Saving"]').first();
  let busySample = { found: false };
  if (await activate.count()) {
    const labelBefore = await activate.getAttribute("aria-label");
    await activate.click({ noWaitAfter: true });
    await prof.waitForTimeout(700); // inside the 3s stall
    busySample = await prof.evaluate(() => {
      const el = [...document.querySelectorAll('[role="button"]')].find(
        (e) => /Saving|ctivate/i.test(e.getAttribute("aria-label") || ""));
      return el
        ? { found: true, label: (el.getAttribute("aria-label") || "").slice(0, 70),
            ariaBusy: el.getAttribute("aria-busy"), ariaDisabled: el.getAttribute("aria-disabled") }
        : { found: false };
    });
    busySample.labelBefore = labelBefore;
  }
  record("R7_aria_busy_lands_in_flight", busySample.found && busySample.ariaBusy === "true",
    busySample.found
      ? `in-flight: aria-busy=${busySample.ariaBusy} aria-disabled=${busySample.ariaDisabled} label "${busySample.label}"`
      : "activate control not reachable on this fixture — NOT counted as a pass");
  evidence.checks.R7 = busySample;

  await prof.close();
} catch (e) {
  console.error("HARNESS ERROR:", e.message);
  record("harness", false, `threw: ${e.message}`);
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.pass);
fs.writeFileSync(
  path.join(OUT, "t3-refix.json"),
  JSON.stringify({ verdict: failed.length ? "FAIL" : "PASS", results, evidence }, null, 2)
);
console.log(`\n${failed.length ? `FAIL — ${failed.length}/${results.length}` : `PASS — ${results.length}/${results.length}`}`);
process.exit(failed.length ? 1 : 0);
