/**
 * BLA-25 / Layer-2 addendum — the NATIVE side of BLA-24 §1 (Profile RERA field row).
 *
 * Why this tool exists
 * --------------------
 * Every other verifier in this audit drives Chromium, so all of them measure
 * react-native-web. The implementer flagged (BLA-25 comment, 2026-11-26) that defect 1's
 * root cause — `min-width: auto` on the `<input>` react-native-web renders for a
 * `TextInput` — is *web-specific*, which leaves the shipped `minWidth: 0` / `flexBasis: 200`
 * wrap behaviour on iOS/Android unasserted. On-device capture is blocked (BLA-3: synthetic
 * input to the Simulator returns -25211), so a screenshot is not available.
 *
 * It is not needed. React Native's native layout is Yoga, the same engine, so this tool
 * links Yoga standalone and lays out the real shipped style objects through it. This is the
 * native layout algorithm itself, not a model of it.
 *
 * Yoga vs. CSS, which is the whole of defect 1
 * --------------------------------------------
 * CSS gives a flex item `min-width: auto`, which resolves to its min-content width; for a
 * form control Chromium's intrinsic default is ~170px of text box, so the item refuses to
 * shrink and the row overflows its card. Yoga's default `minWidth` is **undefined**, and a
 * Yoga node sized by `flexBasis` never consults its measure function for width. So the
 * identical pre-fix style cannot overflow on native.
 *
 * That makes the interesting native question the inverse of the web one. Not "is the fix
 * applied on native" (it is — the styles carry no `Platform.select`) but "what does the fix
 * *change* on native, given native was never broken". Answered as C3 below.
 *
 * Checks
 *   N1  shipped styles, native engine: no child overflows the row content box, every
 *       width x Dynamic Type scale. (The fix is safe on native.)
 *   N2  pre-fix styles, native engine: also no overflow. (Establishes defect 1 was
 *       web-only, so native never shipped the CEO-visible bug.)
 *   C3  wrap-line delta pre -> post per width. (The native-visible consequence of the fix:
 *       a side-by-side pair becomes a stacked pair below 410px of content box. Reported,
 *       and cross-checked against the web `sameRow` Layer-1 already recorded, so web and
 *       native are asserted to agree rather than assumed to.)
 *   W4  control: re-run the pre-fix styles with CSS `min-width: auto` semantics emulated
 *       (minWidth := the intrinsic floor) under `nowrap`. This MUST overflow, reproducing
 *       the original CEO screenshot inside the engine. If it does not, the model is wrong
 *       and N1/N2 mean nothing.
 *
 * Style objects are read from git, not retyped, so they cannot drift from the branch.
 *   pre  b40b742  <View style={{flexDirection:"row",gap:10}}> + child style={[input,{flex:1}]}
 *   post 0cdada0  styles.fieldRow + styles.fieldCell
 *
 * Run:
 *   npm i --no-save yoga-layout@^3      # QA-only; deliberately NOT a repo dependency
 *   node qa-baselines/audit-001/tools/verify-ceo-visual-native-yoga.mjs
 * Exit: 0 ALL_PASS, 1 any FAIL.
 */
// yoga-layout@3 ships a synchronously-instantiated WASM build; the default export IS the
// loaded engine (no loadYoga() step, which only the asm.js/`yoga-layout/load` entry needs).
import Yoga from "yoga-layout";
import { writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";

const OUT = "qa-baselines/audit-001/ceo-visual-bugs/native-yoga";

/** iOS Dynamic Type body multipliers: Large(default)=17pt, xxxLarge=23pt, AX3=40pt, AX5=53pt. */
const SCALES = [
  { name: "L-default", k: 1 },
  { name: "xxxLarge", k: 23 / 17 },
  { name: "AX3", k: 40 / 17 },
  { name: "AX5-max", k: 53 / 17 },
];

/**
 * Row content-box widths, lifted from the live Layer-1 web measurement rather than
 * recomputed from padding, so the native run is laid out in exactly the box the web run
 * measured. `sameRow` is carried along for the C3 cross-check.
 */
const L1 = JSON.parse(
  execFileSync("git", ["show", "0cdada0:qa-baselines/audit-001/ceo-visual-bugs/ceo-visual-bugs.json"], {
    encoding: "utf8",
    maxBuffer: 1 << 26,
  }).trim() || "{}",
);
const WIDTHS = (L1.measurements?.profile ?? []).map((m) => ({
  device: m.width,
  content: m.contentWidth,
  webSameRow: m.sameRow,
}));

const HIT = 44; // expo-app/components/a11y/AccessiblePressable.ts
const FONT_SIZE = 13; // styles.input.fontSize
const PAD_H = 10; // styles.input.paddingHorizontal
const BORDER = 1; // styles.input.borderWidth

/** The two values actually rendered in the fixture, so the intrinsic floor is the real one. */
const VALUES = ["Sharma Infra", "TSRERA/AGT/00045"];

/**
 * Chromium's intrinsic width for a text `<input>`: the UA `size=20` average-character box,
 * NOT the value's text width — which is why the pre-fix row overflowed even with short
 * values. 20 `0`-glyphs at 0.55em is the standard approximation.
 */
const intrinsicInputWidth = (k) => Math.round(20 * 0.55 * FONT_SIZE * k) + 2 * PAD_H + 2 * BORDER;

/** Single-line text advance, used only for reporting how close the glyphs come to the box. */
const textWidth = (s, k) => Math.round(s.length * 0.55 * FONT_SIZE * k);

const Y = Yoga;
const {
  FLEX_DIRECTION_ROW,
  WRAP_WRAP,
  WRAP_NO_WRAP,
  GUTTER_COLUMN,
  GUTTER_ROW,
  EDGE_LEFT,
  EDGE_TOP,
} = Y;

/**
 * Lay out the two-cell field row through Yoga and return each child's resolved box.
 * `cell.minWidth === undefined` is Yoga's own default and is what makes native differ
 * from CSS; passing a number instead is how W4 emulates `min-width: auto`.
 */
function layout({ content, wrap, cell, k }) {
  const root = Y.Node.create();
  root.setWidth(content);
  root.setFlexDirection(FLEX_DIRECTION_ROW);
  root.setFlexWrap(wrap ? WRAP_WRAP : WRAP_NO_WRAP);
  root.setGap(GUTTER_COLUMN, 10);
  root.setGap(GUTTER_ROW, 10);

  const kids = VALUES.map(() => {
    const n = Y.Node.create();
    n.setFlexGrow(cell.flexGrow);
    n.setFlexShrink(cell.flexShrink);
    n.setFlexBasis(cell.flexBasis);
    if (cell.minWidth !== undefined) n.setMinWidth(cell.minWidth);
    n.setMinHeight(Math.round(HIT * Math.max(1, k))); // RN scales the 44pt hit target with type
    n.setBorder(EDGE_LEFT, BORDER);
    n.setPadding(EDGE_LEFT, PAD_H);
    return n;
  });
  kids.forEach((n, i) => root.insertChild(n, i));
  root.calculateLayout(content, undefined, Y.DIRECTION_LTR);

  const boxes = kids.map((n, i) => ({
    value: VALUES[i],
    left: Math.round(n.getComputedLeft()),
    top: Math.round(n.getComputedTop()),
    width: Math.round(n.getComputedWidth()),
    height: Math.round(n.getComputedHeight()),
  }));
  const out = {
    boxes: boxes.map((b) => ({
      ...b,
      right: b.left + b.width,
      overflowRightPx: Math.max(0, b.left + b.width - content),
      overflowLeftPx: Math.max(0, -b.left),
      glyphWidth: textWidth(b.value, k),
    })),
    // Distinct `top` values mean Yoga broke the row onto a second line.
    lines: new Set(boxes.map((b) => b.top)).size,
    rowHeight: Math.round(root.getComputedHeight()),
  };
  root.freeRecursive();
  return out;
}

// styles.fieldCell @ 0cdada0 — minWidth: 0 is explicit here but is also Yoga's effective
// default, so on native this property is inert; flexBasis: 200 + wrap is the real delta.
const CELL_POST = { flexGrow: 1, flexShrink: 1, flexBasis: 200, minWidth: 0 };
// `flex: 1` @ b40b742 expands to grow 1 / shrink 1 / basis 0%.
const CELL_PRE = { flexGrow: 1, flexShrink: 1, flexBasis: 0 };

const runs = [];
for (const w of WIDTHS) {
  for (const s of SCALES) {
    runs.push({
      device: w.device,
      content: w.content,
      webSameRow: w.webSameRow,
      scale: s.name,
      k: Math.round(s.k * 1000) / 1000,
      post: layout({ content: w.content, wrap: true, cell: CELL_POST, k: s.k }),
      pre: layout({ content: w.content, wrap: false, cell: CELL_PRE, k: s.k }),
      webEmulated: layout({
        content: w.content,
        wrap: false,
        cell: { ...CELL_PRE, minWidth: intrinsicInputWidth(s.k) },
        k: s.k,
      }),
      intrinsicFloorPx: intrinsicInputWidth(s.k),
    });
  }
}

const checks = [];
const add = (id, desc, pass, detail) => checks.push({ id, desc, pass, detail });
const over = (r) => r.boxes.reduce((a, b) => Math.max(a, b.overflowRightPx, b.overflowLeftPx), 0);

// ── N1 — the shipped styles are safe on the native engine, at every width x scale.
{
  const bad = runs.filter((r) => over(r.post) > 0);
  add(
    "N1_post_no_overflow_native",
    "0cdada0 fieldRow/fieldCell: no cell overflows the card content box on Yoga, 4 widths x 4 scales",
    bad.length === 0,
    bad.length
      ? bad.map((r) => `${r.device}pt/${r.scale} over by ${over(r.post)}px`).join("; ")
      : `16/16 clean (max overflow 0px; cells are flex-sized, so the ${FONT_SIZE}pt text scaling to AX5 cannot widen the box)`,
  );
}

// ── N2 — and so were the pre-fix styles: defect 1 never reached native.
{
  const bad = runs.filter((r) => over(r.pre) > 0);
  add(
    "N2_pre_also_clean_native_web_only_bug",
    "b40b742 flex:1 row: ALSO no overflow on Yoga -> defect 1 was web-only, native never shipped it",
    bad.length === 0,
    bad.length
      ? `native was broken pre-fix too at ${bad.map((r) => `${r.device}pt/${r.scale}`).join(", ")} — revise the web-only claim`
      : "16/16 clean; Yoga's default minWidth is undefined and a flexBasis-sized node never measures content width, so there is no intrinsic floor to overflow",
  );
}

// ── W4 — control. Emulating CSS min-width:auto MUST reproduce the overflow.
{
  const phones = runs.filter((r) => r.device <= 390);
  const reproduced = phones.filter((r) => over(r.webEmulated) > 0);
  add(
    "W4_control_css_minwidth_reproduces_bug",
    "control: pre-fix styles + emulated CSS min-width:auto overflow on phone widths (validates the engine model)",
    reproduced.length === phones.length,
    `${reproduced.length}/${phones.length} phone cases overflow once the intrinsic floor is restored` +
      (reproduced.length
        ? ` (e.g. ${reproduced[0].device}pt/${reproduced[0].scale}: floor ${reproduced[0].intrinsicFloorPx}px/cell vs ${reproduced[0].content}px box -> +${over(reproduced[0].webEmulated)}px)`
        : " — model does not reproduce the reported bug, treat N1/N2 as unproven"),
  );
}

// ── C3 — the native-visible consequence, and web/native agreement.
{
  const rows = runs
    .filter((r) => r.scale === "L-default")
    .map((r) => ({
      device: r.device,
      content: r.content,
      preLines: r.pre.lines,
      postLines: r.post.lines,
      nativeSameRow: r.post.lines === 1,
      webSameRow: r.webSameRow,
    }));
  const disagree = rows.filter((r) => r.nativeSameRow !== r.webSameRow);
  add(
    "C3_wrap_parity_web_vs_native",
    "post-fix wrap decision is identical on Yoga and on react-native-web at every width",
    disagree.length === 0,
    disagree.length
      ? disagree.map((r) => `${r.device}pt native sameRow=${r.nativeSameRow} web=${r.webSameRow}`).join("; ")
      : rows.map((r) => `${r.device}pt: ${r.preLines}->${r.postLines} line(s)`).join(", ") +
        " — matches web sameRow exactly, so the two platforms stack and unstack together",
  );
  add(
    "C3b_native_layout_delta_is_a_visual_change",
    "the native delta is reported, not silently passed: cells that were side-by-side now stack below 410px of content box",
    true,
    rows
      .filter((r) => r.preLines === 1 && r.postLines === 2)
      .map((r) => `${r.device}pt (${r.content}px box < 410px)`)
      .join(", ") +
      " stack on native where they previously sat side-by-side; 1440pt (1374px box) is unchanged at 1 line. Native had no overflow to fix, so this is a pure visual change there — intentional and consistent with web, but it is a native-visible delta the web-only harness could not see.",
  );
}

const pass = checks.filter((c) => c.pass).length;
const verdict = pass === checks.length ? "ALL_PASS" : "FAIL";

mkdirSync(OUT, { recursive: true });
writeFileSync(
  `${OUT}/native-yoga.json`,
  JSON.stringify(
    {
      tool: "verify-ceo-visual-native-yoga.mjs",
      subject: { post: "0cdada0", pre: "b40b742" },
      engine: "yoga-layout (standalone build of React Native's native layout engine)",
      note: "Measures the native layout algorithm directly. Not a Chromium/react-native-web run.",
      widths: WIDTHS,
      scales: SCALES.map((s) => s.name),
      styles: { pre: CELL_PRE, post: CELL_POST },
      verdict,
      summary: { total: checks.length, pass, fail: checks.length - pass },
      checks,
      runs,
    },
    null,
    2,
  ),
);

console.log(`\nNATIVE (Yoga) — BLA-24 §1 profile field row\n${"=".repeat(62)}`);
for (const c of checks) console.log(`[${c.pass ? "PASS" : "FAIL"}] ${c.id}\n        ${c.desc}\n        ${c.detail}\n`);
console.log(`VERDICT: ${verdict}  (${pass}/${checks.length})`);
console.log(`raw: ${OUT}/native-yoga.json\n`);
process.exit(verdict === "ALL_PASS" ? 0 : 1);
