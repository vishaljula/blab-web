# AUDIT-001 — Layer-2 Independent Verification Verdict

**Gate:** `CLAUDE.md` §3, Invariant #6, Layer 2 (Independent Reviewer).
**Ticket:** BLA-9 `[AUDIT-001 / Layer-2]`.
**Reviewer:** Code Reviewer agent `f5d2c420-9238-4564-a54d-55e99aee9150` (not the implementer).
**Date of this revision:** 2026-11-25.
**Status of the batch:** **HOLD** — 1 of 5 implementation tickets submitted.

This is a living document. One section per ticket; each is stamped with its own verdict and the
evidence that was re-run independently. Sections for unsubmitted tickets state `NOT SUBMITTED`
so the Founder CEO can see exactly how much of the batch has been through this gate.

---

## 0. Batch-level recommendation to the Founder CEO

> **HOLD the batch. Do not merge `agent/uxd-audit` → `main` yet.**
>
> **T1 (BLA-4) individually: PASS**, with one required 1-line hardening (F-T1-1) and three
> advisories. T1's code quality is high and its own acceptance criteria are met and
> independently reproduced.
>
> Four of five implementation tickets (T2/BLA-6, T4/BLA-7, T5/BLA-8 not submitted; T3/BLA-5
> in progress) have not reached this gate. The audit's single named hard merge gate — T4's
> machine-verified dark-mode contrast pairs (`ceo-decision-log.md` §1 D3.3) — cannot be
> evaluated because T4 does not exist yet.

### Governance checks (batch-wide, re-verified this revision)

| Check | Result | Evidence |
| :-- | :-- | :-- |
| No agent pushed to `main` | **PASS** | `git log origin/main` head is `28eccc6`; zero `audit-001` commits on `main`. All 6 audit commits are on `agent/uxd-audit`. |
| Every PR is a Draft | **PASS** | GitHub API: 1 PR total — `#1 draft=true state=open base=agent/uxd-audit head=agent/mobile-web/t1-server-authoritative-caps`. Nothing merged. |
| Branch naming (`agent/<role>/<slug>`) | **PASS** | `agent/mobile-web/t1-server-authoritative-caps`. |
| No server file touched by T1 | **PASS** | `git diff --stat origin/main origin/agent/mobile-web/t1-server-authoritative-caps -- src/` → empty. |

### Open governance concern — read before merging anything (F-BATCH-1)

T1's three app-source files are **already present on the integration branch
`agent/uxd-audit`**, introduced not by PR #1 but by T3's commit `6a3a021`
(*"accessibility pass on Realtor Dashboard (BLA-5 / T3)"*) during the parallel run.

Independently verified:

```
git diff --stat origin/agent/uxd-audit origin/agent/mobile-web/t1-server-authoritative-caps \
  -- expo-app/store/realtorCaps.ts expo-app/store/realtor.ts      → empty (byte-identical)
git log --oneline origin/agent/uxd-audit -- expo-app/store/realtorCaps.ts
  → 6a3a021  feat(audit-001): accessibility pass on Realtor Dashboard (BLA-5 / T3)
```

The RealtorDashboard.tsx cap region is also identical across the two branches (no diff hunk
touches `deriveCapState`, `listingCap`, `handoffCap`, `activeListings`, `activeHandoffs`,
`overflowLabel`, `isPaidPro`, `Free Cap`, or `nearbyHandoffs14d`). The implementer disclosed
this, and there is **no divergent implementation** — the risk is procedural, not technical:

1. Merging PR #1 is a **no-op** against the integration branch. Reviewing PR #1 is still the
   right way to review T1 in isolation, but it is not the thing that gates shipping.
2. T1's code reached the integration branch inside a commit attributed to a different ticket,
   i.e. outside its own review. The gate that actually matters is
   **`agent/uxd-audit` → `main`**, and this document must be re-stamped against that diff
   immediately before the CEO merges.
3. **Recommendation:** keep the per-ticket PRs for reviewability, but treat the final
   `agent/uxd-audit` → `main` PR as the merge gate, and run parallel implementation tickets in
   separate worktrees from here on so ticket boundaries stay reviewable.

---

## 1. T1 — BLA-4, PR #1 · server-authoritative Founding-500 & cap data (E1, E2, D3)

### Verdict: **PASS** — with 1 required hardening (F-T1-1) and 3 advisories

Scope reviewed: 4 files, +509 / −12, against merge-base `853cba7`.

| File | Verdict |
| :-- | :-- |
| `expo-app/store/realtorCaps.ts` (new, 193 L) | PASS — 1 required hardening |
| `expo-app/store/realtor.ts` | PASS |
| `expo-app/components/realtor/RealtorDashboard.tsx` | PASS |
| `qa-baselines/audit-001/tools/verify-t1-caps.mts` (new, 256 L) | PASS — 1 test-quality advisory |

### 1.1 Layer-1 re-run independently by this reviewer

Everything below was executed by me, not taken from the implementer's attachment.

| Check | Implementer claimed | **I measured** |
| :-- | :-- | :-- |
| `GET /api/ops/qa-runner` | `ALL_PASS` 10/10 | **`ALL_PASS`, passed=10, total=10** ✅ |
| `verify-t1-caps.mts` | 35 passed / 0 failed | **35 passed / 0 failed, exit 0** ✅ |
| Harness integrity | — | working-tree copy **byte-identical** to the committed one (`git show … \| diff -`) ✅ |
| `npx tsc --noEmit` | 0 errors | **1 error at T1 head — and the identical 1 error at the pristine T0 merge-base. Delta introduced by T1: 0.** ⚠️ see F-T1-6 |

Typecheck method (both runs in throwaway `git worktree`s, so the BLA-5 run's concurrent edits
to the shared workspace could not contaminate the measurement; `node_modules` symlinked,
generated `expo-env.d.ts` copied in):

```
worktree @ origin/agent/mobile-web/t1-server-authoritative-caps  → 1 error
worktree @ 853cba7 (pristine T0 baseline)                        → 1 error  (same file:line)
  app/tracking/[id].tsx(604,43): TS7016 — no declaration file for 'react-dom/client'
```

### 1.2 Pre-authorised baseline shift — confirmed INTENTIONAL, and confirmed complete

All four tier states were reproduced against the **live** API and the shipped normalizer.
**Nothing in the T1 tier matrix ships unverified.** Measured output:

| Tier state (live DB realtor) | Server truth | Before → After | Classification |
| :-- | :-- | :-- | :-- |
| `soft_cap`, 1 active | `active=1 maxL=2 maxH=1 ovf=0` | banner: 🟩 "Unlimited Listings & Handoffs" → **Starter cap panel** | **INTENTIONAL** — E1, CEO D1 |
| `free_trial`, 0 active + 1 draft | `active=0 maxL=2 maxH=1 ovf=0` | `1 of 2 Free Cap` → **`0 of 2 Free Cap`** | **INTENTIONAL** — E2 |
| `free_trial`, 5 active (overflow) | `active=5 maxL=2 maxH=1 ovf=3` | `2 of 2 Free Cap (3 in Owner Fallback)` → **unchanged** | no delta |
| `pro`, 4 active + 1 draft | `active=4 maxL=999 maxH=999` | Pro strip → **unchanged** | no delta |
| handoff caption, all Starter | `nearbyHandoffs14d=8` | `· 🔥 4 nearby handoffs this week` → **`· 8 nearby handoffs in the last 14 days`** | **INTENTIONAL** — D3 (but see F-T1-4) |

No delta was observed on any surface outside this table. Each `AFTER` value traces to a server
field printed in the same run, so the shift is a **correction to baseline, not a regression**,
exactly as pre-authorised in CEO approval `b4aa0549` (critique §J2).

### 1.3 The ticket's own invariants — each checked adversarially

**(a) No client-side cap arithmetic reintroduced anywhere — PASS.**
Repo-wide sweep of `expo-app` for `myListings.length`, `maxListingCapacity`,
`activeListingCount`, `maxHandoffCapacity`, `starterOverflowCount`:

- every surviving `myListings.length` is a **list length** (`My Properties` stat pill
  `RealtorDashboard.tsx:849`, telemetry `:929`, empty-state `:947`, Profile tab label
  `profile.tsx:325`) — none feeds a cap, a cap bar, or an overflow count;
- `store/listingForm.ts:37-38` declares optional `activeListingCount` / `maxListingCapacity`
  on the realtor-picker type, and **no consumer performs arithmetic on them** (grep over
  `expo-app/app` + `expo-app/components` returns nothing);
- no duplicate cap renderer exists. `app/ops/index.tsx:290` renders
  `"N in Direct Owner Fallback"` from the server's own command-center payload — a different,
  untouched surface.

**(b) `"N in Owner Fallback"` verbatim (Protected Surface #4) — PASS.**
Isolated in `realtorCaps.ts:192`; the only caller is `RealtorDashboard.tsx:888`. Both branches
asserted (`3 in Owner Fallback`, `1 in Owner Fallback`, `0 overflow`). No caller rewords it.

**(c) "Nothing may re-grant unlimited" — the implementer asked me to try to break this.
I found a payload. See F-T1-1.** Not reachable from today's server, so not a live defect.

**(d) `Math.min` display clamps — ACCEPTED, with the reasoning recorded.**
I agree with keeping them. A server over-count would otherwise overflow a progress bar in
front of a paying realtor, which is a worse failure than a masked server bug, and
`starterOverflowCount` is rendered unclamped (`999997 in Owner Fallback` in my probe), so an
over-count still surfaces somewhere visible rather than being silently swallowed.

**(e) Paired-file rule held *within* the PR — PASS.**
`expo-app/components/realtor/` contains only `RealtorDashboard.tsx`; there is no
`.web.tsx` counterpart. The store files are platform-agnostic (no `react-native` /
`Platform` import — deliberately, so the harness can import them). None of the four declared
pairs (`MapView.web`↔`MapView`, `property/[id]`↔`PropertyDetailModal`, `ListView`) is in the
4-file diff. Nothing deferred.

**(f) Platform styling rule — PASS.** The only `cursor: "pointer"` in the touched region is
guarded by `Platform.OS === "web"` (pre-existing, preserved). No raw `boxShadow` added.

**(g) Store defensive guard rule — PASS, and extended.** `normalizeDashboard` applies
`Array.isArray` to `myListings` **and** to the nested `recentEnquiries` / `viewings`
(`realtorCaps.ts:106-113`), which is stronger than the rule requires and correct given
`JSON_AGG` returns `null` for empty nested sets.

**(h) Marketplace Invariant #1 (Zero Buyer Dead-End) — PASS, not weakened.**
`normalizeDashboard` spreads `...l` per listing and overrides only the two nested arrays, so
`contactName` / `contactPhone` pass through untouched. The new `null`-return path sets the
store's existing `error` state and leaves `dashboard` unmodified; it is realtor-facing and
cannot strand a buyer.

**(i) Marketplace Invariant #3 (Option-B overflow) — PASS.** `starterOverflowCount` comes from
the server (`route.ts:214`, `!isPaidPro && activeCount > 2 ? activeCount - 2 : 0`) and is
rendered, not recomputed. Live overflow realtor renders `2 of 2 Free Cap (3 in Owner Fallback)`
against server `active=5, ovf=3`. Correct.

**(j) CEO D1 four-state matrix — PASS for the half T1 owns.** Only `pro` / `pro_plus`
(999/999) reach the "Unlimited Listings & Handoffs" strip; `soft_cap` is never told
"unlimited". The *other* half of D1 — the full Founding-500 conversion panel, the
`FREE TIER — 2 LISTINGS / 1 HANDOFF` heading, and the mandatory `"What you get when you
claim:"` future-tense framing — is **T2/BLA-6's scope** per the approved sequence
(`ceo-decision-log.md` §2). I checked for a live D1 violation in the interim and found none:
the string `Unlimited Listings & Handoffs` appears **only** in the `pro` branch
(`RealtorDashboard.tsx:918` on `agent/uxd-audit`), so the Starter panel does not currently
assert a cap and an absence of a cap simultaneously. **This becomes a hard gate item at T2.**

### 1.4 Findings

#### F-T1-1 — `isPaidPro` is a threshold test, not an unlimited test · **Medium · required before `main`**

`expo-app/store/realtorCaps.ts:159`

```js
const isPaidPro = listingCap > STARTER_LISTING_CAP && handoffCap > STARTER_HANDOFF_CAP;  // > 2 && > 1
```

`realtorCaps.ts:122` documents this field as *"True only when the server granted Pro capacity
(999/999)."* **That is not what the code tests**, and the gap is the E1 defect class this whole
ticket exists to eliminate. Measured against the shipped module:

| Payload | Rendered |
| :-- | :-- |
| `maxListingCapacity: 3, maxHandoffCapacity: 2` | **PRO STRIP → "Unlimited Listings & Handoffs"** |
| `maxListingCapacity: 2.6, maxHandoffCapacity: 1.4` | **PRO STRIP → "Unlimited Listings & Handoffs"** |
| `maxListingCapacity: 1e9, maxHandoffCapacity: 1e9` | PRO STRIP (benign) |

This answers the implementer's adversarial question #2 — *yes*, there is a payload that reaches
the Pro strip without the server granting 999/999. **Not a live defect:** `route.ts:230-231`
emits only `999` or `2` / `999` or `1`, so no production payload reaches it today, and the
harness's 999/999 and 2/1 assertions both hold. It is a **latent re-introduction of E1**: the
first mid tier the business adds (say 5 listings / 2 handoffs) silently tells that realtor
"Unlimited Listings & Handoffs" again, with no test failing.

Fix (1 line, plus 1 assertion):

```js
const UNLIMITED_CAP = 999;                                     // mirrors route.ts:230-231
const isPaidPro = listingCap >= UNLIMITED_CAP && handoffCap >= UNLIMITED_CAP;
// assert: {maxListingCapacity: 3, maxHandoffCapacity: 2} -> isPaidPro === false
```

Better still, have T2 — which already holds the approved unlock on
`src/app/api/realtors/dashboard/route.ts` — send an explicit server `isPaidPro` boolean, which
CEO D1 names as an accepted source of truth, and let the client stop inferring entitlement from
magic numbers entirely.

#### F-T1-2 — partial capacity grants render an incoherent Starter panel · **Low · advisory**

`expo-app/store/realtorCaps.ts:157-159`

The two caps degrade independently, so a half-missing payload produces a panel that is
internally contradictory. Measured:

| Payload | Rendered |
| :-- | :-- |
| `maxListingCapacity: 999`, `maxHandoffCapacity` **missing** | `Starter Tier (999 Active · 1 Handoff Cap)` / `40 of 999 Free Cap` |
| `maxListingCapacity: 2, maxHandoffCapacity: 999` | `Starter Tier (2 Active · 999 Handoff Cap)` / `4 of 999 Active` |

The degradation direction is **safe** (no "unlimited" is asserted, which is what the contract
promises) and the harness's `starterSafe` assertion passes. But "Starter Tier (999 Active)" and
"of 999 Free Cap" are not strings anyone should ever see. Fix F-T1-1 and additionally fall both
caps back together when either is absent or implausible, so a partial payload yields a coherent
`2 / 1` panel.

#### F-T1-3 — two harness fields are asserted against themselves · **Low · test quality**

`qa-baselines/audit-001/tools/verify-t1-caps.mts` §C (the 13 `MALFORMED` cases)

Each case asserts an object whose `listing` and `handoff` keys are **the same variables on both
the `got` and the `want` side**, so those two keys can never fail — they are printed context,
not verification. The real assertions are the four booleans (`noBadTokens`, `starterSafe`,
`finiteFills`, `arraysOk`), and those are sound. Pin the expected rendered string per payload
(e.g. `capacity fields missing → "0 of 2 Free Cap (0 overflow)"`) so a future regression in the
rendered copy fails here.

Count note, for the record: the headline "35" is real and I reproduced it, but it is
**13** malformed payloads (not 22) + 9 junk responses + 13 live/criteria assertions.

#### F-T1-4 — D3 is fixed on the client but the number is still server-floored · **Informational · T2 gate**

`src/app/api/realtors/dashboard/route.ts:241` — **correctly not touched by T1.**

T1 removed the client-side lie (`🔥 4 … this week`) and now renders a real server field. But the
server floors it: `nearbyHandoffs14d: Math.max(3, st.nearby_handoffs_14d ?? 3)`. A realtor with
0 or 2 real nearby handoffs is still shown `3`. `ceo-decision-log.md` §1 D2 explicitly says this
floor is *"out of approved scope, but flag it in the Ticket 2 PR description so the CEO can
decide separately."* **T2's PR description must carry that flag** — recorded here so it cannot
fall through the ticket boundary.

#### F-T1-5 — D2 violation confirmed live (pre-existing, T2-owned) · **Informational · T2 hard gate**

`src/app/api/realtors/dashboard/route.ts:236` — **correctly not touched by T1.**

T1's change made this visible for the first time, and my live run captured it:

```
foundingProgram now reaches the UI:  {"totalCap":500,"claimedCount":63, …}
   claimedCount = Math.min(499, (founding_pro_claimed ?? 1) + 42)  →  real DB count = 21
```

**63 displayed vs 21 real, with no `BLAB_ENV` branch anywhere on the line.** Under CEO D2 the
`+ 42` offset is permitted *only* when `BLAB_ENV !== 'production'`, so as written this line
breaks **Marketplace Invariant #5** the moment it runs in production. It is squarely in
T2/BLA-6's approved scope and is a hard gate item at that review; I will require the
`BLAB_ENV === 'production'` branch to be exercised under **both** values before passing T2.

#### F-T1-6 — missing `@types/react-dom`; the "0 errors" claim is environment-dependent · **Low · housekeeping, not T1's**

`expo-app/app/tracking/[id].tsx:604` — `TS7016`, no declaration file for `react-dom/client`.

Present **identically at the pristine T0 merge-base**, so T1 introduces zero new type errors —
which is the claim that actually matters, and it holds. But `npx tsc --noEmit` is only clean in
an environment that has a generated `expo-env.d.ts` (gitignored at `expo-app/.gitignore:10`),
so a fresh clone or CI worktree will not reproduce "0 errors". The honest Layer-1 attestation
is **"no new errors versus baseline"**. Adding `@types/react-dom` as a devDependency would make
the gate reproducible for everyone; that file is Protected Surface #1, so the type fix is a
separate CEO-unlock conversation, not a drive-by.

### 1.5 Not verified by this gate — T1

| Not verified | Owner |
| :-- | :-- |
| Maestro (iOS Simulator) + Playwright (Web) visual regression vs the T0 screenshot baseline | **Independent Mobile/Web QA `dfa44b40`** — delegated as a child issue of BLA-9 |
| `claimedCount` under `BLAB_ENV === 'production'` | Cannot be exercised in UAT without flipping the env. **Ships unverified unless T2 adds an explicit both-branch test.** |
| `pro_plus` tier state | No `pro_plus` realtor in the seeded DB. The code path is identical to `pro` (both get 999/999 at `route.ts:230-231`) and the badge branch at `RealtorDashboard.tsx:738` is untouched by T1, so exposure is low — but it is **named here as shipping unverified**. |

---

## 2. T3 — BLA-5 · Accessibility pass, Profile & Realtor Dashboard (F1-F3)

### Verdict: **NOT SUBMITTED** (ticket `in_progress`)

Four commits are already on `agent/uxd-audit` (`04b8370`, `6a3a021`, `2216f04`, `e6e9186`) with
no Draft PR of their own. Commit `6a3a021` is also the commit that swept T1's files onto the
integration branch (F-BATCH-1). **T3 needs its own Draft PR for this gate**, and its diff must
be reviewed with the T1 hunks already discounted so the accessibility change can be judged on
its own.

## 3. T2 — BLA-6 · Founding-500 conversion panel + real PROD scarcity count (D1-D4)

### Verdict: **NOT SUBMITTED** (`todo`)

Gate items already banked for this review, from the T1 pass:

1. **F-T1-5** — `claimedCount` must branch on `BLAB_ENV === 'production'` (CEO D2, Invariant #5),
   and **both** branches must be exercised. Confirmed broken today: 63 shown vs 21 real.
2. **F-T1-4** — the `Math.max(3, …)` floor on `nearbyHandoffs14d` must be **flagged in the PR
   description** per CEO D2.
3. **CEO D1, second half** — the conversion panel must carry the
   `FREE TIER — 2 LISTINGS / 1 HANDOFF` heading and put `✓ Unlimited listings & handoffs` under
   an explicit `"What you get when you claim:"` head. A benefit line asserting no cap next to a
   visible `1 of 2` cap bar is *"the same trust defect as E1 in a new costume"* and fails this gate.
4. **F-T1-1 / F-T1-2** — preferred fix is a server-sent `isPaidPro` boolean from this route.
5. The handoff-bar under-report the implementer disclosed (`activeHandoffCount` absent from
   `dashboard/route.ts`, so a draft-held slot can read `0 of 1`) is this ticket's to close.

## 4. T4 — BLA-7 · Additive token layer in `theme.ts`

### Verdict: **NOT SUBMITTED** (`todo`) — **holds the batch's one named hard merge gate**

`ceo-decision-log.md` §1 D3.3: contrast-verifier output must be attached **for every new pair,
light and dark**, or it does not merge. Unverified dark pairs were the single material error
found in the original audit. This gate will check, with no discretion:

1. `theme.ts` diff is **additive only** — no existing export modified, renamed, recoloured, or
   removed, `TIER_COLORS` included. I will verify by diffing the old export set, not by reading
   the PR description.
2. Machine-verifier output attached and **re-runnable by me** for every new pair, light **and**
   dark. T3 set the precedent (`qa-baselines/audit-001/tools/verify-contrast-t3.py` +
   `verify-contrast-t3-dark.py`); T4 must match it.
3. Full Protected-Surface screenshot sweep (`theme.ts` is shared).

## 5. T5 — BLA-8 · Visual refactor (B1-B9, G1-G10)

### Verdict: **NOT SUBMITTED** (`todo`)

Blocked behind T4's tokens. Will be reviewed against the T0 baseline for Protected-Surface
regressions once submitted.

---

## 6. Evidence index

| Evidence | How to re-run |
| :-- | :-- |
| qa-runner 10/10 | `curl -s localhost:3000/api/ops/qa-runner \| jq '.status, .passedCount'` |
| T1 harness 35/35 | `TMPDIR=/tmp npx tsx qa-baselines/audit-001/tools/verify-t1-caps.mts` |
| Typecheck delta = 0 | two `git worktree`s (T1 head, `853cba7`), `node_modules` symlinked, `expo-env.d.ts` copied in, `npx tsc --noEmit` in `expo-app` |
| F-T1-1 / F-T1-2 probes | `qa-baselines/audit-001/tools/probe-t1-cap-edges.mts` (committed alongside this verdict) |
| `main` clean / PR draft | `git log --oneline origin/main`; `curl -s https://api.github.com/repos/vishaljula/blab-web/pulls?state=all` |

**No agent merges to `main`. This gate ends in a recommendation; the human Founder CEO merges.**
