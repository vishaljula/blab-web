# AUDIT-001 — Read-Only UXD Critique & QA Baseline
## Flow #1: Profile & Realtor Dashboard

| Field | Value |
| :--- | :--- |
| **Ticket** | BLA-2 `[AUDIT-001]` |
| **Audit date** | 2026-11-25 |
| **Auditor** | Paperclip agent (Blab CEO agent) |
| **Mode** | **STRICTLY READ-ONLY** — zero files written in `expo-app/` or `src/` |
| **Primary surfaces** | `expo-app/app/(tabs)/profile.tsx` (452 ln), `expo-app/components/realtor/RealtorDashboard.tsx` (1140 ln) |
| **Supporting reads** | `expo-app/app/(tabs)/dashboard.tsx`, `expo-app/lib/theme.ts`, `expo-app/store/realtor.ts`, `src/app/api/realtors/dashboard/route.ts` |
| **Standards applied** | `~/.claude/skills/impeccable` (DESIGN.md doctrine — quotes verified against source), Apple HIG (44pt targets), WCAG 2.2 AA. **`~/.claude/skills/react-native-skills` contributes no design doctrine** — see addendum §3. |
| **Governance read first** | `CLAUDE.md` ✅, `PROTECTED_SURFACES.md` ✅ |
| **Independent design review** | ✅ Verified 2026-11-25 by the **Principal UX Designer** (agent `06e05ba3`, BLA-2 assignee). 6 factual corrections applied in place; all 3 HIGH findings re-confirmed. Correction log: `uxd-review-addendum.md`. |
| **Gate** | **Awaiting Founder CEO review. No engineering ticket opened.** |

### Declared evidence gap (read this before trusting any visual claim)

There are **no verified screenshots in this repository.** `find` across the tree returns only app icons and the splash asset — no QA baseline captures exist for Profile or the Realtor Dashboard on any platform or theme.

Every finding below is therefore derived from **static source reading plus the live API contract**, not from pixels. Findings in §E (correctness) are code-provable and do not need screenshots. Findings in §B/§C that concern *perceived* density, contrast and crowding are high-confidence inferences from explicit style values, but the exact device-level severity (what actually clips, what actually falls below the fold) must be confirmed by the capture matrix in `qa-baseline.md` §2. I am not going to assert pixel outcomes I have not seen.

---

## A. Verdict

Both screens are **functionally complete and information-dense** — the hard product thinking is already done. They do not read as broken; they read as **three different design systems stacked in one scroll**, which is the single thing most likely to make a Founding-500 realtor distrust the product in the first 10 seconds.

Specifically:

1. **Brand incoherence is the dominant visual defect.** Blab's token palette is a warm maroon-on-paper system (`#8B2500` on `#FAFAF8`). Both screens drop **hardcoded slate-navy (`#0F172A`) and emerald (`#064E3B`) panels** into the middle of it — Profile's Ops card, the Dashboard's Starter banner, the Dashboard's Pro banner. Three competing surface languages, none of them theme-aware.
2. **The highest-value conversion action is the smallest, weakest affordance on the screen.** The Founding 500 upgrade CTA (`s.upgradeChip`, `RealtorDashboard.tsx:1030`) is a ~24pt-tall 12px chip tucked into a banner header row — below Apple's 44pt minimum, visually subordinate to a decorative avatar glow ring, and it fires an irreversible billing-tier POST with no confirmation, no loading state and no success feedback.
3. **The server already computes the entire Founding-500 scarcity story and the UI throws it away.** `/api/realtors/dashboard` returns a full `foundingProgram` block — `totalCap: 500`, live `claimedCount`, `annualPriceInr`, `standardMonthlyInr`, `freeTrialThrough: "2027-03-31"`, `freeShootsIncluded: 5`, `nearbyHandoffs14d`. **None of it reaches the UI.** The dashboard re-types all of it as string literals and fabricates `🔥 4 nearby handoffs this week`. This is the biggest conversion win available and it is almost pure UI work.
4. **Two code-provable defects misreport Protected Surface #4** (Starter cap / Option B fallback) — see §E1 and §E2. These are not aesthetic. A Starter realtor can currently be shown "Unlimited Listings & Handoffs" while the server caps them at 2/1.
5. **Accessibility is exactly zero.** Across 1,592 lines and **47** `Pressable` references (19 in `profile.tsx`, 28 in `RealtorDashboard.tsx`) there is not one `accessibilityLabel`, `accessibilityRole`, `accessibilityState` or `accessibilityHint` — `grep -c` returns **0** in both files. Every icon-only control (sign-out, WhatsApp, call, chevrons) is silent to VoiceOver. *(Corrected upward from "~30" — the gap is larger than first published.)*

**Recommendation:** approve a **two-phase** remediation. Phase 1 (§E + §D) is correctness and conversion, is low-risk, and should ship before the Founding 500 push. Phase 2 (§H) is the token/typography refactor and should be gated behind screenshot baselines captured first.

---

## B. What reads dated vs. what reads modern

### Already modern — preserve the intent, not necessarily the exact values

| Element | Why it works |
| :--- | :--- |
| Accordion property card (`PropertyActivityCard`) | Thumbnail + info + progressive disclosure is the correct pattern for a lead-triage surface. The `hasActivity ? toggle : navigate` branch (with its comment at `:466–470` about avoiding nested `Pressable` on iOS) is genuinely well-reasoned. |
| Flat-tab flattening (`allSiteVisits` / `allBuyerContacts`) | Giving the realtor both a property-centric and a time-centric view of the same data is the right information architecture. |
| `UPCOMING` / `PAST` grouping in Site Visits | Correct temporal grouping; uppercase tracked group headers match Impeccable's label doctrine. |
| Inline WhatsApp + Call with auto-`respondToEnquiry` | One-tap contact that self-marks as responded is excellent — zero extra bookkeeping for the realtor. |
| `LayoutAnimation` accordion + `StatPill` spring entrance | Motion is present and tasteful. |
| Role switcher as a 2×2 card grid | Scales to 4 personas, reads instantly, far better than a picker. |

### Reads dated — ranked by how much it costs

**1. Heavy-weight type as the only hierarchy device.**
`fontWeight: "800"` appears **15** times across the two files; `"900"` once (`profile.tsx:296`). On iOS these map to San Francisco **Heavy** and **Black**. Hierarchy is carried almost entirely by weight rather than by size, spacing and color — which is the signature of pre-2019 mobile design. Impeccable's doctrine sets titles at **600** and display at **200**, and lets whitespace do the work. Measured distribution: `400`×1, `600`×9, `700`×17, `800`×15, `900`×1, plus a `"500"` in the tab-bar ternary (`:179`) and unspecified defaults elsewhere — six weights for two screens.

**2. No *named type roles*.** Observed font sizes across both files: `9, 10, 11, 12, 13, 14, 16, 17, 18, 22, 26, 28` — **twelve** sizes. (Corrected: an earlier revision listed thirteen and included `20`, which appears nowhere as a `fontSize` in either file.)

The defect is **not the count**. Impeccable's own ramp carries eighteen values (`9 … 104`), so a wide ramp is not itself dated. What Impeccable has and Blab does not is a **named role layer** — `display / wordmark / title / body / label / tag` — where each role binds size *and* weight *and* line-height *and* family together, so a component picks a role rather than inventing numbers. Blab's `11/12/13` carry different semantic roles in different components with no rule distinguishing them, which is why every new component re-invents its own size. That is the actual gap, and it is what §H1 closes.

**3. No line-height anywhere.** Not a single `lineHeight` is set in either `StyleSheet`. Everything inherits RN's platform default (~1.2× on iOS), which is why multi-line text needs the hack at `RealtorDashboard.tsx:741`: `label={"New Contacts\n(7 days)"}` — a hardcoded `\n` substituting for typographic control. Impeccable body is `lineHeight: 1.5`.

**4. Off-grid spacing.** Observed padding/margin/gap values: `1, 2, 2.5, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 16, 18, 20, 22, 24, 32, 40, 48` — **twenty-two** distinct values, eleven of them off any 4pt grid. (Corrected: an earlier revision listed nineteen and omitted `22`, `32`, `40`.) Two concrete consequences:
   - **The two screens don't share a gutter.** Profile's scroll container uses `paddingHorizontal: 18` (`profile.tsx:177`); the Dashboard uses `14` (`statRow`, `trialRow`, `tabBar`, `listContent`). Tabbing between Profile and Dashboard shifts the whole layout 4pt horizontally.
   - Inside Profile, the Ops card uses `padding: 13` while every neighbouring card uses `14` — a 1pt inconsistency that is invisible in isolation and reads as sloppiness in aggregate.

**5. Emoji standing in for brand assets.** `👑` (twice), `👋`, `🔥`, and a literal `✓` glyph in `"Responded ✓"` (`:229`, `:398`) are mixed with Ionicons. Emoji render differently on iOS / Android / Chrome / Safari, cannot be colored, cannot be sized reliably, and will not match in a screenshot baseline. The crown is doing duty as the **Founding 500 brand marker** — the single most important badge in the product — and it is a system emoji.

**6. Decoration outranking function in the hero.** `avatarRingOuter` (`:938`) is 76×76 with a 10px orange glow shadow and a double-ring construction, plus two decorative blur circles (`heroBg1`, `heroBg2`). The realtor's actual job — triaging leads — starts ~340pt down the screen. The most visually dominant element on the Realtor Dashboard is a photo frame.

**7. Light-mode-only colors hardcoded into both screens.** The following literals are used on surfaces that go dark at `colors.card = #1A1A1A` with no dark-mode variant:

| Literal | Role | Site |
| :--- | :--- | :--- |
| `#FEF3C7` / `#92400E` | "For Sale" tag, unresponded avatar | `:220, :293, :364, :389, :457` |
| `#EFF6FF` / `#1D4ED8` | "For Rent" tag | `:294, :365, :457` |
| `#D1FAE5` / `#065F46` | Responded avatar | `:220, :389` |
| `#ECFDF5` / `#065F46` | "Upcoming soon" tag | `:313` |
| `#F0FFF4` | WhatsApp button fill (`s.waBtn`) | `:1128` |
| `#0F172A` / `#1E293B` | Ops card, Starter banner, upgrade chip | `profile.tsx:154, 209`; `:747, 1031` |
| `#064E3B` / `#065F46` | Pro banner | `:793` |
| `#8B2500` | Hero bg + `avatarDot` border | `:925, :984` |

This is the more frustrating part: **`theme.ts` already solves this.** `LISTER_COLORS` (`theme.ts:63–76`) defines exactly these semantic pairs *with* light and dark variants, and `TIER_COLORS` does the same for tiers. The dashboard bypasses both and retypes the light values as literals. The fix is to consume tokens that already exist.

**8. No desktop containment.** `CLAUDE.md` names Web a first-class platform. Neither screen sets `maxWidth` on its scroll container. At a 1440px viewport, Profile's `roleCard` (`width: "48%", flexGrow: 1`) stretches each role card to ~680px wide to hold a 20px icon and two short lines of text; the three `StatPill`s stretch to ~460px each. The layout is phone-only logic rendered at desktop width.

**9. Dead and vestigial code (minor, but it's the tell).**
   - `s.tierBadge` / `s.tierBadgeText` (`:998–999`) — explicitly commented *"Keep old names as aliases so nothing else breaks"*; neither is referenced anywhere in the file.
   - `trialSalePct` / `trialRentalPct` (`:680–681`) — computed every render, never read. The lead-quota bars they were written for no longer exist.
   - `FlatSiteVisitCard` has a full `status === "cancelled"` → red-dot branch (`:291`), but the API's viewings LATERAL excludes cancelled rows (`route.ts:159`), so the branch is unreachable.

---

## C. Severity-ranked findings

| # | Sev | Finding | Anchor |
| :-- | :-- | :--- | :--- |
| E1 | **HIGH** | `soft_cap` realtors are shown "Founding 500 Pro Active · Unlimited Listings & Handoffs" while the server caps them at 2 listings / 1 handoff. Misreports Protected Surface #4. | `RealtorDashboard.tsx:651, 792–806` |
| E2 | **HIGH** | Starter cap bars count **all** assigned listings incl. drafts, not active ones. Server returns the authoritative `activeListingCount` / `starterOverflowCount`; UI ignores both and derives from `myListings.length`. Misreports Option-B overflow. | `:775–788` vs `route.ts:213–214, 229–232` |
| D1 | **HIGH** | Live Founding-500 scarcity (`claimedCount` of `totalCap: 500`) is returned by the API and never rendered. The scarcity hook of the entire launch is invisible. | `route.ts:233–242`; `store/realtor.ts` (no type) |
| D2 | **HIGH** | Primary conversion CTA is a ~24pt chip at 12px — below the 44pt HIG minimum — and fires an irreversible tier POST with no confirm, no spinner, no success state, no error path. | `:753–766, 1030–1045` |
| F1 | **HIGH** | Zero `accessibilityLabel` / `accessibilityRole` / `accessibilityState` across **47** `Pressable` references in both files. All icon-only controls are silent to VoiceOver. | both files, throughout |
| D3 | **MED** | `🔥 4 nearby handoffs this week` is a hardcoded literal presented as live data. Server returns a real `nearbyHandoffs14d`, and its window is **14 days**, not "this week". | `:787` vs `route.ts:241` |
| D4 | **MED** | The same offer is rendered four different ways: `FREE 3M`, `₹0 till Mar 31`, `Founding 500 Pass (₹10k/yr)`, `₹36,000/yr` struck through. `FREE 3M` is also wrong — the server's `freeTrialThrough` is `2027-03-31`, ~4.2 months from audit date, and no surface states the year. | `profile.tsx:31–32, 269–271, 290–296`; `:765, 769` |
| B7 | **MED** | Eight hardcoded light-mode color pairs used on dark-mode surfaces, while `LISTER_COLORS` / `TIER_COLORS` already provide dark variants. | table in §B7 |
| F2 | **MED** | Fixed-height controls (`height: 38/40/42/46`) + `numberOfLines={1}` will clip at larger Dynamic Type. No `allowFontScaling` strategy. | `profile.tsx:419, 439–443, 277` |
| F3 | **MED** | `actionBtn` (WhatsApp / Call) is 30×30; `signOutPill` 38×38; `tabBtn` ≈33pt. All below 44pt. The WhatsApp/Call pair is the buyer-contact action — Invariant #1 territory. | `:1127`; `profile.tsx:429`; `:1057` |
| G1 | **MED** | No `RefreshControl` on either screen. A lead-triage dashboard has no pull-to-refresh, and `fetchDashboard` runs only on `[token]` — switching tabs back shows stale leads until remount. Profile *does* refetch on focus (`useFocusEffect`), so the two screens behave inconsistently. | `:618, 822`; `profile.tsx:75–80` |
| G2 | **MED** | All errors are silent. `fetchActivity` has a bare `catch {}` (`profile.tsx:68`); `handleRoleSwitch` has no `catch` and no failure branch — a failed role switch leaves the card visually selected with the old role still active. The upgrade POST ignores its response entirely. | `profile.tsx:68, 100–112`; `:755–762` |
| B8 | **MED** | No `maxWidth` container on either screen; phone layout stretches at desktop width. | `profile.tsx:176`; `:684` |
| H1 | **MED** | Profile gutter 18pt vs Dashboard gutter 14pt — layout shifts horizontally when tabbing between them. | `profile.tsx:177` vs `:1005` |
| G3 | **LOW** | Profile empty states are a bare sentence in a box — no icon, no CTA. "No listings posted yet." is a dead end on the primary acquisition surface during a 1,000-listing blitz. | `profile.tsx:360–362, 387–389` |
| G4 | **LOW** | `FlatSiteVisitCard` / `FlatBuyerContactCard` pass `imageUrl` with no fallback; the accordion card falls back to `STOCK`. Inconsistent — flat cards will render a blank 72pt block if the API fallback ever returns null. | `:306, 370` vs `:447–448` |
| G5 | **LOW** | Stock Unsplash fallback can show a photo that is not the property, on a product whose promise is *verified* listings. | `:75–82`; `route.ts` `stockPhoto()` |
| G6 | **LOW** | Role tap immediately mutates role + navigates away, with `selectedRole` set optimistically before the API responds. No confirmation on a workspace-identity change. | `profile.tsx:250–255` |
| G7 | **LOW** | `UPCOMING` header visibility filter omits the `status !== "cancelled"` clause that the list body applies — a header with zero cards if the only upcoming visit is cancelled. Currently unreachable (API filters cancelled) but a latent inconsistency. | `:867` vs `:871` |
| G8 | **LOW** | `tabLabel` has no `numberOfLines`; "Buyer Contacts" + count badge at `flex: 1` across 3 tabs on a 360pt device risks wrapping to 2 lines and breaking the 2px underline alignment. | `:1061` |
| G9 | **LOW** | Dead code: `s.tierBadge`/`s.tierBadgeText`, `trialSalePct`/`trialRentalPct`, unreachable cancelled branch. | `:998, :680, :291` |
| G10 | **LOW** | `StatPill` entrance animation has `useEffect(…, [])` with animated values in a child that remounts on data change — entrance replays on every dashboard refresh. | `:127–132` |

---

## D. Founding-500 conversion clarity

This is where the design debt costs money, so it gets its own section.

### D1 — The scarcity engine is built and unplugged

`GET /api/realtors/dashboard` returns (`src/app/api/realtors/dashboard/route.ts:233–242`):

```json
"foundingProgram": {
  "totalCap": 500,
  "claimedCount": "<live count of pro + pro_plus, +42 offset, capped 499>",
  "annualPriceInr": 10000,
  "standardMonthlyInr": 3000,
  "freeTrialThrough": "2027-03-31",
  "freeShootsIncluded": 5,
  "nearbyHandoffs14d": "<live 14d handoff count, floor 3>"
}
```

`expo-app/store/realtor.ts` has **no `foundingProgram` type**, so the block is dropped at the store boundary and never reaches a component. Every number in the banner is a string literal retyped by hand.

What that costs: a Founding-500 offer with a 500-seat cap and **no visible counter** is just a discount. "**312 of 500 claimed**" is the entire reason the program is called Founding 500. Wiring it is a type addition plus a progress bar — no API work, no migration.

It also means the price copy and the server can drift silently. They already have: the server says free through **2027-03-31**; Profile says "**FREE 3M**" (`profile.tsx:270`), which from 2026-11-25 is ~1.2 months short; and no surface anywhere prints the year.

### D2 — The CTA is built like a dismiss button

`s.upgradeChip` (`:1030–1045`): `paddingVertical: 5`, `fontSize: 12` → roughly **24pt tall**. It sits in `s.trialHeader`, a `flexDirection: "row"` where it shares the line with a `flex: 1` tier title, so it is both the smallest and the right-most element in a secondary header row. Then:

```js
onPress={async () => {
  await fetch(…, { body: JSON.stringify({ action: "upgrade_pro" }) });
  fetchDashboard(token);
}}
```

No `disabled` guard (double-tap sends two POSTs), no pending state, no response check, no error handling, no confirmation, no success moment. A realtor taps the single most consequential button in the product and — for the full round-trip duration — nothing visibly happens. If it fails, nothing visibly happens ever.

### D3 — The value proposition is compressed below legibility

The Starter banner carries six distinct messages inside a `padding: 12` box:

1. Tier name + cap ("Starter Tier (2 Active · 1 Handoff Cap)") — 12px
2. The upgrade CTA — 12px
3. The full value prop — **11px at `rgba(255,255,255,0.72)` on `#0F172A`**
4. Active-listings quota bar — 11px labels
5. Handoff-slot quota bar — 11px labels
6. A FOMO claim — 11px, appended to a bar label

Message 3 — *"First 500 Realtors lock in ₹10,000/yr after Mar 31 (vs ₹3,000/mo standard) + 5 Free HD & Reel Shoots"* — is the actual pitch: a 72% lock-in discount plus ₹-value shoots. It is rendered at the smallest size, the lowest opacity, and the lowest visual priority on the screen. The ₹10,000-vs-₹3,000/mo comparison is buried mid-sentence in parentheses, where its force (₹36,000/yr → ₹10,000/yr) never lands.

Separately, the two quota bars are **punishment framing**: they show the realtor how constrained they are. The identical data framed as opportunity — "Founding 500 unlocks unlimited" — is the same pixels doing conversion work instead of enforcement work.

### D4 — Four renderings of one offer

| Surface | Copy | Anchor |
| :--- | :--- | :--- |
| Profile role card sub | `Founding 500 · ₹10k/yr` | `profile.tsx:31` |
| Profile role card tag | `FREE 3M` | `:270` |
| Profile partner box | `Founding 500 Pass (₹10k/yr)` + `₹36,000/yr` struck + `₹0 till Mar 31` | `:290–296` |
| Dashboard chip | `Founding 500 · ₹0 till Mar 31` | `:765` |
| Dashboard body | `₹10,000/yr after Mar 31 (vs ₹3,000/mo standard)` | `:769` |
| Dashboard Pro banner | `Free through Mar 31 (₹10,000/yr locked)` | `:798` |

Six phrasings, three price framings (`₹10k/yr`, `₹36,000/yr`, `₹3,000/mo`), two duration framings (`3M`, `till Mar 31`), zero years. The math is internally consistent (₹3,000/mo = ₹36,000/yr) but the presentation is not, and `FREE 3M` is factually wrong against the server.

---

## E. Correctness defects that misreport Protected Surface #4

These two are code-provable without screenshots, and they touch Marketplace Invariants #2 and #3.

### E1 — `soft_cap` realtors see "Unlimited Listings & Handoffs"

```js
// RealtorDashboard.tsx:651
const isTrial = realtor.subscriptionTier === "free_trial";
```

The banner is a binary on `isTrial`: `free_trial` → Starter banner; **everything else** → the green *"Founding 500 Pro Active · Free through Mar 31 (₹10,000/yr locked)"* banner with *"Unlimited Listings & Handoffs"* (`:792–806`).

But the server's paid test is different (`route.ts:212`):

```js
const isPaidPro = r.subscription_tier === "pro" || r.subscription_tier === "pro_plus";
maxListingCapacity: isPaidPro ? 999 : 2,
maxHandoffCapacity: isPaidPro ? 999 : 1,
```

`soft_cap` is a real tier — `TIER_COLORS.soft_cap` exists in `theme.ts:85` with label `"Free"`. A `soft_cap` realtor is **not** `isPaidPro`, so the server caps them at 2 listings / 1 handoff, while the UI tells them they have unlimited. Their 3rd listing then silently falls to Option-B Owner Fallback (Invariant #3) with no explanation, because the screen promised no cap existed.

**Fix shape:** derive the banner from the server's capacity fields (`maxListingCapacity`/`maxHandoffCapacity`, or an explicit `isPaidPro` flag added to the payload) rather than from a client-side guess at what `free_trial` means. Four tiers need four defined states, not two.

### E2 — Starter cap bars count drafts as active listings

```js
// RealtorDashboard.tsx:775–788
width: `${Math.min(myListings.length / 2, 1) * 100}%`
"{Math.min(myListings.length, 2)} of 2 Free Cap
 ({myListings.length > 2 ? `${myListings.length - 2} in Owner Fallback` : "0 overflow"})"
```

`myListings` comes from `WHERE l.assigned_realtor_id = ${realtorId}` (`route.ts:162`) with **no status filter** — it includes `draft` listings. In fact the dashboard renders a `"New Owner Handoff"` tag and an `"Accept & Schedule Shoot"` button precisely *because* drafts are present (`:497–525`).

The server computes the authoritative numbers right there and returns them:

```js
const activeCount = myListings.filter(m => m.status === "active").length;   // route.ts:213
const starterOverflowCount = !isPaidPro && activeCount > 2 ? activeCount - 2 : 0;  // :214
```

Both are in the response (`activeListingCount`, `starterOverflowCount`) and both are ignored.

**Concrete failure:** a Starter realtor with 1 active listing and 2 unaccepted drafts sees *"2 of 2 Free Cap (1 in Owner Fallback)"* — bar full, overflow claimed — when the true Option-B state is 1 of 2 with 0 overflow. The realtor believes they are capped and stops accepting handoffs. That is a direct revenue-path regression against Invariant #3, displayed on the surface that governs it.

The handoff bar has the same shape: `Math.min(myListings.length, 1)` uses total assigned listings as a proxy for active handoffs, where the server has `maxHandoffCapacity`.

---

## F. Accessibility & platform parity

**F1 — No accessibility layer at all.** Across both files: zero `accessibilityLabel`, zero `accessibilityRole`, zero `accessibilityState`, zero `accessibilityHint`. Consequences:

- Icon-only controls announce nothing: sign-out (`profile.tsx:194`), WhatsApp (`:234`), Call (`:240`), accordion chevron (`:558`), `navigate-circle-outline` shoot row (`profile.tsx:405`).
- The tab bars (`TabBar` `:160`, Profile's `tabPill` `:339`) are `Pressable`s without `accessibilityRole="tab"` / `accessibilityState={{selected}}` — a screen-reader user cannot tell which tab is active, because active state is conveyed *only* by a 2px underline and a color shift.
- `statusBadge` LIVE / SHOOT PENDING (`profile.tsx:378`) and the `viewingDot` status colors (`:264, :325`) encode status in **color alone** — WCAG 2.2 §1.4.1 failure. The dot is 8×8 with no text equivalent.

**F2 — Dynamic Type will clip.** Fixed heights with no min-height escape: `button` 46, `activateBtn` 42, `input` 40, `tabPill` 38, `signOutPill` 38, `actionBtn` 30, `statIconWrap` 38. Combined with `numberOfLines={1}` on `roleSub` (`profile.tsx:277`), `cardAddress`, `flatAddress` and `cardCity`, a realtor at an accessibility text size loses content rather than reflowing it.

**F3 — Touch targets below 44pt.** `actionBtn` 30×30 is the most serious: it is the WhatsApp/Call pair, i.e. the buyer-contact path that Invariant #1 exists to protect. `signOutPill` 38×38 and `upgradeChip` ~24pt follow.

**Contrast spot-checks** — *recomputed 2026-11-25 under WCAG 2.x sRGB alpha-compositing by the Principal UX Designer; the four values originally published here were wrong. See `uxd-review-addendum.md` §2 for the correction log and the verifier script.*

| Surface | Computed | Verdict |
| :--- | :--- | :--- |
| `greeting` `rgba(255,255,255,0.7)` on `#8B2500` | **5.09:1** | **PASSES AA** (≥4.5:1). Not a defect — the original "3.4:1 / fails AA" claim is withdrawn. |
| `scoreLabel` `rgba(255,255,255,0.55)` on `#8B2500` | **3.70:1** | **Fails AA** for normal text (≥4.5:1); passes AA Large (≥3:1). Finding stands, severity was overstated (originally "2.2:1 / clear failure"). |
| Starter banner body `rgba(255,255,255,0.72)` on `#0F172A` | **9.60:1** | Passes comfortably. The 11px size, not the contrast, is the issue. |
| `tierPill` `free_trial` `#475569` on `#F1F5F9` | **6.92:1** | Passes. |

Net: of the four spot-checks, **one claimed failure does not exist** and **one is real but less severe than published**. The only genuine contrast defect on these two screens is `scoreLabel`.

**Platform parity.** `Platform.select()` is used correctly for all shadows (`statPill`, `card`, `flatCard`, `upgradeChip`, `avatarRingOuter`) and `cursor: "pointer"` is web-guarded everywhere — both CLAUDE.md rules are **satisfied**. Credit where due. Neither file has a `.web.tsx` counterpart, so the Paired File Rule is not triggered; any future split must mirror.

---

## G. What MUST be preserved (per `PROTECTED_SURFACES.md`)

Any approved implementation ticket must treat the following as **non-negotiable**. A regression in any row is a merge blocker.

### From Protected Surface #4 — Founding 500 Pricing & Option B

| Must preserve | Current anchor |
| :--- | :--- |
| Exact price ladder: `₹0 till Mar 31` → `₹10,000/yr` vs `₹3,000/mo` standard | `:765, 769, 798`; `profile.tsx:296` |
| `₹36,000/yr` strike-through anchor on the Realtor role card | `profile.tsx:31, 293–295` |
| Starter cap semantics: **2** active listings, **1** active handoff | `:751, 778, 787` |
| Option-B overflow surfacing: `"N in Owner Fallback"` | `:778` |
| `5 Free HD & Reel Shoots` inclusion | `:769` |
| Zero greyed-out seller option — never disable or gate a realtor the server says is available (Invariant #2) | — |
| Builder Pro anchor `₹4,999/mo` | `profile.tsx:32` |

> Note: E1/E2 propose changing the *numbers' source* (server-authoritative instead of client-derived) and the *framing*, **not** the policy. The cap stays 2/1 and the ladder stays identical. Fixing E2 will make the displayed overflow count *change* for realtors holding drafts — that is the point, and QA must baseline it deliberately rather than flag it as a regression.

### From Protected Surface #5 — Founder Ops Command Center

| Must preserve | Current anchor |
| :--- | :--- |
| 1-tap Ops entry from Profile in the **signed-out** state | `profile.tsx:143–165` |
| 1-tap Ops entry from Profile in the **signed-in** state | `profile.tsx:200–240` |
| Ops subtitle content: `1,000-Listing Blitz · Founding 500 Realtors · UAT Simulator & QA` | `profile.tsx:235` |
| Route target `/ops` unchanged | `profile.tsx:144, 201` |

> The Ops card is the *only* gateway to Surface #5. Restyling it to fit the Blab palette is in scope; reducing its prominence, moving it below the fold, or removing either auth-state entry point is **not**.

### Role switcher & routing (Profile)

| Must preserve | Current anchor |
| :--- | :--- |
| All four personas: `Member`, `Realtor`, `Builder`, `Shutterbug` | `profile.tsx:30–34` |
| RERA + company-name capture gating for Realtor and Builder | `profile.tsx:286–314` |
| `subscriptionTier: "pro"` on realtor activation | `profile.tsx:97` |
| Post-switch routing: shutterbug → `/shutterbug/jobs`; realtor → `/(tabs)/dashboard` | `profile.tsx:104–108` |
| Activity tabs `My Listings (n)` / `My Shoots (n)`; shoot row → `/tracking/[id]` | `profile.tsx:332–335, 394` |
| Gate Code (arrival OTP) display on shoot rows | `profile.tsx:402` |

### Realtor Dashboard structure

| Must preserve | Current anchor |
| :--- | :--- |
| Three-tab IA: `My Properties` / `Site Visits` / `Buyer Contacts` with live counts | `:155–158` |
| `New Owner Handoff` draft tag + `Accept & Schedule Shoot` → `publish_and_schedule` | `:497–525` |
| WhatsApp + Call always available on unresponded contacts; auto-`respondToEnquiry` on tap (Invariant #1) | `:203–213, 232–247` |
| `TIER_COLORS` tier badge mapping and `realtorScore` + `pts` display | `:725–730` |
| Uppercase tracked group headers (`BUYER CONTACTS`, `SITE VISITS`, `UPCOMING`, `PAST`) — matches the `DEVELOPER UNITS` / `OWNER UNITS` convention in Surface #2 | `:584, 595, 869, 879` |
| Accordion `hasActivity ? toggle : navigate` branch — deliberately avoids nested `Pressable` iOS touch conflict | `:466–472` |
| `key={activeTab}` scroll reset on tab switch | `:826` |

### Out of scope for this audit

`theme.ts` is a shared component under `PROTECTED_SURFACES.md` §7 — any change to it requires before/after screenshots across **all** Protected Surfaces, not just Flow #1. The token additions proposed in §H1 are therefore specified as **additive only** (new exports; no edits to existing `COLORS`, `LISTER_COLORS`, `TIER_COLORS`, `MAP_STYLES` values). The dark-mode `markerBg: rgb(255,253,0)` neon yellow is noted as a palette question for a future audit and explicitly **not** touched here.

---

## H. Before / After design spec

Scoped for Founder CEO approval. Phase 1 is correctness + conversion and carries no token risk. Phase 2 is the visual refactor and should be gated behind captured baselines.

### A note on applying Impeccable

Impeccable's literal palette is gold-on-paper (`kinpaku` on chroma-0 paper) and is **not** Blab's brand — Blab is warm maroon `#8B2500` on `#FAFAF8`. What transfers is the **doctrine**, which is where the value is:

| Impeccable rule | Blab translation |
| :--- | :--- |
| "Gold is jewelry" — the accent fills a mark, a hairline, a lit dot, one primary button; never a panel | Maroon is jewelry. No more slate-navy and emerald panels; maroon fills the primary CTA, the active tab underline, the lit indicator. One accent. |
| "Gold text is a bug" — colored text must clear 4.5:1 | Every colored text value gets a contrast-checked dark-mode pair. Kills the `rgba(255,255,255,0.55)` score label. |
| "Mono means machine" — labels/counts/tags are mono, uppercase, tracked 0.12em | Section labels and stat counts go mono-tracked. The `UPCOMING` / `BUYER CONTACTS` headers already do this. |
| "Flat by default; depth only on instruments" | Cards go flat with a hairline border. Shadow is reserved for the primary CTA and the active segmented cap. Removes the 76pt avatar glow ring. |
| "Dense UI: 11px is the floor for anything **functional**" (DESIGN.md:137) | 11px floor enforced on functional text — which **kills the 10px `tabBadgeText`** (a count; Impeccable explicitly classes counts as functional mono). **It does not kill the 9px `freeTagText`:** Impeccable's own `typography.tag` is **9px** mono uppercase (DESIGN.md:76, :173), i.e. a tag is deliberately exempt from the functional floor. §H3 still moves `FREE 3M` up to 11px, but on Blab-specific grounds (it must read as the offer, not as a decoration), **not** on Impeccable's authority. |
| "Severity rule" — one color per state, consistently | `LIVE`/`PENDING`/`OVERFLOW` get one defined semantic color each, with text labels alongside (fixes WCAG 1.4.1). |

### H1 — Token layer (additive to `theme.ts`, new exports only)

**Before:** 12 font sizes, 6 weights (`400 500 600 700 800 900`), **0** line-heights, 22 distinct spacing values, 8 hardcoded light-only color pairs, 2 different screen gutters. *(Corrected: an earlier revision said "13 sizes, 8 weights, 19 spacing values" and contradicted §B1's own weight count.)*

**After:**

```ts
// ADDITIVE — no existing export modified
export const TYPE = {
  display:  { fontSize: 26, fontWeight: "700", lineHeight: 31, letterSpacing: -0.5 },
  stat:     { fontSize: 24, fontWeight: "700", lineHeight: 28, letterSpacing: -0.6 },
  title:    { fontSize: 16, fontWeight: "600", lineHeight: 21 },
  heading:  { fontSize: 14, fontWeight: "600", lineHeight: 19 },
  body:     { fontSize: 13, fontWeight: "400", lineHeight: 19 },
  bodyBold: { fontSize: 13, fontWeight: "600", lineHeight: 19 },
  caption:  { fontSize: 12, fontWeight: "400", lineHeight: 17 },
  label:    { fontSize: 11, fontWeight: "600", lineHeight: 14, letterSpacing: 1.1,
              textTransform: "uppercase", fontFamily: MONO },
  tag:      { fontSize: 11, fontWeight: "600", lineHeight: 14, letterSpacing: 0.4 },
} as const;
// 9 roles replace 13 sizes. Max weight 700 — no 800/900. Every role has a lineHeight.

export const SPACE = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const GUTTER = SPACE.lg;            // 16 — one gutter, both screens
export const RADIUS = { sm: 6, md: 10, card: 14, sheet: 16, pill: 999 } as const;
export const MAX_CONTENT_WIDTH = 720;      // desktop containment
export const HIT = 44;                     // HIG minimum

// Dark-aware semantic pairs, same shape as the existing LISTER_COLORS
export const SEMANTIC = {
  sale:     { light: { bg: "#FEF3C7", text: "#92400E" }, dark: { bg: "#3A2A08", text: "#FCD34D" } },
  rent:     { light: { bg: "#EFF6FF", text: "#1D4ED8" }, dark: { bg: "#172554", text: "#93C5FD" } },
  success:  { light: { bg: "#D1FAE5", text: "#065F46" }, dark: { bg: "#064E3B", text: "#6EE7B7" } },
  pending:  { light: { bg: "#FEF3C7", text: "#92400E" }, dark: { bg: "#3A2A08", text: "#FCD34D" } },
  live:     { light: { bg: "#DCFCE7", text: "#15803D" }, dark: { bg: "#052E16", text: "#4ADE80" } },
  overflow: { light: { bg: "#FFEDD5", text: "#C2410C" }, dark: { bg: "#431407", text: "#FDBA74" } },
  whatsapp: { light: { bg: "#F0FFF4", text: "#128C7E" }, dark: { bg: "#052E1A", text: "#25D366" } },
} as const;
```

*All dark values are proposals requiring contrast verification against `COLORS.dark.card = #1A1A1A` before implementation — that verification is a Phase 2 acceptance criterion, not an assumption.*

### H2 — Profile: Ops card

| | Before | After |
| :--- | :--- | :--- |
| Surface | `#0F172A` slate on `#FAFAF8` warm paper — reads as a foreign component | `colors.card` + `borderColor: colors.border`, with a maroon `${colors.primary}12` icon tile. Theme-aware in both modes. |
| Accent | `#38BDF8` sky blue (not in the Blab palette) | `colors.primary` maroon — Blab's one accent |
| Padding | `13` (1pt off its neighbours) | `SPACE.lg` (16) |
| Signal | Loses "this is the privileged founder surface" when de-slated | Gained back via a mono `OPS` label chip + `pulse` icon in a maroon tile. Prominence preserved per §G. |
| Prominence | Unchanged — stays directly under the header card, above the role grid, in **both** auth states | **Unchanged — mandatory** |

### H3 — Profile: role grid & Founding-500 clarity

| | Before | After |
| :--- | :--- | :--- |
| Offer tag | `FREE 3M` at 9px (below floor, factually wrong vs server `2027-03-31`) | `FREE` at `TYPE.tag` (11px), with the duration moved to the partner box where the full offer lives. Single source: server `freeTrialThrough`. |
| Price anchor | `₹36,000/yr` struck through at 12px, beside `₹0 till Mar 31` at 13px/**900** | Two-line stack: `₹0` at `TYPE.stat` with `through 31 Mar 2027` at `TYPE.caption` beneath; `₹36,000/yr` struck at `TYPE.caption`. Explicit year. Max weight 700. |
| Scarcity | Absent | `N of 500 Founding seats claimed` from `foundingProgram.claimedCount`, as a `TYPE.label` line under the Realtor card |
| Card width | `48%` + `flexGrow: 1`, unbounded on web | Same grid inside a `MAX_CONTENT_WIDTH: 720` container |
| Activation | Immediate irreversible switch on tap for non-RERA roles; optimistic `selectedRole` before response | Tap selects; a primary `Switch to {role}` CTA commits. Loading + error states on the CTA. Role reverts on failure. |
| A11y | None | `accessibilityRole="radio"` + `accessibilityState={{ checked }}` per card |

### H4 — Dashboard hero

| | Before | After |
| :--- | :--- | :--- |
| Avatar | 76×76, double ring, 10px orange glow, green status dot | 52×52, flat, 1px `rgba(255,255,255,0.25)` hairline. Status dot kept (12pt, it carries real meaning). |
| Decoration | `heroBg1` 160pt + `heroBg2` 100pt blur circles | Removed. Impeccable: flat by default. |
| Background | Hardcoded `#8B2500` in both themes | `colors.primary` — picks up `#C4501A` in dark mode |
| Name | `fontSize: 26, fontWeight: "800"` | `TYPE.display` (26/700/lh 31) |
| Greeting | `rgba(255,255,255,0.7)` = **5.09:1 — already passes AA** | **No contrast change required.** Keep `0.7`. (Originally proposed `0.86` to fix a defect that does not exist.) |
| Score label | `rgba(255,255,255,0.55)` = **3.70:1** — fails AA normal text | `rgba(255,255,255,0.78)` = **5.97:1** (verified); `pts` becomes a `TYPE.label` mono suffix |
| Height | ~140pt before the stat row | ~96pt — **~44pt returned to the fold** |

### H5 — Dashboard Founding-500 banner (the conversion rebuild)

This is the highest-value change in the audit.

**Before:** a `#0F172A` slate box with six messages at 11–12px, a 24pt CTA chip in a secondary header row, two punishment-framed quota bars, and a hardcoded FOMO number.

**After** — three stacked zones inside one `colors.card` panel with a 1px maroon border:

**Zone 1 — Scarcity (new, server-driven)**
```
FOUNDING 500                      312 / 500 CLAIMED     ← TYPE.label, mono
▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░                        ← 4pt maroon fill
```
From `foundingProgram.claimedCount` / `totalCap`. **Zero API work.**

**Zone 2 — Value, legibly**
```
₹0  through 31 Mar 2027             ← TYPE.stat + TYPE.caption
then ₹10,000/yr — locked for life   ← TYPE.bodyBold
₹36,000/yr standard                 ← TYPE.caption, struck
✓ 5 free HD + 9:16 Reel shoots      ← TYPE.body, Ionicon not emoji
✓ Unlimited listings & handoffs
```
The ₹36,000 → ₹10,000 comparison becomes the headline instead of a parenthetical. All strings sourced from `foundingProgram`, not literals. Exact ladder preserved per §G.

**Zone 3 — The CTA, built like a CTA**
```
┌──────────────────────────────────────────┐
│  Claim my Founding 500 seat        →     │   48pt tall, TYPE.title,
└──────────────────────────────────────────┘   colors.primary, full width
```
- **48pt** tall, full width, `RADIUS.md` — the largest element in the panel
- `disabled` while pending; inline `ActivityIndicator`
- Response checked; error renders inline, retryable
- Success → the panel animates to the Pro state (the "claimed" moment that currently does not exist)
- A lightweight confirm step before the POST, since this is a billing-tier commitment
- `accessibilityLabel="Claim your Founding 500 seat: free through 31 March 2027, then ₹10,000 per year"`

**Starter caps — reframed and corrected (fixes E2):**
```
STARTER CAPS                                      ← TYPE.label
Active map listings   1 of 2     ▓▓▓▓░░░░         ← from activeListingCount / maxListingCapacity
Seller handoff slot   0 of 1     ░░░░░░░░         ← from maxHandoffCapacity
                                                     (0 in Owner Fallback)  ← starterOverflowCount
4 handoffs assigned near you in the last 14 days  ← nearbyHandoffs14d, honest window
```
Every number server-authoritative. `"N in Owner Fallback"` string preserved verbatim per §G. The `🔥` emoji and the fabricated "this week" are gone.

**Tier states — four, not two (fixes E1):**

| Tier | Banner |
| :--- | :--- |
| `free_trial` | Full Founding-500 panel above |
| `soft_cap` | Same panel, headed `FREE TIER — 2 LISTINGS / 1 HANDOFF`. **Must not say "unlimited".** |
| `pro` | Compact Pro confirmation strip: `Founding 500 Pro · free through 31 Mar 2027 · ₹10,000/yr locked` |
| `pro_plus` | As `pro`, with the Pro+ tier badge |

Driven by server capacity fields, not by `=== "free_trial"`.

### H6 — Dashboard stat pills

| | Before | After |
| :--- | :--- | :--- |
| Value type | `fontSize: 28, fontWeight: "800", letterSpacing: -1` | `TYPE.stat` (24/700) — still dominant, no longer shouting |
| Label | `"New Contacts\n(7 days)"` — hardcoded newline | `TYPE.label` with real `lineHeight`; no `\n` |
| Metric 1 | Sum of `enquiryCount` (total, not actionable) | `stats.openEnquiries` — **"Open contacts"**, the number that drives action. Server already returns it, currently unused. |
| Metric 3 | `myListings.length` (includes drafts) | `stats.activeListings` — server-authoritative, consistent with the cap bars |
| Icon tile | 38×38, `RADIUS` 12 | 32×32, `RADIUS.sm` — flat, less chrome |
| Depth | Shadow on every pill | Hairline border only. Impeccable: flat by default. |
| A11y | None | `accessibilityLabel="{value} {label}"` per pill |
| Animation | Entrance replays on every refresh | Mount-once guard |

### H7 — Dashboard tab bar

| | Before | After |
| :--- | :--- | :--- |
| Height | `paddingVertical: 10` + 13px icon ≈ 33pt | `minHeight: HIT` (44) |
| Label | 11px, no `numberOfLines` — wraps on 360pt devices | `TYPE.label` mono-tracked, `numberOfLines={1}` |
| Badge | 10px (below floor) | 11px, `RADIUS.pill` |
| Active state | 2px underline + color (color-only for a11y) | Underline + color + `accessibilityState={{ selected: true }}` |
| Role | `Pressable` | `accessibilityRole="tab"` |

### H8 — Dashboard cards

| | Before | After |
| :--- | :--- | :--- |
| Depth | `shadowRadius: 10` on `card`, `6` on `flatCard` | Hairline `colors.border`; shadow reserved for the CTA |
| Tags | 8 hardcoded light-only pairs | `SEMANTIC[...]` with dark variants |
| WhatsApp / Call | 30×30 | 44×44 with `HIT`, `SEMANTIC.whatsapp` fill |
| `"Responded ✓"` | Text glyph | `checkmark-circle` Ionicon + `SEMANTIC.success` text |
| Status dots | 8pt, color-only | 8pt dot **plus** a `TYPE.tag` text label |
| Flat-card images | No fallback | Same `STOCK` fallback the accordion card uses |
| Thumbnails | `88` / `72` | `88` both — one value |
| A11y | None | Labels on every row and control |

### H9 — Shared behaviour

| | Before | After |
| :--- | :--- | :--- |
| Refresh | None on Dashboard; focus-refetch on Profile | `RefreshControl` on both; Dashboard refetches on focus — consistent |
| Errors | `catch {}`; no failure branch on role switch or upgrade | Inline retryable error on every mutation; role reverts on failure |
| Desktop | Unbounded | `MAX_CONTENT_WIDTH: 720`, centered, both screens |
| Gutter | Profile 18 / Dashboard 14 | `GUTTER` 16 on both — no shift when tabbing |
| Profile empty states | Bare sentence | Icon + title + CTA (`Post your first listing →`) — supports the 1,000-listing blitz |
| Emoji | `👑 👋 🔥 ✓` | Ionicons + a real Founding-500 crown asset |
| Dead code | 3 blocks | Removed |

---

## I. Proposed ticket slicing — NOT OPENED, pending CEO approval

Per BLA-2 deliverable #4, no engineering ticket has been created. Proposed shape for approval:

| # | Ticket | Scope | Risk | Protected Surfaces touched |
| :-- | :--- | :--- | :--- | :--- |
| 1 | **Server-authoritative Founding-500 & cap data** | Add `foundingProgram` + `maxHandoffCapacity` / `starterOverflowCount` / `activeListingCount` to `store/realtor.ts` types; replace all client-derived cap math. Fixes **E1, E2, D3**. | **Low** — types + reads; no API change | #4 (display only; policy unchanged) |
| 2 | **Founding-500 conversion panel rebuild** | §H5 in full: scarcity bar, value stack, 48pt CTA with confirm/pending/error/success, four tier states. Fixes **D1, D2, D3, D4**. | **Med** — the revenue surface | #4 |
| 3 | **Accessibility pass** | §F1–F3 across both files: labels, roles, states, 44pt targets, contrast fixes, Dynamic Type. Fixes **F1, F2, F3**. | **Low** — additive | none |
| 4 | **Additive token layer** | §H1 exports in `theme.ts`. **No existing export modified.** | **Low** — but `theme.ts` is shared → full Protected-Surface screenshot sweep required | #7 (shared component) |
| 5 | **Visual refactor** | §H2, H3, H4, H6, H7, H8, H9 applied on top of ticket 4. Fixes **B1–B9, G1–G10**. | **Med** — broad surface | #4, #5 |
| 0 | **Screenshot baseline capture** | `qa-baseline.md` §2 matrix. **Blocks tickets 2, 4, 5.** | **None** — read-only | all of Flow #1 |

**Sequencing recommendation:** ticket 0 → 1 → 3 in parallel → 2 → 4 → 5. Tickets 0, 1 and 3 are independently shippable and carry the correctness and compliance wins; 2 carries the revenue win and is worth doing before the Founding 500 push even if the visual refactor waits.

---

## J. Questions for Founder CEO

1. **E1 tier policy.** Is `soft_cap` intended to be a capped free tier (server behaviour: 2/1) or an uncapped grandfathered tier (what the UI currently promises)? The fix differs depending on the answer. Server says capped.
2. **E2 blast radius.** Fixing the cap bars will change the numbers realtors currently see — a Starter realtor with drafts will go from "2 of 2, 1 in overflow" to "1 of 2, 0 overflow". Confirm this is a correction to baseline, not a regression.
3. **`FREE 3M` copy.** Server says `freeTrialThrough: "2027-03-31"`. Should all surfaces standardise on "free through 31 Mar 2027", and is the year safe to display publicly?
4. **Scarcity counter.** `claimedCount` is `min(499, real_count + 42)` — a seeded offset. Approved to display publicly as "N of 500 claimed"?
5. **Ops card restyle.** §H2 moves it from slate-navy to the Blab card palette. Prominence and both auth-state entries are preserved. Does losing the dark treatment lose signal you want kept?
6. **Hero reduction.** §H4 cuts the avatar from 76 to 52 and drops the glow ring to return ~44pt to the fold. Confirm the premium-avatar treatment is not a deliberate brand requirement.
7. **`theme.ts` unlock.** Ticket 4 is additive-only but still touches a shared component under §7, triggering a full Protected-Surface screenshot sweep. Approve the unlock, or keep the tokens local to Flow #1 files for now?
8. **Screenshots.** Should I run ticket 0 (capture the baseline matrix on iOS Simulator + Web) as the next heartbeat? It requires booting the dev server and simulator, and remains fully read-only with respect to app source.

---

*End of AUDIT-001 critique. Companion QA regression baseline: `qa-baselines/audit-001/qa-baseline.md`.*
