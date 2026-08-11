#!/usr/bin/env python3
"""
Blab — Close completed Jira tickets with appropriate comments.
Analyses what's been shipped and marks matching tickets Done.
"""
import requests, sys, time
from requests.auth import HTTPBasicAuth

BASE    = "https://moneymic.atlassian.net"
EMAIL   = "purchases@moneymic.com"
TOKEN   = "ATATT3xFfGF0c8SfBxDWnuOZWdrNF1myt8q0qll6Qc6fmogUrpYblO-pM6Pcku-qr2kxNlrs3m4V2szt05J_f081q6Fmby_qwegvdQsq8YHLvoGTv0utQZRkQvBuD0JwoxsnuS5_ZVAwUBpqdsK12ozSDvUHisGqmHJcvv4RS9I-BQLItbcsiXA=1D516155"
AUTH    = HTTPBasicAuth(EMAIL, TOKEN)
HEADERS = {"Accept": "application/json", "Content-Type": "application/json"}

def adf(paragraphs):
    content = []
    for p in paragraphs:
        if p == "":
            content.append({"type": "paragraph", "content": []})
        else:
            content.append({"type": "paragraph", "content": [{"type": "text", "text": p}]})
    return {"version": 1, "type": "doc", "content": content}

def get_transitions(key):
    r = requests.get(f"{BASE}/rest/api/3/issue/{key}/transitions",
                     auth=AUTH, headers={"Accept": "application/json"})
    return r.json().get("transitions", [])

def transition_to_done(key):
    transitions = get_transitions(key)
    done_id = None
    for t in transitions:
        if t["name"].lower() in ("done", "close", "closed", "resolve", "resolved"):
            done_id = t["id"]
            break
    if not done_id:
        names = [t["name"] for t in transitions]
        print(f"  ⚠️  No Done transition for {key}. Available: {names}")
        return False
    r = requests.post(f"{BASE}/rest/api/3/issue/{key}/transitions",
                      auth=AUTH, headers=HEADERS,
                      json={"transition": {"id": done_id}})
    return r.status_code == 204

def add_comment(key, paragraphs):
    r = requests.post(f"{BASE}/rest/api/3/issue/{key}/comment",
                      auth=AUTH, headers=HEADERS,
                      json={"body": adf(paragraphs)})
    ok = r.status_code in (200, 201)
    if not ok:
        print(f"  ❌ Comment failed {key}: {r.status_code} {r.text[:200]}")
    return ok

def process(key, comment_lines, dry_run=False):
    print(f"\n▶ {key}")
    if dry_run:
        print("  [DRY RUN] Would comment + close")
        return
    if add_comment(key, comment_lines):
        print("  ✅ Commented")
    if transition_to_done(key):
        print("  ✅ Transitioned to Done")
    else:
        print("  ⚠️  Could not transition (may already be Done)")
    time.sleep(0.3)

# ── Tickets known to be shipped but still open in Jira ────────────────────────
tickets = {

    # Listing Wizard (SCRUM-25 epic)
    "SCRUM-26": [
        "✅ SHIPPED — commit a9ce163 (2026-07-23)",
        "Multi-step listing wizard shell implemented in expo-app/components/listing-steps/WizardShell.tsx (+ WizardShell.native.tsx). Both web and native via paired files.",
        "Steps: Step1PropertyType → Step2PathChoice → Step2Location / Step2Location.web → Step3DetailsPrice → Step4Review / Step4RealtorList.",
        "State via expo-app/store/listings.ts (Zustand). Progress indicator in WizardShell header.",
    ],
    "SCRUM-27": [
        "✅ SHIPPED — Step2Location.tsx + Step2Location.web.tsx",
        "Map-based location picker: web uses Mapbox GL JS draggable marker, native uses Expo Location + Mappls maps. Pin sets lat/lng in listing store.",
    ],
    "SCRUM-28": [
        "✅ SHIPPED — Step3DetailsPrice.tsx",
        "Property details form: type, listing type, price (INR), area (sqft/sqyd), BHK, bathrooms, facing direction.",
    ],
    "SCRUM-30": [
        "✅ SHIPPED — integrated into wizard flow",
        "Contact info captured at onboarding. Lister type at Step1PropertyType. Step4Review confirms all details before submission.",
    ],
    "SCRUM-31": [
        "✅ SHIPPED — validation throughout wizard",
        "Required field validation at each wizard step. Progress gated on valid state. Zod schemas for type safety.",
    ],
    "SCRUM-32": [
        "✅ SHIPPED — Step4Review.tsx",
        "Listing preview screen shows all entered details before final submission. File: expo-app/components/listing-steps/Step4Review.tsx",
    ],

    # Auth (SCRUM-50 epic)
    "SCRUM-51": [
        "✅ SHIPPED — expo-app/app/login.tsx + /api/mobile-auth/",
        "Phone OTP login via Twilio Verify (primary) + MSG91 (fallback). Full send-OTP → verify-OTP flow.",
        "Server: src/app/actions/auth.ts. Credentials provider wired in NextAuth.",
    ],
    "SCRUM-52": [
        "✅ SHIPPED — expo-app/app/login.tsx — duplicates SCRUM-113",
        "OTP input UI: per-digit autofocus, backspace navigation, 30s resend countdown, error state.",
    ],
    "SCRUM-53": [
        "✅ SHIPPED — src/app/api/auth/[...nextauth]/route.ts",
        "Auth.js v5 with custom phone OTP credentials provider. JWT strategy. Works for web (NextAuth session) and native (JWT returned to Expo).",
    ],
    "SCRUM-54": [
        "✅ SHIPPED",
        "HTTP-only cookies via Auth.js on web. Native uses Bearer token from /api/mobile-auth/verify-otp.",
    ],
    "SCRUM-55": [
        "✅ SHIPPED — expo-app/app/(tabs)/profile.tsx — also covered by SCRUM-121 (Done)",
        "User profile screen: decrypted name, phone, role badge, subscription tier.",
    ],
    "SCRUM-112": [
        "✅ SHIPPED — expo-app/app/login.tsx",
        "Phone OTP login UI screen fully built. Duplicates SCRUM-114 scope.",
    ],
    "SCRUM-113": [
        "✅ SHIPPED — expo-app/app/login.tsx",
        "OTP input component with autofocus and resend timer implemented. Duplicates SCRUM-52 scope.",
    ],
    "SCRUM-114": [
        "✅ SHIPPED — src/app/api/mobile-auth/ routes",
        "Auth.js v5 hybrid OTP: Twilio Verify primary, MSG91 fallback. Dev bypass (DEV_OTP_BYPASS=true, code 123456).",
        "Files: send-otp/route.ts, verify-otp/route.ts, onboarding/route.ts",
    ],
    "SCRUM-115": [
        "✅ SHIPPED — onboarding in login.tsx + /api/mobile-auth/onboarding",
        "Progressive onboarding: name, role selection (buyer/owner/realtor/developer), role-specific fields (RERA for realtors, company for developers).",
    ],

    # Infrastructure & Database (SCRUM-58 epic)
    "SCRUM-59": [
        "✅ SHIPPED — Neon PostgreSQL live",
        "Neon PostgreSQL in US East (ep-aged-mountain-aqk6tvet). PostGIS + H3 extensions enabled. DATABASE_URL and DATABASE_URL_POOL (pgBouncer) set.",
        "Note: US East chosen over Singapore for reliability.",
    ],
    "SCRUM-60": [
        "✅ SHIPPED — src/db/ Drizzle ORM",
        "Drizzle ORM configured. PostGIS geography columns managed via migrate.ts raw SQL (Drizzle lacks native geography support).",
        "Files: src/db/schema.ts, migrate.ts, drizzle.config.ts",
    ],
    "SCRUM-61": [
        "✅ SHIPPED — src/db/schema.ts",
        "Full schema: users (encrypted PII, realtor profile, subscription tiers), listings (H3 res5-res8 indexes, spatial, status enum, boost_score), listing_images.",
        "Enums: user_role, listing_status, subscription_tier defined.",
    ],
    "SCRUM-64": [
        "✅ SHIPPED — src/app/api/listings/[id]/route.ts",
        "GET /api/listings/[id] returns full listing + images, realtor info (decrypted name/phone via LEFT JOIN), handledByRealtor flag.",
        "Uses DATABASE_URL_POOL (pgBouncer). Decrypt failures warn rather than crash.",
    ],
    "SCRUM-65": [
        "✅ SHIPPED — src/app/api/listings/route.ts",
        "POST /api/listings: validates input, computes H3 cells (res5-res8) from lat/lng, sets status=active, inserts to Neon.",
    ],
    "SCRUM-89": [
        "✅ SHIPPED — src/db/seed.ts",
        "Hyderabad test listings seeded: Banjara Hills, Jubilee Hills, Gachibowli, HITEC City, Kondapur. Diverse property types and realistic INR prices.",
    ],
    "SCRUM-84": [
        "✅ SHIPPED — .vercel/ present, deployed",
        "Vercel project live. Preview and production environments configured. Env vars set in Vercel dashboard.",
    ],
    "SCRUM-86": [
        "✅ SHIPPED",
        "Env var management: .env.local (local dev) + Vercel dashboard (prod). EXPO_PUBLIC_ prefix convention for Expo client vars documented in AGENTS.md.",
    ],

    # Property Details (SCRUM-34 epic)
    "SCRUM-35": [
        "✅ SHIPPED — expo-app/app/property/[id].tsx",
        "Property detail page: full-width hero gallery, swipeable photos, specs, neighbourhood mini-map, contact CTA. Web (modal) + native (full screen) both implemented.",
    ],
    "SCRUM-36": [
        "✅ SHIPPED — property/[id].tsx + PropertyDetailModal.tsx",
        "Swipeable photo carousel with image counter and horizontal snap. Fullscreen mode on both platforms.",
    ],
    "SCRUM-37": [
        "✅ SHIPPED — property/[id].tsx",
        "Specs displayed: price (INR formatted), area (sqft), BHK, bathrooms, facing, property type badge, listing type (Sale/Rent), lister type.",
    ],
    "SCRUM-38": [
        "✅ SHIPPED — expo-app/components/NeighborhoodMap.web.tsx",
        "Mini-map on detail page via Mapbox GL showing exact pin. File: NeighborhoodMap.web.tsx",
    ],
    "SCRUM-39": [
        "✅ SHIPPED — property/[id].tsx Contact CTA",
        "Contact CTA: shows 'Licensed Realtor · Blab' badge when handledByRealtor=true. WhatsApp https://wa.me/ universal link + SMS fallback. Auth-gated.",
    ],
    "SCRUM-41": [
        "✅ SHIPPED — property/[id].tsx",
        "Share: native share sheet (RN Share API) on mobile, clipboard copy on web.",
    ],
    "SCRUM-76": [
        "✅ SHIPPED — PropertyCard.tsx + property detail page",
        "Lister type badge: Owner, Realtor ('Licensed Realtor · Blab'), Developer. Driven by handledByRealtor flag from API.",
    ],
    "SCRUM-96": [
        "✅ SHIPPED — property/[id].tsx",
        "WhatsApp share via https://wa.me/ universal link. Pre-fills property details. Fixed from whatsapp:// to universal link (no LSApplicationQueriesSchemes needed).",
    ],

    # Realtor Dashboard & Flow
    "SCRUM-171": [
        "✅ SHIPPED — Step2PathChoice.tsx + Step4RealtorList.tsx",
        "Dual listing path at wizard Step 2: self-list vs realtor-assisted. Realtor path: GET /api/realtors/available (radius-based search), realtor cards with rating + tier badge.",
        "Files: Step2PathChoice.tsx, Step2PathChoice.web.tsx, Step4RealtorList.tsx",
    ],
    "SCRUM-174": [
        "✅ SHIPPED — RealtorDashboard.tsx + API routes",
        "Realtor dashboard: leads per listing, accept/reject via POST /api/realtors/leads/[id]/respond. Premium glow-ring avatar, tier badge, score display.",
        "Files: RealtorDashboard.tsx, dashboard.tsx tab, /api/realtors/dashboard, /api/realtors/leads/, /api/realtors/leads/[id]/respond",
    ],

    # Map & H3
    "SCRUM-192": [
        "✅ SHIPPED — src/db/migrate.ts",
        "PostGIS GIST index: CREATE INDEX idx_listings_location ON listings USING GIST (ST_MakePoint(longitude,latitude)). Composite partial H3 indexes for DISTINCT ON viewport queries.",
    ],
    "SCRUM-193": [
        "✅ SHIPPED — src/app/api/listings/viewport/route.ts (commit a9ce163)",
        "LIMIT 200 removed. Status='active' filter enforced. H3 zoom-conditional aggregation: res5 (zoom 8-9) → res6 (10-11) → res7 (12) → res8 (13) → raw listings (>=VIEWPORT_STREET_ZOOM).",
        "Single DISTINCT ON + COUNT(*) OVER() replaces two parallel sql.query() calls. Fresh neon() per request prevents ETIMEDOUT under connection pressure.",
    ],
    "SCRUM-195": [
        "✅ SHIPPED — src/db/schema.ts + migrate.ts",
        "H3 columns added: h3_index_res5/res6/res7/res8 on listings. Users table: base_location geography + h3_index_res9. Composite partial indexes (WHERE status='active') for fast DISTINCT ON.",
    ],
    "SCRUM-196": [
        "✅ SHIPPED — src/app/api/listings/viewport/route.ts",
        "Viewport API H3-conditional by zoom. Guard at zoom<8 (400). res5→res6→res7→res8→raw based on VIEWPORT_STREET_ZOOM env var.",
    ],
    "SCRUM-197": [
        "✅ SHIPPED — MapView.web.tsx + MapView.tsx",
        "Both files send zoom param with every fetch. setListings wrapped with Array.isArray() guard in both. Cluster UI removed from both (parity maintained per AGENTS.md paired file rule).",
    ],
    "SCRUM-164": [
        "✅ SHIPPED — expo-app/ directory",
        "UI migrated to Expo/React Native Web. expo-app/ is sole UI for web + native. Next.js limited to API routes (/api/) and server actions. Expo Router shared across platforms.",
    ],

    # Listing creation wizard (newer ticket set)
    "SCRUM-182": [
        "✅ SHIPPED — WizardShell.tsx + WizardShell.native.tsx",
        "Multi-step wizard scaffold for web and native. Back/next nav, progress indicator, step routing.",
    ],
    "SCRUM-183": [
        "✅ SHIPPED — Step1PropertyType.tsx",
        "Step 1: property type (Apartment/Villa/Plot/Commercial) + listing purpose (Sale/Rent) + path choice (self-list vs realtor).",
    ],
    "SCRUM-184": [
        "✅ SHIPPED — Step2Location.tsx + Step2Location.web.tsx",
        "Step 2 location: draggable Mapbox marker (web), GPS + map picker (native). Reverse-geocoded address display.",
    ],
    "SCRUM-185": [
        "✅ SHIPPED — Step3DetailsPrice.tsx",
        "Size and details: area, BHK, bathrooms, property sub-type, floor number.",
    ],
    "SCRUM-186": [
        "✅ SHIPPED — Step3DetailsPrice.tsx (price + terms combined in one step)",
        "Price input (INR formatted), sale/rent type, negotiable flag.",
    ],
    "SCRUM-189": [
        "✅ SHIPPED — Step2PathChoice.tsx + Step2PathChoice.web.tsx",
        "Owner vs realtor choice with fee transparency. Self-list shows listing fee. Realtor path shows commission structure.",
    ],
    "SCRUM-190": [
        "✅ SHIPPED — Step4RealtorList.tsx",
        "Realtor-path: curated realtor selection. Fetches /api/realtors/available, displays rating + tier badge + selection CTA.",
    ],

    # Geo search & Mappls
    "SCRUM-93": [
        "✅ SHIPPED — Mappls search + boundary API",
        "Locality autocomplete via Mappls (MapMyIndia) search at /api/mappls/search. Area polygon search via /api/mappls/boundary. Token refresh via /api/mappls/token.",
    ],

    # Property UI extras
    "SCRUM-100": [
        "✅ SHIPPED — expo-app/components/EMICalculator.tsx",
        "EMI calculator: loan amount (INR), interest rate (%), tenure (years) → monthly EMI. Accessible from property detail page.",
    ],
}

DRY_RUN = "--dry-run" in sys.argv
mode = "DRY RUN" if DRY_RUN else "LIVE"
print(f"\n{'=' * 60}")
print(f"  Blab Jira Closer — {mode} — {len(tickets)} tickets")
print(f"{'=' * 60}")

success = skipped = 0
for key, lines in tickets.items():
    try:
        process(key, lines, dry_run=DRY_RUN)
        success += 1
    except Exception as e:
        print(f"  ❌ Exception on {key}: {e}")
        skipped += 1

print(f"\n{'=' * 60}")
print(f"  Processed: {success}   Errors: {skipped}")
print(f"{'=' * 60}\n")
