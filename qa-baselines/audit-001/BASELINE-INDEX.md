# AUDIT-001 — Ticket 0 (BLA-3) Screenshot Baseline Index

| Field | Value |
| :--- | :--- |
| **Ticket** | BLA-3 `[AUDIT-001 / T0]` |
| **Parent** | BLA-2 `[AUDIT-001]` |
| **Capture date** | 2026-11-25 |
| **Captured by** | Independent Mobile/Web QA (agent `dfa44b40`) |
| **Audited revision** | `9b4a9cd` on `agent/uxd-audit` |
| **Environment** | `BLAB_ENV=uat` (asserted non-production before every run — Marketplace Invariant #5) |
| **Status** | **Web baseline COMPLETE (30 frames). iOS Simulator baseline BLOCKED — see §4.** |

Governing documents, in binding order: `ceo-decision-log.md` → `uxd-critique.md` →
`uxd-review-addendum.md`, plus `CLAUDE.md` and `PROTECTED_SURFACES.md`.

---

## 1. Naming scheme

```
<surface>-<tier-or-state>-<platform>-<scheme>.png
```

| Token | Values |
| :--- | :--- |
| `<surface>` | `profile` · `dashboard` |
| `<tier-or-state>` | `signedout` · `member-listings` · `realtor-rera` · `shoots-gatecode` · `empty` · `free_trial` · `soft_cap` · `pro` · `pro_plus` · `pro-properties-draft` · `pro-sitevisits` · `pro-buyercontacts` |
| `<platform>` | `web1440` (1440×900 desktop) · `web390` (390×844 mobile web) · `ios` (not yet captured) |
| `<scheme>` | `light` · `dark` |

**Deviation from `qa-baseline.md` §2.1, recorded deliberately.** §2.1 specified
`screenshots/before/{screen}-{state}-{platform}-{theme}.png`. BLA-3's own acceptance
criteria specify `qa-baselines/audit-001/baseline/` with
`<surface>-<tier-or-state>-<platform>-<scheme>.png`. The ticket is the authority for
its own deliverable, so the ticket path and naming win. Ticket 2/4/5 should write their
post-change frames to `qa-baselines/audit-001/after/` using the same scheme.

Machine-readable companions in `baseline/`:
- `_web-manifest.json` — one record per frame: file, matrix row, route, auth fixture, tab, page errors, and the leading rendered text (proves the frame is not blank).
- `_measurements.json` — the §2.3 measurement set (§3 below).

---

## 2. Matrix coverage — `qa-baseline.md` §2.1

All 30 captured frames rendered with **zero page errors** (`pageErrors: []` in every
`_web-manifest.json` record).

| § 2.1 row | Screen / state | Platform | Scheme | Artifact | Status |
| :-- | :--- | :-- | :-- | :--- | :-- |
| 1 | Profile, signed out | iOS | light | — | ❌ **BLOCKED** (§4) |
| 2 | Profile, signed out | Web | light | `profile-signedout-web1440-light.png`, `profile-signedout-web390-light.png` | ✅ |
| 3 | Profile, signed out | iOS | dark | — | ❌ **BLOCKED** (§4) |
| 4 | Profile, signed out | Web | dark | `profile-signedout-web1440-dark.png`, `profile-signedout-web390-dark.png` | ✅ |
| 5 | Profile, signed in, role `user`, has listings | iOS | light | — | ❌ **BLOCKED** (§4) |
| 6 | Profile, signed in, role `user`, has listings | Web | light | `profile-member-listings-web1440-light.png`, `profile-member-listings-web390-light.png` | ✅ |
| 7 | Profile, signed in, role `user` | iOS | dark | — | ❌ **BLOCKED** (§4) |
| 8 | Profile, signed in, role `user` | Web | dark | `profile-member-listings-web1440-dark.png`, `profile-member-listings-web390-dark.png` | ✅ |
| 9 | Profile, role `realtor`, RERA box open | iOS | light | — | ❌ **BLOCKED** (§4) |
| 10 | Profile, role `realtor`, RERA box open | Web | light | `profile-realtor-rera-web1440-light.png`, `profile-realtor-rera-web390-light.png` | ✅ |
| 11 | Profile, `My Shoots`, ≥1 shoot w/ Gate Code | iOS | light | — | ❌ **BLOCKED** (§4) |
| 12 | Profile, `My Shoots`, ≥1 shoot w/ Gate Code | Web | light | `profile-shoots-gatecode-web1440-light.png`, `profile-shoots-gatecode-web390-light.png` | ✅ `Gate Code 939981` visible |
| 13 | Profile, both tabs empty | iOS | light | — | ❌ **BLOCKED** (§4) |
| 14 | Profile, both tabs empty | Web | light | `profile-empty-web1440-light.png`, `profile-empty-web390-light.png` | ✅ `My Listings (0)` / `My Shoots (0)` |
| 15 | Dashboard, `free_trial`, Starter banner + quota bars | iOS | light | — | ❌ **BLOCKED** (§4) |
| 16 | Dashboard, `free_trial` | Web | light | `dashboard-free_trial-web1440-light.png`, `dashboard-free_trial-web390-light.png` | ✅ |
| 17 | Dashboard, `free_trial` | iOS | dark | — | ❌ **BLOCKED** (§4) |
| 18 | Dashboard, `free_trial` | Web | dark | `dashboard-free_trial-web1440-dark.png`, `dashboard-free_trial-web390-dark.png` | ✅ B7 literals visible |
| 19 | Dashboard, `pro`, green Pro banner | iOS | light | — | ❌ **BLOCKED** (§4) |
| 20 | Dashboard, `pro`, green Pro banner | Web | light | `dashboard-pro-web1440-light.png`, `dashboard-pro-web390-light.png` | ✅ |
| 21 | Dashboard, `soft_cap` — **E1 evidence** | iOS | light | — | ❌ **BLOCKED** for iOS; **web mirror captured** → `dashboard-soft_cap-web1440-light.png`, `dashboard-soft_cap-web390-light.png` | ⚠️ |
| 22 | Dashboard, `properties` tab, ≥1 draft (`New Owner Handoff`) | iOS | light | — | ❌ **BLOCKED** for iOS; **web mirror** → `dashboard-pro-properties-draft-web*-light.png` | ⚠️ |
| 23 | Dashboard, `siteVisits`, UPCOMING + PAST both populated | iOS | light | — | ❌ **BLOCKED** for iOS; **web mirror** → `dashboard-pro-sitevisits-web*-light.png` — ⚠️ **PAST only, see §5** | ⚠️ |
| 24 | Dashboard, `buyerContacts`, mixed responded/unresponded | iOS | light | — | ❌ **BLOCKED** for iOS; **web mirror** → `dashboard-pro-buyercontacts-web*-light.png` | ⚠️ |
| — | Dashboard, `pro_plus` (required by BLA-3 "all four realtor tiers"; not in §2.1) | Web | light | `dashboard-pro_plus-web1440-light.png`, `dashboard-pro_plus-web390-light.png` | ✅ |

**Score: 12 of 12 web rows captured. 0 of 12 iOS rows captured. 5 extra web mirrors
captured for iOS-only rows 21–24 + the `pro_plus` tier sweep.**

### 2.1 All four realtor tiers are reproducible in UAT

BLA-3 asks that any tier which cannot be reproduced be named explicitly. **None are
unreproducible.** All four already exist in UAT and required **no seeding and no DB
mutation whatsoever** — fixtures were selected, never created:

| Tier | Realtors in UAT | Fixture used | Listings | Drafts | Server `maxListingCapacity` |
| :--- | :-- | :--- | :-- | :-- | :-- |
| `free_trial` | 26 | Priya Kumar `+919100000059` | 5 | 0 | 2 |
| `soft_cap` | 19 | Vikram Iyer `+919100000034` | 1 | 0 | 2 |
| `pro` | 17 | Harish Sharma `+919100000045` | 5 | 1 | 999 |
| `pro_plus` | 4 | Ravi Chowdary `+919100000050` | 1 | 1 | 999 |

Profile fixtures: `+18133355928` (14 listings, 3 shoots w/ Gate Code), `+91910000003`
(0 listings, 0 shoots).

---

## 3. §2.3 measurements (`baseline/_measurements.json`)

| Measurement | §2.3 frames | Recorded value | Verdict |
| :--- | :-- | :--- | :--- |
| Vertical offset of first property card | 15, 16 | **458px** @393×852; **488px** @375×667 | Content starts ~458px down — the "~340pt before content" claim is **understated**; the §H4 ~44pt recovery is measurable against this. |
| Rendered width of `roleCard` @1440 | 6 | **697px** (×93px tall) | **B8 CONFIRMED** — a role card stretches to 697px with no `maxWidth`. |
| Rendered width of `StatPill` @1440 | 16 | **464px** | **B8 CONFIRMED.** |
| Measured contrast, `greeting` | 15 | **5.09:1** (`rgba(255,255,255,0.7)` on `rgb(139,37,0)`) — passes AA | ⚠️ **Corrects `qa-baseline.md` §2.3**, which recorded 3.4:1. Confirms `uxd-review-addendum.md` §5.1: `greeting` passes AA, so the §J6 opacity change was rightly dropped. |
| Measured contrast, `scoreLabel` | 15 | **3.70:1** (`rgba(255,255,255,0.55)`) — fails AA normal text, passes AA large text | ⚠️ **Corrects `qa-baseline.md` §2.3**, which recorded 2.2:1. Still a real defect, but less severe than recorded. |
| Does `tabLabel` wrap at 375pt? | 15 @ SE | **YES** — `My Properties` and `Buyer Contacts` both render 26px against a 13px line-height (2 lines). `Site Visits` does not wrap. | **G8 CONFIRMED.** |
| Appearance of 8 hardcoded light literals on dark card | 17, 18 | Captured visually in `dashboard-free_trial-web1440-dark.png` / `-web390-dark.png` | **B7** evidence frames exist. |
| Horizontal gutter delta, Profile → Dashboard | 5 vs 15 | Profile content **18px**; Dashboard tab bar **14px** → **4px delta** | **H1 CONFIRMED** at exactly the predicted ~4pt. Also noted: the Dashboard tier banner sits at 46px, so Dashboard has no single internal gutter. |
| Content clipping at Dynamic Type XXL | 9, 10, 15 | **BLOCKED** | iOS-only accessibility setting; not reproducible on the Expo web build. Requires the iOS path (§4). |

---

## 4. BLOCKED — iOS Simulator capture

**All 12 iOS rows are uncaptured.** This is an environment limitation, not a scope
decision, and it is not resolvable by this agent.

### What works
- Xcode 16.4; iOS 18.5 runtime; `QA-iPhone15` (`4E7043F4-7DBA-45E2-93E8-B0ACE00AF8C8`) and `QA-iPhoneSE3` (`61E00298-31A6-4DB0-97F9-C52E0E828F5B`) simulators created and booted.
- Expo Go **55.0.34** installed on the simulator and correctly matched to the project's `expo@55.0.26`.
- Metro bundler reachable; the simulator resolves the API at the configured LAN IP `192.168.1.236:3000` (verified HTTP 200).
- `xcrun simctl io … screenshot` and `xcrun simctl ui … appearance light|dark` both work.
- `/api/dev/sim-nav` (`expo-app/app/_layout.tsx:61–79`) can push both a route **and** an auth payload into the running native app — so navigation and sign-in would not need taps.

### The two blockers
1. **No synthetic input.** Launching the project puts an `Open in "Expo Go"?` system
   alert on screen, and dismissing it needs one tap. `xcrun simctl` has no tap verb.
   Both host-side input paths are denied:
   - AppleScript/System Events → `osascript is not allowed assistive access. (-1719)`
   - Quartz `CGEventPost` (via `pyobjc-framework-Quartz`) → events silently dropped.

   The same gap independently blocks rows **11, 23, 24** (and the `My Shoots` /
   `siteVisits` / `buyerContacts` tab switches), because those tabs are local React
   state with no route to deep-link to.
2. **No dev-client fallback.** A development build installs and launches directly and
   would bypass the alert, but `npx expo run:ios` needs CocoaPods, and the host has
   neither `pod` nor Homebrew (system Ruby is 2.6.10, below modern CocoaPods' minimum).

### Unblock — one of these, by a human with GUI/admin access on this Mac
- **Preferred:** grant **Accessibility** (and if prompted, **Input Monitoring**) to the
  terminal app running the agent, in System Settings → Privacy & Security. Then re-run
  `qa-baselines/audit-001/tools/capture-ios.md`'s procedure; everything else is ready.
- **Or:** install CocoaPods (`brew install cocoapods`) so `npx expo run:ios` can build a
  dev client. Note `/ios` is gitignored, so a prebuild does not disturb the attestation.
- **Or:** install `idb` (`brew tap facebook/fb && brew install idb-companion`), which
  taps the simulator directly without host Accessibility permission.

### Risk this leaves on the board
`ceo-decision-log.md` §1 D3.2 makes Ticket 0 the gate for Ticket 4 precisely because
`theme.ts` is a Protected Surfaces §7 shared component carrying a full Protected-Surface
screenshot sweep obligation. **With no iOS baseline, Tickets 2, 4 and 5 cannot prove iOS
non-regression** — only web. Downstream tickets should treat iOS as shipping unverified
until this is unblocked.

---

## 5. Data gaps found in UAT (independent of the iOS blocker)

| Gap | Affected row | Detail |
| :--- | :-- | :--- |
| **No realtor has an upcoming site visit** | 23 | Across all 66 UAT realtors, `viewings` with `scheduled_at > NOW()` and status `pending`/`confirmed` = **0**. Row 23 requires "UPCOMING + PAST both populated"; the captured frame shows the **PAST** section only. Capturing a true row 23 needs a future-dated viewing seeded in UAT. Flagged rather than seeded, to avoid mutating shared UAT data during a concurrent run on BLA-2. |
| **Member fixture has no `active` listing** | 6, 8 | `+18133355928`'s 14 listings are all non-active, so the listing rows render the `SHOOT PENDING` badge and never `LIVE`. Both protected strings live on the same branch (`profile.tsx:378–381`); only the `SHOOT PENDING` arm is visually baselined. |

---

## 6. Reproducing this baseline

```bash
# Terminal 1 — API (BLAB_ENV must not be 'production')
cd /Users/adi/Projects/blab-web-agents && npm run dev

# Terminal 2 — Expo (use the LOCAL CLI; `npx expo` resolves to the wrong major)
cd /Users/adi/Projects/blab-web-agents/expo-app
npm ci --legacy-peer-deps          # plain `npm install` fails: @rnmapbox/maps vs mapbox-gl peer conflict
./node_modules/.bin/expo start --port 8081

# Terminal 3 — capture (playwright is intentionally NOT added to package.json)
cd /Users/adi/Projects/blab-web-agents
npm i -D playwright && npx playwright install chromium
node qa-baselines/audit-001/tools/capture-web.mjs
node qa-baselines/audit-001/tools/measure-web.mjs
git checkout -- package.json package-lock.json   # keep the read-only attestation clean
```

Both harnesses hard-refuse to run when `BLAB_ENV === 'production'` (Invariant #5). They
read fixtures from UAT and never write to the database.

---

## 7. Read-only attestation

```
$ git status --short
?? .claude/
?? qa-baselines/audit-001/baseline/
?? qa-baselines/audit-001/tools/
```

**Zero modifications under `expo-app/` or `src/`** — the BLA-3 acceptance criterion.
`.claude/` was already untracked before this ticket began. The only new paths are this
ticket's own deliverables.

Recorded for completeness:
- `playwright` was installed as a devDependency to run the harness and the resulting
  `package.json` / `package-lock.json` edits were reverted (`git checkout --`) before
  commit; `node_modules/` is gitignored.
- `npm ci --legacy-peer-deps` was run in `expo-app/` to populate `node_modules/`
  (gitignored, lockfile unchanged); its `patch-package` postinstall applied the existing
  `expo-notifications@55.0.25` patch.
- Two simulators (`QA-iPhone15`, `QA-iPhoneSE3`) were created on the host. These are
  host state, not repo state, and are left in place for the unblocked re-run.
- **No row in any database table was inserted, updated or deleted.**

---

*End of BLA-3 baseline index.*
