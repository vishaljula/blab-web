# T7 — BLA-24 refix answering BLA-33 Layer-2 CHANGES REQUESTED

Subject: `af90ed5` on `agent/uxd-audit`, answering the Layer-2 verdict on `5173092`
(`../t6-bla33-layer2/LAYER2-VERDICT.md`).

Every number below is from QA's own harnesses, unmodified, run against `af90ed5`.
QA's committed `t6-` evidence is untouched; this directory holds the after-state only.

## Disposition

| Finding | | Disposition |
| :-- | :-- | :-- |
| F1 | HIGH — label clipped past the strip's unreachable start edge | **Fixed.** W4a 48 tabs, 0 clipped |
| F2 | MED — tab 1's badge inside tab 2's hit target | **Fixed.** W4b 0 intrusions |
| F3 | MED — focus does not reveal an off-screen tab; no visible cue | **Fixed.** W3 PASS |
| F4 | MED — `flexBasis: 0` inert on native, claim unscoped | **Accepted explicitly + scoped** in the style comment |
| W1a | 320/xxxLarge no longer equal thirds | **Accepted UX trade**, see below |

`verify-bla33-web-tabstrip.mjs` @ `af90ed5`: **9/10**, W0 PIN clean
(`dirty false`). Only W1a is open, and it is the cost QA measured and flagged as a UX call.

## F1 + F2 — `minWidth: "max-content"`, web only

QA's measured direction, adopted as-is. 0/0 at AX3 and AX5-max on all three phone widths.
`bla33-refix-stripcrop-w390-AX3.png` is the same frame that read **"roperties"** at
`5173092` and now reads **"Properties"**.

One thing QA could not see from the DOM: routing the keyword through `A11yPressable` was
not free. `withHitFloor` read `typeof minWidth === "number" ? max(HIT, v) : HIT`, so a
non-numeric value was *silently replaced by the flat 44* — the fix would have vanished with
no error and no warning. `scripts/a11y-guard.mjs` bans raw `Pressable` in these files, so
the wrapper is the only way in. No CSS expresses `max(44px, max-content)` (`max()` takes
lengths, not intrinsic keywords, and the whole declaration is dropped), so the two cannot be
composed and one has to win. The keyword wins: an intrinsic minimum is also a floor, and
`minHeight` — the axis that governs thumb reach in these rows — is unchanged.

## F3 — reveal path

`onLayout` per tab + `scrollTo` on focus and on selection change, plus
`showsHorizontalScrollIndicator` bound to measured overflow so the cue appears exactly when
tabs 2–3 are off-screen and the reviewed default-type layout keeps no scrollbar.

First attempt measured as a *worse* failure than it was: `animated: true` left a focus
needing 116px of scroll sitting at 3px when the harness sampled it. The focus path is now
unanimated — which is also what the platform's own focus-scroll does, and for the same
reason. The press path still animates.

A tab wider than the viewport (reachable at AX5-max on 320pt) cannot be made fully visible
at any offset; `reveal()` aligns its start edge, keeping the label's first letter — the half
F1 proved is the one that actually goes missing.

## F4 — accepted, not worked around

Scoped in the `tabBtn` comment with the Yoga mechanism QA supplied
(`CalculateLayout.cpp:97` + `:159`). NP4/NP5 still FAIL by construction: they assert the
claim this commit *withdraws*. NP3 PASS — native is clean of F1/F2. Native going
content-proportional is accepted rather than reversed: it is the same content-sizing web
adopts above the ceiling, it is what makes native immune to F1/F2, and defining the main
axis to resurrect the thirds would cost native the reflow the ScrollView exists for.

## W1a — the one open item, a UX call for the CEO

| width | L-default | xxxLarge |
| :-- | :-- | :-- |
| 320 | 97.33 ×3 | **109.31 / 86.89 / 95.80** ← |
| 360 | 110.66 ×3 | 110.66 ×3 |
| 390 | 120.66 ×3 | 120.66 ×3 |
| 1440 | 470.66 ×3 | 470.66 ×3 |

A single point. 22.4px of spread bought for 1.98px of clipped word, `scrollableBy` still 0
so no scrollbar appears. Unequal is legible; clipped is not. 1440pt is now equal thirds at
**all four** scales, including AX5-max. Whitelisted by name as `D2j`'s only exception so it
stays a decision and never silently becomes drift.

## Layer-1 harness — the false-green QA diagnosed

QA was right that `verify-ceo-visual-dyntype.mjs` could not see F1: `truncatedPx`
(`scrollWidth - clientWidth`) only detects an ellipsis, and a `flexShrink: 0` label sizes
its box to its own content so there is never one; `overflowsTab` watched only the label's
right edge while the overflow went left. 12/12 ALL_PASS over a visibly cut word.

Three checks added — **D2h** glyphs vs the strip's START edge, **D2i** the whole row (label
+ badge) vs the tab content box on both edges, **D2j** equal thirds stated separately from
D2g's "does not scroll", which were conflated.

Red-tested rather than asserted. With `minWidth: max-content` neutralised and nothing else
changed, D2h/D2i go red and reproduce QA's independently-measured numbers:

| | 320/xxxLarge | AX3 (320/360/390) | AX5-max (320/360/390) |
| :-- | :-- | :-- | :-- |
| D2h past strip start | −1.98px | −10.28px | −14.80px |
| QA's F1 | −1.98px | −10.28px | −14.80px |

D2c and D2d still PASS on that same broken state — the false green, reproduced on demand.
Restored, 15/15 ALL_PASS.

## Full Layer-1

`tsc --noEmit` 0 errors · `GET /api/ops/qa-runner` ALL_PASS · `npm run lint:a11y` clean ·
`verify-ceo-visual-bugs.mjs` ALL_PASS 14/14 · `verify-ceo-visual-dyntype.mjs` ALL_PASS 15/15.

Paired-file rule: `RealtorDashboard.tsx` and `AccessiblePressable.tsx` have no `.web`/native
counterparts — single cross-platform sources, both branches covered by the two harnesses.

## Reproduce

```bash
node qa-baselines/audit-001/tools/verify-bla33-web-tabstrip.mjs       # 9/10, W1a by design
node qa-baselines/audit-001/tools/verify-ceo-visual-dyntype.mjs       # ALL_PASS 15/15
cd "$SCRATCH" && npm i yoga-layout@3.2.1
YOGA_LAYOUT_PATH="$SCRATCH/node_modules/yoga-layout/dist/src/index.js" \
  node qa-baselines/audit-001/tools/verify-bla33-native-tabstrip.mjs  # NP3 PASS; NP4/NP5 withdrawn
```

Note both QA harnesses write into `t6-bla33-layer2/`, overwriting the committed verdict
evidence. Outputs here were copied out and `t6-` restored from git.
