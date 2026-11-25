# AUDIT-001 Ticket 0 (BLA-3) — iOS Simulator capture procedure

Everything below is **ready to run**. It is blocked on exactly one thing: the host
cannot deliver a synthetic tap. See `BASELINE-INDEX.md` §4 for the diagnosis.

## 0. Unblock first (human, one time)

Pick one:

- **Accessibility grant (smallest change).** System Settings → Privacy & Security →
  Accessibility → enable the terminal app that runs the agent. If prompted, also enable
  Input Monitoring. Verify:
  ```bash
  osascript -e 'tell application "System Events" to return name of first process whose frontmost is true'
  ```
  This must print a process name, not `-1719 not allowed assistive access`.
- **CocoaPods.** `brew install cocoapods`, then use the dev-client path in §3b. `/ios`
  is gitignored, so `expo prebuild` does not disturb the read-only attestation.
- **idb.** `brew tap facebook/fb && brew install idb-companion && pip3 install fb-idb`.
  `idb ui tap` drives the simulator without host Accessibility permission.

## 1. Preconditions

```bash
# BLAB_ENV must not be production (Marketplace Invariant #5)
grep '^BLAB_ENV=' /Users/adi/Projects/blab-web-agents/.env.local    # expect: uat

# API
cd /Users/adi/Projects/blab-web-agents && npm run dev

# Metro — use the LOCAL CLI; `npx expo` resolves to the wrong major
cd expo-app && npm ci --legacy-peer-deps && ./node_modules/.bin/expo start --port 8081
```

Simulators already created by this ticket:

| Name | UDID | Logical size |
| :--- | :--- | :--- |
| `QA-iPhone15` | `4E7043F4-7DBA-45E2-93E8-B0ACE00AF8C8` | 393×852 (primary, §2.1) |
| `QA-iPhoneSE3` | `61E00298-31A6-4DB0-97F9-C52E0E828F5B` | 375×667 (frames 15–16 fold, §2.1) |

Expo Go 55.0.34 is already installed on `QA-iPhone15` and matches `expo@55.0.26`.
To install it on the SE:

```bash
APP="/Users/adi/Library/Developer/CoreSimulator/Devices/A36A5EA9-432F-495F-98B5-3FE57FF174C8/data/Containers/Bundle/Application/A3B7BA0A-1264-43D7-A0E6-3001FB0BE12E/Expo-Go-55.0.34.tar.app"
xcrun simctl boot 61E00298-31A6-4DB0-97F9-C52E0E828F5B
xcrun simctl install 61E00298-31A6-4DB0-97F9-C52E0E828F5B "$APP"
```

## 2. Launch the project

```bash
SIM=4E7043F4-7DBA-45E2-93E8-B0ACE00AF8C8
xcrun simctl launch $SIM host.exp.Exponent
sleep 5
xcrun simctl openurl $SIM "exp://127.0.0.1:8081"
```

This raises an `Open in "Expo Go"?` alert. **Tap `Open`** — this is the blocked step.
With Accessibility granted, `tools/tap.py` (below) does it:

```bash
# tap.py <device_x_pt> <device_y_pt> <device_w_pt> <device_h_pt>
python3 tools/tap.py 264.7 469.3 393 852      # the "Open" button
```

## 3a. Drive state without taps — `/api/dev/sim-nav`

`expo-app/app/_layout.tsx:61–79` polls `GET /api/dev/sim-nav` every 1500ms on native
and applies both the route and an injected auth payload. So navigation and sign-in need
no taps at all:

```bash
# sign in as a realtor and land on the dashboard
curl -s -X POST localhost:3000/api/dev/sim-nav \
  -H 'Content-Type: application/json' \
  -d '{"route":"/(tabs)/dashboard","role":"realtor"}'

# signed-out profile: relaunch Expo Go with cleared data, then
curl -s -X POST localhost:3000/api/dev/sim-nav \
  -H 'Content-Type: application/json' -d '{"route":"/(tabs)/profile"}'
```

**Caveat on tier selection.** `src/app/api/dev/sim-nav/route.ts` resolves the user with
`WHERE role = $role LIMIT 1`, so it cannot target a specific tier. The POST response
echoes `auth.user.id`, so the reliable sequence is: POST once, read the returned id,
then set that row's `subscription_tier` to the tier under capture, re-POST to refresh,
and **restore the original tier afterwards**. `qa-baseline.md` §2.2 sanctions seeding
`users.subscription_tier` in UAT for exactly these frames. Assert
`BLAB_ENV !== 'production'` first. This ticket did **not** perform any such write.

Theme and capture:

```bash
xcrun simctl ui $SIM appearance dark      # | light
xcrun simctl io $SIM screenshot \
  qa-baselines/audit-001/baseline/dashboard-free_trial-ios-dark.png
```

## 3b. Dev-client alternative (if CocoaPods was installed)

```bash
cd expo-app && npx expo run:ios --device "QA-iPhone15"
```

The app installs and launches directly, so there is no `Open in "Expo Go"?` alert.
Taps are still required for §4's tab frames.

## 4. Frames that need taps even after launch

Rows **11** (`My Shoots`), **23** (`siteVisits`) and **24** (`buyerContacts`) switch a
local `useState` tab with no deep link. Tap targets, in device points on a 393×852
screen — re-measure against a fresh screenshot before trusting these:

| Row | Control | Where |
| :-- | :--- | :--- |
| 11 | Profile `My Shoots` pill | right half of the tab row under the RERA box |
| 23 | Dashboard `Site Visits` tab | centre third of the tab bar |
| 24 | Dashboard `Buyer Contacts` tab | right third of the tab bar |

Row **22** needs no tap (`properties` is the default tab); use the `pro` fixture
`+919100000045`, which has 1 draft listing.

Row **23** additionally needs a **future-dated viewing** seeded in UAT — no realtor
currently has one (`BASELINE-INDEX.md` §5).

## 5. Naming and index

Write frames to `qa-baselines/audit-001/baseline/` as
`<surface>-<tier-or-state>-ios-<scheme>.png`, then fill in the iOS column of
`BASELINE-INDEX.md` §2 and re-run the §2.3 measurements that are iOS-only
(Dynamic Type XXL clipping, frames 9/10/15).

## Appendix — `tap.py`

Requires Accessibility. Maps device points to host screen coordinates using the
Simulator window bounds from `CGWindowListCopyWindowInfo`.

```python
import sys, time, Quartz

def sim_bounds():
    wl = Quartz.CGWindowListCopyWindowInfo(
        Quartz.kCGWindowListOptionOnScreenOnly | Quartz.kCGWindowListExcludeDesktopElements,
        Quartz.kCGNullWindowID)
    for w in wl:
        if 'Simulator' in w.get('kCGWindowOwnerName', '') and w.get('kCGWindowLayer') == 0:
            b = w['kCGWindowBounds']
            return b['X'], b['Y'], b['Width'], b['Height']
    raise SystemExit('no simulator window — boot exactly one simulator')

px, py, DEV_W, DEV_H = (float(a) for a in sys.argv[1:5])
X, Y, W, H = sim_bounds()
ox, oy = X + (W - DEV_W) / 2.0, Y + (H - DEV_H) / 2.0
pt = Quartz.CGPointMake(ox + px, oy + py)

Quartz.CGWarpMouseCursorPosition(pt)
time.sleep(0.15)
for typ in (Quartz.kCGEventLeftMouseDown, Quartz.kCGEventLeftMouseUp):
    Quartz.CGEventPost(Quartz.kCGHIDEventTap,
        Quartz.CGEventCreateMouseEvent(None, typ, pt, Quartz.kCGMouseButtonLeft))
    time.sleep(0.08)
```

Setup: `python3 -m venv pyenv && ./pyenv/bin/pip install pyobjc-framework-Quartz`.
Boot exactly one simulator — `sim_bounds()` takes the first Simulator window it finds.
