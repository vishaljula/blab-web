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
W = (255,255,255)

# (label, fg, fg_alpha, bg_stack[outermost last], required)
CASES = [
 # ── Hero (#8B2500 fixed brand bg, identical in light & dark) ──
 ("greeting  rgba(255,255,255,0.70) on #8B2500",      W, 0.70, [hx("8B2500")], 4.5),
 ("scoreLabel BEFORE rgba(..,0.55) on #8B2500",       W, 0.55, [hx("8B2500")], 4.5),
 ("scoreLabel AFTER  rgba(..,0.78) on #8B2500",       W, 0.78, [hx("8B2500")], 4.5),
 ("scoreRow icon rgba(..,0.65) on #8B2500 (non-text)",W, 0.65, [hx("8B2500")], 3.0),
 ("heroName #fff on #8B2500",                         W, 1.0,  [hx("8B2500")], 4.5),
 # ── Starter banner (#0F172A fixed bg) ──
 ("trialTitle rgba(..,0.95) on #0F172A",              W, 0.95, [hx("0F172A")], 4.5),
 ("trial body rgba(..,0.72) on #0F172A",              W, 0.72, [hx("0F172A")], 4.5),
 ("trialBarLabel BEFORE rgba(..,0.60) on #0F172A",    W, 0.60, [hx("0F172A")], 4.5),
 ("trialBarLabel AFTER  rgba(..,0.72) on #0F172A",    W, 0.72, [hx("0F172A")], 4.5),
 # ── Pro banner (#064E3B fixed bg) ──
 ("pro banner #ECFDF5 on #064E3B",            hx("ECFDF5"), 1.0, [hx("064E3B")], 4.5),
 ("pro banner #A7F3D0 on #064E3B",            hx("A7F3D0"), 1.0, [hx("064E3B")], 4.5),
 # ── Ops card (#0F172A fixed bg, both files) ──
 ("ops title #F8FAFC on #0F172A",             hx("F8FAFC"), 1.0, [hx("0F172A")], 4.5),
 ("ops sub BEFORE #94A3B8 on #0F172A",        hx("94A3B8"), 1.0, [hx("0F172A")], 4.5),
 ("ops sub AFTER  #CBD5E1 on #0F172A",        hx("CBD5E1"), 1.0, [hx("0F172A")], 4.5),
 # ── Hardcoded light-only tag pairs (mode-independent literals) ──
 ("tag For Sale  #92400E on #FEF3C7",         hx("92400E"), 1.0, [hx("FEF3C7")], 4.5),
 ("tag For Rent  #1D4ED8 on #EFF6FF",         hx("1D4ED8"), 1.0, [hx("EFF6FF")], 4.5),
 ("tag Upcoming  #065F46 on #ECFDF5",         hx("065F46"), 1.0, [hx("ECFDF5")], 4.5),
 ("enquiry initials responded #065F46 on #D1FAE5", hx("065F46"),1.0,[hx("D1FAE5")], 4.5),
 ("enquiry initials open      #92400E on #FEF3C7", hx("92400E"),1.0,[hx("FEF3C7")], 4.5),
 # ── profile.tsx literals over light card #FFFFFF ──
 ("freeTagText #16A34A on #22C55E20/#FFFFFF", hx("16A34A"), 1.0, [(34,197,94,0.125), W], 4.5),
 ("statusBadge LIVE #16A34A on #22C55E20/#FFF",hx("16A34A"),1.0, [(34,197,94,0.125), W], 4.5),
 ("statusBadge PEND #D97706 on #F59E0B20/#FFF",hx("D97706"),1.0, [(245,158,11,0.125), W], 4.5),
 ("promo ₹0 #16A34A on #FFFFFF",              hx("16A34A"), 1.0, [W], 4.5),
 # ── Mode-DEPENDENT (T4 scope — reported, not changed here) ──
 ("[T4] countText #EF4444 on light card #FFFFFF", hx("EF4444"),1.0,[W], 4.5),
 ("[T4] countText #10B981 on light card #FFFFFF", hx("10B981"),1.0,[W], 4.5),
 ("[T4] viewingDot #10B981 on #FFFFFF (non-text)",hx("10B981"),1.0,[W], 3.0),
 ("[T4] viewingDot #F59E0B on #FFFFFF (non-text)",hx("F59E0B"),1.0,[W], 3.0),
 ("[T4] viewingDot #6B7280 on #FFFFFF (non-text)",hx("6B7280"),1.0,[W], 3.0),
 ("[T4] viewingDot #EF4444 on #FFFFFF (non-text)",hx("EF4444"),1.0,[W], 3.0),
 ("[T4] mutedForeground #6B6B6B on #FFFFFF",      hx("6B6B6B"),1.0,[W], 4.5),
]

def resolve(stack):
    # stack: innermost-first list of either rgb tuples or (r,g,b,a) overlays; last entry opaque
    base = stack[-1]
    for layer in reversed(stack[:-1]):
        base = over(layer[:3], layer[3], base)
    return base

print(f"{'pair':52} {'ratio':>7}  req   verdict")
print("-"*82)
fails = []
for label, fg, a, stack, req in CASES:
    bg = resolve(stack)
    r = ratio(over(fg, a, bg) if a < 1 else fg, bg)
    ok = r >= req
    if not ok: fails.append(label)
    print(f"{label:52} {r:7.2f}  {req:3.1f}  {'PASS' if ok else 'FAIL'}")
print("-"*82)
print(f"{len(fails)} failing pair(s):")
for f in fails: print("  -", f)
