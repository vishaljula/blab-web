/**
 * BLA-34 / Layer-2 — do D2h/D2i/D2j actually close the false-green, or is there still a hole?
 *
 * BLA-33 F1 was a defect that Layer-1 reported ALL_PASS 12/12 over: a visibly cut word.
 * `af90ed5` adds three checks to `verify-ceo-visual-dyntype.mjs` to close that, and
 * red-tests them by editing the subject file. BLA-34 ask #3 asks whether they are the right
 * shape. Taking a red test on trust is how the first false-green survived, so this tool
 * re-derives the answer independently and in the opposite direction: it does not touch the
 * subject file, it neutralises the fix IN THE LIVE DOM (`min-width: 0 !important`, which
 * beats react-native-web's inline value) and measures the SAME quantities D2h/D2i compute,
 * next to the stronger quantities they could have computed.
 *
 *   H1  D2h's reference edge is sound. D2h measures glyphs against
 *       `tab.closest('[role="tablist"]').getBoundingClientRect().left` — a BORDER-box edge on
 *       whatever element happens to carry the role. The edge that actually clips is the scroll
 *       container's PADDING box. Asserts the role-bearing element IS the scroller and that its
 *       border-left and padding-left are 0, so the two edges coincide. If a border or padding
 *       is ever added to `s.tabBar`, D2h starts measuring from the wrong edge and silently
 *       under-reports — this check is what would catch that.
 *
 *   H2  THE RESIDUAL BLIND SPOT. D2h/D2i measure `leaves` — elements with text and no
 *       text-bearing children, i.e. the LABEL and the count DIGIT. The count badge is a
 *       padded, `minWidth: 20` pill wrapping that digit, and it is the badge's painted box
 *       that owns the pixels and sits in the neighbouring tab's hit target (that was F2).
 *       The digit is centred inside it, so the badge box extends past the digit on each side
 *       and D2i cannot see that margin. This measures the margin, per width x scale, in both
 *       states: shipped (where there is no spill to miss) and neutralised (where there is).
 *
 *   H3  Does the neutralised state actually drive D2h/D2i red, computed from leaves exactly
 *       as the probe does? This is the implementer's red test, re-run from the DOM side with
 *       the file untouched, so the two methods have to agree on -1.98 / -10.28 / -14.80.
 *
 * D2j is a pure-logic finding and needs no browser: `THIRDS_EXCEPTIONS.has("320/xxxLarge")`
 * drops that point from the candidate list before the spread is looked at, so ANY geometry
 * passes there, not just the accepted 109/87/96. H4 states the measured widths the exception
 * should be pinned to instead. Asserted in-process against the real predicate, not reasoned.
 *
 * Usage: QA_OUT=<dir> node qa-baselines/audit-001/tools/verify-bla34-probe-holes.mjs [--json]
 * Exit:  0 ALL_PASS, 1 any FAIL, 2 harness error.
 */
import { createRequire } from "module";
import fs from "fs";
import path from "path";
import { execFileSync } from "node:child_process";

const ROOT = "/Users/adi/Projects/blab-web-agents";
const require = createRequire(ROOT + "/package.json");
const { chromium } = require("playwright");

const WEB = process.env.QA_WEB || "http://localhost:8081";
const API = process.env.QA_API || "http://localhost:3000";
const OUT = process.env.QA_OUT
  ? path.resolve(process.env.QA_OUT)
  : path.join(ROOT, "qa-baselines/audit-001/t8-bla34-layer2");
const SUBJECT = "expo-app/components/realtor/RealtorDashboard.tsx";
const PROBE = "qa-baselines/audit-001/tools/verify-ceo-visual-dyntype.mjs";

const env = fs.readFileSync(ROOT + "/.env.local", "utf8");
const envGet = (k) => (env.match(new RegExp("^" + k + "=(.*)$", "m")) || [])[1]?.trim().replace(/^["']|["']$/g, "");
if (envGet("BLAB_ENV") === "production") {
  console.error("REFUSING: BLAB_ENV === 'production' (Marketplace Invariant #5)");
  process.exit(2);
}

const git = (...a) => execFileSync("git", a, { cwd: ROOT, encoding: "utf8" }).trim();
const pinOf = () => ({
  head: git("rev-parse", "HEAD"),
  subjectBlob: git("hash-object", SUBJECT),
  probeBlob: git("hash-object", PROBE),
  subjectDirty: git("status", "--porcelain", SUBJECT).length > 0,
  probeDirty: git("status", "--porcelain", PROBE).length > 0,
});

const FIXTURE = "+919100000045";
const WIDTHS = [320, 360, 390];
const SCALES = [
  { k: 23 / 17, name: "xxxLarge" },
  { k: 40 / 17, name: "AX3" },
  { k: 53 / 17, name: "AX5-max" },
];
const TAB_RE = /^(My Properties|Site Visits|Buyer Contacts),/;

/** Verbatim from Layer-1 / the BLA-33 harness, so the scale ladder is identical. */
const APPLY_SCALE = (k) => {
  const all = [...document.querySelectorAll("*")];
  const read = all.map((el) => {
    const cs = getComputedStyle(el);
    return { el, fs: parseFloat(cs.fontSize), lh: cs.lineHeight };
  });
  for (const { el, fs, lh } of read) {
    if (!fs) continue;
    el.style.fontSize = fs * k + "px";
    const lhPx = parseFloat(lh);
    if (!Number.isNaN(lhPx)) el.style.lineHeight = lhPx * k + "px";
  }
  return read.length;
};

/**
 * Neutralise the fix without touching the file. An author stylesheet `!important`
 * declaration beats react-native-web's inline `min-width`, so this restores exactly the
 * 5173092 geometry: `flexBasis: 0` thirds with a `flexShrink: 0` row overflowing both sides.
 */
const NEUTRALISE = (on) => {
  const ID = "bla34-neutralise-maxcontent";
  document.getElementById(ID)?.remove();
  if (!on) return false;
  const st = document.createElement("style");
  st.id = ID;
  st.textContent = '[role="tab"] { min-width: 0 !important; }';
  document.head.appendChild(st);
  return true;
};

/**
 * Both measurement methods side by side, from one layout pass.
 *
 * `leaves` is Layer-1's input, copied from `PROBE_DASH_TABS` so there is no chance of
 * measuring a different set than D2h/D2i do. `boxes` is the direct children — the label box
 * and the BADGE box — which is what the BLA-33 web harness used for W4 and what owns the
 * pixels and the hit area.
 */
const PROBE_BOTH = () => {
  const r2 = (n) => Math.round(n * 100) / 100;
  const pos = (v) => r2(Math.max(0, v));
  const tabs = [...document.querySelectorAll('[role="tab"]')].filter((el) =>
    /^(My Properties|Site Visits|Buyer Contacts),/.test(el.getAttribute("aria-label") || ""));
  if (tabs.length !== 3) return { found: false, tabCount: tabs.length };

  // The element the role sits on — D2h's reference.
  const roleStrip = tabs[0].closest('[role="tablist"]');
  // The element that actually scrolls and therefore actually clips.
  let sc = tabs[0].parentElement;
  while (sc && !(tabs.every((t) => sc.contains(t)) && /auto|scroll/.test(getComputedStyle(sc).overflowX)))
    sc = sc.parentElement;
  if (!sc) return { found: false, scrollerFound: false };
  sc.scrollLeft = 0;
  const scs = getComputedStyle(sc);
  const scr = sc.getBoundingClientRect();
  const clipLeft = scr.left + (parseFloat(scs.borderLeftWidth) || 0) + (parseFloat(scs.paddingLeft) || 0);
  const roleLeft = roleStrip ? roleStrip.getBoundingClientRect().left : null;
  sc.scrollLeft = -500;
  const canScrollLeft = sc.scrollLeft < -0.5;
  sc.scrollLeft = 0;

  const tabBoxes = tabs.map((t) => t.getBoundingClientRect());
  const per = tabs.map((tab, ti) => {
    const r = tabBoxes[ti];
    const cs = getComputedStyle(tab);
    const padL = parseFloat(cs.paddingLeft) || 0;
    const padR = parseFloat(cs.paddingRight) || 0;
    const contentL = r.left + padL;
    const contentR = r.right - padR;
    const nextL = ti + 1 < tabBoxes.length ? tabBoxes[ti + 1].left : null;

    const metrics = (el) => {
      const kr = el.getBoundingClientRect();
      return {
        text: (el.innerText || "").trim().slice(0, 20),
        widthPx: r2(kr.width),
        pastContentLeftPx: pos(contentL - kr.left),
        pastContentRightPx: pos(kr.right - contentR),
        clippedByStripStartPx: pos(clipLeft - kr.left),
        intoNextTabHitPx: nextL === null ? 0 : pos(kr.right - nextL),
      };
    };

    // Layer-1's set, copied verbatim from PROBE_DASH_TABS.
    const GLYPH_ONLY = /^[-\s]+$/;
    const leaves = [...tab.querySelectorAll("div,span")].filter((el) => {
      const t = (el.innerText || "").trim();
      return t.length > 0 && !GLYPH_ONLY.test(t)
        && ![...el.children].some((k) => (k.innerText || "").trim().length > 0);
    });
    const boxes = [...tab.children];

    const L = leaves.map(metrics);
    const B = boxes.map(metrics);
    const worst = (set, key) => (set.length ? Math.max(...set.map((m) => m[key])) : 0);
    return {
      ariaLabel: (tab.getAttribute("aria-label") || "").slice(0, 40),
      widthPx: r2(r.width),
      leafCount: L.length,
      boxCount: B.length,
      leaves: L,
      boxes: B,
      // What D2h / D2i see.
      leafStartClipPx: worst(L, "clippedByStripStartPx"),
      leafRowOverflowPx: Math.max(worst(L, "pastContentLeftPx"), worst(L, "pastContentRightPx")),
      leafIntoNextHitPx: worst(L, "intoNextTabHitPx"),
      // What a child-box method sees.
      boxStartClipPx: worst(B, "clippedByStripStartPx"),
      boxRowOverflowPx: Math.max(worst(B, "pastContentLeftPx"), worst(B, "pastContentRightPx")),
      boxIntoNextHitPx: worst(B, "intoNextTabHitPx"),
    };
  });

  return {
    found: true,
    roleIsScroller: roleStrip === sc,
    roleStripTag: roleStrip ? roleStrip.tagName : null,
    scrollerBorderLeftPx: r2(parseFloat(scs.borderLeftWidth) || 0),
    scrollerPaddingLeftPx: r2(parseFloat(scs.paddingLeft) || 0),
    roleLeftMinusClipLeftPx: roleLeft === null ? null : r2(roleLeft - clipLeft),
    canScrollLeft,
    scrollableByPx: r2(sc.scrollWidth - sc.clientWidth),
    tabWidthsPx: per.map((t) => t.widthPx),
    tabWidthSpreadPx: r2(Math.max(...per.map((t) => t.widthPx)) - Math.min(...per.map((t) => t.widthPx))),
    tabs: per,
  };
};

async function login(phone) {
  const r = await fetch(`${API}/api/mobile-auth/verify-otp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, code: "123456" }),
  });
  const j = await r.json();
  if (!j.success) throw new Error(`login failed ${phone}: ${JSON.stringify(j).slice(0, 200)}`);
  return { token: j.token, user: j.user };
}

const READY = () =>
  [...document.querySelectorAll('[role="tab"]')].some((el) =>
    /^Buyer Contacts,/.test(el.getAttribute("aria-label") || ""));

const results = [];
const add = (id, claim, pass, detail) => results.push({ id, claim, pass, detail });

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const pinBefore = pinOf();
  const auth = await login(FIXTURE);
  const browser = await chromium.launch();
  const rows = [];

  for (const width of WIDTHS) {
    const ctx = await browser.newContext({
      viewport: { width, height: 800 },
      colorScheme: "light",
      deviceScaleFactor: 1,
    });
    await ctx.addInitScript((a) => {
      try {
        localStorage.setItem("auth_token", a.token);
        localStorage.setItem("auth_user", JSON.stringify(a.user));
        localStorage.setItem("blab-theme", "light");
      } catch {}
    }, auth);

    for (const { k, name } of SCALES) {
      const page = await ctx.newPage();
      await page.goto(WEB + "/dashboard", { waitUntil: "domcontentloaded", timeout: 180000 });
      await page.waitForFunction(READY, null, { timeout: 180000 });
      await page.waitForTimeout(1200);
      await page.evaluate(APPLY_SCALE, k);
      await page.waitForTimeout(700);

      const shipped = await page.evaluate(PROBE_BOTH);
      await page.evaluate(NEUTRALISE, true);
      await page.waitForTimeout(400);
      const neutralised = await page.evaluate(PROBE_BOTH);
      await page.evaluate(NEUTRALISE, false);
      await page.close();

      rows.push({ width, scale: name, shipped, neutralised });
    }
    await ctx.close();
    console.log(`probed w${width}`);
  }
  await browser.close();
  const pinAfter = pinOf();

  const ok = rows.filter((r) => r.shipped.found && r.neutralised.found);

  // ── H0 PIN ────────────────────────────────────────────────────────────────────────────
  add("H0", "PIN: the subject and the Layer-1 probe are byte-stable across the run and the fix was neutralised in the DOM only, never on disk",
    pinBefore.subjectBlob === pinAfter.subjectBlob
      && pinBefore.probeBlob === pinAfter.probeBlob
      && !pinAfter.subjectDirty && !pinAfter.probeDirty
      && ok.length === rows.length,
    `subject ${pinAfter.subjectBlob.slice(0, 7)} stable, probe ${pinAfter.probeBlob.slice(0, 7)} stable, dirty ${pinAfter.subjectDirty || pinAfter.probeDirty}; ${ok.length}/${rows.length} measured`);

  // ── H1 D2h's reference edge ───────────────────────────────────────────────────────────
  const edgeBad = ok.filter((r) => !r.shipped.roleIsScroller
    || Math.abs(r.shipped.roleLeftMinusClipLeftPx) > 0.01
    || r.shipped.scrollerBorderLeftPx > 0 || r.shipped.scrollerPaddingLeftPx > 0);
  add("H1", "D2h's reference edge is the real clip edge: the element carrying role=tablist IS the scroll container, with no border-left or padding-left to put its border box and its padding box apart",
    edgeBad.length === 0,
    edgeBad.length === 0
      ? `${ok.length}/${ok.length} — role on the scroller itself, border-left 0, padding-left 0, role box left == clip left to 0.01px`
      : edgeBad.map((r) => `w${r.width}/${r.scale} roleIsScroller ${r.shipped.roleIsScroller} delta ${r.shipped.roleLeftMinusClipLeftPx}px`).join(" | "));

  // ── H2 the residual blind spot ────────────────────────────────────────────────────────
  // How much real intrusion a leaf-based method cannot see, measured where there IS some.
  const blind = ok.map((r) => {
    const n = r.neutralised;
    const worst = (key) => Math.max(...n.tabs.map((t) => t[key]));
    return {
      key: `w${r.width}/${r.scale}`,
      leafIntoNext: worst("leafIntoNextHitPx"),
      boxIntoNext: worst("boxIntoNextHitPx"),
      leafRow: worst("leafRowOverflowPx"),
      boxRow: worst("boxRowOverflowPx"),
      intoNextBlindPx: Math.round((worst("boxIntoNextHitPx") - worst("leafIntoNextHitPx")) * 100) / 100,
      rowBlindPx: Math.round((worst("boxRowOverflowPx") - worst("leafRowOverflowPx")) * 100) / 100,
    };
  });
  const maxBlind = Math.max(...blind.map((b) => Math.max(b.intoNextBlindPx, b.rowBlindPx)));
  add("H2", "D2i has no residual blind spot: measuring text LEAVES reports the same intrusion as measuring the child BOXES, so the count badge's painted pill cannot cross into the next tab's hit target while the digit inside it still measures clean",
    maxBlind <= 0.5,
    `worst leaf-vs-box underread ${maxBlind}px — ` +
      blind.map((b) => `${b.key} intoNext leaf ${b.leafIntoNext} vs box ${b.boxIntoNext} (blind ${b.intoNextBlindPx}), row leaf ${b.leafRow} vs box ${b.boxRow} (blind ${b.rowBlindPx})`).join(" | "));

  // ── H3 the red test, re-derived from the DOM with the file untouched ──────────────────
  // Keyed per width x scale, from BLA-33 F1's table — which lists a clip at 320/xxxLarge but
  // NOT at 360 or 390/xxxLarge, where the row still fits its third. A per-scale expectation
  // would assert a clip that was never claimed.
  const EXPECT = {
    "320/xxxLarge": 1.98, "360/xxxLarge": 0, "390/xxxLarge": 0,
    "320/AX3": 10.28, "360/AX3": 10.28, "390/AX3": 10.28,
    "320/AX5-max": 14.8, "360/AX5-max": 14.8, "390/AX5-max": 14.8,
  };
  const red = ok.map((r) => ({
    key: `w${r.width}/${r.scale}`,
    shippedStartClip: Math.max(...r.shipped.tabs.map((t) => t.leafStartClipPx)),
    neutralisedStartClip: Math.max(...r.neutralised.tabs.map((t) => t.leafStartClipPx)),
    expected: EXPECT[`${r.width}/${r.scale}`],
    canScrollLeft: r.neutralised.canScrollLeft,
  }));
  const redBad = red.filter((x) => x.shippedStartClip > 0.5
    || Math.abs(x.neutralisedStartClip - x.expected) > 0.1
    || x.canScrollLeft !== false);
  add("H3", "D2h is genuinely load-bearing: computed from the SAME leaves the probe uses, the clip is 0 as shipped and returns to the independently measured -1.98 / -10.28 / -14.80px the moment the min-width is neutralised — and the start edge stays unreachable (scrollLeft clamps at 0), so it is lost text either way",
    redBad.length === 0,
    redBad.length === 0
      ? red.map((x) => `${x.key} 0 -> -${x.neutralisedStartClip}px (expected -${x.expected})`).join(" | ")
      : redBad.map((x) => `${x.key} shipped ${x.shippedStartClip} / neutralised ${x.neutralisedStartClip} vs expected ${x.expected} / canScrollLeft ${x.canScrollLeft}`).join(" | "));

  // ── H4 D2j's exception is blanket ─────────────────────────────────────────────────────
  // The real predicate, lifted from the probe, run against the accepted geometry and against
  // a hypothetical wrong one at the same point. If both pass, the exception is unpinned.
  const THIRDS_EXCEPTIONS = new Set(["320/xxxLarge"]);
  const d2j = (key, widths) => {
    const spread = Math.round((Math.max(...widths) - Math.min(...widths)) * 1000) / 1000;
    return !(spread > 0.5 && !THIRDS_EXCEPTIONS.has(key));
  };
  const accepted = ok.find((r) => r.width === 320 && r.scale === "xxxLarge")?.shipped.tabWidthsPx ?? [];
  const absurd = [200, 40, 52]; // same total, grossly wrong distribution
  const acceptedPasses = d2j("320/xxxLarge", accepted);
  const absurdPasses = d2j("320/xxxLarge", absurd);
  add("H4", "D2j pins the accepted exception to the geometry that was accepted, rather than exempting the measurement point outright — otherwise any future layout at 320/xxxLarge passes unseen",
    !(acceptedPasses && absurdPasses),
    `the accepted ${accepted.join("/")} passes D2j (${acceptedPasses}); so does the absurd ${absurd.join("/")} (${absurdPasses}) — the exception is keyed on the POINT, not on the widths. Pin to ${accepted.map((v) => Math.round(v * 100) / 100).join("/")} +/- 1px instead.`);

  const report = {
    tool: "verify-bla34-probe-holes.mjs",
    generatedFor: "BLA-34 ask #3 — are D2h/D2i/D2j the right shape, or is the false-green still open?",
    subject: SUBJECT,
    layer1Probe: PROBE,
    pinBefore,
    pinAfter,
    web: WEB,
    fixture: FIXTURE,
    verdict: results.every((r) => r.pass) ? "ALL_PASS" : "FAIL",
    passed: results.filter((r) => r.pass).length,
    total: results.length,
    checks: results,
    blindSpot: blind,
    redTest: red,
    raw: rows,
  };
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "bla34-probe-holes.json"), JSON.stringify(report, null, 2));

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    for (const r of results) {
      console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.id}  ${r.claim}`);
      console.log(`        ${r.detail}\n`);
    }
    console.log(`VERDICT ${report.verdict}  (${report.passed}/${report.total})`);
    console.log(`out ${path.join(OUT, "bla34-probe-holes.json")}`);
  }
  process.exit(report.verdict === "ALL_PASS" ? 0 : 1);
}

main().catch((e) => {
  console.error("HARNESS ERROR", e);
  process.exit(2);
});
