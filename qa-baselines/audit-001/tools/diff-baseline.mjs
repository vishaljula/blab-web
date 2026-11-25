/**
 * AUDIT-001 Ticket 3 — Layer-2 baseline regression diff (BLA-12 §1).
 *
 * Compares a re-captured frame set against the attested Ticket-0 baseline
 * (`qa-baselines/audit-001/baseline/`, commit 853cba7) pixel by pixel and reports
 * the changed-pixel fraction plus the vertical band where the change occurs, so an
 * intended hit-target growth can be told apart from a layout regression.
 *
 * Usage:
 *   CAPTURE_OUT=qa-baselines/audit-001/t3-recapture node .../capture-web.mjs
 *   node qa-baselines/audit-001/tools/diff-baseline.mjs <recaptureDir>
 */
import { createRequire } from "module";
import fs from "fs";
import path from "path";

const ROOT = "/Users/adi/Projects/blab-web-agents";
const require = createRequire(ROOT + "/package.json");
const sharp = require("sharp");

// BLA-15: allow diffing against a same-moment control capture instead of the
// committed baseline. A pixel diff against a baseline captured hours earlier is
// dominated by DATA and CLOCK drift (seeded listing counts change, and the hero
// greeting is `new Date().getHours()`-dependent), which swamps the code delta.
// Point DIFF_BASE at a control set captured from the pre-change commit in the
// same minute to isolate the code delta.
const BASE = process.env.DIFF_BASE
  ? path.resolve(process.env.DIFF_BASE)
  : path.join(ROOT, "qa-baselines/audit-001/baseline");
const NEW = path.resolve(process.argv[2] || path.join(ROOT, "qa-baselines/audit-001/t3-recapture"));

const read = async (p) => {
  const { data, info } = await sharp(p).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, ch: info.channels };
};

const rows = [];
for (const file of fs.readdirSync(BASE).filter((f) => f.endsWith(".png")).sort()) {
  const np = path.join(NEW, file);
  if (!fs.existsSync(np)) { rows.push({ file, status: "MISSING_IN_RECAPTURE" }); continue; }
  const a = await read(path.join(BASE, file));
  const b = await read(np);
  const w = Math.min(a.width, b.width);
  const h = Math.min(a.height, b.height);
  let changed = 0;
  let firstY = null, lastY = null;
  for (let y = 0; y < h; y++) {
    let rowChanged = 0;
    for (let x = 0; x < w; x++) {
      const ia = (a.width * y + x) * a.ch;
      const ib = (b.width * y + x) * b.ch;
      // Perceptual-ish tolerance: ignore <=8/255 per channel (AA + font hinting jitter).
      if (Math.abs(a.data[ia] - b.data[ib]) > 8 ||
          Math.abs(a.data[ia + 1] - b.data[ib + 1]) > 8 ||
          Math.abs(a.data[ia + 2] - b.data[ib + 2]) > 8) rowChanged++;
    }
    if (rowChanged > w * 0.01) { if (firstY === null) firstY = y; lastY = y; }
    changed += rowChanged;
  }
  rows.push({
    file,
    baselineSize: `${a.width}x${a.height}`,
    recaptureSize: `${b.width}x${b.height}`,
    heightDeltaPx: b.height - a.height,
    changedPixelPct: Math.round((changed / (w * h)) * 10000) / 100,
    changedBandY: firstY === null ? null : [firstY, lastY],
    status: b.height === a.height && changed / (w * h) < 0.001 ? "IDENTICAL" : "CHANGED",
  });
}

fs.writeFileSync(path.join(NEW, "_diff-vs-baseline.json"), JSON.stringify(rows, null, 2));
console.log("file".padEnd(48), "base".padEnd(11), "new".padEnd(11), "dH".padStart(6), "chg%".padStart(7), "band");
for (const r of rows)
  console.log(
    r.file.padEnd(48),
    String(r.baselineSize || "-").padEnd(11),
    String(r.recaptureSize || "-").padEnd(11),
    String(r.heightDeltaPx ?? "-").padStart(6),
    String(r.changedPixelPct ?? "-").padStart(7),
    r.changedBandY ? `${r.changedBandY[0]}–${r.changedBandY[1]}` : r.status
  );
const identical = rows.filter((r) => r.status === "IDENTICAL").length;
console.log(`\n${identical}/${rows.length} identical; ${rows.filter((r) => r.status === "CHANGED").length} changed; ` +
            `${rows.filter((r) => r.status === "MISSING_IN_RECAPTURE").length} missing.`);
