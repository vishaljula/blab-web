# BLA-34 — Layer-2 QA re-review: dashboard tab-strip refix @ `af90ed5`

**Verdict: APPROVED for merge on the BLA-33 findings. F1 (HIGH), F2 and F3 are closed,
independently. F4's explicit scoping is sufficient — do not restore native equal thirds.**

Reviewer: Independent Mobile/Web QA (`dfa44b40`). Re-review of the CHANGES REQUESTED I issued
on `5173092` (`../t6-bla33-layer2/LAYER2-VERDICT.md` @ `f91c1ca`).

Subject pinned by blob, before and after every run: `RealtorDashboard.tsx` =
`b3d02577b92a8d5edaf5552fdc985dedb6b0dd82`, byte-identical to its post-image at `af90ed5`;
`AccessiblePressable.tsx` = `7d792d65…`, likewise. `dirty false` throughout. HEAD was
`9776b65` (evidence-only commit on top of the subject). The workspace is shared with a
concurrent run, so this matters: nothing below is attributable to `af90ed5` without it.

| Harness | @ `5173092` | @ `af90ed5` |
| :--- | :--- | :--- |
| `verify-bla33-web-tabstrip.mjs` | FAIL 6/10 | **9/10** — only W1a, the accepted UX trade |
| `verify-bla33-native-tabstrip.mjs` | FAIL 4/6 | **ALL_PASS 6/6** after re-pointing NP4/NP5 (below) |
| `verify-bla34-probe-holes.mjs` (new, this review) | — | **3/5** — two holes in the new Layer-1 checks |

---

## 1. Ask #1 — F1/F2/F3 re-run and confirmed independently

My harness, unmodified, against `af90ed5`. These are my numbers, not a re-reading of the
implementer's.

| Was | Check | Result @ `af90ed5` |
| :--- | :--- | :--- |
| **F1** HIGH — label clipped past the unreachable start edge | W4a | **PASS** — 48 tabs, 0 clipped |
| **F2** MED — tab 1's badge inside tab 2's hit target | W4b | **PASS** — 0 intrusions |
| **F3** MED — focus does not reveal an off-screen tab | W3 | **PASS** — 48 focus moves, all scrolled fully into view |
| (F1 right-edge half) | W4c | **PASS** — 48 tabs, 0 row overflows, 0 truncations |

W3's control still passes (`W3ctl`: injected scroller scrolls 650px on focus;
`scrollIntoView` reaches the last tab 16/16, max `scrollLeft` 228px), so W3's PASS is the
strip's own reveal path working, not the control masking it. W2 (computed AX tree) and W5
(underline survives colour removal) are unchanged at 16/16 and 20 measurements.

**F1's closure is load-bearing, not incidental — proven by a red test I ran myself, from the
other direction.** The implementer red-tested by editing the subject file; taking that on
trust is how the first false-green survived. `verify-bla34-probe-holes.mjs` instead
neutralises the fix **in the live DOM** (`[role="tab"] { min-width: 0 !important }`, which
beats react-native-web's inline value) with the file byte-stable throughout (`H0` PASS), and
recomputes the clip from the same `leaves` set the Layer-1 probe uses:

| | 320/xxxLarge | 360/xxxLarge | 390/xxxLarge | AX3 (320/360/390) | AX5-max (320/360/390) |
| :-- | :-- | :-- | :-- | :-- | :-- |
| shipped @ `af90ed5` | 0 | 0 | 0 | 0 | 0 |
| fix neutralised in DOM | **−1.98** | 0 | 0 | **−10.28** | **−14.80** |
| BLA-33 F1, measured on `5173092` | −1.98 | — | — | −10.28 | −14.80 |

Exact agreement across two different methods and two different ways of removing the fix, and
`canScrollLeft` is `false` in every neutralised state — so the clipped glyphs were
unreachable, not merely off-screen. (`H3` PASS.)

**Geometry, for the record.** Narrowest tab anywhere in the envelope is **86.89 × 44** at
320/xxxLarge, so no tab falls under the 44×44 target floor at any width × scale — relevant
because the fix routes a non-numeric `minWidth` through the HIT-floor primitive (see §4).
1440pt is equal thirds at all four scales, including AX5-max. `scrollableBy` is unchanged from
the reviewed value at every point (0/0/119/228 at 320 … 0/0/0/0 at 1440), so the last tab is
exactly as reachable as before.

## 2. Ask #2 — F4's explicit acceptance is sufficient. Keep native content-proportional.

Four reasons, all measured:

1. **It is not a change this commit makes.** Native geometry at `af90ed5` is byte-identical to
   `5173092` at all 16 width × scale (two runs, `QA_SHA=5173092` and `QA_SHA=9776b65`:
   111/81/100 at 320 through 484/455/473 at 1440 in both). `af90ed5` touches no
   native-reachable style — the keyword sits behind `Platform.select({ web })`, and on native
   `tabBtn` names no `minWidth`, so the relaxed `withHitFloor` still returns the flat 44. The
   shape change arrived with the ScrollView at `5173092`, which was reviewed as a reflow fix.
2. **Native is clean of what F1/F2 were** — NP3, 0 overflows — *because* it content-sizes.
3. **It still reflows where web does** — NP2 6/6, and 112/72/42px of scroll at AX3 against
   web's 119/79/49.
4. **Resurrecting the thirds costs the reflow.** It needs a defined main axis on the content,
   which is the one thing `CalculateLayout.cpp:159` declines to give a Scroll node's children.

The scoping in the `tabBtn` comment names the mechanism, the file and the line numbers, and
says plainly that equal thirds at default type is a web-only claim. That is the right fix for
a claim defect.

**One consequence the implementer did not flag, and I have fixed in my own tool.** NP4/NP5
asserted the claim this commit withdraws, so they fail *by construction* — forever. A
permanently-red harness is not a gate: the next reader cannot tell a withdrawn claim from a
live defect. Both are now re-pointed at the state that was accepted — NP4 pins native to the
content-proportional geometry within 1px and still asserts no early scroll; NP5 asserts the
inertness the code comment now documents, and fires if an RN/Yoga upgrade ever makes
`flexBasis` live inside a scroll node and the comment goes stale. `ALL_PASS 6/6`. The original
FAIL and its numbers remain committed in `t6-bla33-layer2/bla33-native-tabstrip.json`.

## 3. Ask #3 — D2h is the right shape. D2i and D2j still have holes.

| | Verdict |
| :-- | :-- |
| **D2h** glyphs vs the strip's START edge | **Right shape, and load-bearing.** |
| **D2i** whole row vs the tab content box | Fires, but measures the **wrong quantity**, 5px short of F2. |
| **D2j** equal thirds, stated apart from D2g | Exception is keyed on the **point**, not the widths — blanket. |

**D2h — sound, including its reference edge** (`H1` PASS). It measures against
`tab.closest('[role="tablist"]').getBoundingClientRect().left`, which is a *border*-box edge
on whatever element carries the role, while the edge that actually clips is the scroller's
*padding* box. Those coincide here only because the role lands on the scroll container itself
and `s.tabBar` has no border-left or padding-left: measured identical to 0.01px, 9/9. It is
worth knowing this is a coincidence of the current style — add a `paddingHorizontal` to
`s.tabBar` and D2h starts measuring from the wrong edge and under-reports silently.

**D2i — the residual hole, and it is in F2's own quantity** (`H2` FAIL, worst underread
**5.0px**). D2i measures `leaves`: elements with text and no text-bearing children, i.e. the
label and the count **digit**. The badge is a `paddingHorizontal: 5`, `minWidth: 20` pill
*wrapping* that digit, and it is the pill that owns the painted pixels and sits in the
neighbour's hit target — that is what F2 was. The digit is centred inside it, so the pill
extends past the digit on each side and D2i cannot see that margin:

| state (fix neutralised) | into next tab's hit target, **digit** (D2i's input) | into next tab's hit target, **badge box** | blind |
| :-- | --: | --: | --: |
| 320/xxxLarge | 0 | 2.00 | **2.00** |
| AX3 (320/360/390) | 5.28 | 10.28 | **5.00** |
| AX5-max (320/360/390) | 9.81 | 14.81 | **5.00** |

Two separate problems, and the second is the one that matters:

- D2i's reported number is 5px light. Its *row-overflow* figure happens to agree (blind
  ≤0.02px) because the label, not the badge, governs that edge — so D2i does still go red on
  the F1/F2 state. **It is not a miss.** But at 320/xxxLarge the badge crosses 2.00px into tab
  2 while the digit reports **0.00**, which is the shape of a future miss: a small intrusion
  is invisible to it.
- D2i never measures the neighbour-intrusion quantity at all. It measures against the tab's
  own content box; F2 is about the next tab's *border* box. Those differ by the tab's
  horizontal padding, so "fits its own content box" and "does not sit in the neighbour's hit
  target" are not the same claim.

Fix is two lines: iterate `tab.children` instead of `leaves` (the BLA-33 web harness's W4 does
exactly this, which is why W4b saw the pill and D2i does not), and add an explicit
`intoNextTabHitPx` against `tabs[i+1]`'s border box.

**D2j — the exception is unpinned** (`H4` FAIL). `THIRDS_EXCEPTIONS.has("320/xxxLarge")` drops
that point from the candidate list *before* the spread is looked at, so **any** geometry there
passes. Asserted against the real predicate, not reasoned about: the accepted
109.31/86.89/95.80 passes, and so does an absurd 200/40/52. Whitelisting by name was the right
instinct — "so it stays a decision and never silently becomes drift" — but keying it on the
measurement point gives up the drift detection it was meant to preserve. Pin it to the widths
instead: `109.31/86.89/95.80 ± 1px`.

## 4. New finding — the relaxed HIT floor is wider than the fix needs, and the comment says otherwise

**G1 — MEDIUM, latent not live.** `withHitFloor` was right to stop silently discarding
`"max-content"`; the problem is the blast radius of how.

The new branch honours *any* non-numeric value, on *both* axes. So `minWidth: "50%"` or
`minHeight: "2em"` from a future call site now passes through with the 44pt floor gone — and
nothing catches it: `scripts/a11y-guard.mjs` bans raw `Pressable`, but it carries no
minimum-size rule at all, so `withHitFloor` *was* the only enforcement of §F3 / WCAG 2.2
§2.5.8 on that axis. `A11yTextInput` 20 lines below still uses the old ternary, so the two
primitives in one file now disagree about what a non-numeric minimum means.

And the doc comment states "`minHeight` — the axis that actually governs thumb reach in these
row layouts — is unaffected." The code changed `minHeight` identically to `minWidth`. The
comment describes the intent; the next person to read it will be reading it precisely because
they are about to pass a non-numeric minimum.

**Nothing regresses today** — I checked rather than assumed. No `A11yPressable` call site in
`expo-app/` passes a non-numeric min size other than this one (`login.tsx:200`'s
`minHeight: "100%"` is a `ScrollView` `contentContainerStyle`, not a pressable), and the
narrowest tab on the subject surface measures 86.89 × 44. So this does not block `af90ed5`.
It is a removed guard rail in a primitive whose stated purpose is that the floor "cannot be
forgotten per-call-site", and it should be narrowed before the keyword path is used again:
accept intrinsic keywords (`max-content` / `min-content` / `fit-content`) on `minWidth` only,
keep `HIT` for percentages and `"auto"`, and correct the comment.

## 5. Ask #4 — the output-dir flag

`verify-bla33-web-tabstrip.mjs` and `verify-ceo-visual-dyntype.mjs` already honour **`QA_OUT`**
(web harness line 60) — that one was available, just undocumented in the reproduce block, so
the copy-out-and-restore dance was not needed for them. The native harness genuinely did
hardcode its output; it now honours `QA_OUT` and `QA_SHA` (the commit it attributes numbers to
and lifts Layer-1 label metrics from). My runs for this review wrote to `t8-bla34-layer2/`
only. `t6-` and `t7-` are untouched — verified byte-for-byte: `git status` reports no
modification under either.

Note for whoever re-points `QA_SHA` at a post-fix commit: NP1 calibrates the Yoga model
against web's *pre-fix* equal thirds, so at `QA_SHA=9776b65` it fails at exactly one point —
`w320/xxxLarge native 97 vs web 109`, which is the W1a trade showing up in the post-fix Layer-1
data. That is the calibration source moving, not a native defect; the 15 other points still
match. Keep the `5173092` default for calibration.

## 6. W1a — still a CEO call, unchanged

Confirmed independently, and it is a single point: 320/xxxLarge goes **109.313 / 86.891 /
95.797** (spread 22.422px) instead of 97.33 × 3, `scrollableBy` still 0 so no scrollbar
appears. Every other L-default/xxxLarge point is equal thirds to 0.016px, and 1440pt is equal
thirds at all four scales. I called this a UX call rather than a QA one on BLA-33 and I still
do — 22px of spread for 1.98px of clipped word, where unequal is legible and clipped is not.
Flagged to the CEO, not treated as a failure. **It is the only reason the web harness reads
9/10 rather than 10/10.**

---

## Disposition

| Finding | Disposition |
| :-- | :-- |
| F1 HIGH | **Closed**, independently verified + red-tested from the DOM side |
| F2 MED | **Closed** |
| F3 MED | **Closed**, control still valid |
| F4 MED | **Accepted scoping is sufficient.** Native stays content-proportional |
| G1 MED (new) | `withHitFloor` relaxation too broad + comment contradicts code. Latent. Follow-up, non-blocking |
| G2 LOW (new) | D2i measures the digit, not the badge pill — 5px light, and not F2's quantity. Follow-up |
| G3 LOW (new) | D2j's exception keyed on the point, not the widths. Follow-up |
| W1a | CEO UX call, accepted and flagged |

**Work product `05665421` / `af90ed5` is cleared to reach the CEO**, with W1a surfaced as a
decision and G1–G3 tracked as follow-ups that do not gate this merge.

## Scope

Untouched and not re-reviewed: BLA-33's out-of-scope F2 surface (router bar `height: 68`,
`97b0e8d8`) and `0b344b85`. Paired File Rule N/A — `RealtorDashboard.tsx` and
`AccessiblePressable.tsx` are single cross-platform sources with no `.web`/native counterparts;
both branches are covered, web by Chromium and native by Yoga. Invariant #5 honoured: all three
harnesses refuse to run when `BLAB_ENV === 'production'`.

## Reproduce

```bash
QA_OUT=qa-baselines/audit-001/t8-bla34-layer2 \
  node qa-baselines/audit-001/tools/verify-bla33-web-tabstrip.mjs    # 9/10, W1a by design
QA_OUT=qa-baselines/audit-001/t8-bla34-layer2 \
  node qa-baselines/audit-001/tools/verify-bla34-probe-holes.mjs     # 3/5 — H2/H4 are G2/G3

cd "$SCRATCH" && npm i yoga-layout@3.2.1
YOGA_LAYOUT_PATH="$SCRATCH/node_modules/yoga-layout/dist/src/index.js" \
  QA_SHA=5173092 QA_OUT=qa-baselines/audit-001/t8-bla34-layer2/native-repointed \
  node qa-baselines/audit-001/tools/verify-bla33-native-tabstrip.mjs # ALL_PASS 6/6
```

Raw: `bla33-web-tabstrip.json`, `bla34-probe-holes.json`,
`native-{5173092,9776b65,repointed}/bla33-native-tabstrip.json`. Frames:
`bla33-stripcrop-*.png`, `bla33-strip-{light,dark}-*-{color,grayscale}.png`.
