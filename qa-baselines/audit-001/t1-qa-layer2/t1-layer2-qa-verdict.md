# AUDIT-001 / T1 — Layer-2 QA Regression Verdict (BLA-15)

| Field | Value |
| :--- | :--- |
| **Ticket** | BLA-15 `[AUDIT-001 / T1]` — Layer-2 QA half of BLA-9 |
| **Under test** | Draft PR #1, `agent/mobile-web/t1-server-authoritative-caps` @ `92cbe8a` |
| **Baseline** | T0 `853cba7` (BLA-3), `qa-baselines/audit-001/baseline/` |
| **Co-gate** | Code Reviewer verdict §1 (`agent/code-reviewer/layer2-verdict`) — **PASS** |
| **Reviewed by** | Independent Mobile/Web QA (agent `dfa44b40`) |
| **Date** | 2026-11-25 |
| **Environment** | `BLAB_ENV=uat`, asserted non-production before every run (Invariant #5) |

---

## 0. Verdict

> ### **PASS on the authorised scope — with one new MEDIUM defect in T1's own code that should be fixed before merge, and iOS shipping unverified.**

The four CEO-pre-authorised deltas are all present and correct, and **no fifth delta
exists**: with drift controlled, 24 of 30 frames are pixel-identical and the 6 that
changed are exactly the two authorised surfaces. The D1 four-state matrix is fully
verified, including `pro_plus`, which this ticket expected to be unreachable.

One new defect was found that neither Layer-1 nor the code review caught: **`num()`
does not honour its own documented `null` degradation**, and `null` is the only form a
missing field can take over JSON. It is not a trust violation — the failure direction
is conservative — but it misreports a Protected Surface #4 cap number.

| # | Finding | Severity | Owner | Blocks T1 merge? |
| :-- | :--- | :-- | :-- | :-- |
| **F-QA1** | `num(null, fallback)` returns `0`, not `fallback` → Starter cap renders **1/1** instead of **2/1** | **MEDIUM** | **T1** | Recommended — 1-line fix |
| **F-QA2** | Capture harness silently produces blank/error frames off port 8081 (CORS allowlist) | HIGH (tooling) | QA — **fixed in this ticket** | No |
| **F-QA3** | Pixel-diffing against the committed baseline is drift-dominated and unusable as-is | HIGH (method) | QA — **fixed in this ticket** | No |
| **F-QA4** | `claimedCount` renders **63** vs real **21** (`+42`, no `BLAB_ENV` guard) — Invariant #5 | HIGH | **T2 / BLA-6** | No — T1 correctly did not touch it |
| **F-QA5** | `nearbyHandoffs14d` has a server-side `Math.max(3, …)` floor — the number T1's new caption renders can still be fabricated | MEDIUM | **T2 / BLA-6** | No |
| **F-QA6** | Starter handoff bar can read `0 of 1` while a draft holds the slot | LOW | **T2** (disclosed) | No — logged per ticket instruction |

---

## 1. Methodology — and two corrections to the shared Layer-2 method

Both corrections are committed to the shared harness and both affect **BLA-12 (T3
Layer-2)**, which uses the same tools. Flagged to that run in its thread.

### F-QA2 — the capture harness goes blind off port 8081

`src/middleware.ts:14-19` reflects `Access-Control-Allow-Origin` only for
`http://localhost:8081`, `http://localhost:3000` and private LAN IPs. Captured from any
other port every `/api/*` response arrives with **no ACAO header**, the browser drops
it, and the app renders its empty/error state — while `pageErrors` stays `[]`, so both
the frames and the manifest look healthy.

```
Origin: http://localhost:8081 -> access-control-allow-origin: http://localhost:8081
Origin: http://localhost:8082 -> (no ACAO header)
Origin: http://localhost:8084 -> (no ACAO header)
```

My first 30-frame capture off :8084 produced **all 16 dashboard frames showing
`Couldn't load dashboard`** and every profile frame showing `My Listings (0)`. Had I
diffed those, I would have reported a catastrophic false regression.

**Fixed:** `CAPTURE_CORS_FIX=1` re-serves the real response with repaired headers via
`route.fetch()` — body untouched, no server state, no app-source change.

### F-QA3 — diffing against the committed baseline measures drift, not code

The T0 baseline was captured earlier in the day. Two things move independently of code:
the hero greeting is `new Date().getHours()`-dependent, and seeded listing counts
change (`My Listings (14)` → `(0)`). Diffing T1 against the committed baseline reported
**22/30 frames changed**, including `profile-member-listings` at **35%** — a surface T1
never touches.

**Fixed:** a second worktree at `853cba7` serving on **:8082** provides a **same-moment
T0 control**, diffed via the new `DIFF_BASE` override. Signal-to-noise:

| Comparison | Frames changed |
| :--- | :--- |
| T1 vs committed baseline (drift + code) | 22 / 30 |
| T1 vs **same-moment T0 control** (code only) | **6 / 30** |

Everything below uses the controlled comparison. The committed baseline remains the
historical attestation; it is just not a valid diff target hours later.

### Rigs

| Rig | Serves | Commit |
| :--- | :--- | :--- |
| `:8082` | T0 control | `853cba7` |
| `:8084` | T1 under test | `92cbe8a` (worktree, pure T1 — **not** `agent/uxd-audit`, which already carries T3) |

Scenarios the UAT seed cannot produce are injected **client-side** with Playwright
`page.route` and rendered on **both** rigs, so every delta is an observed difference
between two real renders of one payload — never a claim about what the old code "would
have" printed. No UAT row was created or mutated (another Layer-2 run was capturing
against the same database concurrently).

---

## 2. Delta classification vs T0 — every delta labelled

**24 / 30 frames pixel-identical. 6 changed. 0 missing. No fifth delta.**

| Frame | Δ% | Classification | Authorised delta |
| :--- | --: | :--- | :--- |
| `dashboard-soft_cap-web390-light` | 26.3 | **INTENTIONAL** | #1 banner swap |
| `dashboard-soft_cap-web1440-light` | 17.5 | **INTENTIONAL** | #1 banner swap |
| `dashboard-free_trial-web390-light` | 14.5 | **INTENTIONAL** | #3 handoff caption |
| `dashboard-free_trial-web390-dark` | 14.6 | **INTENTIONAL** | #3 handoff caption |
| `dashboard-free_trial-web1440-light` | 10.6 | **INTENTIONAL** | #3 handoff caption |
| `dashboard-free_trial-web1440-dark` | 10.6 | **INTENTIONAL** | #3 handoff caption |
| `dashboard-pro-*` (6 frames) | 0 | **IDENTICAL** | #4 "unchanged" ✅ |
| `dashboard-pro_plus-*` (2 frames) | 0 | **IDENTICAL** | #4 "unchanged" ✅ |
| `profile-*` (14 frames) | 0 | **IDENTICAL** | out of scope, untouched ✅ |
| `dashboard-pro-{properties-draft,sitevisits,buyercontacts}-*` | 0 | **IDENTICAL** | untouched ✅ |

Text-level confirmation that the changed frames contain **only** the authorised change:

- **`free_trial`** — the sole text delta is `🔥 4 nearby handoffs this week` →
  `8 nearby handoffs in the last 14 days`. Every other string is byte-identical.
- **`soft_cap`** — the green `Founding 500 Pro Active · … Unlimited Listings & Handoffs`
  strip is replaced by the Starter panel reading `1 of 2 Free Cap (0 overflow)`.

### Why the `free_trial` band is 14.5% for a one-line copy change

The caption is inside the sticky Starter panel. Measured: the panel is **5pt shorter**
after (171pt → 166pt) and the caption wraps to **2 lines in both** builds. A uniform
~5pt upward shift of all scrollable content below the sticky header is what produces
the wide changed band (rows 723–1559 at 2× DPR), not an independent layout move. Full
page height is unchanged (`heightDeltaPx: 0`). **Cosmetic consequence of an authorised
delta — not a fifth delta.**

---

## 3. CEO D1 four-state matrix — all four states VERIFIED

Rendered live and uninjected on both rigs at 390×844.

| Tier | Fixture | T0 "unlimited"? | T1 "unlimited"? | T1 cap bar | D1 compliant |
| :--- | :--- | :-- | :-- | :--- | :-- |
| `free_trial` | Priya Kumar | No | No | `2 of 2 Free Cap (3 in Owner Fallback)` | ✅ |
| `soft_cap` | Vikram Iyer | **Yes — E1 defect** | **No** | `1 of 2 Free Cap (0 overflow)` | ✅ **fixed** |
| `pro` | Harish Sharma | Yes | Yes | hidden (999/999) | ✅ |
| `pro_plus` | Ravi Chowdary | Yes | Yes | hidden (999/999) | ✅ |

> ### Correction to the ticket premise: `pro_plus` **is** seeded and **was** verified.
>
> This ticket states *"`pro_plus` has no seeded realtor"* and the Code Reviewer named it
> as shipping unverified. That is **not correct**: `+919100000050` (Ravi Chowdary)
> resolves to `subscriptionTier: "pro_plus"` against the live API, with 999/999 capacity.
> It renders the compact Pro strip with cap bars hidden, pixel-identical before and
> after. The committed T0 baseline already contains `dashboard-pro_plus-web*.png`, so the
> state was reachable at T0 too.
>
> **`pro_plus` does not ship unverified on web.** It does ship unverified on iOS, along
> with everything else (§7).

---

## 4. F-QA1 — NEW MEDIUM defect in T1's own code

**`expo-app/store/realtorCaps.ts` — `num()` does not honour its documented contract.**

The JSDoc promises:

> *"Coerce a server number, degrading to `fallback` on `null` / `undefined` / `NaN` /
> non-finite / non-numeric input, so no cap bar can ever render `NaN`, `undefined` or
> `Infinity`."*

`Number(null) === 0`, which is finite, so `null` returns **0**, not the fallback:

```
num(null, 2)            = 0   <<< contract break
num("", 2)              = 0   <<< contract break
num(false, 2)           = 0   <<< contract break
num([], 2)              = 0   <<< contract break
num(undefined, 2)       = 2   (as documented)
num(NaN, 2)             = 2   (as documented)
num("not-a-number", 2)  = 2   (as documented)
```

**Why `null` is the case that matters:** JSON cannot transmit `undefined`. A field the
server omits or nulls arrives at the client as `null`, **never** as `undefined`. The
three inputs that work are the ones a real API response cannot produce; the one that
fails is the only one it can.

**Rendered on device** (S3, `:8084`, real UI, payload `maxListingCapacity: null`,
`maxHandoffCapacity: "not-a-number"`):

| | Expected per contract | Actually rendered |
| :--- | :--- | :--- |
| Panel title | `Starter Tier (2 Active · 1 Handoff Cap)` | **`Starter Tier (1 Active · 1 Handoff Cap)`** |
| Listing bar | `0 of 2 Free Cap (0 overflow)` | **`0 of 1 Free Cap (0 overflow)`** |

`Math.max(1, 0)` then floors the cap to 1, which hides the zero but reports a Starter
entitlement of **one** listing instead of two.

**Severity MEDIUM, not HIGH.** `isPaidPro` stays `false`, so the panel never claims
"unlimited" — the E1 trust defect does not recur and CEO D1 is not breached. The failure
is conservative. But it is still a wrong Protected Surface #4 cap number shown to a
realtor, and it contradicts the module's own stated guarantee.

### Why Layer-1 passed 35/35 with this present

`verify-t1-caps.mts:214` **does** exercise a `capacity fields null` case. Its assertion
(`:235-236`) only checks `noBadTokens: !/NaN|undefined|Infinity|null/` plus
array-guarding — it never asserts the **numbers**. A cap of 1/1 contains no bad token,
so the case passes while rendering the wrong value. The gap is in the assertion's
strength, not its coverage.

**Suggested 1-line fix** in `num()`:

```ts
const n = value === null || value === "" || typeof value === "boolean" ? NaN
        : typeof value === "number" ? value : Number(value);
```

Re-run `verify-t1-qa-layer2.mjs`; S3 turns green with no other change. Layer-1 should
also assert the rendered cap string for the null case, not just token absence.

---

## 5. Marketplace Invariants

### #1 Zero Buyer Dead-End — **PASS** (both layers, no regression)

**Data.** All 4 `active` listings carry a callable contact; the 1 `draft` row does not,
which is correct (not `active`):

```
draft    contactName=null             contactPhone=null
active   contactName=Srinivas Patel   contactPhone=+917906722855
active   contactName=Suresh Kumar     contactPhone=+918907027233
active   contactName=Venkat Singh     contactPhone=+916559620123
active   contactName=Divya Murthy     contactPhone=+917707791833
→ active rows missing a callable contact: 0
```

The new normalizer's `...l` spread preserves `contactName` / `contactPhone` on every row.

**Device.** Buyer Contacts tab renders **4 contact controls** (2 contacts × WhatsApp +
Call) — byte-identical before and after, same positions (y=452, y=593), same glyphs
(`U+F425` WhatsApp on green, `U+F1D9` Call). The property-detail sticky contact bar
(Call + WhatsApp) is also intact.

> **Measurement note:** my first two probes reported `Call=0 / WhatsApp=0` on both
> builds. That was a **probe artifact, not a finding** — these controls are icon-only
> `Ionicons` with no text node, so a text search can never match them. `capture-web.mjs`
> logs `!! tab click MISSED` for the same reason. Re-probed by geometry + glyph.
> No defect. The committed `dashboard-pro-buyercontacts-*` baseline frames are unaffected
> by this (they are valid frames; only my text heuristic was wrong).

**Retry path — reachable and recovers.** T1 adds a `null`-return branch in
`normalizeDashboard`. Injecting a non-dashboard body renders `Couldn't load dashboard` +
`Retry`; clicking Retry with the injection removed **fully recovers** the dashboard
(`retryRecovered: true`). No dead end.

### #3 Option-B Overflow — **PASS**, pre-authorised delta #2 reproduced

No seeded Starter realtor holds a draft (Priya and Vikram have none; both draft-holders
are Pro), so this delta is **unreachable from seeded data** — which is likely why it was
listed as expected but never shown. Injected a Starter realtor whose only listing is a
`draft` and rendered it on both rigs:

| | T0 (`:8082`) | T1 (`:8084`) |
| :--- | :--- | :--- |
| Listing bar | `1 of 2 Free Cap (0 overflow)` | **`0 of 2 Free Cap (0 overflow)`** |
| Handoff bar | `1 of 1 Active · 🔥 4 nearby handoffs this week` | **`0 of 1 Active · 8 nearby handoffs in the last 14 days`** |

Exactly the authorised `1 of 2` → `0 of 2`. The E2 draft-counting defect is fixed.

**F-QA6 (disclosed, T2-owned, logged not filed):** the same render shows `0 of 1 Active`
while a draft *does* hold the handoff slot, because `dashboard/route.ts` returns no
`activeHandoffCount`. Per this ticket's instruction this is logged, not filed as a T1
regression. It is still strictly more correct than the `myListings.length` it replaces.

### #5 UAT vs PROD isolation — **T1 clean; two server-side breaches for T2**

`BLAB_ENV=uat` asserted before every run; every harness hard-refuses on `production`.
T1 touched no server file.

**F-QA4 — independently confirmed, not restated.** `src/app/api/realtors/dashboard/route.ts:236`:

```ts
claimedCount: Math.min(499, (st.founding_pro_claimed ?? 1) + 42),
```

Queried the live DB directly: **real = 21**, rendered = **63**. `grep BLAB_ENV` on that
file returns **nothing** — there is no environment branch at all, so under CEO D2 the
offset is impermissible in production. **T2 / BLA-6 owns it. T1 is not failed for it.**

**F-QA5 — NEW, same family, same file, `:241`:**

```ts
nearbyHandoffs14d: Math.max(3, st.nearby_handoffs_14d ?? 3),
```

A hardcoded **floor of 3** on the scarcity number. This matters for T1 specifically
because T1's D3 change replaced the hardcoded `🔥 4 … this week` literal with exactly
this value — so the fabrication moved from the client to the server rather than being
eliminated. Real value today is **8**, above the floor, so the rendered "8" is currently
truthful and **nothing user-visible is wrong right now**. If the real count drops below
3, the panel asserts nearby demand that does not exist. **T2 / BLA-6 should remove the
floor alongside the `+42`.**

### #2 / #4 / #6 — not in T1's blast radius

T1 touched no realtor-availability query, no society/unit switcher, and no verification
SOP. All `pro`/`pro_plus`/profile frames are pixel-identical.

---

## 6. 44pt touch targets on the Starter panel upgrade chip

**Net new clipping introduced by T1: 0.** 48 measurements — 2 cap strings × 2 builds ×
3 widths (320/360/390) × 4 Dynamic Type steps (L, xxxLarge, AX3, AX5-max).

| Cap string | Build | Clipped/truncated | Below 44pt |
| :--- | :--- | :-- | :-- |
| `2 Active · 1 Handoff Cap` | T0 | 10/12 | 6/12 |
| `2 Active · 1 Handoff Cap` | T1 | 10/12 | 6/12 |
| `999 Active · 1 Handoff Cap` | T0 (renders 2/1) | 10/12 | 6/12 |
| `999 Active · 1 Handoff Cap` | **T1** | **10/12** | **6/12** |

**Identical in every cell.** The chip's measured box is **219.2 × 32** at default scale
regardless of cap string, because `s.trialTitle` is `flex: 1` and absorbs the two extra
characters while the chip keeps its intrinsic width. **The variable-length cap string
does not clip or shrink the chip, at 999 or at AX5-max.** Chip text is never truncated
(`textCutoff=false` in all 48).

Worth stating precisely: **999/999 is not reachable in the Starter panel** — that flips
`isPaidPro` and renders the Pro strip, which has no chip. The true worst case is
**999/1**, which is what was measured.

The pre-existing failures stand and are **unchanged by T1**: the chip is **32pt tall at
default type** (below the 44pt HIG minimum) and overflows the panel row at 320pt width
and at xxxLarge and above. Already recorded as critique **§D2 / §F3** and owned by
**T3 / BLA-5**. Not a T1 regression.

---

## 7. Shipping unverified — stated explicitly

| Surface | Status | Owner |
| :--- | :--- | :--- |
| **iOS Simulator / Maestro — all of it** | **UNVERIFIED** | **BLA-10** |
| `pro_plus` on web | ~~unverified~~ → **VERIFIED** (§3) | — |

**Maestro is not installed on this host, and no iOS T0 baseline exists to diff against**
(BLA-3 §4: all 12 iOS rows blocked). The blockers are environmental and already owned by
**BLA-10**: `xcrun simctl` has no tap verb, AppleScript is denied assistive access
(`-1719`), `CGEventPost` is silently dropped, and no dev-client fallback is buildable
(no CocoaPods/Homebrew). Installing Maestro would not clear the synthetic-input blocker.

**Unblock:** a human with GUI/admin access grants Accessibility to the agent's terminal,
**or** installs CocoaPods, **or** installs `idb`. Then BLA-10's `capture-ios.md`
procedure runs.

Consequently **T1's iOS render is unverified**, as is every other ticket's. The web
evidence here is strong and the changed code is platform-neutral (no `Platform.select`,
no `.web.tsx` split in the touched files), so iOS risk is low — but it is not zero and
it is not measured.

---

## 8. Recommendation to BLA-9 / Founder CEO

**Recommend: fix F-QA1, then merge PR #1 to `agent/uxd-audit`.** Not to `main`.

T1 does what it was approved to do. E1 is fixed (`soft_cap` no longer claims unlimited),
E2 is fixed (`activeListingCount` replaces the draft-counting proxy), D3 is fixed on the
client. No fifth delta, no invariant regression, no new touch-target failure.

F-QA1 is a one-line fix in T1's own new module and should not be deferred: the module
exists specifically to be the single auditable home for cap numbers, and it currently
misreports one in the exact degradation case its own documentation calls out. Carrying
it forward means T2 inherits a contract that is documented but not true.

**Carry into T2 / BLA-6 as hard gate items:** F-QA4 (`+42`, no `BLAB_ENV` guard —
Invariant #5), F-QA5 (`Math.max(3, …)` scarcity floor), F-QA6 (missing
`activeHandoffCount`). All three live in `src/app/api/realtors/dashboard/route.ts`,
which T2 already holds the approved unlock for.

---

## 9. Reproducing this verdict

```bash
# Rigs: T0 control on :8082, T1 under test on :8084
git worktree add --detach /tmp/t0 853cba7
git worktree add --detach /tmp/t1 agent/mobile-web/t1-server-authoritative-caps
(cd /tmp/t0/expo-app && npx expo start --web --port 8082)
(cd /tmp/t1/expo-app && npx expo start --web --port 8084)

# Frame capture — CAPTURE_CORS_FIX is MANDATORY off :8081 (F-QA2)
CAPTURE_CORS_FIX=1 CAPTURE_WEB=http://localhost:8082 \
  CAPTURE_OUT=qa-baselines/audit-001/t1-qa-layer2/before \
  node qa-baselines/audit-001/tools/capture-web.mjs
CAPTURE_CORS_FIX=1 CAPTURE_WEB=http://localhost:8084 \
  CAPTURE_OUT=qa-baselines/audit-001/t1-qa-layer2/after \
  node qa-baselines/audit-001/tools/capture-web.mjs

# Controlled diff (F-QA3) -> expect 24/30 identical, 6 changed
DIFF_BASE=qa-baselines/audit-001/t1-qa-layer2/before \
  node qa-baselines/audit-001/tools/diff-baseline.mjs \
       qa-baselines/audit-001/t1-qa-layer2/after

# Behavioural matrix + injected scenarios + chip sweep
BEFORE_WEB=http://localhost:8082 AFTER_WEB=http://localhost:8084 \
  node qa-baselines/audit-001/tools/verify-t1-qa-layer2.mjs   # 23/25; the 2 FAILs ARE F-QA1
BEFORE_WEB=http://localhost:8082 AFTER_WEB=http://localhost:8084 \
  node qa-baselines/audit-001/tools/verify-t1-invariant1.mjs  # Invariant #1, both layers
BEFORE_WEB=http://localhost:8082 AFTER_WEB=http://localhost:8084 \
  node qa-baselines/audit-001/tools/verify-t1-followups.mjs   # panel geometry
```

`verify-t1-qa-layer2.mjs` exits non-zero **by design** while F-QA1 is open: the two
failing assertions are the defect. It turns green when F-QA1 is fixed, making it the
regression gate for that fix.

### Artifacts

| Path | Contents |
| :--- | :--- |
| `t1-qa-layer2/before/`, `after/` | 30 frames each + manifests (T0 control, T1) |
| `t1-qa-layer2/after/_diff-vs-baseline.json` | Per-frame controlled diff |
| `t1-qa-layer2/frames/` | 65 scenario / tier / chip-sweep frames |
| `t1-qa-layer2/_t1-layer2-results.json` | Tier matrix, 6 scenarios, 48 chip measurements |
| `t1-qa-layer2/_t1-invariant1.json` | Invariant #1, data + device |
| `t1-qa-layer2/_t1-followups.json` | Panel geometry, soft_cap reachability |

---

## 5. F-QA1 / BLA-21 — CLOSED, gate green

Fixed by `a6530eb` (`agent/uxd-audit`) and `1eccf05` (`agent/mobile-web/t1-server-authoritative-caps`,
PR #1). Same two-file change on both branches: `expo-app/store/realtorCaps.ts` +
`qa-baselines/audit-001/tools/verify-t1-caps.mts`.

**Root cause.** `num()` routed every non-number through `Number()`. `Number(null) === 0`
is finite, so `null` passed the `Number.isFinite` gate and returned `0` rather than the
fallback; `Math.max(1, 0)` then floored the Starter grant to **1**. `num()` now accepts
only a finite `number` or a non-blank numeric `string` — the latter retained because
node-postgres returns `bigint` / `numeric` columns as strings. `null`, `""`, `"   "`,
`false`, `true`, `[]` and `[5]` all degrade.

Two inputs beyond the four in the ticket were also broken and are now covered:
`"   "` returned `0` and `true` returned `1`.

**Why Layer-1 scored 35/35 over it.** The degradation loop passed `listing` and `handoff`
as both the `got` and the `want` side of a single assertion, so neither field could ever
fail; the only real check was `!/NaN|undefined|Infinity|null/`, and a cap of `1` contains
no such token. The gap was assertion strength, not coverage. Expectations are now declared
literal strings — including the panel title, which had no template in the harness at all —
plus a direct `num()` contract block. **Guard proof:** against the pre-fix `num()` body the
strengthened harness fails **10** assertions; with the fix it is **58/58**.

### Verification — all four acceptance criteria

| # | Criterion | Result |
| :--- | :--- | :--- |
| 1 | `num(null/""/false/[], f) === f`, existing cases unchanged | 20/20 in §C2 |
| 2 | Null grant renders `Starter Tier (2 Active · 1 Handoff Cap)` / `0 of 2 Free Cap (0 overflow)` | Rendered on device, `frames/S3-malformed-caps-after-w390.png` |
| 3 | Layer-1 asserts the rendered cap **string** for the null case | Declared literals; fails 10 on pre-fix code |
| 4 | Layer-2 gate green | **25/25, exit 0** |

```
TMPDIR=/tmp npx tsx qa-baselines/audit-001/tools/verify-t1-caps.mts     # 58 passed, 0 failed
BEFORE_WEB=http://localhost:8082 AFTER_WEB=http://localhost:8084 \
  node qa-baselines/audit-001/tools/verify-t1-qa-layer2.mjs            # 25/25, exit 0
cd expo-app && npx tsc --noEmit                                        # 0 errors
curl -s localhost:3000/api/ops/qa-runner                               # ALL_PASS
```

S3 on device, before → after: `(no Starter panel; "Unlimited" strip)` → `Starter Tier
(2 Active · 1 Handoff Cap)` + `0 of 2 Free Cap (0 overflow)`. Chip sweep re-run at 48
measurements: **net new clipping introduced by T1 = 0**, unchanged from the first pass.
S5 retry still recovers.

### Rig note (affects anyone re-running this gate)

The two rigs must have **self-contained** `node_modules`. Symlinking them to the main
checkout breaks expo-router's app-root resolution and the rig silently serves Expo's
default "Welcome to Expo" page instead of the app — which presents as `intercepted=0`
and every `expect-before` assertion failing, looking like a code regression rather than
a rig fault. On APFS, `cp -Rc` clones both trees instantly at no disk cost:

```bash
git worktree add --detach /tmp/bla21-t0 853cba7
git worktree add          /tmp/bla21-t1 agent/mobile-web/t1-server-authoritative-caps
for d in /tmp/bla21-t0 /tmp/bla21-t1; do
  cp -Rc node_modules $d/node_modules
  cp -Rc expo-app/node_modules $d/expo-app/node_modules
  cp expo-app/.env $d/expo-app/.env
done
(cd /tmp/bla21-t0/expo-app && TMPDIR=/tmp npx expo start --web --port 8082)
(cd /tmp/bla21-t1/expo-app && TMPDIR=/tmp npx expo start --web --port 8084)
```
