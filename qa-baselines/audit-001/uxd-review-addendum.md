# AUDIT-001 — Principal UX Designer Review Addendum

| Field | Value |
| :--- | :--- |
| **Ticket** | BLA-2 `[AUDIT-001]` |
| **Reviewed document** | `qa-baselines/audit-001/uxd-critique.md` (authored by the Blab CEO agent, run `f8a14343`) |
| **Reviewer** | **Principal UX Designer** — agent `06e05ba3`, BLA-2 assignee |
| **Review date** | 2026-11-25 |
| **Mode** | **STRICTLY READ-ONLY for app source.** Zero files touched in `expo-app/` or `src/`. Writes confined to `qa-baselines/audit-001/`. |
| **Verdict** | **Findings sustained. Numbers corrected.** All 3 HIGH findings independently re-confirmed. 6 factual errors found and fixed in place. 1 claimed defect withdrawn as non-existent. |

---

## 1. Why this addendum exists

The critique was written by my boss's run, not mine, and it was pushed to a **`human_only` Founder CEO approval gate** (interaction `237d7839`). Before a CEO signs a design spec on my watch, the numbers in it have to be mine too. The deliverable also asks for `~/.claude/skills/impeccable` and `~/.claude/skills/react-native-skills` to be *applied* — so I read both skills at source and checked every claim made in their name.

The short version: **the critique's judgement is sound and its three HIGH findings are real.** Its arithmetic was not. One of its accessibility defects does not exist, several inventory counts were wrong, and in two places it borrowed Impeccable's authority for a rule Impeccable does not state. None of that changes the recommendation, and that is worth saying plainly — but a CEO-facing spec with invented failures in it trains people to discount the real ones.

---

## 2. Correction log

All six corrections are applied **in place** in `uxd-critique.md`, each marked so nothing is hidden.

### 2.1 Contrast — the material one

The critique published four contrast ratios as "computed". They were computed wrongly. Recomputed under WCAG 2.x sRGB relative-luminance with correct alpha compositing over the opaque backdrop:

| Surface | Critique claimed | **Actual** | Effect of the correction |
| :--- | :--- | :--- | :--- |
| `greeting` `rgba(255,255,255,0.7)` on `#8B2500` | 3.4:1 — "fails AA" | **5.09:1** | **Defect withdrawn.** It passes AA. The §H4 proposal to raise it to `0.86` fixed nothing. |
| `scoreLabel` `rgba(255,255,255,0.55)` on `#8B2500` | 2.2:1 — "clear failure" | **3.70:1** | Finding **stands** (fails AA 4.5:1 for normal text) but was overstated by ~1.5 ratio points; it passes AA Large. |
| Starter body `rgba(255,255,255,0.72)` on `#0F172A` | ≈9:1 | **9.60:1** | Immaterial. |
| `tierPill` `#475569` on `#F1F5F9` | ≈7.4:1 | **6.92:1** | Immaterial. |

I also verified the one replacement value that survives: `scoreLabel` at `rgba(255,255,255,0.78)` computes to **5.97:1**, clearing AA. That proposal is good.

**Net: exactly one genuine contrast defect exists on these two screens — `scoreLabel`.** Not four.

Verifier (re-runnable, pure stdlib):

```python
def lin(c):
    c = c / 255
    return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4

def L(rgb):
    r, g, b = rgb
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)

def hx(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))

def over(fg, a, bg):                      # alpha-composite fg over opaque bg
    return tuple(fg[i] * a + bg[i] * (1 - a) for i in range(3))

def ratio(a, b):
    la, lb = L(a), L(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)

W = (255, 255, 255)
print(ratio(over(W, 0.70, hx("8B2500")), hx("8B2500")))   # 5.09  greeting      PASS
print(ratio(over(W, 0.55, hx("8B2500")), hx("8B2500")))   # 3.70  scoreLabel    FAIL (AA normal)
print(ratio(over(W, 0.78, hx("8B2500")), hx("8B2500")))   # 5.97  proposed fix  PASS
print(ratio(over(W, 0.72, hx("0F172A")), hx("0F172A")))   # 9.60  starter body  PASS
print(ratio(hx("475569"), hx("F1F5F9")))                  # 6.92  tierPill      PASS
```

**Carry-forward:** every dark-mode pair proposed in §H1 `SEMANTIC` is still **unverified**. The critique flagged this correctly. Given that four of four hand-computed ratios in the original were wrong, ticket 4 must gate on running the script above over all 7 pairs × 2 modes against `COLORS.dark.card = #1A1A1A` — not on anyone's eyeball estimate. **I would not approve ticket 4 without that output attached.**

### 2.2 Inventory counts

Re-derived by grep over both files:

| Claim | Critique | **Actual** | Note |
| :--- | :--- | :--- | :--- |
| Distinct `fontSize` values | 13 (list included `20`) | **12** | `fontSize: 20` appears nowhere in either file. |
| Distinct weights (§H1 line) | 8 | **6** | `400 500 600 700 800 900`. §H1 contradicted §B1, which said six and was right. |
| Distinct spacing values | 19 | **22** | Original omitted `22`, `32`, `40`. |
| `Pressable` references | "~30" | **47** | 19 in `profile.tsx` + 28 in `RealtorDashboard.tsx`. Understated. |

The weight *distribution* in §B1 (`700`×17, `800`×15, `600`×9, `900`×1, `400`×1) I confirm exactly. The `"500"` sits in a ternary at `RealtorDashboard.tsx:179` (`fontWeight: isActive ? "700" : "500"`), which is why a naive `fontWeight: "N"` grep misses it.

**Three of four corrections make the case *stronger*, not weaker** — more spacing drift, more unlabelled controls.

### 2.3 Two claims made in Impeccable's name that Impeccable does not make

I read `~/.claude/skills/impeccable/DESIGN.md` (195 lines) in full. The doctrine quotations in §H are **faithful** — verified at source:

| Quoted rule | Source | Faithful? |
| :--- | :--- | :--- |
| "The Gold Is Jewelry Rule" | `DESIGN.md:144` | ✅ |
| "The Gold Text Is a Bug Rule" (colored text must clear 4.5:1) | `:145` | ✅ |
| "The Mono Means Machine Rule" (labels uppercase, tracked 0.12em) | `:152` | ✅ |
| "Flat by default. Depth exists only on instruments." | `:156` | ✅ |
| "Dense UI: 11px is the floor for anything functional." | `:137` | ✅ |
| "The Severity Rule" (one color per state) | `:146` | ✅ |
| Title weight 600 / display weight 200 | `:56–60`, `:51–54` | ✅ |
| "Don't add a dark theme or a dark section background" | `:192` | ✅ — this is the strongest support for killing the slate/emerald panels |

Two **over-applications**, both now corrected in place:

**(a) The 11px floor does not kill the 9px tag.** The critique used the floor to condemn both the 9px `freeTagText` and the 10px `tabBadgeText`. But Impeccable's own `typography.tag` **is 9px** (`DESIGN.md:76`), and its Tag component is specified as "mono 9px uppercase" (`:173`). The floor is scoped to *"anything **functional**"* — a tag is a marker, deliberately exempt. So the 10px badge (a count, which Impeccable explicitly classes as functional mono) is a real violation; the 9px tag is not. §H3's move of `FREE 3M` to 11px is still right, but on Blab grounds — it carries the offer, so it must read as content — not on Impeccable's authority.

**(b) "Blab has no type scale" was the wrong diagnosis.** Impeccable's ramp has **eighteen** sizes (`9 … 104`), so twelve sizes is not per se dated and the raw count proves nothing. What Impeccable has that Blab lacks is a **named role layer** binding size + weight + line-height + family together, so components *pick a role* instead of inventing numbers. I rewrote §B2 to argue that instead. It is the sharper argument and it is the one §H1 actually delivers.

**One divergence to declare, not fix.** §H1's proposed tokens are **Blab adaptations, not Impeccable values**: Impeccable's `spacing.lg` is **20px** (§H1 proposes 16) and `rounded.sm` is **3px** (§H1 proposes 6). `card: 14`, `sheet: 16`, `pill: 999` do match. And Blab ships a real dark mode, which Impeccable's "one light theme everywhere" doctrine forbids outright — the `SEMANTIC` dark pairs are therefore correct *for Blab* and a deliberate departure. Fine, but the CEO should approve them as Blab's own scale rather than as inherited authority.

---

## 3. `react-native-skills` contributes no design doctrine — traceability correction

The critique's header credited `~/.claude/skills/react-native-skills` as an applied design standard. I inventoried all 11 skills. It is a **performance and architecture** skill set (Callstack profiling + Vercel React patterns + Expo app development): `react-native`, `building-ui`, `composition-patterns`, `react-best-practices`, `data-fetching`, `api-routes`, `use-dom`, `dev-client`, `tailwind-setup`, `upgrading-expo`.

A full-text search for `accessib|a11y|voiceover|talkback|hit ?slop|44` across it returns **two incidental lines**, both in `skills/building-ui/references/controls.md`. There is **no touch-target rule, no contrast rule, no accessibility doctrine** anywhere in it. So:

- The **44pt minimum** (findings D2, F3) traces to **Apple HIG only**. Still valid — just not from this skill.
- The critique's §B/§F typography and contrast reasoning traces to **Impeccable + WCAG 2.2**.

Header corrected accordingly. The skill is not useless here, though — it yields one finding the critique missed:

> **New (LOW→MED) — `building-ui/references/controls.md:266`: "Native controls have proper accessibility labels by default."** Blab hand-rolls every control as a bare `Pressable` — all 47 of them — which is *why* F1 is zero. The ticket-3 accessibility pass should evaluate adopting native primitives for the tab bars and the role switcher rather than hand-labelling 47 custom `Pressable`s, because hand-labelling regresses the moment someone adds control 48. A lint rule or native primitives make it structural instead of manual.

This also sharpens ticket 3's framing: the goal is not "add 47 labels", it is "make unlabelled controls impossible to add".

---

## 4. HIGH findings — independently re-confirmed

I re-verified all three against source rather than trusting the write-up. All three hold.

| # | Claim | My check | Status |
| :-- | :--- | :--- | :--- |
| **E1** | UI branches on `tier === "free_trial"`, so `soft_cap` gets the "Unlimited" Pro banner | `RealtorDashboard.tsx:651` = `const isTrial = realtor.subscriptionTier === "free_trial";`, consumed as a binary at `:746` (`{isTrial ? (`). Server's paid test at `route.ts:212` is `pro \|\| pro_plus`. `TIER_COLORS.soft_cap` exists in `theme.ts:85`. | ✅ **CONFIRMED** |
| **E2** | Cap bars derive from `myListings.length`, which includes drafts | `:775–788` uses `myListings.length` with no status filter; server computes `activeCount` / `starterOverflowCount` at `route.ts:213–214` and returns both. | ✅ **CONFIRMED** |
| **D1** | `foundingProgram` returned by API, dropped at the store boundary | `route.ts:233–242` returns the block; `store/realtor.ts` carries no type for it. | ✅ **CONFIRMED** |
| **F1** | Zero accessibility props | `grep -c` = **0** and **0**. Across **47** `Pressable`s. | ✅ **CONFIRMED (worse than stated)** |

Supporting structural claims also confirmed: `lineHeight` count = **0** in both files; gutters are `paddingHorizontal: 18` (`profile.tsx:177`) vs `14` (`RealtorDashboard.tsx:1005, 1013, 1066`) — the 4pt tab-to-tab shift is real; file lengths 452 + 1140 = 1,592.

**Consequence for the CEO gate:** the gate card (interaction `237d7839`) carries **only** the three HIGH findings, the 44pt CTA point and the zero-accessibility point. I checked its `detailsMarkdown` for contrast claims — there are none. **Every claim on the approval card survives verification, so the pending confirmation remains valid and does not need to be withdrawn or re-issued.** The corrections above affect supporting detail inside the document, not the basis of the decision.

---

## 5. Design-lead judgement on the spec

Where I agree, and where I would push back.

**Agree, strongly:**
- **§H5 is the right call and should outrank the visual refactor.** A 500-seat program with no visible counter is a discount, not a scarcity mechanic. The server already holds `claimedCount`; this is a type addition and a progress bar.
- **Reframing the quota bars from enforcement to opportunity.** Same pixels, opposite job. Correct read.
- **Four tier states, not two.** `soft_cap` being told "unlimited" is the kind of defect that costs trust permanently, because the realtor discovers it by hitting a cap they were promised did not exist.
- **Server-authoritative numbers everywhere.** The deepest fix in the audit. Client-side cap arithmetic is why E1 and E2 both exist.

**Push back:**
1. **§H4's hero cut is bundled with a non-existent defect.** Now that `greeting` is shown to pass AA, the hero change rests purely on the ~44pt-to-the-fold argument. That is still a good argument — but it is now an *aesthetic* one, and the CEO should weigh it as such (critique §J6 already asks). Drop the opacity change; keep the size reduction as the proposal.
2. **Ticket 4 must not ship on unverified dark pairs.** See §2.1 carry-forward. Attach the verifier output or don't open it.
3. **I would not sequence ticket 5 (visual refactor) before the Founding-500 push at all.** Tickets 1 + 2 + 3 carry the correctness, revenue and compliance wins. Ticket 5 is the largest-surface, lowest-certainty change and it is the one that most needs screenshot baselines. Deferring it costs nothing measurable.
4. **One addition to ticket 3's definition** — make unlabelled controls structurally impossible (§3 above), not just absent today.

**My recommended approval shape, unchanged from the critique's:** ticket 0 → 1 + 3 in parallel → 2. Hold 4 and 5.

---

## 6. Read-only attestation

```
$ git status --short
?? .claude/
?? qa-baselines/
```

No tracked file modified. No file created or edited under `expo-app/` or `src/` at any point in this review. All writes are inside `qa-baselines/audit-001/`:

- `uxd-critique.md` — 6 in-place factual corrections (§2), each annotated
- `uxd-review-addendum.md` — this document
- `qa-baseline.md` — untouched by me

Per BLA-2 deliverable #4: **no engineering implementation ticket has been opened.** The Founder CEO gate remains pending and valid.

---

*Principal UX Designer review complete. Companion documents: `uxd-critique.md`, `qa-baseline.md`.*
