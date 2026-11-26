# BLA-25 Layer-2 addendum — the two items the implementer flagged as unsettled

Follow-up to `LAYER2-VERDICT.md` (committed at `d55ea27`). The BLA-24 implementer asked for
two things the geometry harness could not settle. Both are answered here. **Neither changes
the Layer-2 verdict: still recommend merge.** One new native-visible delta is reported.

Branch drift noted in that comment is now moot: `origin/agent/uxd-audit` has advanced to
`d55ea27`, so the reviewed SHA and origin agree again. The findings below are keyed to the
BLA-24 change itself (`b40b742` → `0cdada0`), which is unaffected by the T5 commits layered
on top.

---

## Ask 1 — the native side of defect 1 (`minWidth: 0` / `flexBasis: 200`)

**Verdict: the fix is native-safe, and native was never broken. One real native-visible
delta, reported below rather than passed over.**

On-device capture is still blocked (BLA-3; synthetic input to the Simulator returns -25211),
and there is no `ios/` prebuild in this managed Expo app. A screenshot is not available —
but it is also not the strongest evidence here. React Native's native layout *is* Yoga, so
the new tool links Yoga standalone and lays out the **real shipped style objects, read from
git** through it. That is the native layout algorithm itself, not a model of it.

    node qa-baselines/audit-001/tools/verify-ceo-visual-native-yoga.mjs    # ALL_PASS 5/5
    raw: qa-baselines/audit-001/ceo-visual-bugs/native-yoga/native-yoga.json

| Check | Result |
|---|---|
| `N1` shipped styles, no cell overflows the card box — 4 widths × 4 Dynamic Type scales | **PASS** 16/16, max overflow 0px |
| `N2` **pre-fix** styles on the same engine — also no overflow | **PASS** 16/16 |
| `W4` control: pre-fix + emulated CSS `min-width:auto`, must reproduce the bug | **PASS** 12/12 phone cases overflow (320pt: floor 165px/cell vs 254px box → **+86px**) |
| `C3` wrap decision identical on Yoga and on react-native-web | **PASS** at all 4 widths |
| `C3b` native layout delta, reported | see below |

`W4` is the check that makes the other four mean anything: restoring the CSS intrinsic floor
reproduces the CEO's overflow inside the engine, so the engine is modelling the right thing
when it reports clean elsewhere.

**Why native was never broken.** CSS gives a flex item `min-width: auto`, which resolves to
min-content; for a form control Chromium's intrinsic default (~20 average chars) is ~165px,
so the item refused to shrink and the row burst its card. Yoga's default `minWidth` is
**undefined**, and a Yoga node sized by `flexBasis` never consults a measure function for
width. There is no intrinsic floor on native to overflow. So `minWidth: 0` — the property
that fixes the web — is **inert on native**. Confirmed the styles carry no `Platform.select`,
so native does receive them; they simply have nothing to do there.

### The delta worth knowing about (new, not a regression)

Because native never had the overflow, the part of the fix that *does* reach native is
`flexBasis: 200` + `flexWrap: "wrap"`. On native the two inputs previously sat side-by-side
at half-width each (`flex: 1` → basis 0, always one line). They now **stack onto two lines
whenever the card content box is under 410px** (2 × 200 + 10 gap):

| Device | Card content box | Pre-fix | Post-fix |
|---|---|---|---|
| 320pt | 254px | 1 line | **2 lines** |
| 360pt | 294px | 1 line | **2 lines** |
| 390pt | 324px | 1 line | **2 lines** |
| 1440pt | 1374px | 1 line | 1 line |

This is intentional and it matches web exactly (`C3` cross-checks against the `sameRow` values
Layer-1 recorded live in Chromium — the two platforms stack and unstack together, which is the
good outcome). But it is a **pure visual change on iOS/Android**, where no bug was being
fixed, and the web-only harness could not see it. On a 390pt phone the partner card grows by
one input row. Flagging it so it is a decision rather than a surprise; it is not a defect and
does not block merge.

---

## Ask 2 — does dropping the 13px leading icon read as an affordance regression?

**Verdict: no. It is an improvement, and I would keep it.** This is a judgement, so here is
the reasoning rather than a pass/fail.

The removed glyphs were `home-outline` / `calendar-outline` / `mail-outline` at `size={13}`.

1. **They were duplicates of the row directly above them.** The `StatPill` row renders
   `mail-outline` "Buyer Contacts" and `home-outline` "My Properties"
   (`RealtorDashboard.tsx:881-883`) — the *same two glyphs for the same two concepts*, about
   100px higher up the same viewport, at a legible size. The tab icons were an echo, not a
   signal.
2. **The duplication crossed interaction classes, which is the actual miscue.** StatPills are
   non-interactive metrics; tabs are the control. Painting the identical glyph on both
   suggests the pills are what you tap. Removing the smaller copy disambiguates which of the
   two rows is interactive.
3. **13px is below the size at which an outline glyph identifies anything** (iOS HIG ~17pt,
   Material 18dp). It was decoration — and it was spending the exact horizontal budget that
   was causing the truncation this ticket exists to fix.
4. **Every cue that actually says "tab bar" survived, with triple redundancy**: the 2px
   underline, the accent colour, and weight 700 vs 500 — plus `role="tablist"` / `role="tab"`
   / `aria-selected`, plus the count-badge pattern. I re-confirmed first-hand on the dark
   **grayscale** frame (`frames/dash-tabs-dark-w390-grayscale.png`) that the underline and
   weight shift remain unmistakable with colour removed, so the active state does not lean on
   hue. §H7 never specified an icon, so nothing in that contract is touched.
5. **The icon vocabulary is retained where it does real work** — the same three glyphs render
   at `size={40}` in each tab's empty state (`:983`, `:1008`, `:1047`), which is where an icon
   actually identifies a collection.
6. **Hierarchy gain.** Before, three icon systems stacked within ~450px: 20px stat tiles, 13px
   tab glyphs, 24px router bar. Now there is exactly one icon-bearing navigation surface (the
   router bar — app-level nav) and one text-only one (the segmented control — in-page filter).
   That reads as a cleaner distinction, not a lost affordance.

The one trade-off worth naming honestly: text-only tabs are marginally slower to recognise on
a pre-attentive glance than icon+text tabs would be *if the icons were legible and unique*.
Here they were neither, so the trade is favourable.

---

## Disposition

Layer-2 verdict stands: **recommend merge**. Findings F1 (`Properties` truncates 12px at
320pt/xxxLarge, MEDIUM), F2 (router bar overflows at AX3+, MEDIUM, pre-existing) and F3
(router AX names carry the Ionicons private-use glyph, LOW, pre-existing) are unchanged. The
native stacking delta above is new information, not a new defect.
