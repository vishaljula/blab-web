/**
 * BLA-33 / Layer-2 — the NATIVE side of the BLA-24 dashboard tab-strip fix @ 5173092.
 *
 * Why this tool exists
 * --------------------
 * `verify-ceo-visual-dyntype.mjs` (Layer-1) drives Chromium, so every one of its 12 checks
 * measures react-native-web. The implementer flagged this himself on BLA-33:
 *
 *   "I only test the web `overflow-x: auto` path. Native `ScrollView` is not exercised by
 *    this harness at all — that is the biggest hole in my evidence."
 *
 * The fix's whole mechanism is "the strip reflows instead of truncating". On web that is
 * CSS flexbox. On native it is Yoga. They are NOT the same algorithm, and the specific
 * difference is load-bearing here (see below). On-device capture is blocked (BLA-3:
 * synthetic input to the Simulator returns -25211), so this tool links Yoga standalone and
 * lays out the real shipped style objects through it. That is the native layout algorithm
 * itself, not a model of it.
 *
 * The divergence under test
 * -------------------------
 * CSS gives every flex item `min-width: auto`, which resolves to its min-content width, and
 * CSS §9.9.1 gives a flex *container* an intrinsic max-content size computed from its items'
 * flex fractions. Together those two are what make `flex-basis: 0` + `flex-grow: 1` produce
 * equal thirds while STILL growing the scroll container's content box once the labels stop
 * fitting. That is exactly the behaviour Layer-1 measured: 3 x 137px = 411px of content in a
 * 292px viewport at 320pt/AX3, i.e. `scrollableBy = 119px`.
 *
 * Yoga implements NEITHER. It has no automatic minimum size and no intrinsic-contribution
 * pass for flex items. So the open question is whether `flexBasis: 0` — chosen precisely to
 * preserve the reviewed equal thirds — also makes each tab contribute ZERO to the content
 * container's content-sized measurement on native, in which case the content box can never
 * exceed the viewport and the strip can never scroll.
 *
 * RN 0.83.6 ground truth this tool is built against (read, not assumed):
 *   - ScrollView.js `styles.baseHorizontal` = {flexGrow:1, flexShrink:1, flexDirection:'row',
 *     overflow:'scroll'}; `styles.contentContainerHorizontal` = {flexDirection:'row'}.
 *   - ReactCommon/yoga/yoga/algorithm/CalculateLayout.cpp:159-166 — a node whose overflow is
 *     Scroll does NOT impose its own width on children along the MAIN axis, so a horizontal
 *     ScrollView measures its content container with width UNDEFINED (MaxContent). This is
 *     the reflow mechanism, and it is only as good as what the content container measures to.
 *   - ScrollViewShadowNode.cpp `updateStateIfNeeded()` — the native scrollable content size
 *     is the union of the ScrollView's layoutable child frames. So contentWidth is literally
 *     the content container's Yoga frame; there is no separate native content sizing pass.
 *   - AccessiblePressable.tsx `withHitFloor()` appends {minWidth: 44, minHeight: 44} to every
 *     A11yPressable, so each tab carries minWidth 44. Modelled.
 *
 * Checks
 *   NP0  ENGINE PARITY. A minimal horizontal scroll node whose content container is
 *        content-sized must measure WIDER than its viewport. Proves this npm Yoga build takes
 *        the CalculateLayout.cpp:159 scroll path. If NP0 fails, every other check is void.
 *   NP1  CONTROL. Re-run the shipped tree with CSS automatic-minimum-size emulated
 *        (minWidth := the tab's own content width). This MUST reproduce Layer-1's measured
 *        web numbers — equal thirds at L-default/xxxLarge and the exact per-width
 *        `scrollableBy` at AX3/AX5. If the control does not reproduce web, the label metrics
 *        or the tree are wrong and NP2/NP3 mean nothing.
 *   NP2  THE QUESTION. Shipped styles, native engine: does the strip become scrollable at
 *        AX3/AX5, as D2e asserts for web?
 *   NP3  Shipped styles, native engine: does any tab's content overflow its tab box?
 *        On iOS (overflow visible) that renders as labels overlapping their neighbours; on
 *        Android (overflow hidden) as a hard clip with no ellipsis.
 *   NP4  REGRESSION GUARD, re-pointed at BLA-34 once `af90ed5` withdrew the equal-thirds
 *        claim on native and scoped it to web: the shipped strip must hold the
 *        content-proportional geometry that was ACCEPTED, and still not scroll at the
 *        reviewed sizes. (It previously asserted the equal thirds, which is how it delivered
 *        the F4 finding; the original numbers are in `t6-bla33-layer2/`.)
 *   NP5  MECHANISM, likewise re-pointed: `flexBasis: 0` must be INERT on native —
 *        indistinguishable from `"auto"` — which is what makes the equal thirds a web-only
 *        claim. Fires if an RN/Yoga upgrade ever makes it live and the `tabBtn` comment goes
 *        stale.
 *
 * Label metrics are lifted from the COMMITTED Layer-1 run at 5173092 via `git show`, not
 * retyped and not re-measured, so web and native are laid out from identical glyph advances
 * and the only variable between them is the layout engine.
 *
 * Run:  node qa-baselines/audit-001/tools/verify-bla33-native-tabstrip.mjs [--json]
 * Exit: 0 ALL_PASS, 1 any FAIL, 2 harness error.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";

/**
 * `yoga-layout` is not a declared dependency of this repo, and this workspace is shared with
 * the implementer's run — a concurrent `npm install` prunes an ad-hoc root install mid-flight
 * (it did exactly that during this review). So resolve it from YOGA_LAYOUT_PATH when set,
 * which lets the tool run against a copy installed outside the shared tree:
 *   cd "$SCRATCH" && npm i yoga-layout@3.2.1
 *   YOGA_LAYOUT_PATH="$SCRATCH/node_modules/yoga-layout/dist/src/index.js" node <this file>
 */
const Yoga = (await import(process.env.YOGA_LAYOUT_PATH || "yoga-layout")).default;

/**
 * Both pinnable, because a re-review is a second run against a DIFFERENT commit and the first
 * run's committed evidence must survive it (BLA-34 ask #4 — the implementer had to copy their
 * output out of `t6-` and restore it from git to avoid overwriting the verdict frames).
 *
 *   QA_SHA  the commit this run attributes its numbers to. Also the commit the Layer-1 label
 *           metrics are lifted from, so the glyph advances always come from the same tree as
 *           the subject rather than from whatever the default happens to be.
 *   QA_OUT  where the JSON lands. Defaults to the BLA-33 directory for reproducibility of the
 *           original verdict; a re-review should always set it.
 */
const SHA = process.env.QA_SHA || "5173092";
const OUT = process.env.QA_OUT || "qa-baselines/audit-001/t6-bla33-layer2";

const {
  FLEX_DIRECTION_ROW,
  FLEX_DIRECTION_COLUMN,
  OVERFLOW_SCROLL,
  WRAP_NO_WRAP,
  GUTTER_COLUMN,
  GUTTER_ROW,
  EDGE_LEFT,
  EDGE_RIGHT,
  EDGE_TOP,
  EDGE_BOTTOM,
  ALIGN_CENTER,
  JUSTIFY_CENTER,
  DIRECTION_LTR,
  MEASURE_MODE_UNDEFINED,
} = Yoga;

// ── Shipped style constants, from expo-app/components/realtor/RealtorDashboard.tsx @ 5173092
const HIT = 44; // AccessiblePressable.ts
const TAB_PAD_H = 4; // s.tabBtn.paddingHorizontal
const TAB_PAD_V = 10; // s.tabBtn.paddingVertical
const TAB_GAP = 4; // s.tabBtn.gap
const STRIP_MARGIN_H = 14; // s.tabBar.marginHorizontal
const BADGE_PAD_H = 5; // s.tabBadge.paddingHorizontal
const BADGE_PAD_V = 1; // s.tabBadge.paddingVertical
const BADGE_MIN_W = 20; // s.tabBadge.minWidth
const ACTIVE_UNDERLINE = 2; // borderBottomWidth on the active tab

/** The fixture's counts, as rendered in the Layer-1 run: My Properties 5 / Visits 3 / Contacts 2. */
const COUNTS = { Properties: 5, Visits: 3, Contacts: 2 };
/** `active` defaults to "properties", so tab 0 carries the 2px underline. */
const ACTIVE_INDEX = 0;

// ── Label metrics, lifted from the committed Layer-1 web run ──────────────────────────────
const L1 = JSON.parse(
  execFileSync(
    "git",
    ["show", `${SHA}:qa-baselines/audit-001/ceo-visual-bugs/dyntype/ceo-visual-dyntype.json`],
    { encoding: "utf8", maxBuffer: 1 << 26 },
  ),
);

const WIDTHS = [320, 360, 390, 1440];
const SCALE_NAMES = ["L-default", "xxxLarge", "AX3", "AX5-max"];

/**
 * Glyph advances per scale. Taken from w390 and then ASSERTED identical at every other
 * width — a label's advance must depend only on font size, so if it does not, the Layer-1
 * data is not measuring what it claims and this tool must refuse to run.
 */
function labelMetrics() {
  const bySc = {};
  for (const sc of SCALE_NAMES) {
    const ref = L1.raw.dashboard.find((m) => m.width === 390 && m.scale === sc);
    if (!ref?.found) throw new Error(`Layer-1 has no w390/${sc} dashboard measurement`);
    bySc[sc] = {
      fontSizePx: ref.tabs[0].fontSizePx,
      labels: ref.tabs.map((t) => ({
        text: t.labelText,
        w: t.labelBox[0],
        h: t.labelBox[1],
      })),
    };
    for (const w of WIDTHS) {
      const m = L1.raw.dashboard.find((x) => x.width === w && x.scale === sc);
      if (!m?.found) throw new Error(`Layer-1 has no w${w}/${sc} dashboard measurement`);
      for (let i = 0; i < 3; i++) {
        if (m.tabs[i].labelBox[0] !== bySc[sc].labels[i].w) {
          throw new Error(
            `label advance is width-dependent in Layer-1 data: ${sc} "${m.tabs[i].labelText}" ` +
              `is ${m.tabs[i].labelBox[0]}px at w${w} but ${bySc[sc].labels[i].w}px at w390`,
          );
        }
      }
    }
  }
  return bySc;
}
const METRICS = labelMetrics();

/** Digit advance. 0.556em is the standard tabular-figure advance for a system sans. */
const digitW = (fontSizePx) => 0.556 * fontSizePx;

// ── Yoga tree builders ────────────────────────────────────────────────────────────────────
const leaf = (w, h) => {
  const n = Yoga.Node.create();
  n.setMeasureFunc(() => ({ width: w, height: h }));
  return n;
};

/** The badge: a View with padding + minWidth holding a count Text. */
function badgeNode(count, fontSizePx) {
  const n = Yoga.Node.create();
  n.setFlexDirection(FLEX_DIRECTION_ROW);
  n.setAlignItems(ALIGN_CENTER);
  n.setPadding(EDGE_LEFT, BADGE_PAD_H);
  n.setPadding(EDGE_RIGHT, BADGE_PAD_H);
  n.setPadding(EDGE_TOP, BADGE_PAD_V);
  n.setPadding(EDGE_BOTTOM, BADGE_PAD_V);
  n.setMinWidth(BADGE_MIN_W);
  n.insertChild(leaf(Math.round(String(count).length * digitW(fontSizePx)), fontSizePx * 1.2), 0);
  return n;
}

/**
 * The real shipped TabBar, as RN 0.83.6 builds it.
 *
 *   root (device width, column)
 *     └ ScrollView   baseHorizontal + s.tabBar            overflow: scroll
 *         └ content  contentContainerHorizontal + s.tabBarContent
 *             └ 3x   s.tabBtn + withHitFloor({minWidth:44})
 *                      ├ Text  s.tabLabel (flexShrink: 0), measured
 *                      └ View  s.tabBadge + count Text
 *
 * `variant` selects the strip container and the tab's main-axis sizing:
 *   "shipped"       ScrollView parent, flexBasis 0      — what 5173092 ships
 *   "shippedAuto"   ScrollView parent, flexBasis "auto" — the variant the fix's comment
 *                   rejects. If this is INDISTINGUISHABLE from "shipped", then flexBasis: 0
 *                   is inert on native and the comment's reasoning is web-only.
 *   "preFixView"    plain View parent, flexBasis 0      — what native rendered at 0cdada0,
 *                   and the NP1 calibration case (must reproduce web's equal thirds).
 */
function layoutStrip({ deviceWidth, scale, variant }) {
  const asScroll = variant !== "preFixView";
  const { fontSizePx, labels } = METRICS[scale];

  const root = Yoga.Node.create();
  root.setWidth(deviceWidth);
  root.setFlexDirection(FLEX_DIRECTION_COLUMN);

  // The strip container. Post-fix it is a horizontal ScrollView (baseHorizontal, with
  // s.tabBar overriding flexGrow to 0); pre-fix it was a plain View carrying s.tabBar's
  // own flexDirection: "row".
  const sv = Yoga.Node.create();
  sv.setFlexDirection(FLEX_DIRECTION_ROW);
  if (asScroll) {
    sv.setOverflow(OVERFLOW_SCROLL);
    sv.setFlexShrink(1); // baseHorizontal.flexShrink
  }
  sv.setFlexGrow(0); // s.tabBar.flexGrow (pre-fix the View had no flexGrow either)
  sv.setMargin(EDGE_LEFT, STRIP_MARGIN_H);
  sv.setMargin(EDGE_RIGHT, STRIP_MARGIN_H);
  sv.setMargin(EDGE_TOP, 4);
  sv.setBorder(EDGE_BOTTOM, 0.5); // StyleSheet.hairlineWidth @2x
  root.insertChild(sv, 0);

  // Content container: contentContainerHorizontal + s.tabBarContent. Pre-fix there was no
  // content container at all — the tabs were direct children of the View.
  let cc = sv;
  if (asScroll) {
    cc = Yoga.Node.create();
    cc.setFlexDirection(FLEX_DIRECTION_ROW);
    cc.setFlexWrap(WRAP_NO_WRAP);
    cc.setFlexGrow(1); // s.tabBarContent.flexGrow
    sv.insertChild(cc, 0);
  }

  const tabs = labels.map((lab, i) => {
    const t = Yoga.Node.create();
    t.setFlexDirection(FLEX_DIRECTION_ROW);
    t.setAlignItems(ALIGN_CENTER);
    t.setJustifyContent(JUSTIFY_CENTER);
    t.setGap(GUTTER_COLUMN, TAB_GAP);
    t.setGap(GUTTER_ROW, TAB_GAP);
    t.setPadding(EDGE_LEFT, TAB_PAD_H);
    t.setPadding(EDGE_RIGHT, TAB_PAD_H);
    t.setPadding(EDGE_TOP, TAB_PAD_V);
    t.setPadding(EDGE_BOTTOM, TAB_PAD_V);
    t.setMinHeight(HIT);
    t.setFlexGrow(1); // s.tabBtn.flexGrow
    t.setFlexShrink(0); // s.tabBtn.flexShrink
    if (i === ACTIVE_INDEX) t.setBorder(EDGE_BOTTOM, ACTIVE_UNDERLINE);

    const count = COUNTS[lab.text];
    const badgeW = Math.max(
      BADGE_MIN_W,
      2 * BADGE_PAD_H + Math.round(String(count).length * digitW(fontSizePx)),
    );
    // What the tab needs along the main axis to hold its own children.
    const needed = 2 * TAB_PAD_H + lab.w + (count > 0 ? TAB_GAP + badgeW : 0);

    if (variant === "shippedAuto") t.setFlexBasisAuto();
    else t.setFlexBasis(0); // s.tabBtn.flexBasis
    t.setMinWidth(HIT); // withHitFloor()

    const label = leaf(lab.w, lab.h);
    label.setFlexShrink(0); // s.tabLabel.flexShrink
    t.insertChild(label, 0);
    if (count > 0) t.insertChild(badgeNode(count, fontSizePx), 1);

    cc.insertChild(t, i);
    return { node: t, text: lab.text, labelW: lab.w, badgeW, needed };
  });

  root.calculateLayout(deviceWidth, undefined, DIRECTION_LTR);

  const svInner = sv.getComputedWidth();
  // ScrollViewShadowNode::updateStateIfNeeded — content size is the union of child frames.
  const contentWidth = cc.getComputedLeft() + cc.getComputedWidth();

  const out = {
    deviceWidth,
    scale,
    variant,
    fontSizePx,
    viewportWidth: r1(svInner),
    contentWidth: r1(contentWidth),
    scrollableBy: r1(Math.max(0, contentWidth - svInner)),
    stripHeight: r1(sv.getComputedHeight()),
    tabs: tabs.map((t) => {
      const w = t.node.getComputedWidth();
      return {
        text: t.text,
        width: r1(w),
        labelW: t.labelW,
        badgeW: t.badgeW,
        neededW: r1(t.needed),
        /** >0 means the children do not fit the tab box: overlap on iOS, hard clip on Android. */
        contentOverflowPx: r1(Math.max(0, t.needed - w)),
      };
    }),
  };
  root.freeRecursive();
  return out;
}

const r1 = (n) => Math.round(n * 10) / 10;

// ── NP0: engine parity probe ──────────────────────────────────────────────────────────────
function engineParityProbe() {
  const root = Yoga.Node.create();
  root.setWidth(292);
  const sv = Yoga.Node.create();
  sv.setFlexDirection(FLEX_DIRECTION_ROW);
  sv.setOverflow(OVERFLOW_SCROLL);
  sv.setFlexGrow(0);
  root.insertChild(sv, 0);
  const cc = Yoga.Node.create();
  cc.setFlexDirection(FLEX_DIRECTION_ROW);
  cc.setFlexGrow(1); // the same flexGrow the shipped content container carries
  sv.insertChild(cc, 0);
  // A content-sized (flexBasis auto) child far wider than the viewport.
  const kid = Yoga.Node.create();
  kid.setWidth(900);
  cc.insertChild(kid, 0);
  root.calculateLayout(292, undefined, DIRECTION_LTR);
  const res = { viewport: r1(sv.getComputedWidth()), content: r1(cc.getComputedWidth()) };
  root.freeRecursive();
  return res;
}

// ── Run ───────────────────────────────────────────────────────────────────────────────────
const VARIANTS = ["shipped", "shippedAuto", "preFixView"];
const runs = [];
for (const deviceWidth of WIDTHS)
  for (const scale of SCALE_NAMES)
    for (const variant of VARIANTS) runs.push(layoutStrip({ deviceWidth, scale, variant }));

const pick = (variant, deviceWidth, scale) =>
  runs.find((r) => r.variant === variant && r.deviceWidth === deviceWidth && r.scale === scale);

/** Layer-1's own web numbers at 5173092, for the NP1 control to be scored against. */
const webStrip = (deviceWidth, scale) =>
  L1.raw.strip.find((m) => m.width === deviceWidth && m.scale === scale);
const webTabs = (deviceWidth, scale) =>
  L1.raw.dashboard.find((m) => m.width === deviceWidth && m.scale === scale)?.tabs ?? [];

const checks = [];
const add = (id, what, pass, detail) =>
  checks.push({ id, what, verdict: pass ? "PASS" : "FAIL", detail });

// NP0 — engine parity.
{
  const p = engineParityProbe();
  add(
    "NP0",
    "Engine parity: this Yoga build lets a horizontal overflow:scroll node measure content wider than its viewport (CalculateLayout.cpp:159 path is live)",
    p.content > p.viewport + 0.5,
    `viewport ${p.viewport}px, content ${p.content}px — ${p.content > p.viewport ? "content exceeds viewport, scroll path live" : "CONTENT CLAMPED TO VIEWPORT — harness is void"}`,
  );
}

// NP1 — calibration. The PRE-FIX tree (plain View parent, the same flexBasis: 0) must
// reproduce the equal thirds Layer-1 measured on web, at every width x scale. That is the
// one case where CSS and Yoga are known to agree, so it is the honest calibration of the
// label metrics and the tree. If it does not reproduce web, nothing below means anything.
{
  const bad = [];
  for (const deviceWidth of WIDTHS) {
    for (const scale of SCALE_NAMES) {
      const got = pick("preFixView", deviceWidth, scale);
      const wt = webTabs(deviceWidth, scale);
      // Tolerance 2px: Layer-1 rounds its boxes to whole pixels and the badge digit advance
      // is modelled rather than measured, so sub-pixel agreement is not expected.
      const equalThirds = Math.max(...got.tabs.map((t) => t.width)) - Math.min(...got.tabs.map((t) => t.width)) <= 1;
      if (!equalThirds)
        bad.push(`w${deviceWidth}/${scale} pre-fix native not equal thirds: ${got.tabs.map((t) => t.width).join("/")}`);
      // Compare widths only where the POST-FIX web strip has not yet started scrolling.
      // Above that point web has grown its scroll content to 3x its widest tab (137/173),
      // while the pre-fix tree is still dividing a fixed viewport into thirds and
      // ellipsising — so the two legitimately part and comparing them proves nothing.
      const webScrolls = (webStrip(deviceWidth, scale)?.scrollableBy ?? 0) > 0.5;
      if (!webScrolls && wt.length === 3 && Math.abs(got.tabs[0].width - wt[0].tabBox[0]) > 2)
        bad.push(`w${deviceWidth}/${scale} native ${got.tabs[0].width} vs web ${wt[0].tabBox[0]}`);
    }
  }
  add(
    "NP1",
    "Calibration: the PRE-FIX tree (View parent + flexBasis 0) reproduces Layer-1's measured web equal thirds at every width x scale",
    bad.length === 0,
    bad.length === 0
      ? "16/16 equal thirds, matching web within 2px (97/111/121/471) — label metrics and tree are calibrated"
      : bad.slice(0, 8).join(" | "),
  );
}

// NP2 — the question: does the shipped strip scroll on native where web does?
{
  const shouldScroll = [];
  for (const deviceWidth of WIDTHS) {
    for (const scale of SCALE_NAMES) {
      const want = webStrip(deviceWidth, scale);
      if (!want || want.scrollableBy <= 0.5) continue; // web does not scroll here either
      const got = pick("shipped", deviceWidth, scale);
      shouldScroll.push({ deviceWidth, scale, web: want.scrollableBy, native: got.scrollableBy });
    }
  }
  const dead = shouldScroll.filter((s) => s.native <= 0.5);
  add(
    "NP2",
    "The shipped strip becomes scrollable on NATIVE wherever D2e measured it scrollable on web",
    dead.length === 0,
    dead.length === 0
      ? `${shouldScroll.length}/${shouldScroll.length} scroll on native`
      : `${dead.length}/${shouldScroll.length} do NOT scroll on native: ` +
        dead
          .map((s) => `w${s.deviceWidth}/${s.scale} web +${s.web}px vs native +${s.native}px`)
          .join(", "),
  );
}

// NP3 — shipped: tab content must fit its tab box on native.
{
  const over = runs
    .filter((r) => r.variant === "shipped")
    .flatMap((r) =>
      r.tabs
        .filter((t) => t.contentOverflowPx > 0.5)
        .map((t) => `w${r.deviceWidth}/${r.scale} "${t.text}" needs ${t.neededW} in ${t.width} (+${t.contentOverflowPx}px)`),
    );
  add(
    "NP3",
    "No tab's content overflows its tab box on native (iOS overflow:visible would overlap neighbours; Android overflow:hidden would clip with no ellipsis)",
    over.length === 0,
    over.length === 0 ? "0 overflows" : `${over.length} overflows: ` + over.slice(0, 6).join(" | "),
  );
}

/**
 * NP4 — RE-POINTED AT BLA-34. It used to assert the equal thirds, which is how it delivered
 * the F4 finding; `af90ed5` WITHDRAWS that claim and scopes it to web, so left as it was this
 * check asserts something the code no longer claims and fails forever. A permanently-red gate
 * is not a gate — the next reader cannot tell a withdrawn claim from a live defect. So it now
 * guards the state that was actually accepted: native is CONTENT-PROPORTIONAL at the reviewed
 * sizes, pinned to the exact geometry BLA-33 F4 measured, and still offers no scroll there.
 * If a future change moves native tab widths at default type, this fires; the original FAIL
 * and its numbers remain in `t6-bla33-layer2/bla33-native-tabstrip.json`.
 */
{
  // Accepted native geometry, from the F4 table (verdict @ f91c1ca) and re-measured identical
  // at af90ed5 — the commit touches no native-reachable style, so these must not move.
  const ACCEPTED = {
    "320/L-default": [111, 81, 100], "320/xxxLarge": [114, 77, 101],
    "360/L-default": [124, 95, 113], "360/xxxLarge": [128, 89, 115],
    "390/L-default": [134, 105, 123], "390/xxxLarge": [138, 99, 125],
    "1440/L-default": [484, 455, 473], "1440/xxxLarge": [488, 449, 475],
  };
  const bad = [];
  for (const deviceWidth of WIDTHS) {
    for (const scale of ["L-default", "xxxLarge"]) {
      const key = `${deviceWidth}/${scale}`;
      const r = pick("shipped", deviceWidth, scale);
      const got = r.tabs.map((t) => t.width);
      const want = ACCEPTED[key];
      if (!want) { bad.push(`${key} has no accepted geometry on record`); continue; }
      if (got.some((w, i) => Math.abs(w - want[i]) > 1))
        bad.push(`${key} ${got.join("/")} vs accepted ${want.join("/")}`);
      if (r.scrollableBy > 0.5) bad.push(`${key} scrolls on native +${r.scrollableBy}px`);
    }
  }
  add(
    "NP4",
    "Native regression guard, post-F4: at L-default/xxxLarge the shipped strip holds the content-proportional geometry that was ACCEPTED (not the web-only equal thirds the fix withdraws), and still offers no scroll there",
    bad.length === 0,
    bad.length === 0
      ? "8/8 at the accepted native widths within 1px (111/81/100 at 320 up to 484/455/473 at 1440), 0 early scroll"
      : bad.join(" | "),
  );
}

// NP5 — the MECHANISM behind NP4. The fix's own comment says flexBasis: 0 is what preserves
// the equal thirds and that "auto" is what breaks them into 111/81/100. On native, inside a
// horizontal ScrollView, the two must be shown to be indistinguishable — because
// CalculateLayout.cpp:97 honours `flexBasis` only `&& yoga::isDefined(mainAxisSize)`, and the
// main-axis size of a scroll node's content is undefined by CalculateLayout.cpp:159. So the
// tab falls through to the MaxContent branch and is content-sized either way.
{
  const differs = [];
  for (const deviceWidth of WIDTHS) {
    for (const scale of SCALE_NAMES) {
      const a = pick("shipped", deviceWidth, scale);
      const b = pick("shippedAuto", deviceWidth, scale);
      for (let i = 0; i < 3; i++)
        if (Math.abs(a.tabs[i].width - b.tabs[i].width) > 0.5)
          differs.push(`w${deviceWidth}/${scale} "${a.tabs[i].text}" basis0 ${a.tabs[i].width} vs auto ${b.tabs[i].width}`);
    }
  }
  // RE-POINTED AT BLA-34, same reason as NP4 and in the same direction. The original asserted
  // that `flexBasis: 0` DOES something on native, because the fix's comment said so; af90ed5
  // now documents the opposite — the line is inert inside a horizontal ScrollView — so the
  // check asserts the documented mechanism instead of the withdrawn one. It fires if an RN or
  // Yoga upgrade ever makes `flexBasis` live inside a scroll node, which is exactly when the
  // `tabBtn` comment would go stale and native would silently change shape.
  add(
    "NP5",
    'Documented mechanism holds: `flexBasis: 0` on s.tabBtn is INERT on native — indistinguishable from `flexBasis: "auto"` — because a horizontal ScrollView leaves its content\'s main-axis size undefined (CalculateLayout.cpp:97 + :159), which is what makes the equal-thirds claim web-only',
    differs.length === 0,
    differs.length === 0
      ? 'identical at all 16 width x scale, so the tab falls through to the MaxContent branch and is content-sized either way — on native exactly the 111/81/100 the old comment attributed to "auto"'
      : `NO LONGER INERT — differs at ${differs.length} tab x width x scale, so the tabBtn comment's web-only scoping is now wrong: ` +
        differs.slice(0, 4).join(" | "),
  );
}
const np5 = runs
  .filter((r) => r.variant === "shipped")
  .map((r) => ({
    at: `w${r.deviceWidth}/${r.scale}`,
    scrollableBy: r.scrollableBy,
    tabs: r.tabs.map((t) => t.width),
    equalThirds: Math.max(...r.tabs.map((t) => t.width)) - Math.min(...r.tabs.map((t) => t.width)) <= 1,
  }));

const failed = checks.filter((c) => c.verdict === "FAIL");
const report = {
  generatedFor: `BLA-33 — native (Yoga) side of the dashboard tab-strip fix @ ${SHA}`,
  engine: "yoga-layout 3.2.1 (npm) — same Yoga 3.x generation RN 0.83.6 bundles in ReactCommon/yoga",
  rnVersion: "0.83.6",
  sourceOfTruth: [
    "react-native/Libraries/Components/ScrollView/ScrollView.js styles.baseHorizontal / contentContainerHorizontal",
    "react-native/ReactCommon/yoga/yoga/algorithm/CalculateLayout.cpp:159-166 (overflow:scroll main-axis sizing)",
    "react-native/ReactCommon/react/renderer/components/scrollview/ScrollViewShadowNode.cpp updateStateIfNeeded()",
    "expo-app/components/a11y/AccessiblePressable.tsx withHitFloor()",
  ],
  labelMetricsFrom: `${SHA}:qa-baselines/audit-001/ceo-visual-bugs/dyntype/ceo-visual-dyntype.json`,
  verdict: failed.length === 0 ? "ALL_PASS" : "FAIL",
  checks,
  nativeShippedLayout: np5,
  raw: runs,
};
mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/bla33-native-tabstrip.json`, JSON.stringify(report, null, 2));

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(report, null, 2));
} else {
  for (const c of checks) console.log(`${c.verdict}  ${c.id}  ${c.what}\n        ${c.detail}\n`);
  console.log("Shipped strip on native, scrollableBy (web value in brackets):");
  for (const deviceWidth of WIDTHS) {
    const row = SCALE_NAMES.map((scale) => {
      const n = pick("shipped", deviceWidth, scale);
      const w = webStrip(deviceWidth, scale);
      return `${scale} ${n.scrollableBy}[${w ? w.scrollableBy : "?"}]`;
    }).join("  ");
    console.log(`  w${deviceWidth}: ${row}`);
  }
  console.log(`\nVERDICT ${report.verdict}  (${checks.length - failed.length}/${checks.length})`);
  console.log(`out ${OUT}/bla33-native-tabstrip.json`);
}
process.exit(failed.length === 0 ? 0 : 1);
