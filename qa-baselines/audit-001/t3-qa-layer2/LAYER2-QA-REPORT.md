# [AUDIT-001 / T3] Layer-2 QA Regression — BLA-12

**Agent:** Independent Mobile/Web QA · **Branch:** `agent/uxd-audit` · **Date:** 2026-11-25
**Verified at:** `a828eca` (+ the BLA-8 / BLA-12 fixes that landed during this run)
**Baseline diffed against:** Ticket-0 capture at `853bca7` (`qa-baselines/audit-001/baseline/`)

## Verdict

| § | Area | Verdict |
| :-- | :--- | :--- |
| 1 | Protected-Surface regression (Surfaces 1–5) | **PASS** |
| 2 | 44pt hit targets | **PASS** (372 controls measured, 0 below 44) |
| 3 | Largest-Dynamic-Type sweep | **PASS as a regression** / acceptance criterion not met — all residual clipping is pre-existing |
| 4 | Screen-reader semantics | **PASS after fix** — 2 FAILs found and re-verified fixed; iOS/Android device pass still owed (BLA-14) |
| 5 | Colour-only state | **PASS** |
| 6 | Contrast | **PASS** — both verifiers reproduce exactly; one judgement-call disagreement, non-blocking |

**Not a merge blocker from this ticket.** Two FAILs were found, reported, fixed by the Lead
Engineer mid-run, and re-verified green here. The separate guard blocker (BLA-13) and the
iOS VoiceOver verdict (BLA-14) are tracked on their own issues.

---

## Method — why these numbers are independent

Nothing below reuses the implementer's measurements. `tools/verify-t3-qa.mjs` re-derives
every claim from the live rendered DOM of the Expo web build:

- hit targets from `getBoundingClientRect()`, not from the declared stylesheet;
- screen-reader semantics from **Chromium's computed accessibility tree** over CDP
  (`Accessibility.getFullAXTree`), i.e. what a screen reader is actually handed, not the
  props the author wrote;
- Dynamic Type by rewriting every computed `font-size` / `line-height` by the real iOS
  multipliers, then testing geometrically whether each text box falls outside a cropping
  ancestor's padding box;
- contrast by compositing the real `rgba()` stack from the element up to the page base.

A second Expo server was run from a **git worktree at the pre-T3 commit `853bca7`**
(`QA_WEB` / `QA_LEGACY_TARGETS`), so "pre-existing" vs "regression" is measured, not argued.

### Detector corrections made before trusting any output
The first three revisions of the clip detector over-reported, and the fixes matter for
reading the numbers:
1. a scroll container is not a crop — content past it is reachable, so the axis test must
   skip any ancestor with `overflow-{x,y}: auto|scroll`;
2. `numberOfLines` renders as `text-overflow: ellipsis` (1 line) or `-webkit-line-clamp`
   (>1) — that is requested truncation, not a defect;
3. `hero` sets `overflow: hidden` to crop two decorative absolutely-positioned circles, so
   an ancestor-`scrollHeight` test flags every text node inside it. Only a direct
   text-box-vs-padding-box comparison is sound.

`allowFontScaling={false}` is a **no-op on react-native-web**, so the emulation would scale
the three decorative initials that iOS would not. They are detected by shape (1–2 capitals
in a circular fixed box) and exempted, which is what makes the web sweep stand in for iOS
here.

---

## §1 — Protected-Surface regression · PASS

**No Protected-Surface file was touched.** `git diff 853bca7..HEAD` over every file listed
in `PROTECTED_SURFACES.md` Surfaces 1–5 (plus `theme.ts`, `PropertyCard.tsx`): empty.

**Live smoke of each surface** (`tools/verify-protected-surfaces.mjs`), ids resolved from
the API rather than hardcoded:

| Surface | Route | Result |
| :-- | :--- | :--- |
| 1 Live 3D Shutterbug Tracking | `/tracking/f63addfe…` | renders, **0 errors**. Gate-Code pill not exercised — the fixture's shoot is `completed`, and UAT has no in-flight ride (same gap as `BASELINE-INDEX.md` §5) |
| 2 Multi-Unit Society Switcher | `/property/2969f948…` | **PASS** — price, specs, cap rate, contact bar all render |
| 3 Express Shoot & Zero-Flash Nav | `/post` | **PASS** |
| 4 Founding 500 Pricing & Option B | API-only | **PASS** via qa-runner INV-2 / INV-4 / INV-6 |
| 5 Founder Ops Command Center | `/ops` | **PASS** — `UAT SANDBOX` gate visible (Invariant #5) |

**Pixel diff, 30 frames vs the Ticket-0 baseline** (`tools/diff-baseline.mjs`):
`0/30 identical, 30 changed, 0 missing`, **height delta 0px on all 30**.

The percentages (0.36%–28%) are dominated by UAT data and clock drift — the hero greeting
is `new Date().getHours()`-dependent. Two things isolate the real signal:
- `profile-signedout` (no data, no greeting) changed **0.36%–1.43%** — exactly the two
  buttons growing to 44pt;
- a before/after read of the worst Profile frame (15.5%) shows **identical content in
  identical order**, shifted down ~22px by the hit-target growth. No element moved
  horizontally, nothing clipped, no colour changed.

**Conclusion: the pixel delta is the intended hit-target growth and the reflow it causes.**

---

## §2 — 44pt hit targets · PASS

**372 in-scope interactive controls measured across 10 app states × 4 viewports
(320 / 360 / 390 / 1440pt). Zero below 44×44. Zero console or page errors.**

The Expo Router bottom tab bar is excluded from that count: it measures **43×43** (1pt
short) and lives in `app/(tabs)/_layout.tsx`, outside T3's diff. Pre-existing,
out of scope, worth a follow-up.

### The highest-priority claim — `actionBtn`, the Invariant #1 buyer-contact path
Measured on **both** builds, same fixture, same tab:

| Build | 320pt | 360pt | 390pt | Accessible name |
| :--- | :-- | :-- | :-- | :--- |
| pre-T3 `853bca7` | 30×30 | 30×30 | 30×30 | *(none — bare `<div>`)* |
| T3 | **44×44** | **44×44** | **44×44** | `"WhatsApp Vikram Rao about Bibinagar"` |

Confirmed. At 320pt both buttons still fit the row, the buyer name wraps, nothing is cut.

### The regression the ticket asked me to hunt — did `cardHeader` collapse to 44?
**No.** `withHitFloor()`'s `Math.max` is correct in both directions. Rendered heights
against `min-height: 90px`: **90, 90, 90, 99, 154** — and 90 while expanded.

### "Before" column, independently corroborated on the pre-T3 worktree
`signOutPill` 38×38 ✓ · `input` 40 ✓ · `activateBtn` 42 ✓ · `tabPill` 38 ✓.
Two numbers in the PR are slightly off but directionally right: `upgradeChip` measures
**32**, not ~27; the dashboard tab row measures **48** (outer row), not ~33. Neither
changes the fix.

---

## §3 — Largest Dynamic Type · PASS as a regression; criterion not met

Swept at **L-default / xxxLarge / AX3 / AX5-max** (iOS body multipliers 1.0 / 1.35 / 2.35 /
3.12) at 360pt and 390pt, both screens, every tab.

### The three things the ticket called out — all PASS
- **`"New Contacts (7 days)"`** wraps cleanly and **does not overlap `statValue`** at any
  size. The hardcoded `\n` → `lineHeight: 16` change is sound.
- **Dashboard tab labels at 360pt** now truncate with an ellipsis under `numberOfLines={1}`
  instead of wrapping — a measurable improvement: five clips present pre-T3 are gone.
- **Decorative initials** stay inside their circles; no *informational* text is exempted.

### Overlaps: none real
All 128 geometric overlaps involve the **fixed Expo Router tab bar** with content scrolling
beneath it — by design. Zero app-content overlaps.

### Residual clipping — every instance is pre-existing
Same-frame comparison, pre-T3 vs T3, `dashboard-pro`:

| Scale | Clipped text | pre-T3 | T3 |
| :--- | :--- | :-- | :-- |
| L-default | Pro banner `Founding 500 Pro Active · Free through Mar 31 (₹10,000…` | clipped | clipped |
| xxxLarge+ | card tag row `New Owner Handoff`, `House`, `Apartment`, `2 contacts (2 new)` | clipped | clipped |
| AX3/AX5 | stat pill labels, stat pill icons | clipped | clipped |
| AX3/AX5 | tab labels `Site Visits`, `My Properties`, `Buyer Contacts`, `Pro` | clipped | **fixed** |

**T3 introduced zero new clipping and removed five instances.** The stated acceptance
criterion "no clipped text anywhere at largest Dynamic Type" is **not** met, but nothing
outstanding is in T3's diff. The Pro banner clipping at *default* type size on a 360pt
device is the most user-visible of these and deserves its own ticket.

### Honest limitation
This is a **font-scale emulation on the web build**, not iOS Dynamic Type. The iOS
Simulator input blocker in `BASELINE-INDEX.md` §4 is still unresolved, so a real
Larger-Text pass on device remains owed.

---

## §4 — Screen-reader semantics · 2 FAILs found, fixed, re-verified

### FAIL #1 — nested `<button>` on the Realtor Dashboard *(introduced by T3)*
`accessibilityRole="button"` makes react-native-web render a real `<button>`. The
publish-draft CTA was an `A11yPressable` **inside** the `cardHeader` `A11yPressable`, so the
DOM contained `<button>` inside `<button>`:

```
In HTML, <button> cannot be a descendant of <button>. This will cause a hydration error.
<button> cannot contain a nested <button>.
```

Visible as a red LogBox toast in every dashboard capture. Pre-T3 both were role-less
`Pressable`s rendering as `<div>` — so this was a regression, not pre-existing. This is the
web half of the same root cause as **BLA-14**'s iOS claim (`accessible` collapsing the
subtree); the two platforms fail for different reasons from one nesting mistake.

**Fixed** (`853a9f3`, BLA-8): the CTA is now a sibling of the header.
**Re-verified:** nested interactive elements `[]` and zero DOM-nesting errors at
320 / 360 / 390 / 1440pt.

### FAIL #2 — `accessibilityState` silently dropped on web
**react-native-web 0.21.2 does not support the `accessibilityState` object.** Its
`modules/forwardedProps` allowlist carries only flattened `aria-selected` / `aria-expanded`
/ `aria-busy` / `aria-checked`; `accessibilityState` appears nowhere outside
`TouchableWithoutFeedback`. No warning is emitted — the props vanish.

Measured in the computed AX tree, before the fix:

| Control | Claimed | Measured (before) |
| :--- | :--- | :--- |
| Active dashboard tab | announces `selected` | `selected=false` |
| Profile role grid, active radio | `checked` | `checked=false` |
| Profile activity tab, active | `selected` | `selected=false` |
| Accordion header | `expanded` / `collapsed` | **no `expanded` at all** |
| Activate / publish-draft | `busy` in flight | **never announced** |

The control that proves it was not a measurement artefact: the Expo Router tabs sitting
alongside, which set ARIA directly, correctly reported `selected=true`.

**Fixed** (`a828eca`): `ariaFromState()` in the wrapper translates state → `aria-*` on web
while still passing `accessibilityState` for native. Role-gated, so a `radio` gets
`aria-checked` and not an invalid `aria-selected`.

**Re-verified after the fix:**

| Control | Now |
| :--- | :--- |
| `My Properties` tab (active) | `selected=true`; siblings `false` |
| Accordion headers | `expanded=false`, flips on activation |
| Profile radios | active `checked=true`; other three `false`, inside `radiogroup "Workspace mode"` |
| `Accept handoff and schedule shoot for …` | top-level button, named |

### Other §4 checks
- **No control announces an empty or placeholder-derived name.** Both RERA inputs have real
  names. The three empty names in the raw AX dump are the dev LogBox toast and its dismiss
  button — not app code.
- **WhatsApp / Call announce the buyer's name**, not "button". ✓
- Minor nit, not a blocker: both `tablist` containers are unnamed. Not required by WAI-ARIA,
  but `accessibilityLabel` on each would improve rotor navigation.

### Honest limitation — this is not a device pass
I could **not** run VoiceOver or TalkBack. `osascript` lacks assistive access and
`CGEventPost` is dropped, so the simulator cannot be driven (`BASELINE-INDEX.md` §4), and
there is no Android emulator path from this workspace. Chromium's computed AX tree is a
strong proxy for role/name/state but is **not** a substitute. **BLA-14 still owns the iOS
verdict** and must not be closed on the strength of this report.

---

## §5 — Colour-only state · PASS

38 status dots inspected across every frame, **both colour schemes**, plus grayscale
captures.

| | pre-T3 | T3 |
| :--- | :--- | :--- |
| `FlatSiteVisitCard` dot siblings | `"Mon, 27 Jul · 12:45 am"`, `"· 30 min"` — **no status word** | **`"Pending"` / `"Confirmed"`** |

Holds identically in light and dark. The grayscale capture
(`frames/sitevisits-t3-dark-grayscale.png`) is the cheap proof: status reads with zero hue
information, and the **active tab's underline also survives desaturation**, confirming the
§H8 "not colour alone" claim for the tab bar too.

The only two dots without a text equivalent are the Expo Router tab bar's badge dots —
present identically pre-T3, outside T3's diff.

---

## §6 — Contrast · PASS, with one judgement-call disagreement

**Both verifiers re-run and reproduce exactly**, no edits:
`verify-contrast-t3.py` → 9 failing pairs (1 historical "BEFORE" row, 4 deferred, 4 already
tagged `[T4]`); `verify-contrast-t3-dark.py` → the light/dark table as published.

**`scoreLabel` independently confirmed from the live DOM**, not from the script: computed
`rgba(255,255,255,0.78)` on `rgb(139,37,0)` = **5.97:1** against a 4.5 threshold, identical
across all six dashboard tiers and tabs, both schemes. The claimed 3.70 → 5.97 is correct.

### Where I disagree — partially
> *"4 further light-mode failures were deliberately left for T4 because no single literal
> passes in both modes."*

The **arithmetic is right**; the **boundary is drawn in the wrong place for two of the four**.

- `promo ₹0 till Mar 31` — **agree, defer.** Dark currently *passes* at 5.28, and every
  light fix drops it to ~2.44. Deferring genuinely protects a passing pair.
- `freeTagText` / `statusBadge` LIVE (`#16A34A`) and `statusBadge` PENDING (`#D97706`) —
  **disagree.** Dark **already fails today** (4.30 and 4.38 against 4.5). Deferring does not
  protect a passing dark pair; it leaves *both* modes failing.

And the premise that a fix needs new `SEMANTIC` tokens does not hold: `profile.tsx:38`
already computes `isDark` in the same scope as all three literals, so a mode-aware value is
a one-line ternary at the call site, not a token system.

**Non-blocking** — these are pre-existing defects, not T3 regressions, and the ticket's
scope was explicitly light-mode-only. But T4 should own all four **with the numbers
attached**, and should not inherit the framing that dark mode is currently healthy for two
of them.

---

## Layer-1 gates, re-verified on the current tree (not assumed)

| Gate | Result |
| :--- | :--- |
| `cd expo-app && npx tsc --noEmit` | **0 errors** |
| `GET /api/ops/qa-runner` | **ALL_PASS 10/10** |
| `node scripts/a11y-guard.mjs` | clean (2 guarded files) |
| Protected-Surface files touched | **none** |

---

## Follow-ups this pass surfaced (none block T3)

1. **Pro banner clips at default type size on a 360pt device** — `Founding 500 Pro Active ·
   Free through Mar 31 (₹10,000…` runs off the right edge. Pre-existing, most user-visible
   of the residual clips.
2. **Card tag rows and stat pill labels clip from xxxLarge upward** — pre-existing; the
   natural owner is the T5 optics ticket.
3. **Expo Router tab bar is 43×43** — 1pt under the floor, and its labels are clipped to 5px
   at default size. `app/(tabs)/_layout.tsx`, outside every guarded file.
4. **Both `tablist`s are unnamed.** One-line `accessibilityLabel` each.
5. **iOS / Android device pass still owed** — BLA-14. Do not close it on this report.

---

## Re-running this

```bash
# Terminal 1 — API (BLAB_ENV must not be 'production');  Terminal 2 — npx expo start --web
node qa-baselines/audit-001/tools/verify-t3-qa.mjs              # §2–§6, all frames
node qa-baselines/audit-001/tools/verify-protected-surfaces.mjs # §1 surfaces 1–5
CAPTURE_OUT=qa-baselines/audit-001/t3-recapture \
  node qa-baselines/audit-001/tools/capture-web.mjs             # §1 re-capture
node qa-baselines/audit-001/tools/diff-baseline.mjs qa-baselines/audit-001/t3-recapture

# pre-vs-post comparison (second Expo server on a worktree at the older commit):
git worktree add /tmp/pre-t3 853bca7
QA_WEB=http://localhost:8082 QA_OUT=/tmp/out QA_LEGACY_TARGETS=1 QA_DISABLE_WEB_SECURITY=1 \
  node qa-baselines/audit-001/tools/verify-t3-qa.mjs --only dashboard-pro
```

Raw output: `t3-qa-report.json`, `t3-qa-raw.json`, `protected-surfaces.json`,
`t3-recapture/_diff-vs-baseline.json`, and ~90 frames under `frames/`.
