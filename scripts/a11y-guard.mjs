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

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Files under accessibility guard. Add a file here once it has been swept; the guard then
 * keeps it swept. Flow #1 per PROTECTED_SURFACES.md "Open for UXD Audit".
 */
const GUARDED_FILES = [
  "expo-app/app/(tabs)/profile.tsx",
  "expo-app/components/realtor/RealtorDashboard.tsx",
];

/** Raw RN primitives that bypass the accessible wrappers. */
const BANNED = {
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
 * Strip comments and string/template literals so matches inside prose or copy are not
 * mistaken for code. Replaces with same-length blanks to keep line numbers intact.
 */
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

const violations = [];

for (const rel of GUARDED_FILES) {
  const abs = resolve(REPO_ROOT, rel);
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
  const src = blankNonCode(raw);

  // 1. No raw interactive primitives — neither imported nor used as JSX.
  for (const [banned, replacement] of Object.entries(BANNED)) {
    for (const m of src.matchAll(new RegExp(`<${banned}(?![A-Za-z0-9_])`, "g"))) {
      violations.push({
        file: rel,
        line: lineOf(src, m.index),
        msg: `raw <${banned}> is banned in guarded files — use <${replacement}> from "@/components/a11y/AccessiblePressable" so a label and role cannot be omitted`,
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

  // 2. Every wrapper call site carries its required accessibility props.
  for (const [component, required] of Object.entries(REQUIRED_PROPS)) {
    for (const m of src.matchAll(new RegExp(`<${component}(?![A-Za-z0-9_])`, "g"))) {
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

const label = "a11y-guard";
if (violations.length > 0) {
  violations.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
  for (const v of violations) {
    console.error(`${v.file}:${v.line}  error  ${v.msg}  [${label}]`);
  }
  console.error(
    `\n${label}: ${violations.length} error(s) in ${new Set(violations.map((v) => v.file)).size} file(s).`
  );
  process.exit(1);
}

console.log(`${label}: ${GUARDED_FILES.length} guarded file(s) clean — every control has a label and a role.`);
