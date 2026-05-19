#!/bin/bash
# Blab MVP 1 — Jira Backlog Creator
set -euo pipefail

API="https://moneymic.atlassian.net/rest/api/3"
AUTH=$(echo -n "purchases@moneymic.com:${JIRA_API_TOKEN}" | base64)
PROJECT="SCRUM"
EPIC_TYPE="10001"
STORY_TYPE="10004"
TASK_TYPE="10003"

RESULTS_FILE="/Users/adi/Projects/blab-web/scripts/jira_results.md"
echo "| Key | Type | Epic | Summary |" > "$RESULTS_FILE"
echo "|-----|------|------|---------|" >> "$RESULTS_FILE"

create_issue() {
  local TYPE_ID="$1"
  local SUMMARY="$2"
  local PARENT_KEY="${3:-}"

  local PAYLOAD
  if [ -n "$PARENT_KEY" ]; then
    PAYLOAD=$(jq -n \
      --arg proj "$PROJECT" \
      --arg type "$TYPE_ID" \
      --arg summary "$SUMMARY" \
      --arg parent "$PARENT_KEY" \
      '{fields: {project: {key: $proj}, issuetype: {id: $type}, summary: $summary, parent: {key: $parent}}}')
  else
    PAYLOAD=$(jq -n \
      --arg proj "$PROJECT" \
      --arg type "$TYPE_ID" \
      --arg summary "$SUMMARY" \
      '{fields: {project: {key: $proj}, issuetype: {id: $type}, summary: $summary}}')
  fi

  local RESULT
  RESULT=$(curl -s -X POST "${API}/issue" \
    -H "Authorization: Basic ${AUTH}" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json" \
    -d "$PAYLOAD")

  local KEY
  KEY=$(echo "$RESULT" | jq -r '.key // empty')
  if [ -z "$KEY" ]; then
    echo "FAILED: $(echo "$RESULT" | jq -r '.errors // .errorMessages // .' 2>/dev/null)" >&2
    echo "FAILED"
  else
    echo "$KEY"
  fi
}

# =====================================================
# EPIC 1: Product & UX Foundation
# =====================================================
echo "📦 Creating Epic 1: Product & UX Foundation..."
E1=$(create_issue "$EPIC_TYPE" "Product & UX Foundation")
echo "   ✅ $E1"
echo "| $E1 | Epic | — | Product & UX Foundation |" >> "$RESULTS_FILE"

stories1=(
  "Setup Next.js 15 project with App Router and TypeScript"
  "Install and configure shadcn/ui component library with Radix primitives"
  "Define design tokens: colors (oxblood, warm white), typography (Inter + DM Sans), spacing"
  "Build responsive layout shell: header, control bar, main content area"
  "Configure Framer Motion for page transitions and micro-animations"
  "Setup Lucide React icon library and Sonner toast notifications"
)
for s in "${stories1[@]}"; do
  KEY=$(create_issue "$STORY_TYPE" "$s" "$E1")
  echo "     ↳ $KEY: $s"
  echo "| $KEY | Story | $E1 | $s |" >> "$RESULTS_FILE"
  sleep 0.5
done

# =====================================================
# EPIC 2: Map Search Experience
# =====================================================
echo ""
echo "📦 Creating Epic 2: Map Search Experience..."
E2=$(create_issue "$EPIC_TYPE" "Map Search Experience")
echo "   ✅ $E2"
echo "| $E2 | Epic | — | Map Search Experience |" >> "$RESULTS_FILE"

stories2=(
  "Integrate react-map-gl with Mapbox GL JS v3 (streets style, India-centered)"
  "Build viewport-based listing fetch: debounced API call on map moveend"
  "Create custom oxblood price marker components for map"
  "Implement client-side marker clustering with Supercluster"
  "Build city search: Mapbox Geocoding API → fitBounds to city boundaries"
  "Implement draw-on-map polygon search using @mapbox/mapbox-gl-draw"
  "Build polygon search API: ST_Within query against drawn boundary"
  "Add Remove Boundary button to clear polygon or city bounds"
  "Build Map/List view toggle with floating action button"
  "Build list view: scrollable property cards for current viewport/polygon"
  "Add current location button with browser Geolocation API"
  "Implement For Sale / For Rent dropdown toggle in control bar"
)
for s in "${stories2[@]}"; do
  KEY=$(create_issue "$STORY_TYPE" "$s" "$E2")
  echo "     ↳ $KEY: $s"
  echo "| $KEY | Story | $E2 | $s |" >> "$RESULTS_FILE"
  sleep 0.5
done

# =====================================================
# EPIC 3: Listing Creation Flow
# =====================================================
echo ""
echo "📦 Creating Epic 3: Listing Creation Flow..."
E3=$(create_issue "$EPIC_TYPE" "Listing Creation Flow")
echo "   ✅ $E3"
echo "| $E3 | Epic | — | Listing Creation Flow |" >> "$RESULTS_FILE"

stories3=(
  "Build 4-step listing wizard shell with progress indicator (react-hook-form + zod)"
  "Step 1: Map-based location picker — drop pin to set exact location"
  "Step 2: Property details form — type, listing type, price, area, dimensions, BHK"
  "Step 3: Photo upload — frontage required, property images, drag-to-reorder"
  "Step 4: Contact info — name, phone, lister type (owner/broker/developer)"
  "Implement form validation for all mandatory listing fields"
  "Build listing preview screen before final submission"
  "Build listing success confirmation screen"
)
for s in "${stories3[@]}"; do
  KEY=$(create_issue "$STORY_TYPE" "$s" "$E3")
  echo "     ↳ $KEY: $s"
  echo "| $KEY | Story | $E3 | $s |" >> "$RESULTS_FILE"
  sleep 0.5
done

# =====================================================
# EPIC 4: Property Details Experience
# =====================================================
echo ""
echo "📦 Creating Epic 4: Property Details Experience..."
E4=$(create_issue "$EPIC_TYPE" "Property Details Experience")
echo "   ✅ $E4"
echo "| $E4 | Epic | — | Property Details Experience |" >> "$RESULTS_FILE"

stories4=(
  "Build property detail page layout with full-width hero gallery"
  "Implement swipeable photo gallery with image counter and fullscreen mode"
  "Display property specs: price, area, BHK, bathrooms, facing, dimensions"
  "Embed mini-map showing exact property location"
  "Build Contact Owner button — reveal phone on tap (auth-gated, rate-limited)"
  "Add save/favorite toggle on detail page"
  "Add share listing button (copy link, native share on mobile)"
)
for s in "${stories4[@]}"; do
  KEY=$(create_issue "$STORY_TYPE" "$s" "$E4")
  echo "     ↳ $KEY: $s"
  echo "| $KEY | Story | $E4 | $s |" >> "$RESULTS_FILE"
  sleep 0.5
done

# =====================================================
# EPIC 5: Image Upload & Media Pipeline
# =====================================================
echo ""
echo "📦 Creating Epic 5: Image Upload & Media Pipeline..."
E5=$(create_issue "$EPIC_TYPE" "Image Upload & Media Pipeline")
echo "   ✅ $E5"
echo "| $E5 | Epic | — | Image Upload & Media Pipeline |" >> "$RESULTS_FILE"

stories5=(
  "Setup Cloudflare R2 bucket for property image storage"
  "Build pre-signed URL generation API for direct R2 uploads"
  "Implement client-side image compression with browser-image-compression"
  "Build drag-and-drop upload UI with react-dropzone and progress indicators"
  "Setup Cloudflare Images for on-the-fly resizing and WebP/AVIF conversion"
  "Implement image reordering and primary (frontage) photo selection"
  "Enforce max 10 photos per listing with file size validation (max 5MB each)"
)
for s in "${stories5[@]}"; do
  KEY=$(create_issue "$STORY_TYPE" "$s" "$E5")
  echo "     ↳ $KEY: $s"
  echo "| $KEY | Story | $E5 | $s |" >> "$RESULTS_FILE"
  sleep 0.5
done

# =====================================================
# EPIC 6: Authentication & User Accounts
# =====================================================
echo ""
echo "📦 Creating Epic 6: Authentication & User Accounts..."
E6=$(create_issue "$EPIC_TYPE" "Authentication & User Accounts")
echo "   ✅ $E6"
echo "| $E6 | Epic | — | Authentication & User Accounts |" >> "$RESULTS_FILE"

stories6=(
  "Implement phone OTP login flow with MSG91 (India-first auth)"
  "Build OTP input UI with auto-focus and countdown timer"
  "Setup Auth.js v5 with custom credentials provider for phone OTP"
  "Implement session management with secure HTTP-only cookies"
  "Build user profile page: name, phone, edit profile"
  "Build My Listings page showing user's posted properties"
  "Build Saved/Favorites page with listing cards"
)
for s in "${stories6[@]}"; do
  KEY=$(create_issue "$STORY_TYPE" "$s" "$E6")
  echo "     ↳ $KEY: $s"
  echo "| $KEY | Story | $E6 | $s |" >> "$RESULTS_FILE"
  sleep 0.5
done

# =====================================================
# EPIC 7: Backend API & Database Foundation
# =====================================================
echo ""
echo "📦 Creating Epic 7: Backend API & Database Foundation..."
E7=$(create_issue "$EPIC_TYPE" "Backend API & Database Foundation")
echo "   ✅ $E7"
echo "| $E7 | Epic | — | Backend API & Database Foundation |" >> "$RESULTS_FILE"

stories7=(
  "Provision Neon PostgreSQL (Singapore region) with PostGIS extension"
  "Setup Drizzle ORM with PostGIS geography type support"
  "Create database schema: users, listings, listing_images, favorites, reports"
  "Build GET /api/listings/viewport — spatial bounding box query with GiST index"
  "Build POST /api/listings/polygon — ST_Within polygon search query"
  "Build GET /api/listings/:id — full listing detail with images"
  "Build POST /api/listings — create listing with validation"
  "Build GET /api/listings/:id/contact — auth-gated contact reveal with rate limit"
  "Build POST /api/favorites/:id — toggle favorite"
  "Build POST /api/reports — report listing"
  "Build GET /api/geo/city/:name — city bounding box via Mapbox Geocoding"
  "Setup Upstash Redis (Singapore) for viewport query caching"
)
for s in "${stories7[@]}"; do
  KEY=$(create_issue "$STORY_TYPE" "$s" "$E7")
  echo "     ↳ $KEY: $s"
  echo "| $KEY | Story | $E7 | $s |" >> "$RESULTS_FILE"
  sleep 0.5
done

# =====================================================
# EPIC 8: Report Listing & Basic Trust
# =====================================================
echo ""
echo "📦 Creating Epic 8: Report Listing & Basic Trust..."
E8=$(create_issue "$EPIC_TYPE" "Report Listing & Basic Trust")
echo "   ✅ $E8"
echo "| $E8 | Epic | — | Report Listing & Basic Trust |" >> "$RESULTS_FILE"

stories8=(
  "Build Report Listing UI with reason categories (fake photos, wrong location, spam)"
  "Implement report submission API with auth requirement"
  "Add report count tracking on listings"
  "Implement 90-day listing auto-expiry"
  "Display lister type badge on listings (Owner / Broker / Developer)"
)
for s in "${stories8[@]}"; do
  KEY=$(create_issue "$STORY_TYPE" "$s" "$E8")
  echo "     ↳ $KEY: $s"
  echo "| $KEY | Story | $E8 | $s |" >> "$RESULTS_FILE"
  sleep 0.5
done

# =====================================================
# EPIC 9: SEO & Performance
# =====================================================
echo ""
echo "📦 Creating Epic 9: SEO & Performance..."
E9=$(create_issue "$EPIC_TYPE" "SEO & Performance")
echo "   ✅ $E9"
echo "| $E9 | Epic | — | SEO & Performance |" >> "$RESULTS_FILE"

stories9=(
  "Add SEO meta tags and Open Graph for all pages"
  "Implement JSON-LD structured data for property listings"
  "Generate dynamic sitemap for active listings"
  "Optimize Core Web Vitals: lazy loading images, code splitting"
  "Setup PWA manifest with app icons and theme colors"
)
for s in "${stories9[@]}"; do
  KEY=$(create_issue "$STORY_TYPE" "$s" "$E9")
  echo "     ↳ $KEY: $s"
  echo "| $KEY | Story | $E9 | $s |" >> "$RESULTS_FILE"
  sleep 0.5
done

# =====================================================
# EPIC 10: Infrastructure & Deployment
# =====================================================
echo ""
echo "📦 Creating Epic 10: Infrastructure & Deployment..."
E10=$(create_issue "$EPIC_TYPE" "Infrastructure & Deployment")
echo "   ✅ $E10"
echo "| $E10 | Epic | — | Infrastructure & Deployment |" >> "$RESULTS_FILE"

stories10=(
  "Setup Vercel project with preview and production environments"
  "Configure Cloudflare CDN, WAF, and rate limiting"
  "Setup environment variables and secrets management"
  "Implement CI/CD with GitHub Actions (lint, type-check, build)"
  "Setup error monitoring with Sentry"
  "Seed Hyderabad test listings for launch"
)
for s in "${stories10[@]}"; do
  KEY=$(create_issue "$STORY_TYPE" "$s" "$E10")
  echo "     ↳ $KEY: $s"
  echo "| $KEY | Story | $E10 | $s |" >> "$RESULTS_FILE"
  sleep 0.5
done

echo ""
echo "============================================================"
echo "✅ ALL DONE — Blab MVP 1 Backlog Created!"
echo "============================================================"
echo ""
echo "📋 Results saved to: $RESULTS_FILE"
echo "🔗 View board: https://moneymic.atlassian.net/jira/software/projects/SCRUM/board"
echo ""
cat "$RESULTS_FILE"
