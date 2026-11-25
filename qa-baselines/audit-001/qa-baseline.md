# AUDIT-001 — QA Regression Baseline
## Flow #1: Profile & Realtor Dashboard

| Field | Value |
| :--- | :--- |
| **Ticket** | BLA-2 `[AUDIT-001]` |
| **Baseline date** | 2026-11-25 |
| **Status** | **Code baseline recorded. Screenshot baseline NOT yet captured.** |
| **Purpose** | Pre-change reference so any approved implementation can be proven non-regressive against `PROTECTED_SURFACES.md` |
| **Companion** | `uxd-critique.md` |

---

## 1. Code baseline (recorded)

Frozen reference for the audited revision. Any implementation PR must diff against this.

### 1.1 Files in scope

| File | Lines | SHA-256 (first 16) |
| :--- | :--- | :--- |
| `expo-app/app/(tabs)/profile.tsx` | 452 | see §1.2 |
| `expo-app/components/realtor/RealtorDashboard.tsx` | 1140 | see §1.2 |

### 1.2 Reproducing the hashes

```bash
cd /Users/adi/Projects/blab-web-agents
shasum -a 256 \
  "expo-app/app/(tabs)/profile.tsx" \
  "expo-app/components/realtor/RealtorDashboard.tsx" \
  expo-app/lib/theme.ts \
  expo-app/store/realtor.ts \
  src/app/api/realtors/dashboard/route.ts
```

Audited git revision: `28eccc6` on branch `agent/uxd-audit` (working tree clean for all files above — only `.claude/` was untracked at audit time).

### 1.3 Structural inventory (must survive any refactor)

**`profile.tsx`**
- Signed-out state: icon + `Sign In to Blab` + phone CTA + **Ops entry card** (`:143–165`)
- Signed-in state, in order: header card → **Ops entry card** (`:200–240`) → `WORKSPACE MODE` role grid (4 cards) → conditional RERA partner box → activity tab row → listings/shoots list
- 4 role cards: `user` / `realtor` / `developer` / `shutterbug`
- Routing: shutterbug → `/shutterbug/jobs`; realtor → `/(tabs)/dashboard`; listing row → `/property/[id]`; shoot row → `/tracking/[id]`
- Refetch: `useFocusEffect` → `GET /api/users/my-activity`

**`RealtorDashboard.tsx`**
- Non-scrolling top: hero → 3 stat pills → tier banner → tab bar
- Scrolling: tab-dependent list, `key={activeTab}` scroll reset
- 3 tabs: `properties` / `siteVisits` / `buyerContacts`
- Sub-components: `StatPill`, `TabBar`, `EnquiryRow`, `ViewingRow`, `FlatSiteVisitCard`, `FlatBuyerContactCard`, `PropertyActivityCard`
- Gate: `dashboard.tsx` renders a lock card unless `token && user?.role === "realtor"`
- Mutations: `respondToEnquiry` (store), `publish_and_schedule` (POST), `upgrade_pro` (POST)

### 1.4 Protected string inventory (exact-match assertions)

Any of these strings disappearing or changing is a **merge blocker** unless the ticket explicitly authorises it.

| String | Source |
| :--- | :--- |
| `Founder Ops Command Center` | `profile.tsx:232` |
| `Open Founder Ops Command Center →` | `profile.tsx:163` |
| `1,000-Listing Blitz · Founding 500 Realtors · UAT Simulator & QA` | `profile.tsx:235` |
| `WORKSPACE MODE` | `profile.tsx:243` |
| `Founding 500 · ₹10k/yr` | `profile.tsx:31` |
| `₹36,000/yr` | `profile.tsx:31` |
| `₹4,999/mo` | `profile.tsx:32` |
| `₹0 till Mar 31` | `profile.tsx:296`, `:765` |
| `Founding 500 Pass (₹10k/yr)` | `profile.tsx:290` |
| `Starter Tier (2 Active · 1 Handoff Cap)` | `:751` |
| `First 500 Realtors lock in ₹10,000/yr after Mar 31 (vs ₹3,000/mo standard) + 5 Free HD & Reel Shoots.` | `:769` |
| `Active Map Listings` / `Seller Handoff Slot` | `:773`, `:782` |
| `of 2 Free Cap` / `in Owner Fallback` / `0 overflow` | `:778` |
| `of 1 Active` | `:787` |
| `Founding 500 Pro Active · Free through Mar 31 (₹10,000/yr locked)` | `:798` |
| `Unlimited Listings & Handoffs` | `:803` ⚠️ **see E1 — must not show for `soft_cap`** |
| `My Properties` / `Site Visits` / `Buyer Contacts` | `:156–158` |
| `New Owner Handoff` | `:499` |
| `Accept & Schedule Shoot` / `Booking Shoot…` | `:522` |
| `BUYER CONTACTS` / `SITE VISITS` / `UPCOMING` / `PAST` | `:584`, `:595`, `:869`, `:879` |
| `My Listings (n)` / `My Shoots (n)` | `profile.tsx:334–335` |
| `Gate Code` | `profile.tsx:402` |
| `LIVE` / `SHOOT PENDING` | `profile.tsx:380` |

### 1.5 Baseline grep assertions

Runnable as a cheap pre-merge gate:

```bash
cd /Users/adi/Projects/blab-web-agents

# Ops entry must exist in BOTH auth states (expect 2)
grep -c 'router.push("/ops"' "expo-app/app/(tabs)/profile.tsx"

# All four personas present (expect 4)
grep -cE '^\s+\{ id: "(user|realtor|developer|shutterbug)"' "expo-app/app/(tabs)/profile.tsx"

# Founding 500 price ladder intact (expect >=1 each)
grep -c '₹10,000/yr'  expo-app/components/realtor/RealtorDashboard.tsx
grep -c '₹3,000/mo'   expo-app/components/realtor/RealtorDashboard.tsx
grep -c 'Owner Fallback' expo-app/components/realtor/RealtorDashboard.tsx

# Three dashboard tabs intact (expect 3)
grep -cE 'id: "(properties|siteVisits|buyerContacts)"' expo-app/components/realtor/RealtorDashboard.tsx

# CLAUDE.md platform rules: no unguarded boxShadow (expect 0)
grep -n 'boxShadow' expo-app/components/realtor/RealtorDashboard.tsx | grep -v 'web:' | wc -l

# CLAUDE.md platform rules: no unguarded cursor (expect 0)
grep -n 'cursor: "pointer"' "expo-app/app/(tabs)/profile.tsx" expo-app/components/realtor/RealtorDashboard.tsx \
  | grep -v 'Platform.OS === "web"' | grep -v 'webCursor' | wc -l
```

**Audited-revision results (verified by execution):** `2`, `4`, `2`, `1`, `1`, `3`, `0`, `0` — all pass.

### 1.6 Accessibility baseline (deliberately recorded as zero)

```bash
grep -c 'accessibilityLabel\|accessibilityRole\|accessibilityState\|accessibilityHint' \
  "expo-app/app/(tabs)/profile.tsx" expo-app/components/realtor/RealtorDashboard.tsx
```

**Audited-revision result: `0` and `0`.** Recorded so the accessibility ticket has a measurable floor. Post-fix target: ≥ 1 label on every icon-only control; `accessibilityRole="tab"` + `accessibilityState` on both tab bars.

### 1.7 Layer-1 verification state at audit time

Not run — this audit wrote zero files under `expo-app/` or `src/`, so the Two-Layer Verification SOP (`CLAUDE.md` §3.6) has no diff to gate. For any implementation ticket, Layer 1 is:

```bash
cd expo-app && npx tsc --noEmit        # expect 0 errors
curl -s localhost:3000/api/ops/qa-runner   # expect ALL_PASS
```

---

## 2. Screenshot baseline matrix (NOT YET CAPTURED — blocks tickets 2, 4, 5)

**No verified screenshots exist in this repository.** `find` across the tree returns only `expo-app/assets/images/` app icons and the splash asset. Until this matrix is captured, no visual change to Flow #1 can be proven non-regressive.

### 2.1 Required captures — 24 frames

Save to `qa-baselines/audit-001/screenshots/before/` as `{screen}-{state}-{platform}-{theme}.png`.

| # | Screen | State | Platform | Theme |
| :-- | :--- | :--- | :--- | :--- |
| 1–2 | Profile | signed out (Ops card visible) | iOS, Web | light |
| 3–4 | Profile | signed out | iOS, Web | dark |
| 5–6 | Profile | signed in, role `user`, has listings | iOS, Web | light |
| 7–8 | Profile | signed in, role `user` | iOS, Web | dark |
| 9–10 | Profile | role `realtor` selected, RERA box open | iOS, Web | light |
| 11–12 | Profile | `My Shoots` tab, ≥1 shoot with Gate Code | iOS, Web | light |
| 13–14 | Profile | both tabs empty | iOS, Web | light |
| 15–16 | Dashboard | `free_trial`, Starter banner + quota bars | iOS, Web | light |
| 17–18 | Dashboard | `free_trial` | iOS, Web | dark |
| 19–20 | Dashboard | `pro`, green Pro banner | iOS, Web | light |
| 21 | Dashboard | `soft_cap` ⚠️ **E1 evidence frame** | iOS | light |
| 22 | Dashboard | `properties` tab, ≥1 draft (`New Owner Handoff`) | iOS | light |
| 23 | Dashboard | `siteVisits` tab, UPCOMING + PAST both populated | iOS | light |
| 24 | Dashboard | `buyerContacts` tab, mixed responded/unresponded | iOS | light |

**Device targets:** iPhone 15 (393×852) as primary; iPhone SE (375×667) additionally for frames 15 and 16 to measure the fold. Web at 1440×900 **and** 390×844 to expose the missing `maxWidth` (§B8).

### 2.2 Capture procedure

```bash
# Terminal 1 — API
cd /Users/adi/Projects/blab-web-agents && npm run dev

# Terminal 2 — Expo
cd /Users/adi/Projects/blab-web-agents/expo-app && npx expo start

# iOS Simulator
xcrun simctl boot "iPhone 15"
xcrun simctl io booted screenshot \
  qa-baselines/audit-001/screenshots/before/dashboard-freetrial-ios-light.png

# Theme toggle
xcrun simctl ui booted appearance dark   # | light

# Web — Chrome DevTools device toolbar at 1440×900 and 390×844
```

Tier fixtures (frames 19–21) require seeding `users.subscription_tier`. Prefer the UAT simulator in `/ops` (`PROTECTED_SURFACES.md` #5) over direct DB writes, and **never** against PROD — `BLAB_ENV !== 'production'` must be asserted before any seeding.

### 2.3 Measurements to record alongside each frame

So §H claims can be verified rather than asserted:

| Measurement | Frames | Why |
| :--- | :--- | :--- |
| Vertical offset of the first property card | 15, 16 | Validates the "~340pt before content" claim and the ~44pt §H4 recovery |
| Does any content clip at Dynamic Type XXL? | 9, 10, 15 | F2 |
| Rendered width of `roleCard` at 1440px | 6 | B8 |
| Rendered width of `StatPill` at 1440px | 16 | B8 |
| Measured contrast of `greeting` and `scoreLabel` | 15 | F-contrast (computed 3.4:1 / 2.2:1 — confirm) |
| Does `tabLabel` wrap at 375pt? | 15 at iPhone SE | G8 |
| Appearance of all 8 hardcoded light-mode literals on dark card | 17, 18 | B7 |
| Horizontal gutter delta, Profile → Dashboard | 5 vs 15 | H1 (expect 4pt shift) |

### 2.4 Post-change acceptance gate

For each implementation PR:
1. Recapture every affected frame to `screenshots/after/`.
2. Attach before/after pairs to the PR (`PROTECTED_SURFACES.md` §3 requirement for shared components).
3. Re-run every §1.5 grep assertion — same expected results.
4. Re-run the §1.4 protected-string inventory.
5. Layer 1: `npx tsc --noEmit` = 0 errors; `GET /api/ops/qa-runner` = `ALL_PASS`.
6. Layer 2: independent reviewer + Maestro (iOS) / Playwright (Web) regression against `PROTECTED_SURFACES.md`.
7. **Expected intentional diffs** (correction, not regression — pre-authorised by CEO sign-off on E1/E2 only):
   - Frame 21: `soft_cap` must **stop** showing `Unlimited Listings & Handoffs`.
   - Frame 22: cap bar numbers change when drafts are present (`activeListingCount`, not `myListings.length`).

---

## 3. Marketplace Invariant assertions for Flow #1

The six invariants from `CLAUDE.md` §3, as they apply to these two screens.

| # | Invariant | Flow #1 assertion | Audited state |
| :-- | :--- | :--- | :--- |
| 1 | Zero Buyer Dead-End | WhatsApp + Call always rendered for any unresponded contact; never disabled or gated | ✅ holds — but targets are 30×30, below HIG (F3) |
| 2 | Zero Greyed-Out Seller Option | Dashboard never visually disables an available realtor | ✅ holds (no disabled states on this surface) |
| 3 | Option B Starter Overflow | Starter cap displayed as 2 active / 1 handoff; overflow surfaced as `"N in Owner Fallback"` | ⚠️ **copy holds, numbers wrong — E2.** Bars count drafts as active. |
| 4 | Multi-Unit Society Parity | Not exercised by Flow #1 | n/a |
| 5 | UAT vs PROD Isolation | Neither screen exposes a simulation control; `/ops` entry only links out | ✅ holds |
| 6 | Two-Layer Verification | No diff produced by this audit | ✅ n/a |

Additionally, against Protected Surface #4:

| Assertion | Audited state |
| :--- | :--- |
| Founding 500 ladder `₹0 till Mar 31 → ₹10,000/yr` vs `₹3,000/mo` present | ✅ present, but hardcoded in 6 phrasings (D4) and the "Mar 31" year is never stated |
| Starter cap `2` active / `1` handoff present | ⚠️ labels correct, derived values wrong (E2) |
| Tier state shown correctly for all 4 tiers | ❌ **`soft_cap` misreported as unlimited (E1)** |

---

## 4. Audit read-only attestation

```bash
cd /Users/adi/Projects/blab-web-agents && git status --short
```

**Verified at audit close.** Output was exactly:

```
?? .claude/
?? qa-baselines/
```

Zero modifications under `expo-app/` or `src/`. `.claude/` was already untracked before the audit began; `qa-baselines/` appears as a new untracked path because the directory was previously empty (git does not track empty directories) and now holds the two deliverables, `uxd-critique.md` and `qa-baseline.md`. Nothing else was written.

---

*End of AUDIT-001 QA baseline.*
