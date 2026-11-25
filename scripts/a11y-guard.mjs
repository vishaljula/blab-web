#!/usr/bin/env node
/**
 * a11y-guard — AUDIT-001 / T3 (BLA-5)
 *
 * Structural guard required by `uxd-review-addendum.md` §5.4: make unlabelled controls
 * impossible to add, rather than merely absent today.
 *
 * Layer 1 of the guard is the type system — `A11yPressable` / `A11yTextInput` in
 * `expo-app/components/a11y/AccessiblePressable.tsx` declare `accessibilityLabel` and
 * `accessibilityRole` as required props, so omitting one fails `npx tsc --noEmit`.
 *
 * Layer 2 is this script, which closes the bypass: it fails if a guarded file reaches for a
 * raw `Pressable` / `TouchableOpacity` / `TextInput` instead of the wrapper, and it fails if a
 * wrapper call site is missing its accessibility props (belt-and-braces with the type error,
 * and it catches the `{...spread}` case the type checker cannot see through).
 *
 * Zero dependencies — runs on plain Node. Wired into `.github/workflows/ci.yml` and
 * `npm run lint:a11y`.
 */

import { readFileSync, realpathSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Files under accessibility guard. Add a file here once it has been swept; the guard then
 * keeps it swept. Flow #1 per PROTECTED_SURFACES.md "Open for UXD Audit".
 */
export const GUARDED_FILES = [
  "expo-app/app/(tabs)/profile.tsx",
  "expo-app/components/realtor/RealtorDashboard.tsx",
];

/** Raw RN primitives that bypass the accessible wrappers. */
export const BANNED = {
  Pressable: "A11yPressable",
  TouchableOpacity: "A11yPressable",
  TouchableHighlight: "A11yPressable",
  TouchableWithoutFeedback: "A11yPressable",
  TextInput: "A11yTextInput",
};

/** Wrapper components and the props each one must carry at every call site. */
const REQUIRED_PROPS = {
  A11yPressable: ["accessibilityLabel", "accessibilityRole"],
  A11yTextInput: ["accessibilityLabel"],
};

/**
 * Punctuation that can legally precede the start of a string literal. A `'` or `"` that
 * follows anything else is prose — most often an apostrophe in JSX text (`Couldn't`), which
 * must NOT open a string, or the guard goes blind from there to the next apostrophe in the
 * file. See qa-baselines/audit-001/tools/verify-a11y-guard-coverage.mjs.
 *
 * `}` and `>` are deliberately absent: `<Text>{name}'s listings</Text>` and
 * `<Text>'tis</Text>` are JSX text, not expression position.
 */
const QUOTE_OPENER_PUNCT = new Set(["=", "(", ",", "[", "{", ":", ";", "?", "&", "|", "!", "+"]);

/** Keywords that can legally precede a string literal (`from "react-native"`). */
const QUOTE_OPENER_KEYWORDS = new Set([
  "from", "return", "case", "typeof", "instanceof", "in", "of", "as", "new",
  "throw", "await", "yield", "delete", "void", "do", "else", "default", "extends", "satisfies",
]);

/**
 * Is the `'` / `"` at `pos` in expression position, i.e. could it legally open a string?
 *
 * `out` is the *partially blanked* output array, not the original source. Scanning runs
 * left to right, so everything before `pos` has already had its comments and string bodies
 * replaced by spaces — which is exactly what this lookback needs. Reading the raw source
 * instead would let a trailing line comment hide the operator in front of it:
 *
 *     boxShadow: "0 2px 4px …, " +    // crisp near edge
 *                "0 8px 20px …, " +   // <- lookback must land on `+`, not on `edge`
 */
function opensString(out, pos) {
  let k = pos - 1;
  while (k >= 0 && /\s/.test(out[k])) k--;
  if (k < 0) return true; // start of file
  const c = out[k];
  if (QUOTE_OPENER_PUNCT.has(c)) return true;
  if (!/[A-Za-z0-9_$]/.test(c)) return false; // `}`, `>`, `)`, `]`, a letter-less symbol
  // Preceding token is a word: a string may follow a keyword, never an identifier.
  let w = k;
  while (w >= 0 && /[A-Za-z0-9_$]/.test(out[w])) w--;
  return QUOTE_OPENER_KEYWORDS.has(out.slice(w + 1, k + 1).join(""));
}

/**
 * Strip comments and string/template literals so matches inside prose or copy are not
 * mistaken for code. Replaces with same-length blanks to keep line numbers intact.
 *
 * Returns `{ src, desync }`. `desync` holds tokenizer failures — a `'`/`"` that opened in
 * expression position but found no partner before end of line. The guard FAILS on those
 * rather than blanking the rest of the file: silent blindness is the failure mode this
 * function has to rule out, so anything it cannot tokenise is an error, not an assumption.
 */
export function blankNonCode(src) {
  const out = src.split("");
  const desync = [];
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
    } else if (src[i] === "`") {
      // Template literals legitimately span lines; `${}` interiors are blanked with them,
      // which is safe here because a banned tag inside one is still a banned tag in a string.
      let j = i + 1;
      while (j < src.length) {
        if (src[j] === "\\") j += 2;
        else if (src[j] === "`") break;
        else j++;
      }
      blank(i + 1, Math.min(j, src.length));
      i = Math.min(j + 1, src.length);
    } else if ((src[i] === '"' || src[i] === "'") && opensString(out, i)) {
      const q = src[i];
      let j = i + 1;
      let closed = false;
      while (j < src.length) {
        if (src[j] === "\\") j += 2;
        else if (src[j] === "\n") break; // single-quoted strings do not span lines
        else if (src[j] === q) {
          closed = true;
          break;
        } else j++;
      }
      if (!closed) {
        desync.push({
          index: i,
          msg: `unterminated ${q === '"' ? "double" : "single"}-quoted string — a11y-guard cannot tokenise this line, so it refuses to vouch for the file (fix the quote, or teach opensString() about this position)`,
        });
        i++; // do not consume: blanking to the next quote is exactly the old blind-spot bug
        continue;
      }
      blank(i + 1, j);
      i = j + 1;
    } else {
      i++;
    }
  }
  return { src: out.join(""), desync };
}

const lineOf = (src, index) => src.slice(0, index).split("\n").length;

/**
 * Read the attribute text of the JSX opening tag starting at `start` (the `<`), tracking
 * brace depth so nested JSX expressions do not terminate the tag early.
 */
function readOpeningTag(src, start) {
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (c === "{") depth++;
    else if (c === "}") depth--;
    else if (c === ">" && depth === 0) return src.slice(start, i + 1);
  }
  return src.slice(start);
}

/**
 * JSX tag matcher for `name`, allowing one namespace qualifier: `<Pressable` and
 * `<RN.Pressable` both match. Without the qualifier, `import * as RN from "react-native"`
 * walks straight past both guard layers (the type checker has no opinion on it either).
 */
const jsxTag = (name) => new RegExp(`<(?:[A-Za-z_$][\\w$]*\\.)?${name}(?![A-Za-z0-9_])`, "g");

/** Strip the optional `Ns.` qualifier so a match can be reported by its bare tag name. */
const bareTag = (text) => text.replace(/^<(?:[A-Za-z_$][\w$]*\.)?/, "<");

/** Collect every a11y violation in the guarded files. Pure — returns, never exits. */
export function collectViolations(files = GUARDED_FILES, root = REPO_ROOT) {
  const violations = [];

  for (const rel of files) {
    const abs = resolve(root, rel);
    let raw;
    try {
      raw = readFileSync(abs, "utf8");
    } catch {
      violations.push({
        file: rel,
        line: 0,
        msg: "guarded file not found — update GUARDED_FILES in scripts/a11y-guard.mjs if it moved",
      });
      continue;
    }
    const { src, desync } = blankNonCode(raw);

    // 0. Fail closed: if the scanner lost the thread, say so instead of reporting green over
    //    whatever it blanked. This is the BLA-13 regression — 292 lines were silently blind.
    for (const d of desync) {
      violations.push({ file: rel, line: lineOf(raw, d.index), msg: `guard desync — ${d.msg}` });
    }

    // 1. No raw interactive primitives — neither imported nor used as JSX.
    const seenBannedLines = new Set();
    for (const [banned, replacement] of Object.entries(BANNED)) {
      for (const m of src.matchAll(jsxTag(banned))) {
        seenBannedLines.add(`${banned}:${lineOf(src, m.index)}`);
        violations.push({
          file: rel,
          line: lineOf(src, m.index),
          msg: `raw ${bareTag(m[0])}> is banned in guarded files — use <${replacement}> from "@/components/a11y/AccessiblePressable" so a label and role cannot be omitted`,
        });
      }
    }

    // 1b. Belt-and-braces canary: run the same matchers over the *unblanked* source. Any hit
    //     the blanked pass missed on a non-comment line means blanking ate real code — report
    //     it as a desync rather than trusting the clean result.
    const rawLines = raw.split("\n");
    for (const banned of Object.keys(BANNED)) {
      for (const m of raw.matchAll(jsxTag(banned))) {
        const line = lineOf(raw, m.index);
        if (seenBannedLines.has(`${banned}:${line}`)) continue;
        const text = rawLines[line - 1] ?? "";
        const col = m.index - raw.lastIndexOf("\n", m.index - 1) - 1;
        const commented = /^\s*(\/\/|\*|\/\*)/.test(text) || text.slice(0, col).includes("//");
        if (commented) continue;
        violations.push({
          file: rel,
          line,
          msg: `guard desync — ${bareTag(m[0])} is present in the source but was blanked before matching; the guard cannot vouch for this file (see qa-baselines/audit-001/tools/verify-a11y-guard-coverage.mjs)`,
        });
      }
    }

    // Catch the import too, so the bypass is visible even before any JSX is written.
    // Matched against `raw` because the module specifier is a string literal.
    for (const m of raw.matchAll(/import\s*\{([^}]*)\}\s*from\s*["']react-native["']/g)) {
      const named = m[1].split(",").map((t) => t.trim().split(/\s+as\s+/)[0].trim());
      for (const n of named) {
        if (Object.prototype.hasOwnProperty.call(BANNED, n)) {
          violations.push({
            file: rel,
            line: lineOf(raw, m.index),
            msg: `"${n}" must not be imported from react-native in a guarded file — import ${BANNED[n]} from "@/components/a11y/AccessiblePressable" instead`,
          });
        }
      }
    }

    // Namespace / default / require access to react-native hands out every banned primitive
    // under a name no import check can enumerate (`RN.Pressable`, `React.createElement(RN.Pressable)`).
    // Only the named-import form is reviewable, so only that form is allowed.
    const WHOLE_MODULE = [
      [/import\s+\*\s+as\s+([A-Za-z_$][\w$]*)\s+from\s*["']react-native["']/g, (m) => `import * as ${m[1]}`],
      [/import\s+([A-Za-z_$][\w$]*)\s*(?:,|\s+from)\s*(?:\{[^}]*\}\s*from\s*)?["']react-native["']/g, (m) => `default import ${m[1]}`],
      [/require\(\s*["']react-native["']\s*\)/g, () => `require("react-native")`],
    ];
    for (const [re, describe] of WHOLE_MODULE) {
      for (const m of raw.matchAll(re)) {
        violations.push({
          file: rel,
          line: lineOf(raw, m.index),
          msg: `${describe(m)} from "react-native" is banned in a guarded file — it exposes ${Object.keys(BANNED).join("/")} under a qualified name that no import check can enumerate; use named imports plus the A11y* wrappers`,
        });
      }
    }

    // 2. Every wrapper call site carries its required accessibility props.
    for (const [component, required] of Object.entries(REQUIRED_PROPS)) {
      for (const m of src.matchAll(jsxTag(component))) {
        const tag = readOpeningTag(src, m.index);
        const line = lineOf(src, m.index);
        if (/\{\s*\.\.\./.test(tag)) {
          violations.push({
            file: rel,
            line,
            msg: `<${component}> uses a prop spread — the accessibility props cannot be verified statically; pass accessibilityLabel/accessibilityRole explicitly`,
          });
          continue;
        }
        for (const prop of required) {
          if (!new RegExp(`(^|\\s)${prop}\\s*=`).test(tag)) {
            violations.push({ file: rel, line, msg: `<${component}> is missing required prop "${prop}"` });
          }
        }
      }
    }
  }

  violations.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
  return violations;
}

/** CLI. Importers (the coverage verifier) get the exports without this running. */
function main() {
  const label = "a11y-guard";
  const violations = collectViolations();
  if (violations.length > 0) {
    for (const v of violations) {
      console.error(`${v.file}:${v.line}  error  ${v.msg}  [${label}]`);
    }
    console.error(
      `\n${label}: ${violations.length} error(s) in ${new Set(violations.map((v) => v.file)).size} file(s).`
    );
    process.exit(1);
  }
  console.log(`${label}: ${GUARDED_FILES.length} guarded file(s) clean — every control has a label and a role.`);
}

/**
 * True when this file is the entry point. Compares real paths: `import.meta.url` is already
 * symlink-resolved by the loader while `argv[1]` is not, so a plain string compare silently
 * skips `main()` under any symlinked path (e.g. macOS `/var` -> `/private/var`) — which would
 * turn the guard into a no-op that exits 0.
 */
function invokedDirectly() {
  if (!process.argv[1]) return false;
  const self = fileURLToPath(import.meta.url);
  try {
    return realpathSync(process.argv[1]) === realpathSync(self);
  } catch {
    return resolve(process.argv[1]) === self;
  }
}

if (invokedDirectly()) main();
