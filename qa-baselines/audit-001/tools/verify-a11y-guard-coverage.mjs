#!/usr/bin/env node
/**
 * verify-a11y-guard-coverage — AUDIT-001 / T3 (BLA-11 raised it, BLA-13 fixes it)
 *
 * `scripts/a11y-guard.mjs` reports its guarded files clean. This script answers the
 * question that claim depends on: *how much of each guarded file can the guard actually
 * see, and does it still fail when it should?*
 *
 * The defect it was written to prove (BLA-11 F1): `blankNonCode()` treated any `'` / `"` as
 * a string delimiter regardless of syntactic position, so a lone apostrophe in JSX text
 * (`Couldn't load dashboard`) opened a phantom string running to the next apostrophe
 * anywhere later in the file — blanking every line between. 292 non-comment lines of
 * `RealtorDashboard.tsx` were invisible; a banned control on any of them was reported clean.
 *
 * Fixed in BLA-13: `opensString()` only treats a quote as an opener in expression position,
 * and an opener that reaches end-of-line without its partner is a hard `guard desync` error
 * instead of a silent blanking. This script is the regression test for all of it.
 *
 * It imports `blankNonCode()` from the guard rather than copying it, so it cannot drift from
 * the function under test. (It used to hold a verbatim copy, which would have gone stale the
 * moment the guard was fixed.)
 *
 * Four checks, all re-runnable, no dependencies:
 *
 *   1. COVERAGE — every non-comment line that `blankNonCode()` blanks to nothing is a blind
 *      spot, and every `desync` it reports is a tokenizer failure. Expected: zero of each.
 *   2. A/B INJECTION — mirror the repo into scratch, inject a raw `<Pressable>` at code
 *      positions spread across each guarded file, including both historically blind bands
 *      (719-805 and 1017-1099), and require the guard to fail on every single one.
 *   3. NAMESPACE PROBE (BLA-11 F2) — `import * as RN from "react-native"` + `<RN.Pressable>`
 *      passed both guard layers. Both the import and the qualified tag must now be caught.
 *   4. FAIL-CLOSED PROBE — an unterminated string literal must produce a `guard desync`
 *      error, not a silently blanked remainder of the file.
 *
 * Usage:  node qa-baselines/audit-001/tools/verify-a11y-guard-coverage.mjs
 * Exit 0 = the guard sees every guarded line and still fails on every bypass.
 */

import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, copyFileSync, rmSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

import { blankNonCode, GUARDED_FILES } from "../../../scripts/a11y-guard.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const GUARD_REL = "scripts/a11y-guard.mjs";

/** The two bands of RealtorDashboard.tsx that the pre-fix guard could not see (BLA-11 F1). */
const HISTORIC_BLIND = {
  "expo-app/components/realtor/RealtorDashboard.tsx": [[719, 805], [1017, 1099]],
};

const failures = [];
const note = (s) => console.log(s);

/** Line numbers (1-based) that sit inside a `/* ... *\/` block comment — legitimately blanked. */
function blockCommentLines(raw) {
  const inside = new Set();
  let i = 0;
  while (i < raw.length) {
    const open = raw.indexOf("/*", i);
    if (open === -1) break;
    // Ignore a `/*` that is itself inside a line comment or a string: the guard blanks line
    // comments first, so only a `/*` at a position the guard still sees can open a block.
    let close = raw.indexOf("*/", open + 2);
    if (close === -1) close = raw.length;
    const from = raw.slice(0, open).split("\n").length;
    const to = raw.slice(0, close).split("\n").length;
    for (let n = from; n <= to; n++) inside.add(n);
    i = close + 2;
  }
  return inside;
}

/** Lines that held code but are blank after `blankNonCode()`. Comment bodies don't count. */
function blindLines(raw) {
  const before = raw.split("\n");
  const after = blankNonCode(raw).src.split("\n");
  const comments = blockCommentLines(raw);
  const blind = [];
  for (let n = 0; n < before.length; n++) {
    const o = before[n].trim();
    const b = after[n].trim();
    if (!o.length || b.length) continue;
    if (/^(\/\/|\*|\/\*)/.test(o) || comments.has(n + 1)) continue; // a comment body
    blind.push(n + 1);
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

// ── Check 0: tokenizer cases ─────────────────────────────────────────────────
// `sees` = substring must survive blanking (it is code). `hides` = substring must be blanked
// (it is a comment or string body). `desync` = expected tokenizer-failure count.
const TOKENIZER_CASES = [
  ["JSX text apostrophe",     "<Text>Couldn't load</Text>\n<Pressable/>",                   { desync: 0, sees: "<Pressable" }],
  ["two JSX apostrophes",     "<Text>Couldn't</Text>\n<Pressable/>\n<Text>they'll</Text>",  { desync: 0, sees: "<Pressable" }],
  ["expr close then text",    "<Text>{name}'s listings</Text>\n<Pressable/>",               { desync: 0, sees: "<Pressable" }],
  ["leading apostrophe",      "<Text>'tis the season</Text>\n<Pressable/>",                 { desync: 0, sees: "<Pressable" }],
  ["JSX text double quote",   '<Text>Say "hi" now</Text>\n<Pressable/>',                    { desync: 0, sees: "<Pressable" }],
  ["named import",            'import { View } from "react-native";',                       { desync: 0, hides: "react-native" }],
  ["deep specifier",          'import x from "react-native/Libraries/x";',                  { desync: 0, hides: "Libraries" }],
  ["banned tag in string",    'const m = "use <Pressable> here";',                           { desync: 0, hides: "<Pressable" }],
  ["banned tag in comment",   "// use <Pressable> never\n<A11yPressable/>",                 { desync: 0, hides: "<Pressable" }],
  ["concat w/ line comment",  'const a = "x" +    // note\n  "y";\n<Pressable/>',           { desync: 0, sees: "<Pressable" }],
  ["nested template",         "const l = `a ${t ? ` at ${t}` : \"\"} b`;\n<Pressable/>",    { desync: 0, sees: "<Pressable" }],
  ["escaped apostrophe",      "const a = 'it\\'s';\n<Pressable/>",                          { desync: 0, sees: "<Pressable" }],
  ["object + array literals", "const o = { k: 'v', l: ['a', \"b\"] };\n<Pressable/>",       { desync: 0, sees: "<Pressable" }],
  ["unterminated string",     "const bad = 'oops\nconst ok = 1;",                           { desync: 1 }],
];

note("a11y-guard tokenizer — blankNonCode() on the positions that broke it (BLA-11 F1)\n");
for (const [name, src, exp] of TOKENIZER_CASES) {
  const r = blankNonCode(src);
  const errs = [];
  if (r.desync.length !== exp.desync) errs.push(`desync ${r.desync.length}, expected ${exp.desync}`);
  if (exp.sees && !r.src.includes(exp.sees)) errs.push(`blanked code it must see: ${exp.sees}`);
  if (exp.hides && r.src.includes(exp.hides)) errs.push(`left non-code visible: ${exp.hides}`);
  note(`  ${errs.length ? "FAIL" : "ok  "}  ${name.padEnd(24)}${errs.join("; ")}`);
  if (errs.length) failures.push(`tokenizer case "${name}": ${errs.join("; ")}`);
}

// ── Check 1: coverage ────────────────────────────────────────────────────────
const FILES = GUARDED_FILES;
note("");
note("a11y-guard coverage — can the guard see every line it claims to guard?\n");
note("file                                                  lines  blind  desync  blind ranges");
note("-".repeat(100));

const rawByFile = new Map();
for (const rel of FILES) {
  const raw = readFileSync(resolve(REPO_ROOT, rel), "utf8");
  rawByFile.set(rel, raw);
  const blind = blindLines(raw);
  const { desync } = blankNonCode(raw);
  note(
    rel.padEnd(53) +
      String(raw.split("\n").length).padStart(6) +
      String(blind.length).padStart(7) +
      String(desync.length).padStart(8) +
      "  " + (asRanges(blind) || "—")
  );
  if (blind.length) failures.push(`${rel}: ${blind.length} blind line(s) — ${asRanges(blind)}`);
  for (const d of desync) {
    failures.push(`${rel}:${raw.slice(0, d.index).split("\n").length} tokenizer desync — ${d.msg}`);
  }
}

// ── Scratch mirror used by checks 2-4 ────────────────────────────────────────
const mirror = mkdtempSync(join(tmpdir(), "a11y-guard-ab-"));
const pristine = new Map();
try {
  for (const f of [GUARD_REL, ...FILES]) {
    mkdirSync(resolve(mirror, dirname(f)), { recursive: true });
    copyFileSync(resolve(REPO_ROOT, f), resolve(mirror, f));
    pristine.set(f, readFileSync(resolve(REPO_ROOT, f), "utf8"));
  }

  /** Run the mirrored guard. `caught` = non-zero exit. `out` is captured either way. */
  const runGuard = () => {
    try {
      const out = execFileSync(process.execPath, [resolve(mirror, GUARD_REL)], { stdio: "pipe" });
      return { caught: false, out: String(out || "") };
    } catch (e) {
      return { caught: true, out: String(e.stdout || "") + String(e.stderr || "") };
    }
  };

  /**
   * The guard prints this on a clean run. Its ABSENCE on an exit-0 run means `main()`
   * never executed — the guard did not run at all, which is not the same thing as the
   * guard finding nothing. Checks 2-4 spawn the guard from a scratch mirror under
   * `os.tmpdir()`, a symlinked path on macOS (`/var/folders` -> `/private/var/folders`)
   * and on several CI layouts; an entry-point gate that string-compares `argv[1]` against
   * `import.meta.url` without `realpathSync()` silently no-ops there. With that bug every
   * probe below reports "not caught", so the whole report reads as *the guard catches
   * nothing* when the truth is *the guard never started*. Check 0 separates the two.
   */
  const CLEAN_MARKER = /a11y-guard: \d+ guarded file\(s\) clean/;

  /** Restore every guarded file, then apply `mutate` to one of them and run the guard. */
  const probe = (rel, mutate) => {
    for (const [f, text] of pristine) writeFileSync(resolve(mirror, f), text);
    writeFileSync(resolve(mirror, rel), mutate(pristine.get(rel)));
    return runGuard();
  };

  const insertAt = (text, lineNo, snippet) => {
    const L = text.split("\n");
    L.splice(lineNo - 1, 0, snippet);
    return L.join("\n");
  };

  // ── Check 0: the mirrored guard actually RUNS (not merely exits 0) ──────────
  note("\nCheck 0 — did the mirrored guard run at all? (exit 0 alone does not prove it)");
  note("-".repeat(100));
  const baseline = runGuard();
  if (baseline.caught) {
    failures.push("mirrored guard is not clean before injection — A/B result would be meaningless");
    note(`  ${"mirror baseline".padEnd(74)}guard FAILS before injection (unexpected)`);
    note(baseline.out);
  } else if (!CLEAN_MARKER.test(baseline.out)) {
    failures.push(
      "mirrored guard exited 0 but printed no clean marker — `main()` never ran, so every " +
        "A/B probe below is vacuous. Most likely an entry-point gate comparing argv[1] to " +
        "import.meta.url without realpathSync() (mirror lives under a symlinked tmpdir).",
    );
    note(`  ${"mirror baseline".padEnd(74)}exit 0 but SILENT — guard did not run`);
    note(`  ${"".padEnd(74)}stdout was: ${JSON.stringify(baseline.out)}`);
  } else {
    note(`  ${"mirror baseline".padEnd(74)}guard ran and is clean (correct)`);
  }

  // ── Check 2: A/B injection at code positions across the whole file ─────────
  const INJECTION = "<Pressable onPress={() => {}}><Text>probe</Text></Pressable>";
  note("\nA/B injection — raw <Pressable> at code positions throughout each guarded file");
  note("-".repeat(100));

  for (const rel of FILES) {
    const raw = pristine.get(rel);
    const blanked = blankNonCode(raw).src.split("\n");
    const rawLines = raw.split("\n");
    // Inject only before lines that blanking leaves untouched: those are unambiguously code,
    // so a control placed there is code too. (A line inside a template literal or block
    // comment is legitimately invisible, and injecting there would prove nothing.)
    const sites = [];
    for (let n = 0; n < rawLines.length; n++) {
      const o = rawLines[n].trim();
      if (o.length > 2 && o === blanked[n].trim()) sites.push(n + 1);
    }
    const pick = [];
    for (let k = 0; k < 8; k++) {
      const s = sites[Math.floor((k * (sites.length - 1)) / 7)];
      if (s && !pick.includes(s)) pick.push(s);
    }
    // Force at least two sites inside each historically blind band.
    for (const [from, to] of HISTORIC_BLIND[rel] ?? []) {
      const inBand = sites.filter((s) => s >= from && s <= to);
      for (const s of [inBand[0], inBand[Math.floor(inBand.length / 2)]]) {
        if (s && !pick.includes(s)) pick.push(s);
      }
    }
    pick.sort((a, b) => a - b);

    for (const line of pick) {
      const r = probe(rel, (t) => insertAt(t, line, INJECTION));
      const band = (HISTORIC_BLIND[rel] ?? []).some(([f, t]) => line >= f && line <= t);
      note(
        `  ${rel}:${line}`.padEnd(66) +
          (band ? "[was blind] " : "            ") +
          (r.caught ? "guard FAILS (correct)" : "guard passes (BUG — control is invisible)")
      );
      if (!r.caught) failures.push(`${rel}:${line} — injected raw <Pressable> was not caught`);
    }
  }

  // ── Check 3: namespace import + qualified tag (BLA-11 F2) ─────────────────
  note("\nNamespace-import probe (F2) — import * as RN + <RN.Pressable>");
  note("-".repeat(100));
  const nsTarget = FILES[0];
  const nsImportOnly = probe(nsTarget, (t) => `import * as RN from "react-native";\n${t}`);
  const nsBoth = probe(nsTarget, (t) => {
    const withImport = `import * as RN from "react-native";\n${t}`;
    const blanked = blankNonCode(withImport).src.split("\n");
    const lines = withImport.split("\n");
    let site = 2;
    for (let n = 1; n < lines.length; n++) {
      if (lines[n].trim().length > 2 && lines[n].trim() === blanked[n].trim()) { site = n + 1; break; }
    }
    return insertAt(withImport, site, "<RN.Pressable onPress={() => {}}><Text>probe</Text></RN.Pressable>");
  });
  for (const [what, r] of [["import * as RN alone", nsImportOnly], ["import + <RN.Pressable>", nsBoth]]) {
    note(`  ${what}`.padEnd(66) + "            " + (r.caught ? "guard FAILS (correct)" : "guard passes (BUG — bypass open)"));
    if (!r.caught) failures.push(`namespace probe "${what}" was not caught`);
  }

  // ── Check 4: fail-closed on a tokenizer desync ────────────────────────────
  note("\nFail-closed probe — unterminated string literal must be an error, not silence");
  note("-".repeat(100));
  const desyncProbe = probe(nsTarget, (t) => `const __probe = 'unterminated\n${t}`);
  const reportsDesync = desyncProbe.caught && /guard desync/.test(desyncProbe.out);
  note("  const __probe = 'unterminated".padEnd(66) + "            " +
    (reportsDesync ? "guard FAILS with `guard desync` (correct)" : "no desync error (BUG — silent blindness)"));
  if (!reportsDesync) failures.push("unterminated string literal did not produce a `guard desync` error");
} finally {
  rmSync(mirror, { recursive: true, force: true });
}

// ── Verdict ──────────────────────────────────────────────────────────────────
note("\n" + "=".repeat(100));
if (failures.length === 0) {
  note("PASS — blankNonCode() blanks no code, reports no desync, and the guard fails on every");
  note("       injected bypass: raw <Pressable> at code positions throughout both guarded files");
  note("       (including the two bands that were blind before BLA-13), the namespace import,");
  note("       the qualified <RN.Pressable> tag, and an unterminated string literal.");
  process.exit(0);
}
note(`FAIL — ${failures.length} problem(s):\n`);
for (const f of failures) note("  " + f);
note(
  `\nIf blind lines are listed above, the cause is almost certainly blankNonCode() treating a\n` +
  `quote as a string opener where it is prose. The apostrophes it treated as delimiters:\n`
);
for (const rel of FILES) {
  const raw = rawByFile.get(rel) ?? readFileSync(resolve(REPO_ROOT, rel), "utf8");
  const blanked = blankNonCode(raw).src.split("\n");
  raw.split("\n").forEach((line, n) => {
    if (line.includes("'") && blanked[n].includes("'") && !/^\s*(\/\/|\*|\/\*)/.test(line)) {
      note(`  ${rel}:${n + 1}  ${line.trim().slice(0, 88)}`);
    }
  });
}
process.exit(1);
