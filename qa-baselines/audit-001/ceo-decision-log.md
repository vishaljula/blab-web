# AUDIT-001 — Founder CEO Decision Log & Binding Spec Amendment

| | |
| :-- | :--- |
| **Ticket** | BLA-2 `[AUDIT-001]` |
| **Decision comment** | `b4aa0549-f369-4a53-adf9-3a770d25f3a5` — 2026-11-25T07:45:15Z, `local-board` |
| **Author of this log** | Principal UX Designer |
| **Status** | **APPROVED — Tickets 0–5 cleared for implementation** |
| **Branch** | `agent/uxd-audit` (or scoped `agent/<role>/<slug>`) |
| **Merge rule** | **Draft PRs only. Never push to `main`.** |

This document is **binding and supersedes** the corresponding sections of `uxd-critique.md`
and `uxd-review-addendum.md` where they conflict. Implementers: read this file **after**
the critique, and let it win.

---

## 1. Decisions on the three blocking questions

### D1 — `soft_cap` tier policy (answers critique §J1, fixes §E1)

> `soft_cap` is the permanent Starter Free tier (**2 active listings / 1 active handoff cap**),
> matching the server. Fix the UI branch so ONLY `pro` / `pro_plus` get the Unlimited Pro
> banner (`free_trial` and `soft_cap` both see the Starter 2/1 cap).

**This amends the §H5 tier table.** The approved four-state matrix is now:

| Tier | Banner | Cap bars | May the words "unlimited" appear as a *current* entitlement? |
| :--- | :--- | :--- | :--- |
| `free_trial` | Full Founding-500 conversion panel | **Starter 2 / 1, shown** | **No** |
| `soft_cap` | Full Founding-500 conversion panel, headed `FREE TIER — 2 LISTINGS / 1 HANDOFF` | **Starter 2 / 1, shown** | **No** |
| `pro` | Compact Pro confirmation strip | Hidden (999/999) | Yes |
| `pro_plus` | As `pro`, with the Pro+ tier badge | Hidden (999/999) | Yes |

**Consequential copy change to §H5 Zone 2 — do not miss this.** The approved value stack
contained the line `✓ Unlimited listings & handoffs`. Under D1, `free_trial` is capped 2/1
server-side, so that line must read as a **post-claim benefit of the seat**, never as a
description of the realtor's present state. Required framing:

```
What you get when you claim:
  ✓ 5 free HD + 9:16 Reel shoots
  ✓ Unlimited listings & handoffs      ← explicitly future-tense, under a "when you claim" head
```

Shipping the benefit line adjacent to a visible `1 of 2` cap bar **without** that heading is
the same trust defect as E1 in a new costume. The panel must never simultaneously assert a
cap and an absence of a cap.

**Source of truth:** branch on the server's `maxListingCapacity` / `maxHandoffCapacity`
(or an explicit `isPaidPro` flag), **never** on `subscriptionTier === "free_trial"`.
The server's test is `tier === "pro" || tier === "pro_plus"`
(`src/app/api/realtors/dashboard/route.ts:212`).

### D2 — Founding-500 scarcity counter (answers critique §J4, feeds §H5 Zone 1)

> Use **100% real DB count in PROD** (remove any `+ 42` offset when `BLAB_ENV === 'production'`;
> UAT sandbox may keep a simulated offset only if `BLAB_ENV !== 'production'`).

**This adds server scope to Ticket 2.** The offset is a single line:

```js
// src/app/api/realtors/dashboard/route.ts:236  — CURRENT
claimedCount: Math.min(499, (st.founding_pro_claimed ?? 1) + 42),
```

Approved shape:

- `BLAB_ENV === 'production'` → `claimedCount` is the **real** `founding_pro_claimed`, no offset,
  no `+ 42`, no synthetic floor.
- `BLAB_ENV !== 'production'` → the simulated offset **may** remain, for UAT demo only.
- Clamp to `totalCap` (500) is retained as a display-safety bound in both branches.
- The env branch must be evaluated **server-side only**. Do not leak a simulation flag into a
  client bundle beyond what the panel needs to render honestly.

This change touches **Marketplace Invariant #5 (UAT vs. PROD strict isolation)**, so it is a
QA-verified line, not a drive-by edit. `nearbyHandoffs14d` carries a comparable
`Math.max(3, …)` floor on line 241 — out of approved scope, but **flag it in the Ticket 2 PR
description** so the CEO can decide separately.

### D3 — `theme.ts` unlock & Ops card (answers critique §J5 and §J7)

> Approved to unlock `theme.ts` (**additive-only** tokens, preserving all existing colors)
> + align the Founder Ops card to the Blab palette (keeping both signed-in and signed-out
> entry points intact).

Binding constraints on Ticket 4:

1. **Additive only.** New exports may be added. **No existing export may be modified, renamed,
   recoloured, or removed** — including every key in `TIER_COLORS`.
2. `theme.ts` is a shared surface under Protected Surfaces §7, so the unlock carries a
   **full Protected-Surface screenshot sweep** obligation. That is why Ticket 0 blocks Ticket 4.
3. **Carried forward from `uxd-review-addendum.md` §2.1 — still in force:** the new dark-mode
   token pairs were specified but their contrast ratios were **never machine-verified**.
   Ticket 4 must attach verifier output for every new pair, light **and** dark, or it does not
   merge. Unverified dark pairs were the one material error found in this audit; do not
   reintroduce it.
4. Ops card (§H2): both the signed-in and signed-out entry points stay, and prominence is
   preserved. The dark slate-navy treatment is the only thing being traded away.

---

## 2. Approved sequence

```
Ticket 0  (baseline capture)
   ├──> Ticket 1  (server-authoritative data)  ──┐
   └──> Ticket 3  (accessibility pass)           │   1 and 3 run in parallel
                                                 ▼
                                          Ticket 2  (Founding-500 rebuild + D2 server fix)
                                                 ▼
                                          Ticket 4  (additive token layer)
                                                 ▼
                                          Ticket 5  (visual refactor)
```

**Note on my earlier recommendation.** `uxd-review-addendum.md` §5.3 recommended holding
Tickets 4 and 5. The CEO has cleared all six with the `theme.ts` unlock granted explicitly.
That is the CEO's call and it is now the plan of record — 4 and 5 proceed. The addendum's
substantive guard rails survive as **acceptance criteria rather than as reasons to defer**:
Ticket 0 blocks 4 and 5, and Ticket 4 ships only with attached contrast-verifier output.

## 3. Items cleared by blanket approval (no separate answer given)

The decision cleared "All Tickets 0–5", which carries these spec items as written. Called out
so nobody mistakes silence for omission:

- **§J3 — `FREE 3M` copy.** All surfaces standardise on the server value
  `freeTrialThrough: "2027-03-31"`, rendered "free through 31 Mar 2027". No hardcoded
  duration strings.
- **§J6 — Hero reduction (§H4).** Avatar 76 → 52, glow ring dropped, ~44pt returned to the fold.
  **Amended per addendum §5.1:** the opacity change is **dropped** — it rested on a contrast
  defect that independent verification disproved (`greeting` passes AA). Size reduction only.
- **§J8 — Ticket 0 execution.** Proceeds as its own ticket, assigned to Independent QA.

## 4. Verification contract — every ticket, no exceptions

Per **Invariant #6 (Two-Layer Verification SOP)**:

- **Layer 1 — Lead Mobile/Web Engineer:** `cd expo-app && npx tsc --noEmit` → 0 errors;
  `GET /api/ops/qa-runner` → `10/10 PASS`; paired-file sync per CLAUDE.md §1 verified.
- **Layer 2 — Code Reviewer + Independent Mobile/Web QA:** independent PR review and a
  Maestro (iOS) / Playwright (Web) regression check against `PROTECTED_SURFACES.md`,
  before any human CEO merge.
- **Draft PRs only.** No agent pushes to `main`.

---

*Companion documents: `uxd-critique.md` (full critique + before/after spec),
`uxd-review-addendum.md` (independent verification + correction log),
`qa-baseline.md` (QA regression baseline + Ticket 0 screenshot matrix).*
