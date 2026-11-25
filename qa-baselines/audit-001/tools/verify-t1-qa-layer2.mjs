/**
 * AUDIT-001 Ticket 1 — Layer-2 QA regression harness (BLA-15).
 *
 * The committed Ticket-0 baseline (`qa-baselines/audit-001/baseline/`, commit
 * 853cba7) only covers the tier states that happen to exist in the UAT seed. Three
 * things this ticket must prove are therefore unreachable from seeded data alone:
 *
 *   1. A **Starter realtor holding a draft** — the E2 defect's exact shape. Every
 *      seeded Starter realtor (Priya `free_trial`, Vikram `soft_cap`) has zero
 *      drafts; both seeded draft-holders (Harish, Ravi) are Pro. So the
 *      `1 of 2` → `0 of 2` delta the ticket pre-authorises cannot be rendered by
 *      logging in as anybody.
 *   2. The **degradation contract** (missing / malformed capacity, absent
 *      `foundingProgram`, non-dashboard response) — the server never emits these.
 *   3. The **999 cap string**, which is what re-opened the 44pt question on the
 *      upgrade chip: `Starter Tier ({listingCap} Active · {handoffCap} Handoff Cap)`
 *      is variable-length for the first time.
 *
 * Rather than mutate the shared UAT database (another Layer-2 run is capturing
 * against it concurrently), each scenario is injected **client-side** with
 * Playwright `page.route`, which is per-browser-context and touches no server
 * state. The same injected payload is then rendered twice:
 *
 *   BEFORE → http://localhost:8082  (worktree at 853cba7, the T0 baseline commit)
 *   AFTER  → http://localhost:8084  (worktree at the T1 branch tip)
 *
 * so every delta is an observed on-device difference between two real renders of
 * one payload, not a claim about what the old code "would have" printed.
 *
 * Read-only with respect to app source and to the UAT database.
 *
 * Usage:
 *   BEFORE_WEB=http://localhost:8082 AFTER_WEB=http://localhost:8084 \
 *     node qa-baselines/audit-001/tools/verify-t1-qa-layer2.mjs
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

// ── Marketplace Invariant #5: never run this against production ───────────
if (envGet("BLAB_ENV") === "production") {
  console.error("REFUSING: BLAB_ENV === 'production' (Marketplace Invariant #5)");
  process.exit(2);
}

const HIT = 44; // Apple HIG minimum touch target, in pt
/** iOS Dynamic Type body multipliers, matching verify-t3-qa.mjs §SCALES. */
const SCALES = [
  { k: 1.0, name: "L-default" },
  { k: 23 / 17, name: "xxxLarge" },
  { k: 40 / 17, name: "AX3" },
  { k: 53 / 17, name: "AX5-max" },
];

const FIXTURES = {
  realtor_free_trial: "+919100000059", // Priya Kumar   — free_trial, 5 active, 0 draft
  realtor_soft_cap: "+919100000034", // Vikram Iyer   — soft_cap,   1 active, 0 draft
  realtor_pro: "+919100000045", // Harish Sharma — pro,        4 active, 1 draft
  realtor_pro_plus: "+919100000050", // Ravi Chowdary — pro_plus,   0 active, 1 draft
};

async function login(phone) {
  const r = await fetch(`${API}/api/mobile-auth/verify-otp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, code: "123456" }),
  });
  const j = await r.json();
  if (!j.success) throw new Error(`login failed ${phone}: ${JSON.stringify(j)}`);
  return { token: j.token, user: j.user };
}

// ── Same APPLY_SCALE as verify-t3-qa.mjs, so chip measurements are comparable ──
const APPLY_SCALE = (k) => {
  const read = [...document.querySelectorAll("*")].map((el) => {
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

/**
 * Locate the Founding-500 upgrade chip and report its box, whether it is clipped
 * by an ancestor, and whether its own text is truncated inside it.
 */
const PROBE_CHIP = () => {
  const nodes = [...document.querySelectorAll("div,span")];
  const textEl = nodes.find((el) => (el.innerText || "").trim().startsWith("Founding 500 ·"));
  if (!textEl) return { found: false };

  // Walk up to the Pressable that carries the chip's pill background.
  let chip = textEl;
  for (let i = 0; i < 5 && chip.parentElement; i++) {
    const cs = getComputedStyle(chip);
    if (parseFloat(cs.borderTopLeftRadius) >= 20 && parseFloat(cs.borderTopWidth) >= 1) break;
    chip = chip.parentElement;
  }
  const cb = chip.getBoundingClientRect();
  const tb = textEl.getBoundingClientRect();

  // The banner row (`s.trialRow`) is the clipping ancestor that matters.
  let row = chip;
  while (row && !(row.innerText || "").includes("Handoff Cap") && row.parentElement) row = row.parentElement;
  const rb = row ? row.getBoundingClientRect() : null;

  const titleEl = nodes.find((el) => {
    const t = (el.innerText || "").trim();
    return t.startsWith("Starter Tier (") && t.endsWith("Handoff Cap)");
  });

  return {
    found: true,
    chip: { w: Math.round(cb.width * 10) / 10, h: Math.round(cb.height * 10) / 10 },
    // Chip text wider/taller than the chip box == the label is being cut off.
    textOverflowsChip: tb.width - cb.width > 1 || tb.height - cb.height > 1,
    // Chip escaping the banner box == it is being clipped by the panel.
    chipOverflowsRow: rb ? cb.right - rb.right > 1 || cb.bottom - rb.bottom > 1 : null,
    // scrollWidth > clientWidth on the text node == ellipsis / hard truncation.
    textTruncated: textEl.scrollWidth - textEl.clientWidth > 1,
    chipText: (textEl.innerText || "").trim(),
    titleText: titleEl ? (titleEl.innerText || "").trim() : null,
    titleTruncated: titleEl ? titleEl.scrollWidth - titleEl.clientWidth > 1 : null,
    meetsHit: cb.height >= 44 && cb.width >= 44,
  };
};

/** Normalised full-page text, for delta classification. */
const PAGE_TEXT = () => document.body.innerText.replace(/\s+/g, " ").trim();

// ── Scenario payload builders ─────────────────────────────────────────────
// Each takes the live payload for a fixture and returns the payload to inject,
// so untouched fields stay realistic.
const SCENARIOS = [
  {
    id: "S1-starter-with-drafts",
    fixture: "realtor_free_trial",
    why:
      "The E2 defect's exact shape, unreachable from seeded data: a Starter realtor " +
      "whose only listing is a draft. T0 counts myListings.length (1); T1 counts " +
      "activeListingCount (0). This is the ticket's pre-authorised delta #2.",
    build: (live) => ({
      ...live,
      realtor: {
        ...live.realtor,
        subscriptionTier: "free_trial", // keep T0's isTrial gate TRUE so the only
        activeListingCount: 0, //          difference observed is the counting
        maxListingCapacity: 2,
        maxHandoffCapacity: 1,
        starterOverflowCount: 0,
      },
      myListings: [
        {
          ...(live.myListings?.[0] ?? {}),
          id: "qa-draft-1",
          status: "draft",
          title: "QA Draft Row",
          contactName: "Priya Kumar",
          contactPhone: "+919100000059",
          recentEnquiries: [],
          viewings: [],
        },
      ],
    }),
    expectAfter: ["0 of 2 Free Cap (0 overflow)", "Starter Tier (2 Active · 1 Handoff Cap)"],
    expectBefore: ["1 of 2 Free Cap (0 overflow)"],
  },
  {
    id: "S2-soft-cap-gate",
    fixture: "realtor_soft_cap",
    why:
      "CEO D1: soft_cap is permanent Starter 2/1 and may never be told 'unlimited'. " +
      "Pre-authorised delta #1.",
    build: (live) => ({
      ...live,
      realtor: {
        ...live.realtor,
        subscriptionTier: "soft_cap",
        activeListingCount: 1,
        maxListingCapacity: 2,
        maxHandoffCapacity: 1,
        starterOverflowCount: 0,
      },
    }),
    expectAfter: ["Starter Tier (2 Active · 1 Handoff Cap)", "1 of 2 Free Cap (0 overflow)"],
    forbidAfter: ["Unlimited Listings & Handoffs"],
    expectBefore: ["Unlimited Listings & Handoffs"],
  },
  {
    id: "S3-malformed-caps",
    fixture: "realtor_soft_cap",
    why:
      "Degradation contract: a missing/malformed capacity grant must fall back to " +
      "Starter-safe 2/1 and must NEVER fall back to an unlimited entitlement.",
    build: (live) => ({
      ...live,
      realtor: {
        ...live.realtor,
        subscriptionTier: "soft_cap",
        activeListingCount: undefined,
        maxListingCapacity: null,
        maxHandoffCapacity: "not-a-number",
        starterOverflowCount: NaN,
      },
    }),
    expectAfter: ["Starter Tier (2 Active · 1 Handoff Cap)", "0 of 2 Free Cap (0 overflow)"],
    forbidAfter: ["Unlimited", "NaN", "undefined", "Infinity", "null"],
  },
  {
    id: "S4-no-founding-program",
    fixture: "realtor_soft_cap",
    why:
      "foundingProgram degrades to null -> the handoff caption must simply end, not " +
      "print 'undefined nearby handoffs' and not resurrect the hardcoded literal.",
    build: (live) => {
      const { foundingProgram, ...rest } = live;
      return {
        ...rest,
        realtor: {
          ...live.realtor,
          subscriptionTier: "soft_cap",
          activeListingCount: 1,
          maxListingCapacity: 2,
          maxHandoffCapacity: 1,
          starterOverflowCount: 0,
        },
      };
    },
    expectAfter: ["1 of 1 Active"],
    forbidAfter: ["undefined", "NaN", "nearby handoffs", "this week"],
  },
  {
    id: "S5-non-dashboard-response",
    fixture: "realtor_soft_cap",
    why:
      "normalizeDashboard returns null for a non-dashboard body -> the store throws " +
      "and the existing 'Couldn't load dashboard' retry state must appear. This branch " +
      "is new in T1, so it is reachable for the first time and must be confirmed on device.",
    build: () => ({ ok: true, note: "not a dashboard" }),
    expectAfter: ["Couldn't load dashboard", "Retry"],
    forbidAfter: ["NaN", "undefined"],
    retryProbe: true,
  },
  {
    id: "S6-cap-string-999",
    fixture: "realtor_free_trial",
    why:
      "Scope item 5: the cap string is variable-length for the first time. 999/1 is the " +
      "longest string that still renders the Starter panel (999/999 flips isPaidPro and " +
      "hides the chip entirely), so it is the true worst case for the upgrade chip.",
    build: (live) => ({
      ...live,
      realtor: {
        ...live.realtor,
        subscriptionTier: "free_trial",
        activeListingCount: 999,
        maxListingCapacity: 999,
        maxHandoffCapacity: 1,
        starterOverflowCount: 999,
      },
    }),
    expectAfter: [
      "Starter Tier (999 Active · 1 Handoff Cap)",
      "999 of 999 Free Cap (999 in Owner Fallback)",
    ],
    chipSweep: true, // measure the chip at 320/360/390 x 4 Dynamic Type steps
  },
];

const CHIP_WIDTHS = [320, 360, 390];

/**
 * CORS repair — mandatory when rendering from any port other than 8081.
 *
 * `src/middleware.ts:14-19` reflects Access-Control-Allow-Origin only for
 * `http://localhost:8081`, `http://localhost:3000` and private LAN IPs. Served
 * from 8082/8084 the API responses arrive with no ACAO header, the browser drops
 * them, and every authenticated surface renders its empty/error state while
 * reporting `pageErrors: []`. Repaired in the browser context only: `route.fetch()`
 * issues the real request and the body is passed through untouched.
 */
async function applyCorsRepair(ctx, web) {
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
  return cors;
}

async function renderScenario(browser, { web, token, user, payload, vp, scheme = "dark", route = "/dashboard" }) {
  const ctx = await browser.newContext({ viewport: vp, colorScheme: scheme, deviceScaleFactor: 2 });
  const cors = await applyCorsRepair(ctx, web);
  await ctx.addInitScript(
    ({ a, scheme }) => {
      try {
        localStorage.setItem("auth_token", a.token);
        localStorage.setItem("auth_user", JSON.stringify(a.user));
        localStorage.setItem("blab-theme", scheme);
      } catch {}
    },
    { a: { token, user }, scheme }
  );
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 240)));

  let intercepted = 0;
  if (payload !== undefined) {
    // Registered on the page, so it takes precedence over the context-level CORS
    // repair route above.
    await page.route("**/api/realtors/dashboard**", async (r) => {
      intercepted++;
      await r.fulfill({
        status: 200,
        contentType: "application/json",
        headers: cors,
        // JSON.stringify drops `undefined` and turns NaN into null, which is
        // exactly how a malformed real response would arrive over the wire.
        // That asymmetry matters: `undefined` is unreachable from a real API.
        body: JSON.stringify(payload),
      });
    });
  }

  await page.goto(web + route, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForFunction(() => document.body && document.body.innerText.trim().length > 20, null, {
    timeout: 120000,
  });
  await page.waitForTimeout(3500);
  return { ctx, page, errors, interceptedCount: () => intercepted };
}

const results = {
  meta: {
    ticket: "BLA-15 [AUDIT-001 / T1] Layer-2 QA",
    beforeWeb: BEFORE_WEB,
    afterWeb: AFTER_WEB,
    blabEnv: envGet("BLAB_ENV"),
    hitTargetPt: HIT,
  },
  livePayloads: {},
  scenarios: [],
  chipSweep: [],
  invariant1: {},
  tierMatrix: [],
};

async function main() {
  fs.mkdirSync(FRAMES, { recursive: true });

  const tokens = {};
  for (const [k, phone] of Object.entries(FIXTURES)) {
    tokens[k] = await login(phone);
    console.log(`auth ${k.padEnd(20)} -> ${tokens[k].user.name || "(anon)"} / ${tokens[k].user.role}`);
  }

  // ── Live payload snapshot, so the report states the real seeded data ──────
  for (const [k, t] of Object.entries(tokens)) {
    const r = await fetch(`${API}/api/realtors/dashboard`, {
      headers: { Authorization: `Bearer ${t.token}` },
    });
    const j = await r.json();
    const statuses = {};
    for (const l of j.myListings || []) statuses[l.status] = (statuses[l.status] || 0) + 1;
    results.livePayloads[k] = {
      name: j.realtor?.name,
      tier: j.realtor?.subscriptionTier,
      activeListingCount: j.realtor?.activeListingCount,
      maxListingCapacity: j.realtor?.maxListingCapacity,
      maxHandoffCapacity: j.realtor?.maxHandoffCapacity,
      starterOverflowCount: j.realtor?.starterOverflowCount,
      myListingsLength: (j.myListings || []).length,
      listingStatuses: statuses,
      nearbyHandoffs14d: j.foundingProgram?.nearbyHandoffs14d,
      claimedCount: j.foundingProgram?.claimedCount,
      hasActiveHandoffCount: Object.prototype.hasOwnProperty.call(j.realtor || {}, "activeHandoffCount"),
      raw: j,
    };
  }

  const browser = await chromium.launch();
  const vp390 = { width: 390, height: 844 };

  // ── §1 CEO D1 four-state tier matrix, from LIVE seeded data (no injection) ─
  console.log("\n── D1 four-state tier matrix (live, uninjected) ──");
  for (const key of ["realtor_free_trial", "realtor_soft_cap", "realtor_pro", "realtor_pro_plus"]) {
    const t = tokens[key];
    const row = { fixture: key, tier: results.livePayloads[key].tier };
    for (const [label, web] of [["before", BEFORE_WEB], ["after", AFTER_WEB]]) {
      const { ctx, page, errors } = await renderScenario(browser, {
        web, token: t.token, user: t.user, payload: undefined, vp: vp390,
      });
      const text = await page.evaluate(PAGE_TEXT);
      row[label] = {
        saysUnlimited: /Unlimited Listings & Handoffs/.test(text),
        starterPanel: /Starter Tier \(/.test(text),
        capBarVisible: /Free Cap \(/.test(text),
        capLine: (text.match(/\d+ of \d+ Free Cap \([^)]*\)/) || [null])[0],
        handoffLine: (text.match(/\d+ of \d+ Active[^·]*(· [^\n]{0,60})?/) || [null])[0],
        starterTitle: (text.match(/Starter Tier \([^)]*\)/) || [null])[0],
        pageErrors: errors.slice(0, 2),
      };
      await page.screenshot({ path: path.join(FRAMES, `tier-${row.tier}-${label}-w390.png`), fullPage: true });
      await ctx.close();
    }
    results.tierMatrix.push(row);
    console.log(
      `${row.tier.padEnd(11)} before: unlimited=${String(row.before.saysUnlimited).padEnd(5)} cap=${row.before.capLine} | ` +
      `after: unlimited=${String(row.after.saysUnlimited).padEnd(5)} cap=${row.after.capLine}`
    );
  }

  // ── §2 Injected scenarios, rendered BEFORE and AFTER ─────────────────────
  for (const sc of SCENARIOS) {
    console.log(`\n── ${sc.id} ──`);
    const live = results.livePayloads[sc.fixture].raw;
    const payload = sc.build(live);
    const t = tokens[sc.fixture];
    const rec = { id: sc.id, why: sc.why, fixture: sc.fixture, renders: {}, checks: [] };

    for (const [label, web] of [["before", BEFORE_WEB], ["after", AFTER_WEB]]) {
      const { ctx, page, errors, interceptedCount } = await renderScenario(browser, {
        web, token: t.token, user: t.user, payload, vp: vp390,
      });
      const text = await page.evaluate(PAGE_TEXT);
      rec.renders[label] = {
        intercepted: interceptedCount(),
        capLine: (text.match(/\d+ of \d+ Free Cap \([^)]*\)/) || [null])[0],
        handoffLine: (text.match(/\d+ of \d+ Active(?: · [^\n]{0,60})?/) || [null])[0],
        starterTitle: (text.match(/Starter Tier \([^)]*\)/) || [null])[0],
        saysUnlimited: /Unlimited Listings & Handoffs/.test(text),
        errorState: /Couldn't load dashboard/.test(text),
        pageErrors: errors.slice(0, 2),
        textHead: text.slice(0, 320),
      };
      await page.screenshot({ path: path.join(FRAMES, `${sc.id}-${label}-w390.png`), fullPage: true });

      // S5: prove the retry path actually recovers once the bad response stops.
      if (sc.retryProbe && label === "after") {
        await page.unroute("**/api/realtors/dashboard**");
        const btn = page.getByText("Retry", { exact: true }).first();
        await btn.click({ timeout: 10000 }).catch(() => {});
        await page.waitForTimeout(4000);
        const after = await page.evaluate(PAGE_TEXT);
        rec.retryRecovered = !/Couldn't load dashboard/.test(after) && /Starter Tier \(|Unlimited/.test(after);
        rec.retryTextHead = after.slice(0, 220);
        await page.screenshot({ path: path.join(FRAMES, `${sc.id}-after-retry-w390.png`), fullPage: true });
        console.log(`  retry recovered: ${rec.retryRecovered}`);
      }

      await ctx.close();
    }

    // Search the rendered-text fields only (never pageErrors, which would let a
    // stack trace satisfy a "forbid" check by accident).
    const blob = (r) =>
      [r.capLine, r.handoffLine, r.starterTitle, r.textHead, r.saysUnlimited ? "Unlimited Listings & Handoffs" : ""]
        .filter(Boolean)
        .join("   ");
    const aBlob = blob(rec.renders.after);
    const bBlob = blob(rec.renders.before);
    rec.afterBlob = aBlob;
    rec.beforeBlob = bBlob;
    for (const e of sc.expectAfter || [])
      rec.checks.push({ kind: "expect-after", needle: e, pass: aBlob.includes(e) });
    for (const f of sc.forbidAfter || [])
      rec.checks.push({ kind: "forbid-after", needle: f, pass: !aBlob.includes(f) });
    for (const e of sc.expectBefore || [])
      rec.checks.push({ kind: "expect-before", needle: e, pass: bBlob.includes(e) });

    for (const c of rec.checks) console.log(`  [${c.pass ? "PASS" : "FAIL"}] ${c.kind}: "${c.needle}"`);
    results.scenarios.push(rec);
  }

  // ── §2b Upgrade-chip sweep (scope item 5) ────────────────────────────────
  // Measured on BOTH builds and with BOTH cap strings, because the question is
  // not "does the chip clip" (critique §D2/§F3 already records it as a ~24pt
  // pre-existing HIG failure) but "did T1's newly variable-length cap string
  // make it clip where it did not before". Only a before/after pair at the same
  // width and scale can answer that.
  console.log("\n── §2b upgrade-chip sweep: before/after x 2/1 vs 999/1 cap string ──");
  {
    const t = tokens.realtor_free_trial;
    const live = results.livePayloads.realtor_free_trial.raw;
    const CAP_CASES = [
      {
        name: "cap-2-1",
        note: "T0's fixed-length string, the pre-T1 control",
        payload: {
          ...live,
          realtor: {
            ...live.realtor, subscriptionTier: "free_trial", activeListingCount: 1,
            maxListingCapacity: 2, maxHandoffCapacity: 1, starterOverflowCount: 0,
          },
        },
      },
      {
        name: "cap-999-1",
        note: "longest string that still renders the Starter panel",
        payload: {
          ...live,
          realtor: {
            ...live.realtor, subscriptionTier: "free_trial", activeListingCount: 999,
            maxListingCapacity: 999, maxHandoffCapacity: 1, starterOverflowCount: 999,
          },
        },
      },
    ];

    for (const cc of CAP_CASES) {
      for (const [label, web] of [["before", BEFORE_WEB], ["after", AFTER_WEB]]) {
        for (const w of CHIP_WIDTHS) {
          for (const { k, name } of SCALES) {
            const r2 = await renderScenario(browser, {
              web, token: t.token, user: t.user, payload: cc.payload, vp: { width: w, height: 844 },
            });
            if (k !== 1.0) {
              await r2.page.evaluate(APPLY_SCALE, k);
              await r2.page.waitForTimeout(700);
            }
            const probe = await r2.page.evaluate(PROBE_CHIP);
            results.chipSweep.push({
              capCase: cc.name, note: cc.note, build: label, width: w,
              scale: name, k: Math.round(k * 1000) / 1000, ...probe,
            });
            console.log(
              `  ${cc.name} ${label.padEnd(6)} w${w} ${name.padEnd(10)} ` +
              (probe.found
                ? `${probe.chip.w}x${probe.chip.h} hit44=${String(probe.meetsHit).padEnd(5)} ` +
                  `clippedByRow=${String(probe.chipOverflowsRow).padEnd(5)} ` +
                  `textCutoff=${probe.textOverflowsChip || probe.textTruncated} ` +
                  `title="${probe.titleText}"`
                : "CHIP NOT FOUND (Pro strip or error state)")
            );
            if (k === 1.0 || name === "AX5-max")
              await r2.page.screenshot({
                path: path.join(FRAMES, `chip-${cc.name}-${label}-w${w}-${name}.png`),
              });
            await r2.ctx.close();
          }
        }
      }
    }
  }

  // ── §3 Invariant #1 — contact parity survives the new normalizer ──────────
  console.log("\n── Invariant #1: buyer-contact parity after normalizeDashboard ──");
  {
    const t = tokens.realtor_pro;
    const live = results.livePayloads.realtor_pro.raw;
    // Every key the server sends on a listing must still be present after the
    // normalizer's `...l` spread, especially the contact fields.
    const serverKeys = [...new Set((live.myListings || []).flatMap((l) => Object.keys(l)))].sort();
    const contactFields = (live.myListings || []).map((l) => ({
      id: l.id,
      status: l.status,
      contactName: l.contactName ?? null,
      contactPhone: l.contactPhone ?? null,
    }));
    results.invariant1.serverListingKeys = serverKeys;
    results.invariant1.serverContactFields = contactFields;
    results.invariant1.activeRowsMissingContact = contactFields.filter(
      (c) => c.status === "active" && (!c.contactName || !c.contactPhone)
    );

    for (const [label, web] of [["before", BEFORE_WEB], ["after", AFTER_WEB]]) {
      const { ctx, page, errors } = await renderScenario(browser, {
        web, token: t.token, user: t.user, payload: undefined, vp: vp390, scheme: "light",
      });
      // Open the Buyer Contacts tab (same disambiguation as capture-web.mjs).
      await page.evaluate((label2) => {
        const hit = [...document.querySelectorAll("div,span")].filter((el) => {
          const txt = (el.innerText || "").trim();
          if (!txt.startsWith(label2) || txt.length > label2.length + 4) return false;
          let n = el;
          for (let i = 0; i < 4 && n; i++, n = n.parentElement)
            if (getComputedStyle(n).cursor === "pointer") return true;
          return false;
        });
        const el = hit[hit.length - 1];
        if (!el) return false;
        let target = el;
        while (target && getComputedStyle(target).cursor !== "pointer") target = target.parentElement;
        (target || el).click();
        return true;
      }, "Buyer Contacts");
      await page.waitForTimeout(2500);
      const text = await page.evaluate(PAGE_TEXT);
      // Buyer-contact actions are the Invariant #1 surface on this screen.
      const probe = await page.evaluate(() => {
        const btns = [...document.querySelectorAll("div,span,a")].filter((el) => {
          const t2 = (el.innerText || "").trim();
          return t2 === "Call" || t2 === "WhatsApp";
        });
        return {
          callCount: btns.filter((b) => b.innerText.trim() === "Call").length,
          whatsappCount: btns.filter((b) => b.innerText.trim() === "WhatsApp").length,
          phoneLike: (document.body.innerText.match(/(\+91|\b)[6-9]\d{9}\b/g) || []).slice(0, 6),
        };
      });
      results.invariant1[label] = { ...probe, pageErrors: errors.slice(0, 2), textHead: text.slice(0, 320) };
      await page.screenshot({ path: path.join(FRAMES, `invariant1-buyercontacts-${label}-w390.png`), fullPage: true });
      await ctx.close();
      console.log(`  ${label}: Call=${probe.callCount} WhatsApp=${probe.whatsappCount} phones=${probe.phoneLike.length}`);
    }
  }

  await browser.close();
  fs.writeFileSync(path.join(OUT, "_t1-layer2-results.json"), JSON.stringify(results, null, 2));

  // ── Summary ───────────────────────────────────────────────────────────────
  const allChecks = results.scenarios.flatMap((s) => s.checks);
  const failed = allChecks.filter((c) => !c.pass);
  console.log(`\n${allChecks.length - failed.length}/${allChecks.length} scenario checks passed.`);
  for (const f of failed) console.log(`  FAIL ${f.kind}: "${f.needle}"`);
  // Chip verdict: a clipping/truncation count that is EQUAL before and after for
  // the same cap case is pre-existing (critique §D2/§F3, owned by T3). Only an
  // after-count that exceeds the before-count is a T1 regression.
  console.log(`\nchip sweep: ${results.chipSweep.length} measurements`);
  const bad = (c) => c.found && (c.chipOverflowsRow || c.textOverflowsChip || c.textTruncated || c.titleTruncated);
  for (const capCase of ["cap-2-1", "cap-999-1"]) {
    for (const build of ["before", "after"]) {
      const set = results.chipSweep.filter((c) => c.capCase === capCase && c.build === build);
      console.log(
        `  ${capCase} ${build.padEnd(6)}: ${set.filter(bad).length}/${set.length} clipped or truncated, ` +
        `${set.filter((c) => c.found && !c.meetsHit).length}/${set.length} below ${HIT}pt, ` +
        `${set.filter((c) => !c.found).length} chip-not-found`
      );
    }
  }
  const newClip = results.chipSweep.filter((c) => c.build === "after" && bad(c)).length -
                  results.chipSweep.filter((c) => c.build === "before" && bad(c)).length;
  console.log(`  net new clipping introduced by T1: ${newClip} (<=0 means pre-existing only)`);
  console.log(`\nwritten to ${OUT}/_t1-layer2-results.json`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
