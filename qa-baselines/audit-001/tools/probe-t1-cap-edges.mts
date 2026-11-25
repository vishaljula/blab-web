/**
 * AUDIT-001 Layer-2 (BLA-9) — adversarial edge probe for the T1 cap derivation.
 *
 * Companion to the implementer's `verify-t1-caps.mts`. That harness proves the
 * acceptance criteria hold; this one attacks the *boundary* of
 * `deriveCapState().isPaidPro` and the independent degradation of the two caps,
 * i.e. the inputs the acceptance criteria do not pin.
 *
 * It imports the SHIPPED `expo-app/store/realtorCaps.ts`, needs no DB and no
 * running API, and prints the string a realtor would actually read.
 *
 * Findings this probe produced (see `qa-baselines/audit-001/layer2-verdict.md`):
 *   F-T1-1  capacity 3 / 2 (and 2.6 / 1.4) reach the PRO strip and assert
 *           "Unlimited Listings & Handoffs" without the server granting 999/999,
 *           because `isPaidPro` is `> 2 && > 1` rather than an unlimited test.
 *   F-T1-2  the two caps degrade independently, so a half-missing payload renders
 *           "Starter Tier (999 Active · 1 Handoff Cap)".
 *
 * Run (from the repo root)
 *   TMPDIR=/tmp npx tsx qa-baselines/audit-001/tools/probe-t1-cap-edges.mts
 *
 * `TMPDIR=/tmp` is required only when the ambient TMPDIR is too long for a unix
 * socket, which is the case inside a Paperclip run scratch dir.
 *
 * This probe is diagnostic: it prints, it does not assert, and it always exits 0.
 * The assertions belong in `verify-t1-caps.mts` once F-T1-1 is fixed.
 */
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const { normalizeDashboard, deriveCapState, overflowLabel } = await import(
  resolve(REPO_ROOT, "expo-app/store/realtorCaps.ts") as string
);

/** The two banner branches of RealtorDashboard.tsx, rendered as plain strings. */
function render(realtor: any): string {
  const d = normalizeDashboard({ realtor, foundingProgram: { nearbyHandoffs14d: 8 } })!;
  const c = deriveCapState(d.realtor);
  return c.isPaidPro
    ? `PRO STRIP -> "Unlimited Listings & Handoffs"`
    : `STARTER -> header "Starter Tier (${c.listingCap} Active · ${c.handoffCap} Handoff Cap)"` +
      ` | listing "${c.activeListings} of ${c.listingCap} Free Cap (${overflowLabel(c.overflowCount)})"` +
      ` | handoff "${c.activeHandoffs} of ${c.handoffCap} Active"`;
}

const PROBES: Array<[string, any]> = [
  // F-T1-1 — entitlement boundary. The server emits only 2/1 or 999/999 today
  // (route.ts:230-231), so none of these is reachable in production *now*; each
  // becomes reachable the moment a mid tier exists.
  ["F-T1-1  server grants 3 listings / 2 handoffs (hypothetical mid tier)",
    { subscriptionTier: "soft_cap", maxListingCapacity: 3, maxHandoffCapacity: 2, activeListingCount: 1, starterOverflowCount: 0 }],
  ["F-T1-1  capacity 2.6 / 1.4 (fractional)",
    { maxListingCapacity: 2.6, maxHandoffCapacity: 1.4, activeListingCount: 2, starterOverflowCount: 0 }],
  ["F-T1-1  capacity 1e9 / 1e9",
    { maxListingCapacity: 1e9, maxHandoffCapacity: 1e9, activeListingCount: 3 }],
  ["        capacity as numeric strings '999' / '999' (coercion still grants Pro)",
    { subscriptionTier: "pro", maxListingCapacity: "999", maxHandoffCapacity: "999", activeListingCount: 7 }],

  // F-T1-2 — the two caps degrade independently.
  ["F-T1-2  999 listings but maxHandoffCapacity MISSING",
    { subscriptionTier: "pro", maxListingCapacity: 999, activeListingCount: 40, starterOverflowCount: 0 }],
  ["F-T1-2  999 listings but only 1 handoff (partial grant)",
    { subscriptionTier: "pro", maxListingCapacity: 999, maxHandoffCapacity: 1, activeListingCount: 4, starterOverflowCount: 0 }],
  ["F-T1-2  2 listings but 999 handoffs (partial grant)",
    { subscriptionTier: "pro", maxListingCapacity: 2, maxHandoffCapacity: 999, activeListingCount: 4, starterOverflowCount: 2 }],

  // Degrades correctly — Starter-safe, no "unlimited", no NaN. Recorded as the
  // control group so a future change that breaks them is visible here.
  ["OK      capacity as bool true (Number(true) === 1)",
    { maxListingCapacity: true, maxHandoffCapacity: true, activeListingCount: 5, starterOverflowCount: 3 }],
  ["OK      absurd over-count, Starter caps (clamped, overflow still surfaced)",
    { maxListingCapacity: 2, maxHandoffCapacity: 1, activeListingCount: 999999, starterOverflowCount: 999997 }],
  ["OK      genuine Pro 999 / 999",
    { subscriptionTier: "pro", maxListingCapacity: 999, maxHandoffCapacity: 999, activeListingCount: 40 }],
  ["OK      genuine Starter 2 / 1",
    { subscriptionTier: "soft_cap", maxListingCapacity: 2, maxHandoffCapacity: 1, activeListingCount: 1, starterOverflowCount: 0 }],
];

for (const [name, realtor] of PROBES) {
  console.log(`\n• ${name}\n  ${render(realtor)}`);
}
console.log("\nDiagnostic probe — see layer2-verdict.md §1.4 for the verdict on each line.");
