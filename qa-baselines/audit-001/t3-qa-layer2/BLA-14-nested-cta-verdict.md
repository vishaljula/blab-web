# BLA-14 — Verdict: nested publish-draft CTA vs. screen-reader reachability

**Ticket:** BLA-14 (Layer-2 QA) · raised by BLA-11 finding **F4** · branch `agent/uxd-audit`
**Target:** `expo-app/components/realtor/RealtorDashboard.tsx` — `cardHeader` A11yPressable (`:554`) with `publishDraftBtn` A11yPressable (`:594`) as its **child**
**Re-runnable evidence:**
- `qa-baselines/audit-001/tools/verify-bla14-nested-cta.mjs` → `bla14-nested-cta.json`
- `qa-baselines/audit-001/tools/verify-bla14-320pt-actions.mjs` → `bla14-320pt-actions.json`

---

## 1. Headline

**F4 is platform-split. It is NOT one verdict.**

| Platform | Verdict | Basis |
| :--- | :--- | :--- |
| **iOS / VoiceOver** | **CONFIRMED** — CTA unreachable *and* unannounced | Source trace, 5/5 links asserted against the vendored RN 0.83.6 we ship |
| **Web / Chromium** | **CLEARED** — CTA exposed, focusable, handler routes correctly | Empirical: live Expo web build, CDP accessibility tree |
| **Android / TalkBack** | **NOT DETERMINED** | Needs TalkBack on a device/emulator; `accessible` maps through a different path on Android |

The review's instinct was right for iOS and wrong for web. Shipping the fix is still justified — but the iOS reasoning, not "it's broken everywhere", is what justifies it.

The nesting itself is **confirmed real on both platforms**: 2 nested `role="button"` ancestors in the rendered web DOM (`C1.nestedButtonInsideButton: true`). The block comment at `:552` — *"Avoids nesting a Pressable inside a Pressable (iOS touch conflict)"* — is factually contradicted by the code 40 lines below it. As BLA-14 notes, the nesting is **pre-existing**; T3 did not introduce it.

---

## 2. iOS — CONFIRMED, with the mechanism

VoiceOver cannot be enabled in the iOS Simulator at all, and **BLA-3** already established this host cannot deliver a synthetic tap to a simulator. So I could not perform the VoiceOver pass the ticket asked for. Instead of guessing, I traced the exact code path through the React Native we actually vendor, and encoded each link as a regex assertion (`C5`) so an RN upgrade that changes any of them **fails the check** rather than silently invalidating this verdict.

`C5_ios_source_trace` — React Native **0.83.6**, `allLinksHold: true`:

1. **`Pressable` defaults `accessible` to true.** `Libraries/Components/Pressable/Pressable.js:252` → `accessible: accessible !== false`. `A11yPressable` never passes `accessible`, so **both** the header and the CTA render with it true.
2. **`accessible` becomes `isAccessibilityElement`.** `RCTViewComponentView.mm:348` → `self.accessibilityElement.isAccessibilityElement = newViewProps.accessible`.
3. **`accessibilityElement` is `self`.** `RCTViewComponentView.mm:1287` → `return self;` (header doc: *"Defaults to `self`"*). So the flag lands on the header view itself.
4. **The parent's explicit label short-circuits child-label aggregation.** `RCTViewComponentView.mm:1360` → `NSString *label = super.accessibilityLabel; if (label) { return label; }`. `cardHeader` **does** set an explicit `accessibilityLabel`, so `RCTRecursiveAccessibilityLabel` is never reached.
5. **Children are re-exposed only via an opt-in prop.** `updateAccessibilityElements` sets `self.accessibilityElements = nil` whenever `accessibilityOrder` is empty. `cardHeader` does not set it.

**Consequence.** UIKit treats a view with `isAccessibilityElement = YES` as a **leaf** and does not expose its descendants. So the CTA is:

- **not separately focusable** — link 2+3+5 close the "reach it as its own element" path; and
- **not folded into the parent's announcement either** — link 4 closes the fallback path.

The label `"Accept handoff and schedule shoot for {address}"` that T3 added in good faith is **doubly dead on iOS**. Worse than merely silent: activating the collapsed element fires the **parent's** `onPress` — accordion toggle when `hasActivity`, otherwise navigation to the property detail page. A VoiceOver user on this screen **cannot accept an owner handoff at all**.

That is why this sits adjacent to **Marketplace Invariants #2 and #3** — the accept-handoff path is the mechanism those invariants are about.

> **Residual gap, stated plainly:** this is a source-level proof, not a device observation. It is strong — every link is asserted against shipped code — but a VoiceOver device pass should still sign it off before the fix is closed out. Tracked below.

---

## 3. Web — CLEARED, empirically

Ran against the **live Expo web build** (`localhost:8081`) with the real UAT fixture `realtor_pro` / Harish Sharma, whose draft listing puts the CTA on screen (`C0.ctaRenderedOnPage: true`).

| Check | Result |
| :--- | :--- |
| `C1` DOM nesting | `role="button"` **inside** `role="button"` — nesting confirmed; CTA carries the right `aria-label` |
| `C2` Chromium AX tree (CDP `Accessibility.getFullAXTree`) | CTA present as `role: button`, name `"Accept handoff and schedule shoot for …"`, **`ignored: false`**, `ignoredReasons: []` → **exposed to AT** |
| `C3` keyboard reachability | `tabindex="0"`, in the page's focusable set → reachable by Tab |
| `C4` handler routing | Pressing the CTA fired **`publish_and_schedule`** (1 attempt), not the parent — no navigation, no accordion toggle |

So on web, react-native-web renders two real nested `<button>` elements. That is **invalid HTML** — but Chromium recovers, exposes both in the accessibility tree, and routes the press to the inner control. The T3 label works here.

**Caveat I am not papering over:** this is **Chromium only**. Nested `<button>` is spec-invalid, so recovery behaviour is browser-dependent, and the browser that matters most for a screen-reader pass — **WebKit/Safari with macOS or iOS VoiceOver** — is exactly where it is most likely to differ. Firefox is also untested. I would not generalise "web is fine" past Chromium.

---

## 4. The 320pt `actionBtn` concern — PASS

From the ticket's "also worth covering" list, this was the one item testable without a device. T3 raised the two icon buttons in `FlatBuyerContactCard` from 30×30 to 44pt via `withHitFloor`; the worry was that the tight row overflows at the narrowest width.

Measured **rendered geometry** (not eyeballed screenshots) across 3 cases — 320px, 320px at 200% root font size as a largest-Dynamic-Type stand-in, and 390px — covering **12 buttons**:

```
anyBelow44: false     anyOverflowCard: false     anyOverflowViewport: false
anyClipped: false     anyOverlapName: false      anyHorizontalScroll: false
verdict: PASS — 44pt targets hold at 320pt with no overflow, clipping or h-scroll
```

Every button measured exactly **44×44**. The `flex: 1` name column absorbs the squeeze, which is the correct behaviour. **No layout regression was traded for the a11y win.**

---

## 5. Incidental finding (minor, not a blocker)

The `cardHeader` accessible name for a draft came out as:

> `"Ps 1194، 500027 Hyderabad، India, Ps 1194، 500027 Hyderabad، India, ₹0, For Sale, new owner handoff. No contacts or visits yet"`

Checked against the DB: **all 14** UAT drafts have `price = 0` and `address == city`.

- The **duplicated address** is a fixture data artifact (`address == city`), not a code bug.
- The **`₹0`** is genuine data — owner-handoff drafts are not priced yet. But the label template `${address}, ${city}, ${formatPrice(price)}` announcing *"₹0"* for an unpriced draft is a **label-quality issue that would also occur in PROD**. Suggest suppressing the price segment when `price` is falsy and `status === "draft"`. Cosmetic; for T5.

---

## 6. Fix options for whoever owns this

Per BLA-14 this belongs to **T5 or a follow-up, not T3** — the nesting is pre-existing. Three viable shapes:

1. **Hoist the CTA out of the `cardHeader` Pressable** — sibling below the header. Cleanest; also retires the false comment at `:552` and removes the invalid nested-`<button>` on web.
2. **`accessible={false}` on `cardHeader`** — stops the collapse, but the header then loses its single composed announcement and its children get announced as loose fragments, which is the §F1 defect T3 existed to fix. Needs explicit child ordering to be acceptable.
3. **`experimental_accessibilityOrder` on `cardHeader`** — per link 5 this is the sanctioned way to re-expose specific descendants. Experimental; I would not bet the accept-handoff path on it.

**Recommendation: option 1.**

---

## 7. Still outstanding (device-gated — NOT covered by this pass)

These were on the ticket's wishlist and I am explicitly **not** claiming them:

- **iOS VoiceOver device sign-off** of §2, and the **Android/TalkBack** verdict (§1 row 3).
- **Announcement sweep of the 25 labelled controls** across both screens.
- **Profile workspace-mode `radiogroup`/`radio`** with both `selected` and `checked` — whether iOS VoiceOver falls back to the selected trait.
- **Largest Dynamic Type on device**, incl. the three `allowFontScaling={false}` decorative initials (48pt / 76pt / 32pt).
- **WebKit/Safari + Firefox** re-run of §3 (see caveat).
- **Maestro** regression vs. `PROTECTED_SURFACES.md` — `maestro` is not installed on this host.

All of these need either a real device with a screen reader, or toolchain installs this host does not have.

---

## 8. Safety notes

- `BLAB_ENV=uat` asserted at the top of **both** tools; they refuse to run against production (**Marketplace Invariant #5**).
- The CTA's real handler publishes a draft and books a shoot. `C4` **aborts** that POST at the network layer, so handler routing was observed **without mutating UAT data** — re-verified after the run: **14 drafts still present**. The 320pt tool likewise aborts `POST /api/realtors/leads` so no contact is marked responded.
- Both tools are read-only with respect to `expo-app/` and `src/`.
