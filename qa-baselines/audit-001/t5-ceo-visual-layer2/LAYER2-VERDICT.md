# BLA-25 — Layer-2 QA verdict: CEO visual-bug sweep @ `0cdada0`

**Subject:** `agent/uxd-audit` @ `0cdada0` (BLA-24 §1, BLA-24 §2, BLA-19)
**Reviewer:** Independent Mobile/Web QA (agent `dfa44b40`), 2026-11-26
**Harness:** `qa-baselines/audit-001/tools/verify-ceo-visual-layer2.mjs` — 37 checks
**Raw:** `_ceo-visual-layer2.json` · **Frames:** `frames/` · **Re-score:** `QA_RESCORE=<json>`

## Verdict

**PASS — recommend merge.** All three defects are independently confirmed fixed at DEFAULT
type size, on both colour schemes, with the accessible names intact. **34 of 37 checks PASS.**

The three FAILs are **not regressions from this commit**: one is a newly-quantified Dynamic
Type ceiling that this commit *raises* relative to its parent, one is pre-existing, and one
is informational by design. Details and severities below.

The headline result Layer-1 could not produce: the fix does not trade width for a shorter
word at the cost of scaling headroom. It **raises the ceiling at every width.**

| Viewport | Dashboard tab labels, pre-rename (`b40b742` shape) | Post-fix (`0cdada0`) |
| :--- | :--- | :--- |
| 320pt | **truncates at DEFAULT** (`My Properties` −36px) | L-default clean, xxxLarge −12px |
| 360pt | **truncates at DEFAULT** (`My Properties` −22px, `Buyer Contacts` −26px) | **xxxLarge** clean |
| 390pt | **truncates at DEFAULT** (−12px / −16px) | **xxxLarge** clean |

Those pre-rename numbers are an independent reproduction of the defect the CEO screenshotted:
at 360pt/DEFAULT the old labels really did ellipsise. BLA-24 §2 was a real bug, correctly fixed.

## Measurement isolation (read this before trusting any number)

The dev server at `:8081` serves **one shared working tree**, and a concurrent run (BLA-21 /
BLA-18) was editing `RealtorDashboard.tsx` throughout this review. Handling:

- `0cdada0` and `b40b742` were checked out into dedicated worktrees for all source comparison.
- The measurement sweep completed at **16:51:12**; the concurrent `TabBar` rewrite landed in
  the working tree at **16:53:34**. The banked measurements therefore predate it, and the data
  self-certifies: equal-thirds tabs (120.7pt each @390), `tablistOverflowPx: 0`, no scroll
  container — i.e. the `0cdada0` `TabBar`, not the later `ScrollView` one.
- A later re-measure would have silently retargeted the probe at the other ticket's code, so
  the corrected checks were **re-scored from the banked measurements** (`QA_RESCORE`) rather
  than re-measured. Every check is a pure function of the measurement set, so the two paths
  cannot drift.

## What was independently established

### §L1 — Dynamic Type (the gap Layer-1 left open)
Sweep: L-default / xxxLarge / AX3 / AX5-max × 320/360/390 (+1440 for Profile), using the same
uniform font-scale emulation T3 established. Each scale was *also* measured against a DOM
mutated back to the pre-rename label text, so the verdict is a before/after, not a bare pass.

- Dashboard labels: clean to **xxxLarge** at 360/390, **L-default** at 320. Ceiling raised at
  every width (table above). Tablist and page never overflow at any scale.
- Router bar: items **90×53** at 360pt (was 97.5×43), labels **14/14** not clipped, ≥44×44 at
  every width, font 11px ≥ the §F3 floor. Clean to **xxxLarge**; see F2 for the ceiling.
- Profile: no field escapes the partner card at **any** scale or width, no page overflow, and
  the desktop side-by-side row survives all the way to AX5-max.

### §L2 — the icon removal is a visual delta, checked as one
In **both** light and dark, at 390pt: no Ionicons glyph leaf remains in any tab (the removal
is real, not just copy), exactly one `aria-selected="true"`, a 2px active underline
(`rgb(139,37,0)` light / `rgb(196,80,26)` dark) with 0px on both inactive tabs, and selection
tracks correctly when each of the three tabs is clicked. State is **not colour-only**: active
is weight 700 vs 500 plus the underline, so it survives the grayscale proof (frames banked).
The T3 §H7 contract — underline + colour + `accessibilityState.selected` + `role="tab"` — is
intact. §H7 never specified an icon, so dropping it does not touch that contract.

### §L3 — accessible names survived (real AX tree, not the attribute read back)
From Chromium's `Accessibility.getFullAXTree` — the tree VoiceOver/TalkBack consume:

- `"My Properties, 5 items"`, `"Site Visits, 3 items"`, `"Buyer Contacts, 2 items"`, each with
  `nameFrom: attribute`. No tab computes its name from the shortened visible text.
- Router tabs announce their titles, and `selected=true` is exposed on both tab sets.

### §L4 — the locator rewrite is additive (the "silent pass" risk)
The seven rewritten locators were replayed against four live DOM shapes — post-rename and
pre-rename, each with `aria-label` present and stripped — gated **per tool call site** (most
are `byAria || legacy`), not per branch.

- All 6 call sites resolve on `0cdada0`'s DOM **and** on the pre-rename DOM. Additive.
- With the accessible name stripped, every legacy text/geometry branch still resolves on a
  pre-rename DOM: nothing was removed.
- Root cause of why this was safe: `b40b742` **already** carried the identical
  `accessibilityRole="tab"` + `accessibilityLabel={`${label}, N items`}`. The rename changed
  only the rendered text, never the accessible name the new branch matches on.

### §L5 — the untouched iOS `insets.bottom > 0` branch
On-device capture is **blocked** (see F4). Covered geometrically instead: the label's required
line box is measured at every scale and checked against both branches' content budgets, derived
from the live bar's own border and padding.

- No-inset branch (the one this commit changed): `68 − 1 border − 6 top − 8 bottom` = **53pt**.
- Inset-34 branch (unchanged): `90 − 1 − 6 − 17` = **66pt**.
- Required = 28pt icon box + 1 + label line box → 43pt at DEFAULT, 48 at xxxLarge, 62 at AX3.

So the **untouched branch is strictly roomier and clears AX3, while the branch this commit
changed clears only xxxLarge**. "Unchanged by design" is safe here: the iOS branch cannot be
the tighter of the two at any scale, so it cannot have regressed.

### Regression
- **Invariant #1 (Zero Buyer Dead-End) — PASS.** `verify-t1-invariant1.mjs`: Buyer Contacts
  `clicked=true switched=true contactControls=4`; 0 of 4 active listings missing a callable
  `contactName`/`contactPhone`. The tab rename did not sever the buyer path.
- **PROTECTED_SURFACES — no violation.** None of the three edited files is in the protected
  table. Surface #3's `_layout.tsx` is `expo-app/app/_layout.tsx`; this commit touched
  `expo-app/app/(tabs)/_layout.tsx`, a different file. `verify-protected-surfaces.mjs`:
  Surfaces 2/3/5 PASS. Surface 1 is `REVIEW` only because the tracking fixture sits in its
  `Shoot complete` state so there is no `ARRIVAL` pill to find — reproduces independently of
  this commit, and no Surface 1 file was touched.
- **Paired File Rule — N/A.** None of the three files has a `.web.tsx`/native counterpart.

## Findings

### F1 — `Properties` truncates 12px at 320pt / xxxLarge · MEDIUM · not blocking
`Properties` needs 77px in a 65px box at 320pt once type reaches xxxLarge — the largest
**standard** (non-accessibility) Dynamic Type step, so real users reach it. All three labels
truncate at AX3/AX5 at every width.

Not a regression: the pre-rename control truncated at **DEFAULT** at all three widths, so this
commit strictly improves the surface. The residue is the structural limit of a fixed
equal-thirds segmented control holding unbreakable single-word tokens at a fixed 11px.

*Already being addressed:* an uncommitted change in the shared tree reworks `TabBar` into a
horizontally-scrolling, content-sized strip citing exactly this measurement. That change is
outside this verdict's subject and is **unverified here**.

### F2 — router tab bar's fixed `height: 68` overflows at AX3+ · MEDIUM · not blocking
`barOverflowPx` = **+6px at AX3** and **+17px at AX5-max**, at all three widths. The labels are
clipped by the **bar**, not by their own line box — `flexShrink: 0` (correctly) guarantees the
label its line box, which pushes the shortfall out to the fixed-height container.

The commit's own comment frames 68pt as a "height budget", but that budget is computed for
DEFAULT type only. Suggested follow-up: scale the height by `useWindowDimensions().fontScale`,
or let the bar grow. Not a regression — the 60pt predecessor clipped at DEFAULT.

> Worth flagging for future Layer-2 passes: a label-level clip probe (`scrollHeight −
> clientHeight` on the text node) reads **clean** here and is a false pass. My first scoring
> pass asserted exactly that and had to be corrected against the screenshot. The load-bearing
> signal is the container's overflow.

### F3 — router tab accessible names carry the Ionicons glyph · LOW · pre-existing
AX names compute to `" Explore"` etc. (`nameFrom: contents`) because react-navigation
sets no `accessibilityLabel` on the router tabs. Titles **are** announced, so BLA-25's
requirement is met, but a private-use codepoint precedes each one. Not touched by this commit.

### F4 — iOS on-device capture still blocked · carried forward from BLA-3
`insets.bottom > 0` could not be verified on a real home-indicator device. Re-confirmed on this
host: `osascript` can **read** the AX process list (returns `"Simulator"`, rc 0) but cannot
**deliver** synthetic input — `click at {100,100}` → `not allowed assistive access (-25211)`,
window geometry → `-1719`. Cold-launching via `simctl terminate` + `openurl` does not avoid the
`Open in "Expo Go"?` alert: SpringBoard raises it on the URL open and renders it as a
`UIAlertController` **inside** the device screen, so it exposes no macOS AX button to click.

Script and the three sanctioned unblocks are in `tools/capture-ios-tabbar.sh`; it preflights the
permission and exits 3 rather than banking a screenshot of the alert as if it were the app.
§L5's geometric proof stands in until a human grants Accessibility or installs `idb`.

### F5 — two harnesses cannot fail on a missed tab click · LOW · pre-existing
`verify-t1-invariant1.mjs` prints a verdict but has **no exit-code gate** (always exits 0), and
its device-layer "no regression" line compares `propertiesTab.contactControls` (0 vs 0) rather
than the Buyer Contacts count it just measured. `capture-web.mjs` only `console.log`s
`!! tab click MISSED`. This is the hazard BLA-25 named; it is **pre-existing** and the locator
rewrite makes these call sites more robust, not less. Recommend a non-zero exit on
`clicked === false` so a future rename of the *accessible* name cannot pass silently.

## Reproduce

```bash
# full sweep (needs :8081 + :3000, ~8 min, and a working tree pinned to the subject)
node qa-baselines/audit-001/tools/verify-ceo-visual-layer2.mjs

# re-score the banked measurements without a browser — use this when the shared
# working tree has moved off the commit under review
QA_RESCORE=qa-baselines/audit-001/t5-ceo-visual-layer2/_ceo-visual-layer2.json \
  node qa-baselines/audit-001/tools/verify-ceo-visual-layer2.mjs
```

Exit 0 = ALL_PASS. It currently exits 1 on three checks by design:

| Check | Finding | Why it is not a merge blocker |
| :--- | :--- | :--- |
| `L1g2_router_bar_content_fits_any_scale` | F2 | ceiling raised vs the 60pt predecessor, which clipped at DEFAULT |
| `L3e_ax_router_name_is_title_only` | F3 | pre-existing; titles still announce |
| `L4d_legacy_branch_alone_on_new_dom` | — | informational: the legacy branch is *meant* to be dead on the renamed DOM; the accessible name it defers to is always present. Kept visible rather than silently excluded. |

F1 surfaces through the ceiling table rather than a FAIL, because `L1c` asks the question that
matters — *did the fix lower the ceiling* — and the answer is no, it raised it at every width.
A Layer-2 tool that goes green while a label is visibly clipped is worth less than one that does not.
