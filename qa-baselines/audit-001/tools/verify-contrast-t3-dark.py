def lin(c):
    c = c / 255
    return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
def L(rgb):
    r, g, b = rgb
    return 0.2126*lin(r) + 0.7152*lin(g) + 0.0722*lin(b)
def hx(h):
    h = h.lstrip("#")
    if len(h) == 8:  # #RRGGBBAA
        return tuple(int(h[i:i+2],16) for i in (0,2,4)), int(h[6:8],16)/255
    return tuple(int(h[i:i+2],16) for i in (0,2,4))
def over(fg, a, bg):
    return tuple(fg[i]*a + bg[i]*(1-a) for i in range(3))
def ratio(a, b):
    la, lb = L(a), L(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi+0.05)/(lo+0.05)

# ── T3 boundary check: can a single literal satisfy BOTH colour modes? ────────
# These six text pairs sit on `colors.card`, which is #FFFFFF light / #1A1A1A dark.
# If no single hex passes in both modes, the pair needs a mode-aware SEMANTIC
# token and therefore belongs to Ticket 4, not Ticket 3.
#
# The two `countText` rows were added in BLA-13 (F3): the light-mode run already listed
# them FAIL, but the mode table — and the PR §5 that inherits from it — carried only four
# pairs, so T4 would have dropped them. They are normal-text 1.4.3 failures in exactly the
# same mode-dependent shape as the other four.
W = (255, 255, 255)

def r_on(fg, stack):
    base = stack[-1]
    for layer in reversed(stack[:-1]):
        base = over(layer[:3], layer[3], base)
    return ratio(hx(fg), base)

LIGHT_CARD = hx("FFFFFF")   # COLORS.light.card
DARK_CARD  = hx("1A1A1A")   # COLORS.dark.card
G = (34, 197, 94, 0.125)    # #22C55E20 tint
A = (245, 158, 11, 0.125)   # #F59E0B20 tint

ROWS = [
    ("freeTagText / statusBadge LIVE",  "16A34A", [G]),
    ("   candidate fix",                "166534", [G]),
    ("statusBadge PENDING / draft tag", "D97706", [A]),
    ("   candidate fix",                "92400E", [A]),
    ("promo '0 till Mar 31'",           "16A34A", []),
    ("   candidate fix",                "166534", []),
    ("countText contacts  :612 EF4444", "EF4444", []),
    ("   candidate fix",                "B91C1C", []),
    ("countText visits    :621 10B981", "10B981", []),
    ("   candidate fix",                "047857", []),
]

print()
print(f"{'pair':34} {'LIGHT':>7} {'DARK':>7}   (need 4.50 in both)")
print("-" * 62)
for name, fg, tint in ROWS:
    l = r_on(fg, tint + [LIGHT_CARD])
    d = r_on(fg, tint + [DARK_CARD])
    mark = lambda v: "PASS" if v >= 4.5 else "FAIL"
    print(f"{name:34} {l:7.2f} {d:7.2f}   {mark(l)}/{mark(d)}")
print("-" * 62)
print("Conclusion: every candidate that fixes light mode drops dark mode below 4.5:1.")
print("These SIX text pairs require mode-aware SEMANTIC tokens -> Ticket 4 scope.")
print()
print("Not carried to T4 — the two `viewingDot` non-text FAILs (1.4.11):")
print("  viewingDot #10B981 2.54 and #F59E0B 2.15 on #FFFFFF are below the 3.0 non-text")
print("  bar, but 1.4.11 covers graphics *required to understand* content. `StatusDot`")
print("  (RealtorDashboard.tsx:144) now renders the dot with its text label beside it in")
print("  both call sites, so the colour is decorative reinforcement, not the only channel.")
print("  1.4.1 (colour alone) was the real defect there and it is fixed in T3.")
