#!/usr/bin/env python3
"""
Create Jira tickets for:
  MVP1:
    - Realtor Matching Algorithm (SCRUM-25)
    - H3 Map Clustering — update SCRUM-193 + subtasks (SCRUM-160)
  MVP2:
    - Photographer Live Location Tracking (SCRUM-175)
    - Photographer Dispatch Algorithm (SCRUM-175)
"""
import os, json, requests
from requests.auth import HTTPBasicAuth

BASE   = "https://moneymic.atlassian.net"
EMAIL  = "purchases@moneymic.com"
TOKEN  = "ATATT3xFfGF0ZOQSbvo8rcX6QNdW-OXKYEJvWoBbnp2BxTDQBO2BCfu7zPwOCiFNbKJCEMxU7GnV3_r-bIRHw1SImCSy1tHDe_dWg35tdRwRsyUY6wkkUG8MCRXN-nXogDl32dPkFQe7kKMnYysZ2OreHYprmI_-6APoauhlRouUE-PUZbVUg-s=E9608F98"
PROJECT = "SCRUM"
AUTH   = HTTPBasicAuth(EMAIL, TOKEN)
HEADERS = {"Accept": "application/json", "Content-Type": "application/json"}

def adf(text):
    """Wrap plain text in Atlassian Document Format."""
    return {
        "version": 1,
        "type": "doc",
        "content": [{"type": "paragraph", "content": [{"type": "text", "text": text}]}]
    }

def adf_full(paragraphs):
    """Multiple paragraphs in ADF."""
    content = []
    for p in paragraphs:
        content.append({"type": "paragraph", "content": [{"type": "text", "text": p}]})
    return {"version": 1, "type": "doc", "content": content}

def create_issue(summary, description_paragraphs, issue_type, epic_key, labels=None):
    body = {
        "fields": {
            "project": {"key": PROJECT},
            "summary": summary,
            "description": adf_full(description_paragraphs),
            "issuetype": {"name": issue_type},
            "labels": labels or [],
            "parent": {"key": epic_key},
        }
    }
    r = requests.post(f"{BASE}/rest/api/3/issue", auth=AUTH, headers=HEADERS, json=body)
    if r.status_code in (200, 201):
        data = r.json()
        print(f"  ✅ Created {data['key']}: {summary}")
        return data["key"]
    else:
        print(f"  ❌ Failed ({r.status_code}): {r.text[:300]}")
        return None

def update_issue(key, description_paragraphs):
    body = {"fields": {"description": adf_full(description_paragraphs)}}
    r = requests.put(f"{BASE}/rest/api/3/issue/{key}", auth=AUTH, headers=HEADERS, json=body)
    if r.status_code == 204:
        print(f"  ✅ Updated {key}")
    else:
        print(f"  ❌ Failed updating {key} ({r.status_code}): {r.text[:300]}")

def add_comment(key, paragraphs):
    body = {"body": adf_full(paragraphs)}
    r = requests.post(f"{BASE}/rest/api/3/issue/{key}/comment", auth=AUTH, headers=HEADERS, json=body)
    if r.status_code in (200, 201):
        print(f"  ✅ Commented on {key}")
    else:
        print(f"  ❌ Failed comment on {key} ({r.status_code}): {r.text[:200]}")


print("\n━━━ MVP1: Realtor Matching Algorithm (under SCRUM-25) ━━━")
realtor_key = create_issue(
    summary="[BLAB-REALTOR-01] Realtor Matching Algorithm — Composite Scoring & Dynamic Radius",
    description_paragraphs=[
        "CONTEXT",
        "When a listing is submitted, Blab needs to assign the top-3 most suitable available realtors. A naive 'nearest within 5km' approach fails in multiple real scenarios: dense areas return overloaded realtors, sparse areas return nothing, and new realtors with 1 high rating game the ranking.",
        "",
        "ALGORITHM",
        "Composite score = (proximity 40%) + (rating 35%) + (availability 25%)",
        "Proximity score: continuous inverse-distance, not binary cutoff. A realtor 8km away can still win on other dimensions.",
        "Rating score: Bayesian adjusted average = (count * raw + C * prior) / (count + C) where C=10, prior=platform avg. Prevents 1 rating of 5.0 from outranking 200 ratings of 4.7.",
        "Availability score: inverse of active_listing_count. Cap: realtors with >30 active listings are excluded entirely.",
        "",
        "EXPANDING RADIUS (handles sparse areas)",
        "Try 2km → 5km → 10km → 20km. If <3 realtors found at max radius, fill remaining slots from Blab in-house team. This mirrors Uber's concentric-ring driver dispatch pattern.",
        "",
        "DB CHANGES NEEDED on users table:",
        "- location geography(POINT, 4326) GENERATED ALWAYS AS ... STORED (same pattern as listings)",
        "- GIST index on location (idx_users_location)",
        "- h3_index_res9 bigint (for ring-expansion dispatch, cheaper than repeated ST_DWithin)",
        "- rating float DEFAULT 0",
        "- rating_count int DEFAULT 0",
        "- active_listing_count int DEFAULT 0 (cached, updated on assignment/completion — NOT computed via JOIN on every query)",
        "- is_available boolean DEFAULT true",
        "",
        "API",
        "POST /api/realtors/match  body: { listingId }",
        "Returns: top-3 ranked realtor objects with score breakdown",
        "",
        "EDGE CASES",
        "- Dense area: many realtors → score ranks them correctly",
        "- Sparse area: expanding radius → in-house fallback",
        "- All nearby overloaded (>30 listings): excluded, look farther",
        "- New realtor: Bayesian rating prevents gaming",
        "- Realtor manually offline (is_available=false): excluded",
    ],
    issue_type="Story",
    epic_key="SCRUM-25",
    labels=["backend", "spatial", "realtor", "mvp1"]
)

print("\n━━━ MVP1: Update SCRUM-193 (H3 re-scope) + add subtasks under SCRUM-160 ━━━")
# Update SCRUM-193 to reflect the H3 approach
add_comment("SCRUM-193", [
    "SCOPE UPDATE — re-scoped after architecture review",
    "Original scope was: remove LIMIT 200 + simple area guard.",
    "After architecture review, this is NOT sufficient for billion-scale. The correct approach is H3 hex aggregation at low zoom + individual pins at high zoom. This eliminates both the LIMIT 200 problem and the unbounded query problem without arbitrary area cutoffs.",
    "See subtasks below for implementation breakdown.",
])

print("  → Creating H3 subtasks under SCRUM-160...")
h3_db = create_issue(
    summary="[BLAB-MAP-H3-01] H3 schema migration — add h3_index columns to listings and users tables",
    description_paragraphs=[
        "Add Uber H3 cell index columns to listings (and users) tables via migrate.ts.",
        "",
        "LISTINGS TABLE — add columns:",
        "h3_index_res7 bigint  (neighborhood scale, ~86 km², used for mid-zoom aggregation)",
        "h3_index_res9 bigint  (street block scale, ~1.7 km², used for fine-zoom and photographer dispatch)",
        "",
        "Both are GENERATED ALWAYS AS (h3_lat_lng_to_cell(latitude, longitude, <res>)) STORED using the h3-pg Postgres extension, OR computed via h3-js in the migration script if the extension is unavailable on Neon.",
        "",
        "Also add h3_index_res9 to users table (needed by realtor matching and photographer dispatch).",
        "",
        "Add B-tree indexes on both h3 columns for GROUP BY performance:",
        "CREATE INDEX idx_listings_h3_res7 ON listings (h3_index_res7);",
        "CREATE INDEX idx_listings_h3_res9 ON listings (h3_index_res9);",
        "",
        "Backfill existing rows using h3-js in a migration script.",
        "Update the listing INSERT API to compute and store h3 values on new rows.",
    ],
    issue_type="Subtask" if False else "Story",  # Jira cloud doesn't always allow subtask via API easily
    epic_key="SCRUM-160",
    labels=["backend", "database", "h3", "migration", "mvp1"]
)

h3_api = create_issue(
    summary="[BLAB-MAP-H3-02] Viewport API — zoom-conditional response (H3 clusters vs individual pins)",
    description_paragraphs=[
        "Modify GET /api/listings/viewport to accept a zoom param and return different data based on zoom level.",
        "",
        "ZOOM LOGIC:",
        "zoom < 10  → H3 resolution 5 aggregation (city scale): SELECT h3_index_res7, COUNT(*), AVG(price) GROUP BY h3_index_res7",
        "zoom 10-11 → H3 resolution 7 aggregation (neighborhood): SELECT h3_index_res7, COUNT(*), AVG(price) GROUP BY h3_index_res7",
        "zoom 12+   → Individual pins (current behavior, no LIMIT)",
        "",
        "Response shape:",
        "Low zoom: { type: 'clusters', data: [{h3index, count, avgPrice, lat, lng}] }",
        "High zoom: { type: 'listings', data: [{id, lat, lng, price, ...}] }",
        "",
        "The GIST index is still used in ALL paths for the WHERE location && [bbox] pre-filter before GROUP BY.",
        "LIMIT 200 is REMOVED entirely — the zoom gate naturally bounds result count.",
        "Both the polygon route and viewport route get the same treatment.",
        "",
        "Area guard (secondary protection): if bbox area > 2 sq degrees, reject with 400 regardless of zoom. Prevents country-scale queries.",
    ],
    issue_type="Story",
    epic_key="SCRUM-160",
    labels=["backend", "api", "h3", "spatial", "mvp1"]
)

h3_client = create_issue(
    summary="[BLAB-MAP-H3-03] Map client — zoom-aware rendering (cluster count badges vs price pins)",
    description_paragraphs=[
        "Update MapView.web.tsx and MapView.tsx to handle the new zoom-conditional API response.",
        "",
        "CHANGES:",
        "1. Send zoom level with every viewport API call: fetchViewportListings(bounds, listingType, zoom)",
        "2. On response type='clusters': render centroid pins with count badge (e.g. '1,247') instead of price tags. Click zooms map into that cluster area.",
        "3. On response type='listings': current behavior — pass to Supercluster for client-side grouping + render price pins.",
        "4. Smooth transition: no flicker when crossing zoom threshold. Debounce API calls remain.",
        "",
        "The cluster count badge should show abbreviated count: 1247 → '1.2k', 62000 → '62k'",
        "Tap/click on a cluster badge → map.fitBounds(h3 cell bbox, {padding: 60})",
        "",
        "Supercluster is still used at high zoom for final grouping of individual pins. No change there.",
    ],
    issue_type="Story",
    epic_key="SCRUM-160",
    labels=["frontend", "map", "h3", "mvp1"]
)

print("\n━━━ MVP2: Photographer tickets (under SCRUM-175) ━━━")
photo_tracking = create_issue(
    summary="[BLAB-PHOTO-01] Photographer Live Location Tracking — H3 cell update + map display",
    description_paragraphs=[
        "Photographer's mobile app sends GPS location periodically. Server stores location + H3 cell. Customer-facing map shows live photographer marker.",
        "",
        "PHOTOGRAPHER APP (Expo):",
        "- Request location permission on photographer login",
        "- Send GPS update every 15 seconds via POST /api/photographers/location",
        "- Body: { lat, lng }  — server computes H3, no client-side H3 lib needed",
        "- Only send when job is assigned (status = 'en_route' or 'shooting')",
        "",
        "SERVER (POST /api/photographers/location):",
        "- Update users SET location = ST_MakePoint(lng, lat)::geography, h3_index_res9 = h3_lat_lng_to_cell(lat, lng, 9), last_location_at = NOW()",
        "- Authenticate via photographer session token",
        "",
        "CUSTOMER MAP:",
        "- Poll GET /api/listings/{id}/photographer-location every 10s when job is active",
        "- Returns { lat, lng, status } or null if no active photographer",
        "- Map renders a camera icon marker with smooth position interpolation",
        "- Show ETA if available (can use Mappls directions API)",
        "",
        "DB CHANGES:",
        "- users table: location, h3_index_res9, last_location_at timestamp (already planned in BLAB-REALTOR-01 migration)",
        "",
        "Privacy: photographer location is ONLY visible to the customer whose listing job is active. Never shown on the public map.",
    ],
    issue_type="Story",
    epic_key="SCRUM-175",
    labels=["backend", "frontend", "photographer", "h3", "mvp2", "maps"]
)

photo_dispatch = create_issue(
    summary="[BLAB-PHOTO-02] Photographer Dispatch Algorithm — h3_grid_disk nearest-cell assignment",
    description_paragraphs=[
        "When a listing is approved and needs photography, automatically assign the nearest available photographer using H3 ring expansion.",
        "",
        "ALGORITHM (mirrors Uber driver dispatch):",
        "1. Get listing's h3_index_res9 cell",
        "2. Query photographers in that cell: WHERE h3_index_res9 = listing_cell AND is_available = true AND status = 'idle'",
        "3. If none found: expand to ring 1 (6 adjacent cells) using h3_grid_disk(cell, 1)",
        "4. Expand ring 2, 3... up to ring 5 (~8.5 km radius at res9)",
        "5. If still none: fall back to manual assignment + Slack alert to ops team",
        "",
        "Within found candidates, rank by:",
        "- Distance from listing (primary)",
        "- Current job queue length (secondary) — photographers with 0 queued jobs preferred",
        "- Rating (tertiary)",
        "",
        "h3_grid_disk is pure integer arithmetic — much faster than repeated ST_DWithin radius expansions.",
        "",
        "ASSIGNMENT FLOW:",
        "1. System finds top candidate",
        "2. Creates job record: photography_jobs(listing_id, photographer_id, status='pending', assigned_at)",
        "3. Sends push notification to photographer app",
        "4. Photographer has 2 min to accept. If no response → try next candidate.",
        "5. On acceptance → status='confirmed', customer notified",
        "",
        "NEW TABLE: photography_jobs",
        "id uuid PK, listing_id uuid FK, photographer_id uuid FK, status enum(pending/confirmed/en_route/shooting/completed/cancelled), assigned_at, accepted_at, completed_at, notes text",
        "",
        "API:",
        "POST /api/photography-jobs/assign  (internal/ops, triggered on listing approval)",
        "POST /api/photography-jobs/{id}/accept  (photographer app)",
        "POST /api/photography-jobs/{id}/status  (photographer app — update to en_route, shooting, completed)",
    ],
    issue_type="Story",
    epic_key="SCRUM-175",
    labels=["backend", "photographer", "h3", "dispatch", "mvp2"]
)

print("\n━━━ Summary ━━━")
print(f"MVP1 — Realtor matching:   {realtor_key}")
print(f"MVP1 — H3 DB migration:    {h3_db}")
print(f"MVP1 — H3 viewport API:    {h3_api}")
print(f"MVP1 — H3 client render:   {h3_client}")
print(f"MVP2 — Photo tracking:     {photo_tracking}")
print(f"MVP2 — Photo dispatch:     {photo_dispatch}")
print("\nSCRUM-193 — commented with scope update (H3 approach)")
