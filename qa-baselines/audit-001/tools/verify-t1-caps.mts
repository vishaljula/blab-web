/**
 * AUDIT-001 Ticket 1 (BLA-4) — Layer-1 verification harness for the
 * server-authoritative cap fix (E1, E2, D3).
 *
 * Read-only with respect to app source and the database. Exercises the SHIPPED
 * `expo-app/store/realtorCaps.ts` two ways:
 *
 *   A. against live `/api/realtors/dashboard` responses for real DB realtors in
 *      each of the four tier states, printing the before/after rendered string
 *      so QA can diff the pre-authorised baseline shift (critique §J2); and
 *   B. against the acceptance criteria and the malformed-payload degradation
 *      contract from BLA-4.
 *
 * `realtorCaps.ts` is deliberately free of `zustand` / `react-native` / `@/`
 * imports so it can be imported here directly — these assertions run the real
 * shipped code, not a copy of it.
 *
 * Prerequisites
 *   1. Next.js API running on :3000  ->  npm run dev
 *   2. `.env.local` with DATABASE_URL + the ENCRYPTION_KEY used by src/lib/crypto
 *
 * Run (from the repo root)
 *   TMPDIR=/tmp npx tsx qa-baselines/audit-001/tools/verify-t1-caps.mts
 *
 * `TMPDIR=/tmp` is required only when the ambient TMPDIR is too long for a unix
 * socket, which is the case inside a Paperclip run scratch dir.
 *
 * Exit code 0 = all assertions passed.
 */
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { config } from "dotenv";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
config({ path: resolve(REPO_ROOT, ".env.local") });

const { encrypt } = await import(resolve(REPO_ROOT, "src/lib/crypto.ts") as string);
const { normalizeDashboard, deriveCapState, overflowLabel } = await import(
  resolve(REPO_ROOT, "expo-app/store/realtorCaps.ts") as string
);

const BASE = process.env.BLAB_API_BASE ?? "http://localhost:3000";

let passed = 0;
let failed = 0;

function assert(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? passed++ : failed++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}`);
  console.log(`        got=${JSON.stringify(got)}${ok ? "" : `\n        want=${JSON.stringify(want)}`}`);
}

/** Mint the Bearer token shape `resolveRealtorId` expects (route.ts:345). */
function token(userId: string): string {
  return encrypt(JSON.stringify({ userId, expiry: Date.now() + 3_600_000 }));
}

async function fetchDashboard(userId: string) {
  const res = await fetch(`${BASE}/api/realtors/dashboard`, {
    headers: { Authorization: `Bearer ${token(userId)}` },
  });
  return { status: res.status, raw: await res.json() };
}

// ── The exact render templates from RealtorDashboard.tsx ─────────────────────
// Kept verbatim so a copy edit to either bar shows up here as a diff.

const listingBar = (active: number, cap: number, overflow: number) =>
  `${active} of ${cap} Free Cap (${overflowLabel(overflow)})`;

const handoffBar = (active: number, cap: number, nearby14d: number | null) =>
  `${active} of ${cap} Active` +
  (nearby14d === null ? "" : ` · ${nearby14d} nearby handoffs in the last 14 days`);

// ── The PRE-FIX templates, for the before/after diff ─────────────────────────

const oldListingBar = (n: number) =>
  `${Math.min(n, 2)} of 2 Free Cap (${n > 2 ? `${n - 2} in Owner Fallback` : "0 overflow"})`;

const oldHandoffBar = (n: number) =>
  `${Math.min(n, 1)} of 1 Active · 🔥 4 nearby handoffs this week`;

/** The pre-fix banner gate: `subscriptionTier === "free_trial"` (old `:651`). */
const oldBanner = (tier: string) =>
  tier === "free_trial" ? "Starter cap panel" : 'GREEN "Unlimited Listings & Handoffs"';

// ── A. Live API → shipped normalizer → rendered string ───────────────────────

/**
 * Realtor IDs selected from the seeded DB to cover all four tier states.
 * Re-resolve with `pick-t1-fixtures.sql` if the seed is regenerated.
 */
const CASES = [
  { label: "E1   soft_cap, 1 active",             id: "6e8039f4-535c-412f-bc18-c4e62fbc5677" },
  { label: "E2   free_trial, 0 active + 1 draft", id: "25197a1e-1462-4af4-83bc-feba318fbc99" },
  { label: "OVF  free_trial, 5 active",           id: "32c3490c-5525-4c73-ac4c-fea098131908" },
  { label: "PRO  pro, 4 active + 1 draft",        id: "f83a1de4-eea5-40ee-b95b-47b1d1f16121" },
];

console.log("══ A. LIVE API → SHIPPED NORMALIZER → RENDERED STRING ══\n");

for (const c of CASES) {
  const { status, raw } = await fetchDashboard(c.id);
  const d = normalizeDashboard(raw);
  if (!d) {
    console.log(`── ${c.label}: normalizer returned null (http ${status})\n`);
    failed++;
    continue;
  }
  const cap = deriveCapState(d.realtor);
  const proxy = d.myListings.length; // the client-side proxy this ticket removed

  console.log(`── ${c.label}   [tier=${d.realtor.subscriptionTier}]`);
  console.log(
    `   server:  activeListingCount=${d.realtor.activeListingCount}` +
    `  maxListing=${d.realtor.maxListingCapacity}` +
    `  maxHandoff=${d.realtor.maxHandoffCapacity}` +
    `  starterOverflow=${d.realtor.starterOverflowCount}`
  );
  console.log(`   removed client proxy:  myListings.length=${proxy}`);
  console.log(`   banner      BEFORE:  ${oldBanner(d.realtor.subscriptionTier)}`);
  console.log(`   banner       AFTER:  ${cap.isPaidPro ? 'PRO strip ("Unlimited Listings & Handoffs")' : "Starter cap panel"}`);
  if (!cap.isPaidPro) {
    console.log(`   listing bar BEFORE:  "${oldListingBar(proxy)}"`);
    console.log(`   listing bar  AFTER:  "${listingBar(cap.activeListings, cap.listingCap, cap.overflowCount)}"`);
    console.log(`   handoff bar BEFORE:  "${oldHandoffBar(proxy)}"`);
    console.log(`   handoff bar  AFTER:  "${handoffBar(cap.activeHandoffs, cap.handoffCap, d.foundingProgram?.nearbyHandoffs14d ?? null)}"`);
  }
  console.log(`   foundingProgram now reaches the UI:  ${JSON.stringify(d.foundingProgram)}\n`);
}

// ── B. Acceptance criteria ───────────────────────────────────────────────────

console.log("══ B. ACCEPTANCE CRITERIA ══\n");

for (const [label, id] of [["soft_cap", CASES[0].id], ["free_trial", CASES[1].id]] as const) {
  const { raw } = await fetchDashboard(id);
  const d = normalizeDashboard(raw)!;
  const cap = deriveCapState(d.realtor);
  assert(`${label}: isPaidPro === false (E1)`, cap.isPaidPro, false);
  assert(`${label}: caps are Starter 2/1`, [cap.listingCap, cap.handoffCap], [2, 1]);
}

// 1 active + 2 drafts -> "1 of 2", 0 overflow. Server shape replicated exactly:
// activeListingCount counts status='active' only; myListings has no status filter.
{
  const payload = {
    realtor: {
      subscriptionTier: "free_trial", name: "Fixture",
      activeListingCount: 1, maxListingCapacity: 2, maxHandoffCapacity: 1,
      starterOverflowCount: 0,
    },
    foundingProgram: {
      totalCap: 500, claimedCount: 7, annualPriceInr: 10000, standardMonthlyInr: 3000,
      freeTrialThrough: "2027-03-31", freeShootsIncluded: 5, nearbyHandoffs14d: 3,
    },
    stats: { activeListings: 1 },
    myListings: [{ status: "active" }, { status: "draft" }, { status: "draft" }],
  };
  const d = normalizeDashboard(payload)!;
  const cap = deriveCapState(d.realtor);
  assert(
    "1 active + 2 drafts -> listing bar (E2)",
    listingBar(cap.activeListings, cap.listingCap, cap.overflowCount),
    "1 of 2 Free Cap (0 overflow)"
  );
  assert("1 active + 2 drafts -> overflow is 0", cap.overflowCount, 0);
  assert(
    "regression guard: what the pre-fix code rendered",
    oldListingBar(d.myListings.length),
    "2 of 2 Free Cap (1 in Owner Fallback)"
  );
}

// "N in Owner Fallback" preserved verbatim — Protected Surface #4 / critique §G.
assert("overflowLabel(3) verbatim", overflowLabel(3), "3 in Owner Fallback");
assert("overflowLabel(1) verbatim", overflowLabel(1), "1 in Owner Fallback");
assert("overflowLabel(0) verbatim", overflowLabel(0), "0 overflow");

// Pro capacity still grants the unlimited strip; a tier string never can.
{
  const pro = normalizeDashboard({
    realtor: { maxListingCapacity: 999, maxHandoffCapacity: 999, activeListingCount: 40, starterOverflowCount: 0 },
  })!;
  assert("999/999 -> isPaidPro true", deriveCapState(pro.realtor).isPaidPro, true);

  const soft = normalizeDashboard({
    realtor: { subscriptionTier: "soft_cap", maxListingCapacity: 2, maxHandoffCapacity: 1, activeListingCount: 9, starterOverflowCount: 7 },
  })!;
  const cap = deriveCapState(soft.realtor);
  assert("soft_cap never unlimited, whatever the tier string says", cap.isPaidPro, false);
  assert(
    "soft_cap w/ 9 active -> clamped, overflow surfaced",
    listingBar(cap.activeListings, cap.listingCap, cap.overflowCount),
    "2 of 2 Free Cap (7 in Owner Fallback)"
  );
}

// ── C. Degradation contract ──────────────────────────────────────────────────

console.log("\n══ C. DEGRADATION CONTRACT (malformed payloads) ══\n");

const STARTER_REALTOR = {
  activeListingCount: 1, maxListingCapacity: 2, maxHandoffCapacity: 1, starterOverflowCount: 0,
};

const MALFORMED: Array<[string, any]> = [
  ["foundingProgram missing",     { realtor: STARTER_REALTOR }],
  ["foundingProgram null",        { realtor: STARTER_REALTOR, foundingProgram: null }],
  ["foundingProgram wrong type",  { realtor: STARTER_REALTOR, foundingProgram: "nope" }],
  ["foundingProgram fields null", { realtor: {}, foundingProgram: { totalCap: null, claimedCount: null, nearbyHandoffs14d: null, freeTrialThrough: null } }],
  ["capacity fields missing",     { realtor: {} }],
  ["capacity fields null",        { realtor: { activeListingCount: null, maxListingCapacity: null, maxHandoffCapacity: null, starterOverflowCount: null } }],
  ["capacity non-numeric",        { realtor: { activeListingCount: "abc", maxListingCapacity: "xyz", maxHandoffCapacity: {}, starterOverflowCount: [] } }],
  ["capacity negative",           { realtor: { activeListingCount: -5, maxListingCapacity: -2, maxHandoffCapacity: 0, starterOverflowCount: -1 } }],
  ["capacity NaN / Infinity",     { realtor: { activeListingCount: NaN, maxListingCapacity: Infinity, maxHandoffCapacity: NaN, starterOverflowCount: NaN } }],
  ["myListings not an array",     { realtor: {}, myListings: "oops" }],
  ["nested arrays null",          { realtor: {}, myListings: [{ id: "a", recentEnquiries: null, viewings: null }] }],
  ["stats missing",               { realtor: {} }],
  ["stats wrong type",            { realtor: {}, stats: "oops" }],
];

for (const [name, payload] of MALFORMED) {
  const d = normalizeDashboard(payload);
  if (!d) {
    assert(`${name} -> dashboard object`, null, "object");
    continue;
  }
  const cap = deriveCapState(d.realtor);
  const listing = listingBar(cap.activeListings, cap.listingCap, cap.overflowCount);
  const handoff = handoffBar(cap.activeHandoffs, cap.handoffCap, d.foundingProgram?.nearbyHandoffs14d ?? null);

  const rendered = listing + handoff + cap.listingFill + cap.handoffFill;
  assert(`${name} -> no NaN/undefined, Starter-safe, arrays guarded`, {
    noBadTokens:  !/NaN|undefined|Infinity|null/.test(rendered),
    starterSafe:  !cap.isPaidPro && cap.listingCap >= 1 && cap.handoffCap >= 1,
    finiteFills:  Number.isFinite(cap.listingFill) && Number.isFinite(cap.handoffFill)
                  && cap.listingFill >= 0 && cap.listingFill <= 1
                  && cap.handoffFill >= 0 && cap.handoffFill <= 1,
    arraysOk:     Array.isArray(d.myListings)
                  && d.myListings.every((l: any) => Array.isArray(l.recentEnquiries) && Array.isArray(l.viewings)),
    listing, handoff,
  }, {
    noBadTokens: true, starterSafe: true, finiteFills: true, arraysOk: true, listing, handoff,
  });
}

// A response that is not a dashboard at all -> null -> existing retry UI.
const JUNK = [null, undefined, "str", 42, [], {}, { error: "Unauthorized" }, { realtor: null }, { realtor: "x" }];
for (const junk of JUNK) {
  assert(`junk ${JSON.stringify(junk) ?? "undefined"} -> null (retry UI)`, normalizeDashboard(junk), null);
}

console.log(`\n══ RESULT: ${passed} passed, ${failed} failed ══`);
process.exit(failed === 0 ? 0 : 1);
