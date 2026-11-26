# BLA-24 re-verification at branch HEAD `983b784`

The banked evidence one directory up was measured at `0cdada0` — the commit the BLA-24
work product and the BLA-25 QA review both point at. Two commits have landed on
`agent/uxd-audit` since, and one of them (`a26209d`, BLA-8 / T5) edits
`expo-app/components/realtor/RealtorDashboard.tsx` — the same file as defect 2's fix.
This directory re-runs the same harness against the drifted tree so QA can tell a
regression in the later work from a defect in the BLA-24 fix itself.

- Harness: `qa-baselines/audit-001/tools/verify-ceo-visual-bugs.mjs` (unmodified)
- Tree: `983b784` + the concurrent run's untracked `qa-baselines` churn
- Verdict: **ALL_PASS**, 14/14 checks, measured from live rendered geometry at 320/360/390/1440pt
- `npx tsc --noEmit` in `expo-app/`: 0 errors at the same tree

Reproduce:

    QA_OUT=<dir> node qa-baselines/audit-001/tools/verify-ceo-visual-bugs.mjs

Requires the Expo web dev server on `:8081` and the Next.js API on `:3000`. The harness
refuses to run when `BLAB_ENV === 'production'` (Marketplace Invariant #5).
