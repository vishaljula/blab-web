#!/usr/bin/env node
/**
 * verify-a11y-guard-coverage — AUDIT-001 / T3 Layer-2 review (BLA-11, reviewing BLA-5)
 *
 * `scripts/a11y-guard.mjs` reports its guarded files clean. This script answers the
 * question that claim depends on: *how much of each guarded file can the guard actually
 * see?*
 *
 * The guard calls `blankNonCode()` to blank comments and string literals before matching.
 * That function treats any `'` / `"` / `` ` `` as a string delimiter regardless of syntactic
 * position, so a lone apostrophe in **JSX text** (`Couldn't load dashboard`) opens a phantom
 * string that runs to the next apostrophe *anywhere later in the file* — blanking every line
 * in between. Blanked lines cannot match the banned-tag or missing-prop regexes, so the guard
 * passes over them in silence.
 *
 * Two checks, both re-runnable, no dependencies:
 *
 *   1. COVERAGE — report every non-comment line that `blankNonCode()` blanks to nothing.
 *      These are the guard's blind spots. Expected: zero.
 *   2. A/B INJECTION — copy the repo into a scratch mirror, inject a raw `<Pressable>` into
 *      a blind line and into a sighted line, and confirm the guard fails on BOTH. A guard
 *      that catches the sighted one and misses the blind one is the defect, demonstrated.
 *
 * Usage:  node qa-baselines/audit-001/tools/verify-a11y-guard-coverage.mjs
 * Exit 0 = guard sees all of every guarded file. Exit 1 = blind spots exist.
 */

import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, copyFileSync, rmSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const GUARD_REL = "scripts/a11y-guard.mjs";

/** Read GUARDED_FILES out of the guard itself, so this check cannot drift from it. */
function guardedFiles() {
  const src = readFileSync(resolve(REPO_ROOT, GUARD_REL), "utf8");
  const block = src.match(/const GUARDED_FILES = \[([\s\S]*?)\]/);
  if (!block) throw new Error(`could not parse GUARDED_FILES out of ${GUARD_REL}`);
  return [...block[1].matchAll(/["']([^"']+)["']/g)].map((m) => m[1]);
}

/** Verbatim copy of `blankNonCode()` from scripts/a11y-guard.mjs — the function under test. */
function blankNonCode(src) {
  const out = src.split("");
  let i = 0;
  const blank = (from, to) => {
    for (let k = from; k < to; k++) if (out[k] !== "\n") out[k] = " ";
  };
  while (i < src.length) {
    const two = src.slice(i, i + 2);
    if (two === "//") {
      let j = src.indexOf("\n", i);
      if (j === -1) j = src.length;
      blank(i, j);
      i = j;
    } else if (two === "/*") {
      let j = src.indexOf("*/", i + 2);
      j = j === -1 ? src.length : j + 2;
      blank(i, j);
      i = j;
    } else if (src[i] === '"' || src[i] === "'" || src[i] === "`") {
      const q = src[i];
      let j = i + 1;
      while (j < src.length) {
        if (src[j] === "\\") j += 2;
        else if (src[j] === q) break;
        else j++;
      }
      blank(i + 1, Math.min(j, src.length));
      i = Math.min(j + 1, src.length);
    } else {
      i++;
    }
  }
  return out.join("");
}

/** Lines that held code but are blank after `blankNonCode()`. Comment bodies don't count. */
function blindLines(raw) {
  const before = raw.split("\n");
  const after = blankNonCode(raw).split("\n");
  const blind = [];
  for (let n = 0; n < before.length; n++) {
    const o = before[n].trim();
    const b = after[n].trim();
    // A line inside a block comment is legitimately blanked; it starts with * or / after trim.
    if (o.length > 0 && b.length === 0 && !/^(\/\/|\*|\/\*)/.test(o)) blind.push(n + 1);
  }
  return blind;
}

const asRanges = (ns) => {
  if (!ns.length) return "";
  const out = [];
  let s = ns[0], p = ns[0];
  for (const x of ns.slice(1)) {
    if (x === p + 1) p = x;
    else { out.push([s, p]); s = x; p = x; }
  }
  out.push([s, p]);
  return out.map(([a, z]) => (a === z ? `${a}` : `${a}-${z}`)).join(", ");
};

// ── Check 1: coverage ────────────────────────────────────────────────────────
const FILES = guardedFiles();
console.log("a11y-guard coverage — can the guard see every line it claims to guard?\n");
console.log("file                                                  lines  blind  blind ranges");
console.log("-".repeat(100));

const blindByFile = new Map();
for (const rel of FILES) {
  const raw = readFileSync(resolve(REPO_ROOT, rel), "utf8");
  const blind = blindLines(raw);
  blindByFile.set(rel, blind);
  console.log(
    rel.padEnd(53),
    String(raw.split("\n").length).padStart(5),
    String(blind.length).padStart(6),
    " " + (asRanges(blind) || "—")
  );
}

const totalBlind = [...blindByFile.values()].reduce((a, b) => a + b.length, 0);

// ── Check 2: A/B injection ───────────────────────────────────────────────────
// Prove the consequence rather than asserting it: the same banned control is caught on a
// sighted line and missed on a blind line.
const worst = [...blindByFile.entries()].sort((a, b) => b[1].length - a[1].length)[0];
let abReport = null;

if (worst && worst[1].length > 0) {
  const [rel, blind] = worst;
  const mirror = mkdtempSync(join(tmpdir(), "a11y-guard-ab-"));
  try {
    for (const f of [GUARD_REL, ...FILES]) {
      mkdirSync(resolve(mirror, dirname(f)), { recursive: true });
      copyFileSync(resolve(REPO_ROOT, f), resolve(mirror, f));
    }
    const target = resolve(mirror, rel);
    const pristine = readFileSync(target, "utf8");
    const INJECTION = "<Pressable onPress={() => {}}><Text>probe</Text></Pressable>";

    const runGuard = () => {
      try {
        execFileSync(process.execPath, [resolve(mirror, GUARD_REL)], { stdio: "pipe" });
        return { caught: false };
      } catch (e) {
        return { caught: true, out: String(e.stdout || "") + String(e.stderr || "") };
      }
    };

    const injectAt = (lineNo) => {
      const L = pristine.split("\n");
      L.splice(lineNo - 1, 0, INJECTION);
      writeFileSync(target, L.join("\n"));
      return runGuard();
    };

    const sightedLine = (() => {
      const set = new Set(blind);
      const total = pristine.split("\n").length;
      for (let n = 1; n <= total; n++) if (!set.has(n)) return n;
      return 1;
    })();

    const blindResult = injectAt(blind[Math.floor(blind.length / 2)]);
    const sightedResult = injectAt(sightedLine);
    abReport = {
      rel,
      blindLine: blind[Math.floor(blind.length / 2)],
      sightedLine,
      blindCaught: blindResult.caught,
      sightedCaught: sightedResult.caught,
    };
  } finally {
    rmSync(mirror, { recursive: true, force: true });
  }

  console.log("\nA/B injection — identical raw <Pressable>, two positions in " + abReport.rel);
  console.log("-".repeat(100));
  console.log(`  injected at sighted line ${abReport.sightedLine}`.padEnd(55) + (abReport.sightedCaught ? "guard FAILS (correct)" : "guard passes (BUG)"));
  console.log(`  injected at blind   line ${abReport.blindLine}`.padEnd(55) + (abReport.blindCaught ? "guard FAILS (correct)" : "guard passes (BUG — control is invisible)"));
}

console.log("\n" + "=".repeat(100));
if (totalBlind === 0) {
  console.log("PASS — blankNonCode() blanks no code. The guard sees every guarded line.");
  process.exit(0);
}
console.log(
  `FAIL — ${totalBlind} line(s) of guarded code are blanked before matching, so the guard\n` +
  `       cannot see them. A banned control placed on any of these lines is reported clean.\n\n` +
  `Root cause: blankNonCode() treats an apostrophe in JSX text as a string delimiter.\n` +
  `Reproduce the cause: each JSX-text apostrophe below opens a phantom string that ends at\n` +
  `the next apostrophe anywhere later in the file; everything between is blanked.\n`
);
for (const rel of FILES) {
  const raw = readFileSync(resolve(REPO_ROOT, rel), "utf8");
  const blanked = blankNonCode(raw).split("\n");
  raw.split("\n").forEach((line, n) => {
    // Surface apostrophes that survive blanking, i.e. ones the scanner treated as delimiters.
    if (line.includes("'") && blanked[n].includes("'") && !/^\s*(\/\/|\*|\/\*)/.test(line)) {
      console.log(`  ${rel}:${n + 1}  ${line.trim().slice(0, 88)}`);
    }
  });
}
process.exit(1);
