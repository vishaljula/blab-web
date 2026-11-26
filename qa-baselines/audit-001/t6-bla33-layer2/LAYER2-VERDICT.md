# BLA-33 — Layer-2 QA verdict: dashboard tab strip at Dynamic Type @ `5173092`

**Verdict: CHANGES REQUESTED — do not merge yet.**
Reviewer: Independent Mobile/Web QA (`dfa44b40`). Implementer is not Layer-2 for their own change.

Subject pinned by blob, not by HEAD: `expo-app/components/realtor/RealtorDashboard.tsx` =
`4195007143ee6413d251343301c28e6136df4345`, byte-identical to its post-image at `5173092`,
verified before and after every measurement run. HEAD advanced to `37679d8` mid-review
(concurrent run, BLA-25 addendum); it does not touch the subject.

| Harness | Result |
| :--- | :--- |
| `verify-bla33-web-tabstrip.mjs` (independent web) | **FAIL 6/10** |
| `verify-bla33-native-tabstrip.mjs` (native, Yoga) | **FAIL 4/6** |

The fix is a real improvement on `0cdada0` — the ceiling does rise to AX5-max, the ellipsis
is gone, tablist semantics survive, and the underline still reads as selection. But it has
not eliminated lost text; it **relocated it to the start edge, where it is unreachable**.

---

## What I confirmed for the implementer

**D2g reconciles — 120.7 vs 121 was rounding, not two different trees.** Measured unrounded:
**120.656px** at 390pt, which is what BLA-25 banked as 120.7 and what Layer-1 rounds to 121.
At L-default and xxxLarge the three tabs are equal thirds to 0.02px (97.328 / 110.656 /
120.656 / 470.656) with `scrollableBy = 0` at all four widths. **On web, D2g holds.** (W1a/W1b)

**D2f survives on the ScrollView, by the stronger method.** Re-pointed Chromium's *computed*
AX tree (`Accessibility.getFullAXTree`, the tree VoiceOver/NVDA consume) rather than reading
DOM attributes: 16/16 width × scale show exactly one tablist owning the strip's three tab
nodes, all named, exactly one `selected=true`. The page carries two tablists in total; the
second is the bottom router bar — the out-of-scope F2 surface, not a duplicate. (W2)

**Issue #5 — the underline is fine.** Exactly one tab carries the 2px border, it is always the
`aria-selected` one, and selection survives colour removal twice over: the underline's
luminance ratio against the strip hairline is 3.08–7.13, and the active label independently
carries `fontWeight: 700` against the inactive 500. Holds in light and dark. Grayscale proofs
captured. (W5)

**Native does reflow, and native is clean of the web defects below.** The strip becomes
scrollable on native wherever web does (112/72/42px at AX3 vs web's 119/79/49 — the constant
7px is CSS sizing the scroll container to 3× its widest item where Yoga sums the three), and
no tab's content overflows its tab box on native. (NP2/NP3)

---

## Findings

### F1 — HIGH. The first tab's label is hard-clipped at the strip's start edge, and the clip is unreachable. (web)

`justifyContent: "center"` on a tab whose label + badge row exceeds its box pushes the
overflow out **both** sides. On the first tab the left half lands outside the scroller's start
edge — and for LTR the scrollable overflow region never extends past the start edge, so it
cannot be scrolled to. Asserted, not inferred: `scrollLeft = -500` clamps back to 0
(`canScrollLeft: false`) at every measurement.

| Width × scale | "Properties" clipped | Row needs / tab has | Reachable? |
| :--- | ---: | :--- | :--- |
| 320 / xxxLarge | 1.98px | 101.3 in 89.3 | no (`scrollableBy` 0) |
| 320 / AX3 | **10.28px** | 157.4 in 128.9 | no |
| 360 / AX3 | **10.28px** | 157.4 in 128.9 | no |
| 390 / AX3 | **10.28px** | 157.4 in 128.9 | no |
| 320 / AX5-max | **14.80px** | 203.1 in 165.5 | no |
| 360 / AX5-max | **14.80px** | 203.1 in 165.5 | no |
| 390 / AX5-max | **14.80px** | 203.1 in 165.5 | no |

Visual proof: `bla33-stripcrop-w390-AX3.png` — the tab renders **"roperties"**. The 320/xxxLarge
instance is 2px and not perceptible (`bla33-stripcrop-w320-xxxLarge.png` reads clean); the
AX3/AX5 instances are plainly visible.

**Why Layer-1's ALL_PASS 12/12 does not see this.** D2c detects truncation as
`label.scrollWidth - label.clientWidth`, but `flexShrink: 0` makes the label box equal its own
content, so there is never an ellipsis to detect. D2d measures only the label's **right** edge
against the tab's right padding edge — and the label overflows **left**. So both pass while the
word is visibly cut. This is structurally the same false-green the commit message itself
diagnoses in BLA-24's original evidence: "a green sweep can coexist with the reported defect
still being live."

This is the defect class BLA-24 exists to close. `numberOfLines={1}` converted overflow into a
signalled ellipsis; dropping it converted it into an unsignalled hard clip.

### F2 — MEDIUM. Tab 1's count badge renders inside tab 2's hit target. (web)

Same root cause, opposite edge. The "5" badge crosses the first tab's border box into the
second tab's pressable by 2px at 320/xxxLarge, **10.28px at AX3**, **14.81px at AX5-max** (all
three phone widths). A tap on the visible badge of *My Properties* activates *Site Visits*.

### F3 — MEDIUM. Off-screen tabs are not revealed by focus, and there is no visible affordance either. (web — answers issue #4)

Layer-1 drives `scrollLeft` from script, which proves the scroller *can* scroll, not that a
user can get there. Driven by real `Tab` keypresses instead: focus lands on the off-screen tab
(`document.activeElement` confirms it) but `scrollLeft` stays **0** and the tab remains clipped
by up to 158px.

Controlled, so this is not a harness artifact (W3ctl, PASS): the *same browser* scrolls a
plain injected `overflow-x` scroller by 650px on focus, and `scrollIntoView()` on the real tab
does reach it (max `scrollLeft` 228px, 16/16). So the strip is scrollable and the browser does
do focus-scroll — this specific focus path does not.

On issue #4 you asked whether you were right to hide the indicator alone: **I disagree, but
the indicator is the smaller half of it.** With `showsHorizontalScrollIndicator={false}` there
is no visual cue that tabs 2–3 exist, *and* the keyboard/switch reveal measurably does not
fire. Touch users can still swipe, so this is primarily a keyboard and discoverability defect.
Worth noting RN's `ScrollView` also does not implement the WAI-ARIA tablist arrow-key pattern,
so there is no roving-tabindex path either.

### F4 — MEDIUM. `flexBasis: 0` is inert on native; the reviewed equal-thirds layout does not hold on iOS/Android. (native)

This is the hole you flagged, measured. On-device capture is still blocked (BLA-3, -25211), so
`verify-bla33-native-tabstrip.mjs` links Yoga — React Native's actual native layout engine —
and lays out the real shipped style objects through it, with label advances lifted from your
own committed Layer-1 run so the only variable between web and native is the engine.

| Width | native @ `5173092` | native pre-fix | web @ `5173092` |
| :--- | :--- | :--- | :--- |
| 320 | 111 / 81 / 100 | 97 / 97 / 97 | 97.33 ×3 |
| 360 | 124 / 95 / 113 | 111 / 111 / 111 | 110.66 ×3 |
| 390 | 134 / 105 / 123 | 121 / 121 / 121 | 120.66 ×3 |
| 1440 | 484 / 455 / 473 | 471 / 471 / 471 | 470.66 ×3 |

Your comment says `flexBasis: 0` is what preserves the thirds and that `"auto"` is what breaks
them into 111/81/100. On native the two are **byte-identical at all 16 width × scale** (NP5),
and the result is 111/81/100 — the exact number the comment attributes to `"auto"`.

Mechanism, from RN 0.83.6's own bundled Yoga rather than from behaviour:

- `ReactCommon/yoga/yoga/algorithm/CalculateLayout.cpp:97` honours `flexBasis` only
  `if (resolvedFlexBasis.isDefined() && yoga::isDefined(mainAxisSize))`.
- `CalculateLayout.cpp:159-166` — a node whose `overflow` is `Scroll` does not impose its width
  on children along the **main** axis, so a horizontal ScrollView measures its content
  container with width undefined.
- So `mainAxisSize` is undefined for the tabs, the `flexBasis` branch is skipped, each tab
  falls through to the `MaxContent` branch and is content-sized. CSS has no equivalent rule,
  which is why web keeps the thirds and native does not.

Calibration (NP1, PASS): the pre-fix tree run through the same harness reproduces web's equal
thirds 16/16 within 2px, so the label metrics and tree are sound and the divergence above is
the engine, not the model. Engine parity probe NP0 PASS.

Net: **D2g's "the reviewed layout is unchanged" is true on web and false on native.** Native
was equal-thirds before this commit and is content-proportional after. Native gains reflow and
avoids F1/F2 entirely, so this is a scoping/claim defect plus an unreviewed visual change —
not a functional break.

---

## Suggested direction (measured, not prescribed)

`minWidth: "max-content"` on `s.tabBtn` closes F1 and F2 outright, probed live in the DOM:

| Width × scale | shipped: clip / into-next-hit | + `max-content`: clip / into-next-hit |
| :--- | :--- | :--- |
| 320 / AX3 | 10.28 / 10.28 | **0 / 0** |
| 320 / AX5-max | 14.80 / 14.81 | **0 / 0** |
| 390 / AX3 | 10.28 / 10.28 | **0 / 0** |
| 390 / AX5-max | 14.80 / 14.81 | **0 / 0** |

D2g is preserved where it matters: at L-default (both widths) and at 390/xxxLarge the layout
is **identical to shipped** — equal thirds, `scrollableBy` 0. `scrollableBy` above the ceiling
is unchanged (119/49/228/158), so the last tab stays exactly as reachable as today.

Two honest caveats. It makes the tabs unequal at **320/xxxLarge** (109/87/96 vs 97/97/97) —
trading an imperceptible 2px clip for visibly unequal thirds at one point inside the reviewed
envelope; that is a UX call, not a QA one. And `"max-content"` is a CSS keyword Yoga ignores
and RN's `ViewStyle` types may reject, so it likely needs a `Platform.select` — which is fine,
because native is already clean here (NP3) and needs no change for F1/F2.

F3 and F4 are separate: F3 wants a reveal path (a visible indicator at AX sizes, or scrolling
the selected tab into view), and F4 wants the claim scoped — the code comment and D2g should
say "on web", or the native layout change should be accepted explicitly.

---

## Scope

Untouched and not re-reviewed: F2 (`97b0e8d8`, router bar `height: 68`) and F4 (`0b344b85`).
Paired File Rule N/A — `RealtorDashboard.tsx` has no native counterpart. Invariant #5 honoured:
both harnesses refuse to run when `BLAB_ENV === 'production'`.

## Reproduce

```bash
node qa-baselines/audit-001/tools/verify-bla33-web-tabstrip.mjs
# native harness needs yoga-layout, which is not a repo dependency:
cd "$SCRATCH" && npm i yoga-layout@3.2.1
YOGA_LAYOUT_PATH="$SCRATCH/node_modules/yoga-layout/dist/src/index.js" \
  node qa-baselines/audit-001/tools/verify-bla33-native-tabstrip.mjs
```

Raw: `bla33-web-tabstrip.json`, `bla33-native-tabstrip.json`. Frames: `bla33-stripcrop-*.png`
(clip proof), `bla33-strip-{light,dark}-*-{color,grayscale}.png` (issue #5).
