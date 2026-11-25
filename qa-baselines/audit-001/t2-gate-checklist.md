# AUDIT-001 / T2 (BLA-6) — Layer-2 gate contract, banked before implementation

| | |
| :-- | :--- |
| **Ticket** | BLA-6 `[AUDIT-001 / T2]` — Founding-500 conversion panel rebuild + real PROD scarcity count |
| **Owner** | Lead Mobile/Web Engineer `57d64ba5` |
| **Source** | BLA-6 comment `17a2882f-2c2a-4b08-9fff-7d0bc9ad9469` (Code Reviewer `f5d2c420`, from the BLA-9 / T1 Layer-2 pass) |
| **Binding spec** | `ceo-decision-log.md` §1 (D1, D2) > `uxd-critique.md` §H5 > `uxd-review-addendum.md` |
| **Status** | **Gate contract accepted. Implementation still gated on BLA-4 and BLA-5 closing Layer-2.** |
| **Harness** | `tools/verify-t2-scarcity.mts` — must exit 0 on the T2 PR head |
| **Pre-fix proof** | `t2-prefix-gate-output.txt` — 13 open gates, exit 1, captured on `agent/uxd-audit` |

The reviewer's four gate items are accepted verbatim. This file converts each into a
machine-checkable gate so none of them can be lost at the ticket boundary, and records the
two ownership decisions the reviewer asked me to make.

---

## 1. Accepted gates (from the reviewer's comment)

### Gate item 1 — `claimedCount` / CEO D2 / Invariant #5

Reproduced independently. `tools/verify-t2-scarcity.mts` evaluates the **shipped** expression
at `src/app/api/realtors/dashboard/route.ts:236` under an injected `BLAB_ENV`, so the defect is
now a re-runnable artifact rather than a one-off observation:

```
mode: path B — shipped expression scraped from route.ts: Math.min(499, (st.founding_pro_claimed ?? 1) + 42)
  FAIL  D2-PROD-REAL        founding_pro_claimed=21 under BLAB_ENV=production rendered 63
  FAIL  D2-PROD-NO-FLOOR    founding_pro_claimed=0  under BLAB_ENV=production rendered 42
  FAIL  D2-BRANCHES-DIVERGE production -> 63; uat -> 63 — identical, no env branch is evaluated
```

The reviewer's numbers match exactly: **63 displayed against a real count of 21.** Confirmed as
a live Invariant #5 breach the moment this runs with `BLAB_ENV=production`.

**Answer to "both branches exercised in the evidence."** Agreed, and it drives the
implementation shape. The branch will live in a pure server-side helper —
`src/lib/foundingScarcity.ts`, exporting `computeFoundingClaimedCount(statsRow, env)` — and
`route.ts` will call it. Two reasons:

1. It keeps the Protected Surface #4 diff on `route.ts` to a single line.
2. It makes both branches directly testable. The harness already prefers that helper
   (**path A**) over source scraping (**path B**) and switches automatically the moment the file
   exists, so the T2 PR ships the same command, exercising both `BLAB_ENV` values as a function
   call rather than as text. No env flip, no UAT/PROD deployment needed to verify.

### Gate item 2 — `nearbyHandoffs14d` floor: flag, do not fix

Carried. The harness prints it as a `NOTE` on every run so it cannot be forgotten while
drafting the PR description:

```
NOTE  CARRY-D2-FLOOR  nearbyHandoffs14d: Math.max(3, st.nearby_handoffs_14d ?? 3)
      (a realtor with 0 or 2 real nearby handoffs still reads 3)
```

Scope confirmed: **flagged for a separate CEO decision, not fixed in T2** (`ceo-decision-log.md`
§1 D2, final paragraph).

### Gate item 3 — CEO D1's conversion-panel half

Accepted as a **fail condition**, not a nitpick. Three gates:

| Gate | Requirement | Pre-fix |
| :--- | :--- | :--- |
| `D1-FREE-TIER-HEAD` | `soft_cap` panel carries `FREE TIER — 2 LISTINGS / 1 HANDOFF` | **FAIL** — heading absent |
| `D1-FUTURE-TENSE` | any `unlimited` line in the Starter branch sits under `"What you get when you claim:"` | PASS — no `unlimited` in the Starter branch today; re-checked after the rebuild |
| `D4-NO-LITERALS` | no price/date literal in the panel | **FAIL** — 6 literals |

`D1-FUTURE-TENSE` passing today confirms the reviewer's finding that there is **no interim D1
violation** on `agent/uxd-audit`. The risk is that the §H5 rebuild *introduces* one, which is
exactly what the gate exists to catch.

The two hardcoded client literals the reviewer named are confirmed, plus four more the same
scan found:

```
FAIL  D4-NO-LITERALS  6 literal(s) still hardcoded:
      "₹10,000", "₹3,000", "₹0 till", "Mar 31", "31 March 2027", "500 Realtors"
```

- `RealtorDashboard.tsx:875` — `Founding 500 · ₹0 till Mar 31`
- `RealtorDashboard.tsx:914` — `Founding 500 Pro Active · Free through Mar 31 (₹10,000/yr locked)`
- `:879` — `First 500 Realtors lock in ₹10,000/yr after Mar 31 (vs ₹3,000/mo standard)`
- `:862`/`:863` — the **accessibility label and hint** carry `31 March 2027`, `₹10,000`, `₹3,000`
  as literals too. Worth calling out: a11y copy drifting out of sync with visible copy is the
  same D4 defect, just invisible to a screenshot diff. All of it moves onto
  `foundingProgram.annualPriceInr` / `standardMonthlyInr` / `freeTrialThrough`, which T1
  normalized and guarded (`realtorCaps.ts:87-91`).

### Gate item 4 — the two carry-overs

Both close in T2. See §2.

---

## 2. Ownership decisions the reviewer asked for

**F-T1-1 (`realtorCaps.ts:159` latent E1) — T2 owns it.** The reviewer offered T1 or T2. T2,
because the clean fix the reviewer names is a **server-sent `isPaidPro` boolean**, and T2 is the
ticket that holds the approved unlock on `realtors/dashboard/route.ts` (Protected Surface #4).
Fixing it in T1 would mean reopening a ticket that has already passed Layer-2 to touch a
protected surface T1 has no unlock for. `ceo-decision-log.md` §1 D1 explicitly names an
"explicit `isPaidPro` flag" as an accepted source of truth, so this is spec-sanctioned, and the
server already computes `isPaidPro` at `route.ts:212` — it is serialised, not invented.

**Handoff-bar under-report — T2 owns it.** `dashboard/route.ts` returns no `activeHandoffCount`,
while `/api/realtors/available` defines slot occupancy as `('draft','pending_photography','active')`,
so a draft-held slot can read `0 of 1`. I flagged this in T1 and deliberately left it; the known
gap is documented in `realtorCaps.ts:164-171`. T2 adds `activeHandoffCount` to the same route.

**Invariant #2 guard rail acknowledged:** the cap-occupancy *query* stays in
`/api/realtors/available`, which keeps filtering at the query level. T2 adds a count to the
dashboard response; it does not move cap logic between routes.

---

## 3. One new finding from building the harness — the clamp is one short

Not in the reviewer's list, found while asserting D2:

```
FAIL  D2-PROD-CLAMP  founding_pro_claimed=10000 under BLAB_ENV=production rendered 499
      — a genuinely full program can never render "500 / 500 CLAIMED".
FAIL  D2-UAT-CLAMP   same under BLAB_ENV=uat rendered 499
```

The shipped clamp is `Math.min(499, …)`, but D2 requires "a clamp to `totalCap` (**500**)".
`499` is not a display-safety bound, it is an off-by-one that makes the scarcity mechanic
unable to express its own terminal state: once the program genuinely sells out, §H5 Zone 1 would
render `499 / 500 CLAIMED` forever, with one seat permanently and falsely available. T2 clamps
to `totalCap` in **both** branches. Flagging rather than silently changing it, since `499` reads
like a deliberate "never show sold out" choice — if the CEO wants that behaviour it belongs in
copy, not in a clamp.

---

## 4. Full gate list

Run from the repo root (`TMPDIR=/tmp` only matters inside a Paperclip scratch dir):

```
TMPDIR=/tmp npx tsx qa-baselines/audit-001/tools/verify-t2-scarcity.mts
```

| Gate | Pre-fix |
| :--- | :--- |
| `D2-PROD-REAL` — production returns the real count, no `+42` | FAIL |
| `D2-PROD-NO-FLOOR` — production applies no synthetic floor | FAIL |
| `D2-PROD-CLAMP` — production clamps to `totalCap`, not 499 | FAIL |
| `D2-UAT-CLAMP` — non-production keeps the offset but clamps to `totalCap` | FAIL |
| `D2-BRANCHES-DIVERGE` — the env is actually read | FAIL |
| `D2-NO-FLAG-LEAK` — no sim/env flag in the client payload | PASS |
| `D1-FUTURE-TENSE` — `unlimited` only under the when-you-claim head | PASS |
| `D1-FREE-TIER-HEAD` — `FREE TIER — 2 LISTINGS / 1 HANDOFF` | FAIL |
| `D4-NO-LITERALS` — no price/date literal in the panel | FAIL |
| `J3-DATE-SOURCE` — date renders from `freeTrialThrough` | FAIL |
| `H5-SCARCITY-RENDERED` — panel renders `claimedCount` / `totalCap` | FAIL |
| `H5-CTA-RESPONSE-CHECKED` — the POST response is checked | FAIL |
| `H5-CTA-PENDING` — disabled + `ActivityIndicator` while pending | FAIL |
| `H5-CTA-CONFIRM` — confirm step before a billing commitment | FAIL |
| `H5-CTA-ERROR` — retryable inline error path | FAIL |
| `INV3-OVERFLOW-STRING` — verbatim `"N in Owner Fallback"` preserved | PASS |
| `D3-NO-FAKE-WINDOW` — `🔥` / "this week" stay removed | PASS |

**4 passed, 13 open, exit 1.** Three of the four passes are regression guards on ground T1 and
T3 already won (`D1-FUTURE-TENSE`, `INV3-OVERFLOW-STRING`, `D3-NO-FAKE-WINDOW`) — they protect
against the rebuild undoing them.

This harness is a *static and unit* gate. It does not replace Layer-2: the Maestro / Playwright
regression sweep against `PROTECTED_SURFACES.md` and the independent PR review still apply, and
the CTA's confirm/pending/error/success states need a human or a driven-browser pass. What it
does guarantee is that no gate in the table above can regress silently between now and merge.

---

## 5. Branch hygiene note for the Code Reviewer

Worth knowing before T2's PR lands, because it affects what a reviewer sees in a diff.

T1's three source files (`realtorCaps.ts`, `realtor.ts`, `RealtorDashboard.tsx`) are **present on
`agent/uxd-audit`**, but they arrived inside the **T3 commit `6a3a021`**, not via T1's own commits:

```
$ git merge-base --is-ancestor agent/mobile-web/t1-server-authoritative-caps agent/uxd-audit
  -> T1 NOT ancestor

$ git show --stat --format="" 6a3a021        # "accessibility pass on Realtor Dashboard (BLA-5 / T3)"
  expo-app/components/realtor/RealtorDashboard.tsx | 382 ++++--
  expo-app/store/realtor.ts                        |  34 +-
  expo-app/store/realtorCaps.ts                    | 193 ++++      <- T1's file, in T3's commit
```

Cause: the shared workspace is held concurrently by more than one run, so T1's then-uncommitted
files were swept into T3's commit. Consequences, neither of which is a defect in the code itself:

- A reviewer diffing `6a3a021` as "T3's accessibility pass" is also reading T1's cap fix.
- T1's Layer-2 was performed on `agent/mobile-web/t1-server-authoritative-caps`. I verified the
  reviewed content survived the sweep: `realtorCaps.ts` and `realtor.ts` are **byte-identical**
  on both branches (`git diff --quiet` → clean), and `RealtorDashboard.tsx` carries the same
  three `deriveCapState` call sites on each. The file does differ overall, but only because
  T3's a11y layer sits on top of T1's cap fix on `agent/uxd-audit`. So the Layer-2 pass stands
  on content; only the commit attribution is wrong.

Separately, `foundingProgram` and the `+ 42` offset are **pre-existing MVP code** from `60fd3d3`
(`git log -S"foundingProgram" -- route.ts`), not something T1 introduced. T1 correctly left the
protected line alone.

T2 branches from `agent/uxd-audit`, so it inherits the content it needs regardless. I will not
rewrite history to correct the attribution — that would invalidate the baseline SHAs in
`BASELINE-INDEX.md`. Recording it here instead.
