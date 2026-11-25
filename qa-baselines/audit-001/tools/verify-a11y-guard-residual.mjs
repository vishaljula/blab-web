#!/usr/bin/env node
/**
 * verify-a11y-guard-residual — AUDIT-001 / T3 (BLA-11 Layer-2 re-review of BLA-13)
 *
 * BLA-13 closed the two holes this review raised: the 292-line apostrophe blind spot (F1)
 * and the namespace-import bypass (F2). `verify-a11y-guard-coverage.mjs` is the regression
 * test for both and it passes.
 *
 * This file is the *next* layer of the same question. The re-review attacked the new
 * tokenizer with cases outside that suite and found four residual holes. None is live in
 * either guarded file today — all four are latent, and all four are cheap to close — so
 * they were raised as follow-ups on the guard-hardening ticket rather than as T3 blockers.
 * This script is their definition of done.
 *
 *   R1  BLIND TAIL AFTER `//`  (the F1 class, narrowed to one line)
 *       `blankNonCode()` treats `//` as a line-comment opener wherever it appears outside a
 *       string that `opensString()` accepted. A URL in JSX text (`<Text>see https://x</Text>`)
 *       therefore blanks the REST OF THAT LINE — and the 1b canary explicitly skips any line
 *       whose banned tag sits after a `//` (`text.slice(0, col).includes("//")`), so the
 *       backstop is disabled for exactly the lines the blanker got wrong. Worse, the coverage
 *       verifier cannot see it either: `blindLines()` only counts a line blind when the WHOLE
 *       line blanks (`!o.length || b.length` -> continue), and this blanks a tail. Three
 *       layers blind to one class is the shape F1 had.
 *       Not live: 8 `://` lines in the guarded files, all inside properly-opened literals;
 *       0 partial-blind lines measured at 7cb50b0.
 *
 *   R2  BLIND TAIL VIA A STRING `opensString()` REJECTS
 *       Same mechanism, reached from the other side. `=>`, `>`, `<`, `-`, `*`, `/` are not in
 *       QUOTE_OPENER_PUNCT, so `const u = () => "https://x";` never opens a string — and the
 *       `//` inside it then blanks the rest of the line. Conservative for any other content
 *       (an unblanked string yields false positives, never false negatives); `//` is the one
 *       payload that inverts it.
 *       Not live: 0 occurrences of `=> "` in expo-app/ + src/ at 7cb50b0.
 *
 *   R3  FALSE-POSITIVE DESYNC FROM A BLOCK COMMENT  (usability, not a bypass)
 *       The 1b canary's `commented` test is `/^\s*(\/\/|\*|\/\*)/`, which only recognises a
 *       block-comment interior when the line STARTS with `*`. Documenting the banned pattern
 *       in a JSDoc-less block comment therefore fails CI with `guard desync` — a confusing
 *       error whose natural "fix" is to weaken the canary that F1 depends on.
 *       Not live, but one multi-line block comment in RealtorDashboard.tsx already has
 *       non-star continuation lines; it fails only once a banned tag is named inside one.
 *
 *   R4  EMPTY ACCESSIBLE NAME PASSES BOTH LAYERS
 *       `accessibilityLabel={""}` satisfies the type system (it is a `string`) and satisfies
 *       the guard (`(^|\s)accessibilityLabel\s*=`). An empty accessible name is precisely the
 *       defect the guard exists to prevent — the control is announced as unlabelled.
 *       Not live: every call site in both guarded files passes a non-empty literal or template.
 *
 *   R5  DYNAMIC IMPORT IS NOT IN THE WHOLE-MODULE BAN
 *       BLA-13 banned `import * as`, default import and `require()` of react-native, which
 *       closes `React.createElement(RN.Pressable, …)`. `await import("react-native")` is the
 *       remaining door to the same namespace object.
 *       Not live: 0 occurrences in expo-app/ + src/ at 7cb50b0.
 *
 * Each probe below injects its case into a scratch mirror of the real guarded file and asks
 * the real guard about it. A probe PASSES when the guard reports the injected control; it
 * FAILS while the hole is open. The script therefore exits 1 today, on purpose: it is the
 * acceptance test for the hardening ticket, not a claim that the tree is broken.
 *
 * Preceded by the same MIRROR LIVENESS assertion as the coverage verifier, because "not
 * caught" is only evidence of a bypass if the guard actually ran.
 *
 * Usage:  node qa-baselines/audit-001/tools/verify-a11y-guard-residual.mjs
 * Exit 0 = every residual hole closed.  Exit 1 = at least one still open (expected at 7cb50b0).
 */

import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, copyFileSync, rmSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

import { GUARDED_FILES } from "../../../scripts/a11y-guard.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const GUARD_REL = "scripts/a11y-guard.mjs";
const DASHBOARD = "expo-app/components/realtor/RealtorDashboard.tsx";

const note = (s) => console.log(s);
const open = [];

note("verify-a11y-guard-residual — BLA-11 re-review of the BLA-13 tokenizer fix");
note("=".repeat(100));

const mirror = mkdtempSync(join(tmpdir(), "a11y-guard-residual-"));
const pristine = new Map();
try {
  for (const f of [GUARD_REL, ...GUARDED_FILES]) {
    mkdirSync(resolve(mirror, dirname(f)), { recursive: true });
    copyFileSync(resolve(REPO_ROOT, f), resolve(mirror, f));
    pristine.set(f, readFileSync(resolve(REPO_ROOT, f), "utf8"));
  }

  const runGuard = () => {
    try {
      const out = execFileSync(process.execPath, [resolve(mirror, GUARD_REL)], { stdio: "pipe" });
      return { caught: false, out: String(out || "") };
    } catch (e) {
      return { caught: true, out: String(e.stdout || "") + String(e.stderr || "") };
    }
  };

  /** See the coverage verifier: an exit-0 run that printed nothing never executed `main()`. */
  const CLEAN_MARKER = /a11y-guard: \d+ guarded file\(s\) clean/;

  /**
   * Inject `snippet` at `lineNo` of `rel` in the mirror (every other file pristine) and run
   * the real guard against it.
   */
  const probe = (rel, lineNo, snippet) => {
    for (const [f, text] of pristine) writeFileSync(resolve(mirror, f), text);
    const L = pristine.get(rel).split("\n");
    L.splice(lineNo - 1, 0, snippet);
    writeFileSync(resolve(mirror, rel), L.join("\n"));
    return runGuard();
  };

  note("\nMirror liveness — did the mirrored guard run at all? (exit 0 alone does not prove it)");
  note("-".repeat(100));
  const baseline = runGuard();
  if (baseline.caught) {
    open.push("mirrored guard is not clean before injection — every probe below is meaningless");
    note(`  ${"mirror baseline".padEnd(70)}guard FAILS before injection (unexpected)`);
    note(baseline.out);
  } else if (!CLEAN_MARKER.test(baseline.out)) {
    open.push(
      "mirrored guard exited 0 but printed no clean marker — `main()` never ran, so every " +
        "probe below is vacuous (entry-point gate without realpathSync(); see BLA-11 F5)",
    );
    note(`  ${"mirror baseline".padEnd(70)}exit 0 but SILENT — guard did not run`);
  } else {
    note(`  ${"mirror baseline".padEnd(70)}guard ran and is clean (correct)`);
  }

  /**
   * A code position inside the component body of RealtorDashboard.tsx. Line 300 sits in the
   * middle of the file's helper components — unambiguously code, and inside neither of the
   * two historically blind bands, so a miss here is this script's finding and not F1's.
   */
  const SITE = 300;

  const PROBES = [
    {
      id: "R0",
      title: "control — bare <Pressable> at a plain code position",
      expectOpen: false,
      snippet: `      const __r0 = <Pressable onPress={() => {}} />;`,
    },
    {
      id: "R1",
      title: "blind tail — URL in JSX text, control after it on the same line",
      expectOpen: true,
      snippet:
        `      const __r1 = <><Text>see https://blab.in</Text>` +
        `<Pressable onPress={() => {}} /></>;`,
    },
    {
      id: "R2",
      title: "blind tail — URL in a string opensString() rejects (after `=>`)",
      expectOpen: true,
      snippet:
        `      const __r2u = () => "https://blab.in";` +
        ` const __r2 = <Pressable onPress={() => {}} />;`,
    },
    {
      id: "R3",
      title: "false-positive desync — banned tag named in a non-star block comment",
      expectOpen: true,
      // Inverted assertion: this one must NOT be reported. `caught` here is the defect.
      invert: true,
      snippet: `      /* bad example, for the next reader:\n   <Pressable /> must never appear here\n*/`,
    },
    {
      id: "R4",
      title: "empty accessible name — accessibilityLabel={\"\"} passes type + guard",
      expectOpen: true,
      snippet:
        `      const __r4 = <A11yPressable accessibilityLabel={""} accessibilityRole="button"` +
        ` onPress={() => {}} />;`,
    },
    {
      id: "R5",
      title: "dynamic import — await import(\"react-native\") + createElement(RN.Pressable)",
      expectOpen: true,
      snippet:
        `      const __r5ns = await import("react-native");` +
        ` const __r5 = React.createElement(__r5ns.Pressable, {});`,
    },
    {
      // Added while closing R1-R5: the `://` rule does not cover a protocol-relative `//host`,
      // which is indistinguishable from a comment without a real parser. The tokenizer still
      // blanks that tail, so the canary has to be the layer that notices. It is only allowed
      // to trust a `//` comment that OPENS its line; a mid-line one is reported as a desync.
      // Fail closed, not silently clean — the F1 rule applied to the residual case.
      id: "R6",
      title: "blind tail — protocol-relative //host, control after it on the same line",
      expectOpen: true,
      snippet: `      const __r6 = <><Text>at //blab.in</Text><Pressable onPress={() => {}} /></>;`,
    },
  ];

  note("\nResidual probes against the real guard (mirror of RealtorDashboard.tsx, line 300)");
  note("-".repeat(100));

  for (const p of PROBES) {
    const { caught, out } = probe(DASHBOARD, SITE, p.snippet);
    const good = p.invert ? !caught : caught;
    const detail = p.invert
      ? caught
        ? "guard reports a FALSE desync (hole open)"
        : "guard stays quiet (correct)"
      : caught
        ? "guard FAILS (correct)"
        : "guard reports CLEAN — bypass (hole open)";
    note(`  ${p.id}  ${p.title.padEnd(74)}  ${detail}`);
    if (!good) {
      open.push(`${p.id} — ${p.title}`);
      const first = out.split("\n").find((l) => /error/.test(l));
      if (first) note(`      ${first.trim()}`);
    }
  }
} finally {
  rmSync(mirror, { recursive: true, force: true });
}

note("\n" + "=".repeat(100));
if (open.length) {
  note(`${open.length} residual hole(s) OPEN — expected at 7cb50b0; this script is the`);
  note("acceptance test for the a11y-guard hardening follow-up, not a regression in T3:");
  for (const f of open) note(`  - ${f}`);
  note("\nNone of these is live in either guarded file today; see the header for the measurements.");
  process.exit(1);
}
note("PASS — every residual hole raised in the BLA-11 re-review is closed.");
