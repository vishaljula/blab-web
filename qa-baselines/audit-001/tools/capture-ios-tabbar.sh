#!/usr/bin/env bash
# AUDIT-001 / BLA-25 §L5 — capture the Expo Router bottom tab bar on a HOME-INDICATOR
# device, i.e. the `insets.bottom > 0` branch of `(tabs)/_layout.tsx` that 0cdada0 left
# unchanged by design. Layer-1 and the web harness only ever exercise the no-inset branch.
#
# STATUS 2026-11-26 (BLA-25): still blocked by the Ticket 0 / BLA-3 blocker, re-confirmed
# on this host. `osascript` can READ the AX process list:
#
#     osascript -e 'tell application "System Events" to return name of first process \
#       whose frontmost is true'            -> "Simulator"   (rc 0)
#
# but cannot DELIVER synthetic input, which is what the `Open in "Expo Go"?` alert needs:
#
#     osascript -e 'tell application "System Events" to click at {100,100}'
#       -> execution error: ... not allowed assistive access. (-25211)
#     ... to get {position, size} of front window
#       -> execution error: ... not allowed assistive access. (-1719)
#
# Cold-launching via `simctl terminate` + `simctl openurl` does NOT avoid the alert — it is
# raised by SpringBoard on the URL open, not by Expo Go being foregrounded, and it renders
# as a UIAlertController INSIDE the device screen, so it has no macOS AX button to click.
# Verified screenshot of that state is in BLA-25's thread.
#
# Unblock (human, one time) — any one of capture-ios.md §0:
#   - System Settings -> Privacy & Security -> Accessibility: enable the terminal that runs
#     the agent (and Input Monitoring if prompted), then re-run this script.
#   - brew tap facebook/fb && brew install idb-companion && pip3 install fb-idb, then
#     replace the alert step below with: idb ui tap --udid "$SIM" 264 469
#   - brew install cocoapods and use the dev-client path (capture-ios.md §3b), which never
#     raises the scheme-confirmation alert.
#
# Until then, §L5 of `verify-ceo-visual-layer2.mjs` covers the untouched branch
# geometrically: it measures the label's REQUIRED line box at every Dynamic Type scale and
# checks it against BOTH branches' computed content budgets, derived from the live bar's
# own border and padding.
set -uo pipefail

SIM="${SIM:-4E7043F4-7DBA-45E2-93E8-B0ACE00AF8C8}"   # QA-iPhone15, 393x852 pt, inset 34
OUT="${OUT:-/Users/adi/Projects/blab-web-agents/qa-baselines/audit-001/t5-ceo-visual-layer2/ios}"
URL="${URL:-exp://127.0.0.1:8081}"
# "Open" button centre, in device POINTS on a 393x852 screen.
TAP_X="${TAP_X:-264}"
TAP_Y="${TAP_Y:-469}"
mkdir -p "$OUT"

echo "== preflight: can this host deliver a synthetic tap?"
if ! osascript -e 'tell application "System Events" to get {position, size} of front window of process "Finder"' >/dev/null 2>&1; then
  echo "   NO — assistive access denied. See the header of this script for the unblock."
  echo "   Refusing to bank a screenshot of the alert as if it were the app."
  BLOCKED=1
else
  BLOCKED=0
fi

echo "== booting $SIM"
xcrun simctl boot "$SIM" 2>/dev/null
xcrun simctl bootstatus "$SIM" -b >/dev/null 2>&1
open -a Simulator
xcrun simctl terminate "$SIM" host.exp.Exponent 2>/dev/null
sleep 2
xcrun simctl openurl "$SIM" "$URL" >/dev/null 2>&1
sleep 4

if [ "$BLOCKED" = "1" ]; then
  xcrun simctl io "$SIM" screenshot "$OUT/ios-BLOCKED-scheme-alert.png" >/dev/null 2>&1
  echo "== blocked at the scheme-confirmation alert; evidence: $OUT/ios-BLOCKED-scheme-alert.png"
  exit 3
fi

echo "== dismissing the Open-in-Expo-Go alert (idb if present, else a coordinate tap)"
if command -v idb >/dev/null 2>&1; then
  idb ui tap --udid "$SIM" "$TAP_X" "$TAP_Y"
else
  osascript <<OSA
tell application "System Events" to tell process "Simulator"
  set frontmost to true
  delay 1
  set {wx, wy} to position of front window
  set {ww, wh} to size of front window
  -- the device screen fills the window below the title bar; derive the scale from width
  set titleBar to 28
  set k to ww / 393.0
  click at {wx + ($TAP_X * k), wy + titleBar + ($TAP_Y * k)}
end tell
OSA
fi

echo "== waiting for the JS bundle (up to 180s)"
for i in $(seq 1 36); do
  sleep 5
  if xcrun simctl spawn "$SIM" log show --last 10s --style compact 2>/dev/null | grep -qi "Running application"; then
    echo "   bundle running at $((i * 5))s"; break
  fi
done
sleep 8

xcrun simctl io "$SIM" screenshot "$OUT/ios-tabbar-inset34.png" >/dev/null 2>&1
echo "== screenshot: $OUT/ios-tabbar-inset34.png"
ls -la "$OUT"
