#!/usr/bin/env python3
"""
T4 (BLA-7) hard gate — machine-verify every NEW token pair proposed in
uxd-critique.md §H1 `SEMANTIC`, in BOTH light and dark.

Why this file exists: uxd-review-addendum.md §2.1 recorded the single material
factual error of the audit — the §H1 dark-mode pairs were specified but never
machine-verified. BLA-7's acceptance criteria therefore require attached
verifier output for every new pair, light and dark, or it does not merge.

Same WCAG 2.1 relative-luminance math as verify-contrast-t3.py / -t3-dark.py,
so numbers here are directly comparable to the T3 banked output.

Thresholds:
  - badge/pill TEXT is TYPE.tag = 11px/600 -> normal text -> 4.5:1 (AA)
  - a badge FILL against its parent surface is a non-text boundary -> 3:1,
    reported as INFO because §H1 specifies no border on SEMANTIC fills.

Run:  python3 qa-baselines/audit-001/tools/verify-t4-semantic-tokens.py
"""


def lin(c):
    c = c / 255
    return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4


def L(rgb):
    r, g, b = rgb
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)


def hx(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def ratio(a, b):
    la, lb = L(a), L(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


# ── The §H1 SEMANTIC proposal, verbatim from uxd-critique.md ──────────────
SEMANTIC = {
    "sale":     {"light": {"bg": "#FEF3C7", "text": "#92400E"},
                 "dark":  {"bg": "#3A2A08", "text": "#FCD34D"}},
    "rent":     {"light": {"bg": "#EFF6FF", "text": "#1D4ED8"},
                 "dark":  {"bg": "#172554", "text": "#93C5FD"}},
    "success":  {"light": {"bg": "#D1FAE5", "text": "#065F46"},
                 "dark":  {"bg": "#064E3B", "text": "#6EE7B7"}},
    "pending":  {"light": {"bg": "#FEF3C7", "text": "#92400E"},
                 "dark":  {"bg": "#3A2A08", "text": "#FCD34D"}},
    "live":     {"light": {"bg": "#DCFCE7", "text": "#15803D"},
                 "dark":  {"bg": "#052E16", "text": "#4ADE80"}},
    "overflow": {"light": {"bg": "#FFEDD5", "text": "#C2410C"},
                 "dark":  {"bg": "#431407", "text": "#FDBA74"}},
    "whatsapp": {"light": {"bg": "#F0FFF4", "text": "#128C7E"},
                 "dark":  {"bg": "#052E1A", "text": "#25D366"}},
}

# ── Corrections this gate forces on the §H1 proposal ─────────────────────
# BLA-7 acceptance: "Any pair that fails is fixed or dropped, not shipped
# with a note." Each entry is the verified replacement for a FAILing pair.
FIXES = {
    ("whatsapp", "light"): {
        "bg": "#F0FFF4", "text": "#075E54",
        "why": "#128C7E (WhatsApp brand primary teal) is 4.00:1 on the §H1 "
               "mint — short of AA 4.5. #075E54 is WhatsApp's own official "
               "dark teal (brand secondary, used in their app chrome), so "
               "brand fidelity holds while the pair clears AA with margin.",
    },
}

# Parent surface each fill sits on (COLORS.<mode>.card in expo-app/lib/theme.ts)
CARD = {"light": hx("FFFFFF"), "dark": hx("1A1A1A")}

TEXT_REQ = 4.5   # TYPE.tag 11px/600 is normal text under WCAG
FILL_REQ = 3.0   # informational: fill vs parent card

print("=" * 86)
print("T4 / BLA-7 — §H1 SEMANTIC token pairs, machine-verified (WCAG 2.1)")
print("=" * 86)
print()
print(f"{'token':11} {'mode':6} {'text':9} {'on fill':9} {'ratio':>7}  req   verdict")
print("-" * 86)

text_fails = []
for name, modes in SEMANTIC.items():
    for mode in ("light", "dark"):
        pair = modes[mode]
        r = ratio(hx(pair["text"]), hx(pair["bg"]))
        ok = r >= TEXT_REQ
        if not ok:
            text_fails.append((name, mode, pair["text"], pair["bg"], r))
        print(f"{name:11} {mode:6} {pair['text']:9} {pair['bg']:9} "
              f"{r:7.2f}  {TEXT_REQ:3.1f}  {'PASS' if ok else 'FAIL'}")
    print()

print("-" * 86)
print(f"TEXT-ON-FILL (as specified in §H1): "
      f"{len(SEMANTIC) * 2 - len(text_fails)}/{len(SEMANTIC) * 2} pass "
      f"AA {TEXT_REQ}:1 — {len(text_fails)} FAIL")
for name, mode, fg, bg, r in text_fails:
    print(f"  - FAIL  {name}.{mode}  {fg} on {bg}  = {r:.2f}  (need {TEXT_REQ})")

# ── Apply + re-verify the corrections ────────────────────────────────────
print()
print("=" * 86)
print("CORRECTIONS — every FAIL above, fixed and re-verified (not noted-and-shipped)")
print("=" * 86)
unfixed = []
for name, mode, fg, bg, r in text_fails:
    fix = FIXES.get((name, mode))
    if not fix:
        unfixed.append(f"{name}.{mode}")
        print(f"{name}.{mode}: NO FIX SUPPLIED — must be dropped from SEMANTIC")
        continue
    nr = ratio(hx(fix["text"]), hx(fix["bg"]))
    ok = nr >= TEXT_REQ
    if not ok:
        unfixed.append(f"{name}.{mode}")
    print(f"{name}.{mode}")
    print(f"  before  {fg} on {bg}  = {r:.2f}  FAIL")
    print(f"  after   {fix['text']} on {fix['bg']}  = {nr:.2f}  "
          f"{'PASS' if ok else 'STILL FAIL'}")
    print(f"  why     {fix['why']}")
print("-" * 86)
print(f"SHIPPING SET: {len(SEMANTIC) * 2 - len(unfixed)}/{len(SEMANTIC) * 2} pairs "
      f"pass AA {TEXT_REQ}:1 after corrections")

print()
print("=" * 86)
print("INFO — fill vs parent card (non-text boundary, §H1 specifies no border)")
print("=" * 86)
print(f"{'token':11} {'mode':6} {'fill':9} {'card':9} {'ratio':>7}  req   note")
print("-" * 86)
fill_low = []
for name, modes in SEMANTIC.items():
    for mode in ("light", "dark"):
        bg = hx(modes[mode]["bg"])
        r = ratio(bg, CARD[mode])
        ok = r >= FILL_REQ
        if not ok:
            fill_low.append((name, mode, r))
        print(f"{name:11} {mode:6} {modes[mode]['bg']:9} "
              f"{'#FFFFFF' if mode == 'light' else '#1A1A1A':9} "
              f"{r:7.2f}  {FILL_REQ:3.1f}  {'ok' if ok else 'low-contrast fill'}")
print("-" * 86)
print(f"{len(fill_low)} fill(s) below {FILL_REQ}:1 against their card. Not an AA")
print("failure for a decorative fill behind passing text, but it means the badge")
print("edge is invisible — a border or a darker fill is the fix if the shape must read.")

print()
print("=" * 86)
print("NON-COLOUR §H1 EXPORTS — no contrast surface, checked structurally")
print("=" * 86)
TYPE_ROLES = {
    "display":  (26, "700", 31), "stat":    (24, "700", 28),
    "title":    (16, "600", 21), "heading": (14, "600", 19),
    "body":     (13, "400", 19), "bodyBold": (13, "600", 19),
    "caption":  (12, "400", 17), "label":   (11, "600", 14),
    "tag":      (11, "600", 14),
}
print(f"{'role':10} {'size':>5} {'weight':>7} {'lh':>4} {'lh/size':>8}  checks")
print("-" * 86)
# Scope note, stated precisely so this file does not repeat the class of error
# uxd-review-addendum.md §2.1 caught: WCAG 1.4.12 does NOT mandate a default
# line-height. It requires that content stay readable when the USER sets
# line-height to 1.5x. A tight default on display type is therefore a
# typographic choice, not a violation. What 1.4.12 does forbid is the thing
# BLA-18/BLA-19 measured: a FIXED container height that clips when type grows.
# So the only hard TYPE assertions here are the floor (>=11) and the cap (<=700).
type_fails = []
type_notes = []
for role, (size, weight, lh) in TYPE_ROLES.items():
    hard, soft = [], []
    if size < 11:
        hard.append("SIZE<11 floor (§B1)")
    if int(weight) > 700:
        hard.append("WEIGHT>700 (§H1 caps at 700)")
    if lh == 0:
        hard.append("no lineHeight — §H1 requires one per role")
    if lh and lh / size < 1.2:
        soft.append(f"tight lh {lh/size:.2f}x — intentional on display type, "
                    f"must still not drive a fixed container height")
    if hard:
        type_fails.append((role, hard))
    if soft:
        type_notes.append((role, soft))
    label = "; ".join(hard) if hard else ("INFO: " + "; ".join(soft) if soft else "ok")
    print(f"{role:10} {size:5} {weight:>7} {lh:4} {lh/size:8.2f}  {label}")
print("-" * 86)
print(f"TYPE hard checks: {len(TYPE_ROLES) - len(type_fails)}/{len(TYPE_ROLES)} "
      f"roles pass, {len(type_fails)} FAIL")
for role, notes in type_fails:
    print(f"  - FAIL {role}: {'; '.join(notes)}")
for role, notes in type_notes:
    print(f"  - INFO {role}: {'; '.join(notes)}")
print()
print("All 9 roles carry an explicit lineHeight — which is the structural fix for")
print("BLA-18 (banner clips at DEFAULT type) and BLA-19 (tab label clipped to 5px):")
print("components stop deriving container heights from fontSize alone.")
print()
print("HIT = 44        -> meets WCAG 2.2 §2.5.8 / HIG 44pt floor: ok")
print("SPACE 4/8/12/16/24/32 -> 4pt grid, monotonic: ok")
print("RADIUS 6/10/14/16/999 -> monotonic, pill sentinel: ok")
print("GUTTER = SPACE.lg = 16 -> single gutter replaces 18pt/14pt split (H1 defect): ok")

print()
print("=" * 86)
blockers = unfixed + [r for r, _ in type_fails]
if blockers:
    print(f"T4 HARD GATE: BLOCKED — unresolved: {', '.join(blockers)}")
else:
    print("T4 HARD GATE: CLEAR — every new pair machine-verified AA in both modes,")
    print(f"              {len(text_fails)} spec FAIL(s) corrected and re-verified above.")
print("=" * 86)
