/**
 * AUDIT-001 Ticket 2 (BLA-6) — Layer-2 gate harness for the Founding-500
 * conversion panel + real PROD scarcity count (CEO D1-D4).
 *
 * Written BEFORE the T2 implementation, on purpose. Run today it FAILS, and
 * each failure is a re-runnable proof that the defect named in the ticket is
 * live in `agent/uxd-audit`. Run after the T2 fix it must exit 0. That makes it
 * the evidence artifact the Code Reviewer asked for in BLA-6 comment
 * `17a2882f` — specifically gate item 1: "both branches exercised in the
 * evidence", which the reviewer cannot reproduce in UAT without flipping
 * `BLAB_ENV`.
 *
 * Read-only. Touches no database, no network, and no app source.
 *
 * Gate 1 is the only non-static check. It exercises the REAL shipped
 * `claimedCount` logic under both env values, two ways:
 *
 *   A. post-fix shape — imports `computeFoundingClaimedCount` from
 *      `src/lib/foundingScarcity.ts` if that module exists, so the branch is
 *      tested as a pure function rather than as scraped text; or
 *   B. pre-fix shape — extracts the `claimedCount:` expression verbatim out of
 *      `src/app/api/realtors/dashboard/route.ts` and evaluates it in a sandbox
 *      with an injected `process.env.BLAB_ENV` and a stub `st` row.
 *
 * Path B runs the shipped expression, not a paraphrase of it, which is what
 * lets today's run stand as evidence.
 *
 * Run (from the repo root)
 *   npx tsx qa-baselines/audit-001/tools/verify-t2-scarcity.mts
 *
 * Exit code 0 = every gate passed (T2 is ready for Layer-2).
 * Exit code 1 = at least one gate open (expected until T2 lands).
 */
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { readFileSync, existsSync } from "node:fs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

const ROUTE_PATH  = "src/app/api/realtors/dashboard/route.ts";
const PANEL_PATH  = "expo-app/components/realtor/RealtorDashboard.tsx";
const HELPER_PATH = "src/lib/foundingScarcity.ts";

const routeSrc = readFileSync(resolve(REPO_ROOT, ROUTE_PATH), "utf8");
const panelSrc = readFileSync(resolve(REPO_ROOT, PANEL_PATH), "utf8");

/** Spec constant — `foundingProgram.totalCap` in the same response. */
const TOTAL_CAP = 500;
/** The real `founding_pro_claimed` the reviewer observed in the live DB. */
const REAL_CLAIMED = 21;

let passed = 0;
let failed = 0;
const open: string[] = [];

function check(id: string, requirement: string, ok: boolean, detail: string) {
  if (ok) {
    passed++;
    console.log(`  PASS  ${id}  ${requirement}`);
    if (detail) console.log(`        ${detail}`);
  } else {
    failed++;
    open.push(id);
    console.log(`  FAIL  ${id}  ${requirement}`);
    console.log(`        ${detail}`);
  }
}

function info(label: string, detail: string) {
  console.log(`  NOTE  ${label}`);
  console.log(`        ${detail}`);
}

/** Strips `//` line comments so extracted source can be evaluated. */
function stripLineComments(src: string): string {
  return src
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");
}

/**
 * Strips `{/* … *\/}` JSX comments and `//` lines before scanning for copy.
 * Without this, the T1 comment that *names* the removed `🔥 … this week`
 * literal is itself read as a live regression.
 */
function stripComments(src: string): string {
  return stripLineComments(src.replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")).replace(
    /\/\*[\s\S]*?\*\//g,
    "",
  );
}

/**
 * Extracts the balanced expression that follows `key:` in an object literal,
 * stopping at the first comma at bracket depth 0.
 */
function extractValueExpression(src: string, key: string): string | null {
  const at = src.indexOf(`${key}:`);
  if (at === -1) return null;
  let depth = 0;
  let out = "";
  for (let i = at + key.length + 1; i < src.length; i++) {
    const ch = src[i];
    if ("([{".includes(ch)) depth++;
    else if (")]}".includes(ch)) {
      if (depth === 0) break;
      depth--;
    } else if (ch === "," && depth === 0) break;
    out += ch;
  }
  return stripLineComments(out).trim() || null;
}

/** Slices the conversion-panel JSX out of the dashboard by its structural markers. */
function panelRegion(): { starter: string; pro: string } | null {
  const start = panelSrc.indexOf("Starter Tier / Founding 500 Pro Banner");
  const end   = panelSrc.indexOf("{/* Tab bar */}", start);
  if (start === -1 || end === -1) return null;
  const whole = panelSrc.slice(start, end);
  // The `!isPaidPro` consequent is everything before the `) : (` that opens the
  // Pro strip; the alternative is everything after it.
  const split = whole.indexOf(") : (");
  if (split === -1) return { starter: whole, pro: "" };
  return { starter: whole.slice(0, split), pro: whole.slice(split) };
}

console.log("");
console.log("AUDIT-001 / T2 (BLA-6) — Founding-500 gate harness");
console.log(`repo: ${REPO_ROOT}`);
console.log("");

// ───────────────────────────────────────────────────────────────────────────
// Gate 1 — CEO D2 / Invariant #5: real PROD count, both branches exercised
// ───────────────────────────────────────────────────────────────────────────
console.log("Gate 1 — D2 / Invariant #5: claimedCount under BOTH BLAB_ENV branches");

type ClaimedFn = (claimed: number, env: string | undefined) => number;

let claimedUnderEnv: ClaimedFn | null = null;
let gate1Mode = "";

if (existsSync(resolve(REPO_ROOT, HELPER_PATH))) {
  // Path A — post-fix: exercise the pure helper directly.
  const mod: any = await import(resolve(REPO_ROOT, HELPER_PATH) as string);
  const fn = mod.computeFoundingClaimedCount ?? mod.default;
  if (typeof fn === "function") {
    gate1Mode = `path A — pure helper \`computeFoundingClaimedCount\` from ${HELPER_PATH}`;
    claimedUnderEnv = (claimed, env) => Number(fn({ founding_pro_claimed: claimed }, env));
  }
}

if (!claimedUnderEnv) {
  // Path B — pre-fix: evaluate the shipped expression verbatim.
  const expr = extractValueExpression(routeSrc, "claimedCount");
  if (expr) {
    gate1Mode = `path B — shipped expression scraped from ${ROUTE_PATH}: ${expr}`;
    const evaluate = new Function("st", "process", `return (${expr});`) as (
      st: unknown,
      process: unknown,
    ) => number;
    claimedUnderEnv = (claimed, env) =>
      Number(evaluate({ founding_pro_claimed: claimed }, { env: { BLAB_ENV: env } }));
  }
}

if (!claimedUnderEnv) {
  check(
    "D2-EXERCISE",
    "claimedCount logic must be reachable for testing",
    false,
    `Neither ${HELPER_PATH} nor a \`claimedCount:\` expression in ${ROUTE_PATH} could be loaded.`,
  );
} else {
  console.log(`        mode: ${gate1Mode}`);

  const prodReal   = claimedUnderEnv(REAL_CLAIMED, "production");
  const prodZero   = claimedUnderEnv(0, "production");
  const prodFull   = claimedUnderEnv(10_000, "production");
  const uatReal    = claimedUnderEnv(REAL_CLAIMED, "uat");
  const uatFull    = claimedUnderEnv(10_000, "uat");

  check(
    "D2-PROD-REAL",
    "BLAB_ENV=production returns the real founding_pro_claimed — no +42 offset",
    prodReal === REAL_CLAIMED,
    `founding_pro_claimed=${REAL_CLAIMED} under BLAB_ENV=production rendered ${prodReal}` +
      (prodReal === REAL_CLAIMED
        ? ""
        : ` — ${prodReal - REAL_CLAIMED} seats of fabricated scarcity shown to a PROD realtor (Invariant #5).`),
  );

  check(
    "D2-PROD-NO-FLOOR",
    "BLAB_ENV=production applies no synthetic floor (0 real claims must read 0)",
    prodZero === 0,
    `founding_pro_claimed=0 under BLAB_ENV=production rendered ${prodZero}`,
  );

  check(
    "D2-PROD-CLAMP",
    `BLAB_ENV=production clamps to totalCap (${TOTAL_CAP}), not ${TOTAL_CAP - 1}`,
    prodFull === TOTAL_CAP,
    `founding_pro_claimed=10000 under BLAB_ENV=production rendered ${prodFull}` +
      (prodFull === TOTAL_CAP
        ? ""
        : ` — a genuinely full program can never render "${TOTAL_CAP} / ${TOTAL_CAP} CLAIMED".`),
  );

  check(
    "D2-UAT-CLAMP",
    `BLAB_ENV!=production may keep the simulated offset but clamps to totalCap (${TOTAL_CAP}) too`,
    uatFull === TOTAL_CAP,
    `founding_pro_claimed=10000 under BLAB_ENV=uat rendered ${uatFull}`,
  );

  check(
    "D2-BRANCHES-DIVERGE",
    "the two branches are genuinely distinct code paths (env is actually read)",
    prodReal !== uatReal,
    `BLAB_ENV=production -> ${prodReal}; BLAB_ENV=uat -> ${uatReal}` +
      (prodReal === uatReal
        ? " — identical, so no env branch is being evaluated at all."
        : " — the simulated offset is confined to non-production."),
  );
}

// The simulation decision must not ride along into the client bundle.
const foundingBlock = routeSrc.slice(
  routeSrc.indexOf("foundingProgram: {"),
  routeSrc.indexOf("stats: {"),
);
const leakedKeys = [...foundingBlock.matchAll(/^\s*(\w*(?:sim|uat|isProd|env|sandbox)\w*)\s*:/gim)].map(
  (m) => m[1],
);
check(
  "D2-NO-FLAG-LEAK",
  "no simulation/env flag is serialised into the foundingProgram client payload",
  leakedKeys.length === 0,
  leakedKeys.length === 0
    ? "foundingProgram exposes only render data."
    : `leaked key(s): ${leakedKeys.join(", ")}`,
);

// Carry-over the CEO asked to be flagged, not fixed (D2, final paragraph).
const nearbyExpr = extractValueExpression(routeSrc, "nearbyHandoffs14d");
info(
  "CARRY-D2-FLOOR  nearbyHandoffs14d floor — flag in the PR description, do not fix",
  nearbyExpr
    ? `${ROUTE_PATH} -> nearbyHandoffs14d: ${nearbyExpr}  ` +
      "(a realtor with 0 or 2 real nearby handoffs still reads 3)"
    : "expression not found — re-check the route before writing the PR description.",
);

// ───────────────────────────────────────────────────────────────────────────
// Gate 2 — CEO D1: the panel must never assert a cap and its absence at once
// ───────────────────────────────────────────────────────────────────────────
console.log("");
console.log("Gate 2 — D1: cap and 'unlimited' may never coexist as current entitlements");

const region = panelRegion();
if (!region) {
  check(
    "D1-REGION",
    "the conversion panel must be locatable by its structural markers",
    false,
    `Could not slice the panel out of ${PANEL_PATH}. Markers moved — update this harness.`,
  );
} else {
  // Comments are stripped before any copy assertion: the panel's own comments
  // quote the literals they removed, and a quoted literal is not shipped copy.
  const starterCode = stripComments(region.starter);
  const whole = stripComments(region.starter + region.pro);

  const unlimitedInStarter = /unlimited/i.test(starterCode);
  const claimHead = /What you get when you claim/i.test(starterCode);

  check(
    "D1-FUTURE-TENSE",
    "any 'unlimited' line in the Starter panel sits under \"What you get when you claim:\"",
    !unlimitedInStarter || claimHead,
    unlimitedInStarter
      ? claimHead
        ? "'unlimited' appears only under the when-you-claim head."
        : "'unlimited' appears in the Starter branch with NO when-you-claim head — E1 in a new costume."
      : "no 'unlimited' assertion in the Starter branch (currently correct; re-checked after the rebuild).",
  );

  check(
    "D1-FREE-TIER-HEAD",
    "the Starter panel carries the FREE TIER — 2 LISTINGS / 1 HANDOFF heading",
    /FREE TIER/i.test(starterCode),
    /FREE TIER/i.test(starterCode)
      ? "heading present."
      : "heading absent — required by ceo-decision-log.md §1 D1 for free_trial and soft_cap.",
  );

  // ─────────────────────────────────────────────────────────────────────────
  // Gate 3 — D1/D4: no price or date literal survives in the client
  // ─────────────────────────────────────────────────────────────────────────
  console.log("");
  console.log("Gate 3 — D1/D4/§J3: every price and date string comes from `foundingProgram`");

  const LITERALS = [
    "₹10,000",
    "₹3,000",
    "₹0 till",
    "Mar 31",
    "31 March 2027",
    "31 Mar 2027",
    "500 Realtors",
  ];
  const hits = LITERALS.filter((lit) => whole.includes(lit));
  check(
    "D4-NO-LITERALS",
    "no hardcoded price/date literal inside the panel",
    hits.length === 0,
    hits.length === 0
      ? "all strings interpolated from server fields."
      : `${hits.length} literal(s) still hardcoded: ${hits.map((h) => JSON.stringify(h)).join(", ")}`,
  );

  check(
    "J3-DATE-SOURCE",
    "the trial end date renders from `freeTrialThrough`",
    whole.includes("freeTrialThrough"),
    whole.includes("freeTrialThrough")
      ? "panel reads foundingProgram.freeTrialThrough."
      : "panel never reads freeTrialThrough — §J3 standardisation not applied.",
  );

  // ─────────────────────────────────────────────────────────────────────────
  // Gate 4 — §H5 Zone 1: the scarcity counter actually renders
  // ─────────────────────────────────────────────────────────────────────────
  console.log("");
  console.log("Gate 4 — §H5 Zone 1: the server's scarcity count reaches the screen");

  check(
    "H5-SCARCITY-RENDERED",
    "the panel renders `claimedCount` / `totalCap`",
    whole.includes("claimedCount") && whole.includes("totalCap"),
    whole.includes("claimedCount")
      ? "scarcity counter bound to server fields."
      : "claimedCount reaches the store (realtorCaps.ts:88) but no UI renders it — D1 defect still live.",
  );

  // ─────────────────────────────────────────────────────────────────────────
  // Gate 5 — §H5 Zone 3: the CTA is built like a CTA, and checks its response
  // ─────────────────────────────────────────────────────────────────────────
  console.log("");
  console.log("Gate 5 — §H5 Zone 3: the claim CTA confirms, pends, checks, and recovers");

  const ctaAt = starterCode.indexOf("upgrade_pro");
  const cta = ctaAt === -1 ? "" : starterCode.slice(Math.max(0, ctaAt - 2000), ctaAt + 2000);

  check(
    "H5-CTA-RESPONSE-CHECKED",
    "the upgrade POST response is checked before the panel claims success",
    /\bres(?:ponse)?\s*\.\s*(ok|status)\b/.test(cta),
    cta === ""
      ? "no `upgrade_pro` POST found in the Starter branch."
      : /\bres(?:ponse)?\s*\.\s*(ok|status)\b/.test(cta)
        ? "response status is inspected."
        : "fire-and-forget `await fetch(...)` with no status check — a failed billing commitment reads as success.",
  );

  check(
    "H5-CTA-PENDING",
    "the CTA disables itself and shows an ActivityIndicator while pending",
    /ActivityIndicator/.test(cta) && /disabled/.test(cta),
    /ActivityIndicator/.test(cta)
      ? "pending state present."
      : "no pending state — the CTA is double-tappable during a billing-tier POST.",
  );

  check(
    "H5-CTA-CONFIRM",
    "a confirm step precedes the POST (billing-tier commitment)",
    /confirm/i.test(cta),
    /confirm/i.test(cta)
      ? "confirm step present."
      : "no confirm step — one tap commits the realtor to a billing tier.",
  );

  check(
    "H5-CTA-ERROR",
    "a retryable inline error path exists",
    /catch\s*\(/.test(cta) && /(error|Err)/.test(cta),
    /catch\s*\(/.test(cta)
      ? "error path present."
      : "no catch/error state — a network failure is silent.",
  );

  // ─────────────────────────────────────────────────────────────────────────
  // Gate 6 — invariants that must survive the rebuild
  // ─────────────────────────────────────────────────────────────────────────
  console.log("");
  console.log("Gate 6 — invariants the rebuild must not disturb");

  check(
    "INV3-OVERFLOW-STRING",
    'the verbatim "N in Owner Fallback" string is preserved',
    /in Owner Fallback/.test(panelSrc) || /in Owner Fallback/.test(readFileSync(resolve(REPO_ROOT, "expo-app/store/realtorCaps.ts"), "utf8")),
    "Option-B overflow copy (Invariant #3) located.",
  );

  check(
    "D3-NO-FAKE-WINDOW",
    'the fabricated "this week" FOMO window and 🔥 emoji stay removed',
    !/🔥/.test(whole) && !/this week/i.test(whole),
    !/🔥/.test(whole)
      ? "honest 14-day window only."
      : "the 🔥 / 'this week' literal is back — D3 regression.",
  );
}

console.log("");
console.log("─".repeat(72));
console.log(`passed: ${passed}    failed: ${failed}`);
if (failed > 0) {
  console.log(`open gates: ${open.join(", ")}`);
  console.log("");
  console.log("A non-zero exit BEFORE the T2 commit is the expected result: each FAIL");
  console.log("above is a re-runnable reproduction of a defect named in BLA-6. The same");
  console.log("command must exit 0 on the T2 PR head.");
}
console.log("─".repeat(72));
console.log("");

process.exit(failed > 0 ? 1 : 0);
