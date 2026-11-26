/**
 * AUDIT-001 / BLA-18 — Founding 500 Pro banner must not clip at any supported width.
 *
 * The defect (found by Layer-2 QA on BLA-12 §3, listed there as follow-up #1): the Pro
 * banner in `RealtorDashboard.tsx` is a `flexDirection: "row"` with
 * `justifyContent: "space-between"` holding two non-shrinking text groups whose intrinsic
 * widths sum to roughly double the card's content box on a 360pt device, so
 * `Founding 500 Pro Active · Free through Mar 31 (₹10,000/yr locked)` runs off the right
 * edge at DEFAULT type size — before any Dynamic Type scaling is applied.
 *
 * What is asserted (all re-derived from live rendered geometry, never from source):
 *   B1  no text leaf inside the banner extends past the banner's own content box
 *   B2  no text leaf inside the banner is cropped by a cropping ancestor
 *   B3  the page does not gain horizontal overflow because of the banner
 *   B4  no two banner text boxes overlap
 *   B5  at 1440pt the two groups still share one row (the intended desktop design is
 *       preserved, i.e. the fix is a narrow-width wrap, not an unconditional stack)
 *
 * B1 is the assertion that fails on the unfixed build; B5 is the regression guard on the
 * fix itself. Run with --json to dump raw measurements.
 *
 * Usage: node qa-baselines/audit-001/tools/verify-bla18-pro-banner.mjs [--json]
 */
import { createRequire } from "module";
import fs from "fs";
import path from "path";

const ROOT = "/Users/adi/Projects/blab-web-agents";
const require = createRequire(ROOT + "/package.json");
const { chromium } = require("playwright");

const WEB = process.env.QA_WEB || "http://localhost:8081";
const API = process.env.QA_API || "http://localhost:3000";
const OUT = process.env.QA_OUT
  ? path.resolve(process.env.QA_OUT)
  : path.join(ROOT, "qa-baselines/audit-001/t5-evidence");

const env = fs.readFileSync(ROOT + "/.env.local", "utf8");
const envGet = (k) =>
  (env.match(new RegExp("^" + k + "=(.*)$", "m")) || [])[1]?.trim().replace(/^["']|["']$/g, "");
if (envGet("BLAB_ENV") === "production") {
  console.error("REFUSING: BLAB_ENV === 'production' (Marketplace Invariant #5)");
  process.exit(2);
}

/** `realtor_pro` is the only fixture that reaches the `isPaidPro` branch. */
const PRO_FIXTURE = "+919100000045";
/** 320 is the narrowest supported phone; 360 is the width BLA-18 names. */
const WIDTHS = [320, 360, 390, 1440];
/** iOS Dynamic Type body multipliers: Large(default)=17pt, xxxLarge=23pt, AX3=40pt, AX5=53pt. */
const SCALES = [
  { k: 1.0, name: "L-default" },
  { k: 23 / 17, name: "xxxLarge" },
  { k: 40 / 17, name: "AX3" },
  { k: 53 / 17, name: "AX5-max" },
];

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
 * Measure the Pro banner subtree. The banner is located by its own copy, so the probe
 * survives any restructuring of the markup around it.
 */
const PROBE_BANNER = () => {
  const MARKER = "Founding 500 Pro Active";
  // Smallest element whose text contains the marker AND which also carries the
  // "Unlimited" badge — that is the banner row's container (`trialRow`).
  const all = [...document.querySelectorAll("div")];
  const holders = all.filter((el) => {
    const t = el.innerText || "";
    return t.includes(MARKER) && t.includes("Unlimited");
  });
  if (!holders.length) return { found: false };
  // deepest such element = the banner, not the whole screen
  const banner = holders.sort(
    (a, b) => (a.contains(b) ? 1 : b.contains(a) ? -1 : 0),
  )[0];

  const cs = getComputedStyle(banner);
  const br = banner.getBoundingClientRect();
  const bl = parseFloat(cs.borderLeftWidth) || 0;
  const bt = parseFloat(cs.borderTopWidth) || 0;
  const pl = parseFloat(cs.paddingLeft) || 0;
  const pr = parseFloat(cs.paddingRight) || 0;
  // content box = padding box inset by the declared padding
  const contentLeft = br.left + bl + pl;
  const contentRight = br.left + bl + banner.clientWidth - pr;

  const leaves = (() => {
    const out = [];
    const walk = (el) => {
      const kids = [...el.children];
      const kidHasText = kids.some((k) => (k.innerText || "").trim().length > 0);
      const own = (el.innerText || "").trim();
      if (own.length > 0 && !kidHasText) { out.push(el); return; }
      kids.forEach(walk);
    };
    walk(banner);
    return out;
  })();

  const intentional = (e) => {
    const c = getComputedStyle(e);
    return (c.webkitLineClamp && c.webkitLineClamp !== "none") ||
           (c.textOverflow && c.textOverflow !== "clip");
  };

  const texts = [];
  for (const el of leaves) {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) continue;
    const txt = (el.innerText || "").trim().replace(/\s+/g, " ");
    // B2 — cropped by a cropping ancestor (same geometric test as verify-t3-qa.mjs §3)
    let cropCutPx = 0, cropper = null, cropAxis = null, cropOutX = 0, cropOutY = 0;
    let n = el.parentElement, hops = 0, sx = false, sy = false;
    while (n && hops < 10) {
      const ncs = getComputedStyle(n);
      const scrollish = (v) => v === "auto" || v === "scroll";
      if (scrollish(ncs.overflowX)) sx = true;
      if (scrollish(ncs.overflowY)) sy = true;
      const cropsX = !sx && (ncs.overflowX === "hidden" || ncs.overflowX === "clip");
      const cropsY = !sy && (ncs.overflowY === "hidden" || ncs.overflowY === "clip");
      if ((cropsX || cropsY) && !intentional(n) && !intentional(el)) {
        const nr = n.getBoundingClientRect();
        const nbl = parseFloat(ncs.borderLeftWidth) || 0, nbt = parseFloat(ncs.borderTopWidth) || 0;
        const vx = nr.left + nbl, vy = nr.top + nbt;
        const vr = vx + n.clientWidth, vb = vy + n.clientHeight;
        const outX = Math.max(cropsX ? r.right - vr : 0, cropsX ? vx - r.left : 0);
        const outY = Math.max(cropsY ? r.bottom - vb : 0, cropsY ? vy - r.top : 0);
        const cut = Math.max(outX, outY);
        if (cut > 1) {
          cropCutPx = Math.round(cut * 10) / 10;
          cropAxis = outX > outY ? "horizontal" : "vertical";
          cropOutX = Math.round(outX * 10) / 10;
          cropOutY = Math.round(outY * 10) / 10;
          cropper = `${n.tagName.toLowerCase()}${n.getAttribute("aria-label") ? `[${n.getAttribute("aria-label").slice(0, 30)}]` : ""}` +
            ` ${Math.round(nr.width)}x${Math.round(nr.height)} ovf=${ncs.overflowX}/${ncs.overflowY} h=${ncs.height}`;
          break;
        }
      }
      n = n.parentElement; hops++;
    }
    texts.push({
      text: txt.slice(0, 70),
      box: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
      overflowRightPx: Math.round((r.right - contentRight) * 10) / 10,
      overflowLeftPx: Math.round((contentLeft - r.left) * 10) / 10,
      ellipsised: intentional(el),
      cropCutPx,
      cropAxis,
      cropOutX,
      cropOutY,
      cropper,
      fontSizePx: Math.round(parseFloat(getComputedStyle(el).fontSize) * 10) / 10,
    });
  }

  // B4 — overlap between two banner text boxes
  const overlaps = [];
  for (let a = 0; a < texts.length; a++) {
    for (let b = a + 1; b < texts.length; b++) {
      const [A, B] = [texts[a].box, texts[b].box];
      const ix = Math.min(A[0] + A[2], B[0] + B[2]) - Math.max(A[0], B[0]);
      const iy = Math.min(A[1] + A[3], B[1] + B[3]) - Math.max(A[1], B[1]);
      if (ix <= 1 || iy <= 1) continue;
      const frac = (ix * iy) / Math.min(A[2] * A[3], B[2] * B[3]);
      if (frac > 0.2)
        overlaps.push({ a: texts[a].text, b: texts[b].text, overlapFrac: Math.round(frac * 100) / 100 });
    }
  }

  // B5 — are the title group and the "Unlimited" badge on the same visual row?
  const title = texts.find((t) => t.text.includes("Founding 500 Pro Active"));
  const badge = texts.find((t) => t.text.startsWith("Unlimited"));
  const sameRow = !!(title && badge) &&
    Math.abs((title.box[1] + title.box[3] / 2) - (badge.box[1] + badge.box[3] / 2)) <= Math.max(title.box[3], badge.box[3]) / 2;

  return {
    found: true,
    bannerBox: [Math.round(br.x), Math.round(br.y), Math.round(br.width), Math.round(br.height)],
    contentWidth: Math.round((contentRight - contentLeft) * 10) / 10,
    flexWrap: cs.flexWrap,
    texts,
    overlaps,
    sameRow,
    docOverflowPx: Math.round((document.documentElement.scrollWidth - window.innerWidth) * 10) / 10,
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

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const auth = await login(PRO_FIXTURE);
  const browser = await chromium.launch();
  const measurements = [];

  for (const width of WIDTHS) {
    const ctx = await browser.newContext({
      viewport: { width, height: width >= 1440 ? 900 : 800 },
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
      await page.waitForFunction(
        () => document.body && document.body.innerText.includes("Founding 500 Pro Active"),
        null, { timeout: 180000 },
      );
      await page.waitForTimeout(1200);
      if (k !== 1.0) { await page.evaluate(APPLY_SCALE, k); await page.waitForTimeout(600); }
      const m = await page.evaluate(PROBE_BANNER);
      measurements.push({ width, scale: name, k: Math.round(k * 1000) / 1000, ...m });
      if (k === 1.0 || name === "AX5-max")
        await page.screenshot({ path: path.join(OUT, `bla18-pro-banner-w${width}-${name}.png`) });
      await page.close();
    }
    await ctx.close();
  }
  await browser.close();

  const TOL = 0.5;
  const checks = [];
  const push = (id, pass, detail) => checks.push({ id, verdict: pass ? "PASS" : "FAIL", detail });

  const missing = measurements.filter((m) => !m.found);
  push("B0_banner_rendered", missing.length === 0,
    missing.length ? `banner not found at ${missing.map((m) => `w${m.width}/${m.scale}`).join(", ")}`
                   : `measured at ${measurements.length} width x scale combinations`);

  const found = measurements.filter((m) => m.found);
  const over = found.flatMap((m) => m.texts
    .filter((t) => !t.ellipsised && Math.max(t.overflowRightPx, t.overflowLeftPx) > TOL)
    .map((t) => ({ at: `w${m.width}/${m.scale}`, text: t.text, outPx: Math.max(t.overflowRightPx, t.overflowLeftPx) })));
  push("B1_text_within_banner_content_box", over.length === 0,
    over.length ? over.map((o) => `${o.at}: "${o.text}" +${o.outPx}px`).join(" | ")
                : "every banner text leaf fits its card's content box");

  const cropped = found.flatMap((m) => m.texts.filter((t) => t.cropCutPx > 1)
    .map((t) => ({ at: `w${m.width}/${m.scale}`, text: t.text, cut: t.cropCutPx, cropper: t.cropper })));
  push("B2_no_text_cropped_by_ancestor", cropped.length === 0,
    cropped.length ? cropped.map((c) => `${c.at}: "${c.text}" cut ${c.cut}px by <${c.cropper}>`).join(" | ")
                   : "no cropping ancestor cuts banner text");

  const hscroll = found.filter((m) => m.docOverflowPx > 1);
  push("B3_no_horizontal_page_overflow", hscroll.length === 0,
    hscroll.length ? hscroll.map((m) => `w${m.width}/${m.scale}: +${m.docOverflowPx}px`).join(" | ")
                   : "document never exceeds the viewport width");

  const ovl = found.flatMap((m) => m.overlaps.map((o) => `w${m.width}/${m.scale}: "${o.a}" x "${o.b}" ${o.overlapFrac}`));
  push("B4_no_banner_text_overlap", ovl.length === 0, ovl.length ? ovl.join(" | ") : "no overlapping banner text boxes");

  const desktopDefault = found.find((m) => m.width === 1440 && m.scale === "L-default");
  push("B5_desktop_row_preserved", !!desktopDefault?.sameRow,
    desktopDefault
      ? `1440pt L-default: title and badge ${desktopDefault.sameRow ? "share one row (intended design intact)" : "are stacked — desktop layout regressed"}`
      : "1440pt L-default not measured");

  const verdict = checks.every((c) => c.verdict === "PASS") ? "ALL_PASS" : "FAIL";
  const report = { issue: "BLA-18", web: WEB, widths: WIDTHS, scales: SCALES.map((s) => s.name), verdict, checks, measurements };
  fs.writeFileSync(path.join(OUT, "bla18-pro-banner.json"), JSON.stringify(report, null, 2));

  for (const c of checks) console.log(`${c.id.padEnd(36)} ${c.verdict}  ${c.detail}`);
  console.log(`\n${verdict}  (raw: ${path.join(OUT, "bla18-pro-banner.json")})`);
  if (process.argv.includes("--json")) console.log(JSON.stringify(report.measurements, null, 2));
  process.exit(verdict === "ALL_PASS" ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(2); });
