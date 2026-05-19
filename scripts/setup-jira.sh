#!/bin/bash
# ============================================================
# Blab — Jira MVP Backlog Setup Script
# ============================================================
# Prerequisites:
#   export JIRA_BASE_URL="https://your-org.atlassian.net"
#   export JIRA_EMAIL="purchases@moneymic.com"
#   export JIRA_API_TOKEN="your-api-token"
#   export JIRA_PROJECT_KEY="BLAB"
# ============================================================

set -euo pipefail

# --- Validate environment variables ---
for var in JIRA_BASE_URL JIRA_EMAIL JIRA_API_TOKEN JIRA_PROJECT_KEY; do
  if [ -z "${!var:-}" ]; then
    echo "❌ Missing required env var: $var"
    echo ""
    echo "Set them with:"
    echo "  export JIRA_BASE_URL=\"https://your-org.atlassian.net\""
    echo "  export JIRA_EMAIL=\"purchases@moneymic.com\""
    echo "  export JIRA_API_TOKEN=\"your-api-token\""
    echo "  export JIRA_PROJECT_KEY=\"BLAB\""
    exit 1
  fi
done

API="${JIRA_BASE_URL}/rest/api/3"
AUTH=$(echo -n "${JIRA_EMAIL}:${JIRA_API_TOKEN}" | base64)
HEADERS=(-H "Authorization: Basic ${AUTH}" -H "Content-Type: application/json" -H "Accept: application/json")

echo "🔗 Jira Base URL: ${JIRA_BASE_URL}"
echo "📧 Email: ${JIRA_EMAIL}"
echo "📁 Project Key: ${JIRA_PROJECT_KEY}"
echo ""

# --- Step 1: Verify connection ---
echo "1️⃣  Verifying Jira connection..."
MYSELF=$(curl -s -w "\n%{http_code}" "${API}/myself" "${HEADERS[@]}")
HTTP_CODE=$(echo "$MYSELF" | tail -1)
BODY=$(echo "$MYSELF" | sed '$d')

if [ "$HTTP_CODE" != "200" ]; then
  echo "❌ Connection failed (HTTP ${HTTP_CODE})"
  echo "$BODY" | jq . 2>/dev/null || echo "$BODY"
  exit 1
fi
echo "✅ Connected as: $(echo "$BODY" | jq -r '.displayName')"
echo ""

# --- Step 2: Fetch issue types ---
echo "2️⃣  Fetching project issue types..."
ISSUE_TYPES=$(curl -s "${API}/issue/createmeta?projectKeys=${JIRA_PROJECT_KEY}&expand=projects.issuetypes" "${HEADERS[@]}")

# Try to find Epic, Story, Task, Sub-task issue type IDs
EPIC_TYPE_ID=$(echo "$ISSUE_TYPES" | jq -r '.projects[0].issuetypes[] | select(.name=="Epic") | .id // empty')
STORY_TYPE_ID=$(echo "$ISSUE_TYPES" | jq -r '.projects[0].issuetypes[] | select(.name=="Story") | .id // empty')
TASK_TYPE_ID=$(echo "$ISSUE_TYPES" | jq -r '.projects[0].issuetypes[] | select(.name=="Task") | .id // empty')

# Fallback: try alternate endpoint if createmeta doesn't return types
if [ -z "$EPIC_TYPE_ID" ]; then
  echo "   Trying alternate endpoint for issue types..."
  PROJECT_TYPES=$(curl -s "${API}/issuetype/project?projectId=$(curl -s "${API}/project/${JIRA_PROJECT_KEY}" "${HEADERS[@]}" | jq -r '.id')" "${HEADERS[@]}")
  EPIC_TYPE_ID=$(echo "$PROJECT_TYPES" | jq -r '.[] | select(.name=="Epic") | .id // empty')
  STORY_TYPE_ID=$(echo "$PROJECT_TYPES" | jq -r '.[] | select(.name=="Story") | .id // empty')
  TASK_TYPE_ID=$(echo "$PROJECT_TYPES" | jq -r '.[] | select(.name=="Task") | .id // empty')
fi

# If still no Epic, check for closest parent type
if [ -z "$EPIC_TYPE_ID" ]; then
  echo "⚠️  Epic type not found. Looking for alternatives..."
  EPIC_TYPE_ID=$(echo "$PROJECT_TYPES" | jq -r '.[0].id')
  echo "   Using first available type as parent: $(echo "$PROJECT_TYPES" | jq -r '.[0].name')"
fi

if [ -z "$STORY_TYPE_ID" ]; then STORY_TYPE_ID="$TASK_TYPE_ID"; fi
if [ -z "$TASK_TYPE_ID" ]; then TASK_TYPE_ID="$STORY_TYPE_ID"; fi

echo "   Epic type ID:  ${EPIC_TYPE_ID}"
echo "   Story type ID: ${STORY_TYPE_ID}"
echo "   Task type ID:  ${TASK_TYPE_ID}"
echo ""

# --- Helper: Create issue ---
create_issue() {
  local TYPE_ID="$1"
  local SUMMARY="$2"
  local DESCRIPTION="${3:-}"
  local PARENT_KEY="${4:-}"

  local PAYLOAD
  if [ -n "$PARENT_KEY" ]; then
    PAYLOAD=$(jq -n \
      --arg proj "${JIRA_PROJECT_KEY}" \
      --arg type "$TYPE_ID" \
      --arg summary "$SUMMARY" \
      --arg desc "$DESCRIPTION" \
      --arg parent "$PARENT_KEY" \
      '{
        fields: {
          project: { key: $proj },
          issuetype: { id: $type },
          summary: $summary,
          description: {
            type: "doc",
            version: 1,
            content: [{ type: "paragraph", content: [{ type: "text", text: $desc }] }]
          },
          parent: { key: $parent }
        }
      }')
  else
    PAYLOAD=$(jq -n \
      --arg proj "${JIRA_PROJECT_KEY}" \
      --arg type "$TYPE_ID" \
      --arg summary "$SUMMARY" \
      --arg desc "$DESCRIPTION" \
      '{
        fields: {
          project: { key: $proj },
          issuetype: { id: $type },
          summary: $summary,
          description: {
            type: "doc",
            version: 1,
            content: [{ type: "paragraph", content: [{ type: "text", text: $desc }] }]
          }
        }
      }')
  fi

  local RESULT
  RESULT=$(curl -s -w "\n%{http_code}" -X POST "${API}/issue" "${HEADERS[@]}" -d "$PAYLOAD")
  local CODE=$(echo "$RESULT" | tail -1)
  local RBODY=$(echo "$RESULT" | sed '$d')

  if [ "$CODE" = "201" ]; then
    local KEY=$(echo "$RBODY" | jq -r '.key')
    echo "$KEY"
  else
    echo "ERROR:${CODE}:$(echo "$RBODY" | jq -r '.errors // .errorMessages // .' 2>/dev/null)" >&2
    echo "FAILED"
  fi
}

# --- Step 3: Create Epics and Stories ---
echo "3️⃣  Creating MVP backlog..."
echo ""

SUMMARY_FILE="/tmp/blab_jira_summary.csv"
echo "Key,Type,Epic,Summary" > "$SUMMARY_FILE"

log_ticket() {
  echo "$1,$2,$3,\"$4\"" >> "$SUMMARY_FILE"
}

# ==================== EPIC 1 ====================
echo "📦 Epic 1: Product & UX Foundation"
E1=$(create_issue "$EPIC_TYPE_ID" "Product & UX Foundation" "Design system, component library, typography, color tokens, responsive layouts, and core UX patterns.")
echo "   → $E1"
log_ticket "$E1" "Epic" "-" "Product & UX Foundation"

for story in \
  "Define design tokens: colors, typography, spacing, shadows, radii" \
  "Build core component library: Button, Card, Input, Modal, Sheet, Skeleton" \
  "Implement responsive layout system: mobile-first grid + breakpoints" \
  "Setup dark mode / light mode theme switching" \
  "Build bottom sheet component with drag gesture support" \
  "Create property card component with thumbnail, price, specs" \
  "Implement skeleton loading states for all components" \
  "Setup Google Fonts: Inter + DM Sans with proper weight loading"; do
  KEY=$(create_issue "$STORY_TYPE_ID" "$story" "" "$E1")
  echo "     ↳ $KEY: $story"
  log_ticket "$KEY" "Story" "$E1" "$story"
  sleep 0.3
done

# ==================== EPIC 2 ====================
echo ""
echo "📦 Epic 2: Map Search Experience"
E2=$(create_issue "$EPIC_TYPE_ID" "Map Search Experience" "Full-screen Mapbox map with viewport-based listing loading, custom price markers, clustering, polygon draw search, and smooth mobile interactions.")
echo "   → $E2"
log_ticket "$E2" "Epic" "-" "Map Search Experience"

for story in \
  "Integrate Mapbox GL JS v3 with custom desaturated map style" \
  "Implement viewport-based listing fetch on map move/zoom with debounce" \
  "Build custom price marker components (oxblood style)" \
  "Implement client-side marker clustering with Supercluster" \
  "Add polygon draw-on-map search using Mapbox Draw" \
  "Build map filter panel: property type, price range, area, sale/rent" \
  "Implement split-view layout: map + list panel (desktop)" \
  "Add current location button with geolocation API" \
  "Optimize map performance: buffer, feature-state, lazy loading" \
  "Build map dark mode style variant"; do
  KEY=$(create_issue "$STORY_TYPE_ID" "$story" "" "$E2")
  echo "     ↳ $KEY: $story"
  log_ticket "$KEY" "Story" "$E2" "$story"
  sleep 0.3
done

# ==================== EPIC 3 ====================
echo ""
echo "📦 Epic 3: Listing Creation Flow"
E3=$(create_issue "$EPIC_TYPE_ID" "Listing Creation Flow" "4-step property listing wizard: location pin, property details, photo upload, contact info. Lightweight but enforcing mandatory fields.")
echo "   → $E3"
log_ticket "$E3" "Epic" "-" "Listing Creation Flow"

for story in \
  "Build Step 1: Map-based location picker with pin drop" \
  "Build Step 2: Property details form (type, price, area, dimensions)" \
  "Build Step 3: Photo upload with frontage requirement" \
  "Build Step 4: Contact info and lister type selection" \
  "Implement multi-step wizard navigation with progress indicator" \
  "Add form validation for all mandatory fields" \
  "Implement listing preview before submission" \
  "Build listing success/confirmation screen"; do
  KEY=$(create_issue "$STORY_TYPE_ID" "$story" "" "$E3")
  echo "     ↳ $KEY: $story"
  log_ticket "$KEY" "Story" "$E3" "$story"
  sleep 0.3
done

# ==================== EPIC 4 ====================
echo ""
echo "📦 Epic 4: Property Details Experience"
E4=$(create_issue "$EPIC_TYPE_ID" "Property Details Experience" "Beautiful property detail page with photo gallery, specs, map embed, contact CTA, and sharing.")
echo "   → $E4"
log_ticket "$E4" "Epic" "-" "Property Details Experience"

for story in \
  "Build property detail page layout with hero gallery" \
  "Implement swipeable photo gallery with counter" \
  "Display property specs: price, area, BHK, facing, dimensions" \
  "Embed mini-map showing property location" \
  "Build owner/broker info card with Request Contact CTA" \
  "Add save/favorite toggle on detail page" \
  "Implement share listing functionality" \
  "Add similar properties section"; do
  KEY=$(create_issue "$STORY_TYPE_ID" "$story" "" "$E4")
  echo "     ↳ $KEY: $story"
  log_ticket "$KEY" "Story" "$E4" "$story"
  sleep 0.3
done

# ==================== EPIC 5 ====================
echo ""
echo "📦 Epic 5: Verification & Anti-Fake Listing System"
E5=$(create_issue "$EPIC_TYPE_ID" "Verification & Anti-Fake Listing System" "Automated and manual verification pipelines to detect fake photos, wrong locations, price anomalies, and duplicate listings.")
echo "   → $E5"
log_ticket "$E5" "Epic" "-" "Verification & Anti-Fake Listing System"

for story in \
  "Build AI photo verification pipeline (real vs AI-generated detection)" \
  "Implement EXIF GPS extraction and cross-check with listing pin" \
  "Build price sanity checker against area averages" \
  "Implement duplicate listing detection via perceptual image hashing" \
  "Build report listing flow with reason categories" \
  "Implement auto-delist on report threshold (3+ reports)" \
  "Build lister reputation scoring system" \
  "Implement listing expiry and re-confirmation flow (90 days)"; do
  KEY=$(create_issue "$STORY_TYPE_ID" "$story" "" "$E5")
  echo "     ↳ $KEY: $story"
  log_ticket "$KEY" "Story" "$E5" "$story"
  sleep 0.3
done

# ==================== EPIC 6 ====================
echo ""
echo "📦 Epic 6: Image Upload & Media Pipeline"
E6=$(create_issue "$EPIC_TYPE_ID" "Image Upload & Media Pipeline" "Client-side compression, pre-signed R2 uploads, on-the-fly image transforms, CDN delivery, and variant generation.")
echo "   → $E6"
log_ticket "$E6" "Epic" "-" "Image Upload & Media Pipeline"

for story in \
  "Implement client-side image compression before upload" \
  "Build pre-signed URL generation for R2 direct upload" \
  "Setup Cloudflare R2 bucket with proper access policies" \
  "Implement image variant generation (thumb, card, full)" \
  "Setup Cloudflare Images for on-the-fly format conversion (WebP/AVIF)" \
  "Build image reordering and primary photo selection UI" \
  "Implement max photo limit (10) and file size validation"; do
  KEY=$(create_issue "$STORY_TYPE_ID" "$story" "" "$E6")
  echo "     ↳ $KEY: $story"
  log_ticket "$KEY" "Story" "$E6" "$story"
  sleep 0.3
done

# ==================== EPIC 7 ====================
echo ""
echo "📦 Epic 7: Safe Contact & Anti-Spam Flow"
E7=$(create_issue "$EPIC_TYPE_ID" "Safe Contact & Anti-Spam Flow" "Request-based contact system with rate limiting, message requirement, blocking, and phone number protection.")
echo "   → $E7"
log_ticket "$E7" "Epic" "-" "Safe Contact & Anti-Spam Flow"

for story in \
  "Build contact request flow with mandatory message" \
  "Implement owner notification system (in-app + SMS)" \
  "Build accept/decline contact request UI for owners" \
  "Implement phone number reveal on mutual acceptance" \
  "Add daily contact request rate limiting (10/day)" \
  "Build block user functionality for repeated requesters" \
  "Implement 48-hour auto-expiry for unanswered requests"; do
  KEY=$(create_issue "$STORY_TYPE_ID" "$story" "" "$E7")
  echo "     ↳ $KEY: $story"
  log_ticket "$KEY" "Story" "$E7" "$story"
  sleep 0.3
done

# ==================== EPIC 8 ====================
echo ""
echo "📦 Epic 8: Authentication & User Accounts"
E8=$(create_issue "$EPIC_TYPE_ID" "Authentication & User Accounts" "Phone OTP login (India-first), Google OAuth, user profiles, and session management.")
echo "   → $E8"
log_ticket "$E8" "Epic" "-" "Authentication & User Accounts"

for story in \
  "Implement phone OTP authentication flow with MSG91" \
  "Add Google OAuth sign-in option" \
  "Build user profile page (name, phone, email, avatar)" \
  "Implement session management with secure cookies" \
  "Build My Listings page (user's posted properties)" \
  "Build Saved/Favorites page with synced local-first state" \
  "Implement edit/delete listing for owners"; do
  KEY=$(create_issue "$STORY_TYPE_ID" "$story" "" "$E8")
  echo "     ↳ $KEY: $story"
  log_ticket "$KEY" "Story" "$E8" "$story"
  sleep 0.3
done

# ==================== EPIC 9 ====================
echo ""
echo "📦 Epic 9: Backend API & Database Foundation"
E9=$(create_issue "$EPIC_TYPE_ID" "Backend API & Database Foundation" "PostgreSQL + PostGIS schema, API routes, spatial queries, caching layer, and core data infrastructure.")
echo "   → $E9"
log_ticket "$E9" "Epic" "-" "Backend API & Database Foundation"

for story in \
  "Setup PostgreSQL with PostGIS extension and initial schema" \
  "Implement Drizzle ORM with PostGIS type support" \
  "Build viewport-based spatial query API with GiST indexing" \
  "Build polygon search API using ST_Within" \
  "Implement Redis/Upstash caching layer with geohash keys" \
  "Build listing CRUD API with validation" \
  "Setup database migrations workflow" \
  "Implement API rate limiting and auth middleware"; do
  KEY=$(create_issue "$STORY_TYPE_ID" "$story" "" "$E9")
  echo "     ↳ $KEY: $story"
  log_ticket "$KEY" "Story" "$E9" "$story"
  sleep 0.3
done

# ==================== EPIC 10 ====================
echo ""
echo "📦 Epic 10: Admin Moderation Dashboard"
E10=$(create_issue "$EPIC_TYPE_ID" "Admin Moderation Dashboard" "Internal dashboard for reviewing flagged listings, managing reports, and moderating content.")
echo "   → $E10"
log_ticket "$E10" "Epic" "-" "Admin Moderation Dashboard"

for story in \
  "Build admin review queue for flagged listings" \
  "Implement approve/reject listing with reason" \
  "Build report management dashboard" \
  "Add listing analytics: total active, pending, flagged counts" \
  "Implement admin user role and access control"; do
  KEY=$(create_issue "$STORY_TYPE_ID" "$story" "" "$E10")
  echo "     ↳ $KEY: $story"
  log_ticket "$KEY" "Story" "$E10" "$story"
  sleep 0.3
done

# ==================== EPIC 11 ====================
echo ""
echo "📦 Epic 11: Performance, SEO & PWA"
E11=$(create_issue "$EPIC_TYPE_ID" "Performance, SEO & PWA" "Core Web Vitals optimization, SEO meta tags, structured data, PWA manifest, service worker, and offline support.")
echo "   → $E11"
log_ticket "$E11" "Epic" "-" "Performance, SEO & PWA"

for story in \
  "Setup PWA manifest with app icons and theme colors" \
  "Implement service worker for offline shell caching" \
  "Add SEO meta tags and Open Graph for all pages" \
  "Implement structured data (JSON-LD) for property listings" \
  "Generate dynamic sitemap for active listings" \
  "Optimize Core Web Vitals: LCP, FID, CLS" \
  "Implement lazy loading for images and heavy components"; do
  KEY=$(create_issue "$STORY_TYPE_ID" "$story" "" "$E11")
  echo "     ↳ $KEY: $story"
  log_ticket "$KEY" "Story" "$E11" "$story"
  sleep 0.3
done

# ==================== EPIC 12 ====================
echo ""
echo "📦 Epic 12: Infrastructure & Deployment"
E12=$(create_issue "$EPIC_TYPE_ID" "Infrastructure & Deployment" "Vercel deployment, Neon PostgreSQL provisioning, Cloudflare setup, CI/CD pipeline, monitoring, and environment management.")
echo "   → $E12"
log_ticket "$E12" "Epic" "-" "Infrastructure & Deployment"

for story in \
  "Setup Vercel project with preview and production environments" \
  "Provision Neon PostgreSQL with PostGIS extension" \
  "Setup Cloudflare R2 bucket and Images pipeline" \
  "Configure Cloudflare WAF and rate limiting rules" \
  "Setup Upstash Redis for caching and sessions" \
  "Implement CI/CD pipeline with GitHub Actions" \
  "Setup error monitoring (Sentry) and analytics" \
  "Configure environment variables and secrets management"; do
  KEY=$(create_issue "$STORY_TYPE_ID" "$story" "" "$E12")
  echo "     ↳ $KEY: $story"
  log_ticket "$KEY" "Story" "$E12" "$story"
  sleep 0.3
done

# --- Output Summary ---
echo ""
echo "============================================================"
echo "✅ Blab MVP Backlog Created Successfully!"
echo "============================================================"
echo ""
echo "📋 Summary of all created tickets:"
echo ""
column -t -s',' "$SUMMARY_FILE" 2>/dev/null || cat "$SUMMARY_FILE"
echo ""
echo "🔗 View your board: ${JIRA_BASE_URL}/jira/software/projects/${JIRA_PROJECT_KEY}/board"
echo ""
