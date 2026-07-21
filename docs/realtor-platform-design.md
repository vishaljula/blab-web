# Blab Realtor Platform — Design Document

> **How to use this file**
> Add your comments anywhere using the format below, then tell Antigravity to update:
>
> ```
> <!-- ADI: your comment here -->
> ```
>
> Antigravity will reply inline and revise sections as the design evolves.
> Commit this file with the code — it is the living spec.

---

## 1. Where does realtor data live?

### National vs State

Realtors in India are regulated **per state** by RERA (Real Estate Regulatory Authority).
Each state body has a different name and ID format:

| State | Body | Realtor ID format example |
|---|---|---|
| Telangana | TSRERA | `A/RLT/TS/2024/0001` |
| Maharashtra | MahaRERA | `A01900000001` |
| Karnataka | K-RERA | `PRM/KA/RERA/AGENT/...` |
| Andhra Pradesh | AP RERA | Alphanumeric |

A realtor operating in Telangana must have a **TSRERA registration**.
If they also close deals in AP, they need a separate AP RERA registration.

**Design decision:** Store RERA registrations as a separate table, not a single column on `users`.
One realtor can have many RERA IDs across states.

```
rera_registrations
  id
  user_id         FK → users
  state_code      'TG' | 'MH' | 'KA' | 'AP' ...
  rera_body       'TSRERA' | 'MahaRERA' | 'K-RERA' ...
  rera_id         text (state-specific format)
  registered_at   date
  expires_at      date  ← RERA registrations expire, typically 5 years
  verified        boolean DEFAULT false
  verified_at     timestamptz
```

**Why not a JSONB column on users?**
- Expiry tracking per registration needs per-row queries — messy on JSONB arrays
- Separate table allows indexing on `rera_id` for duplicate detection
- Cleaner to add `verified_at`, `expires_at` per state

<!-- ADI:  -->

---

## 2. Full realtor schema (users table additions)

### On `users` (fast-access, always needed for ranking and display)

```sql
-- Identity / profile
photo_url           text
bio                 text
years_experience    smallint
languages_spoken    text[]          -- ['Telugu', 'English', 'Hindi']
phone               text

-- Location
base_location       geography(Point, 4326)   -- PostGIS, for ST_DWithin proximity ranking
areas_served        text[]          -- locality/neighbourhood names

-- Firm membership (SCRUM-204)
firm_id             uuid FK → firms (nullable — NULL for independent realtors)
firm_role           enum('admin','member')

-- Subscription / monetisation (SCRUM-203)
subscription_tier   enum('free_trial','soft_cap','pro','pro_plus')
trial_leads_used    smallint DEFAULT 0
trial_started_at    timestamptz

-- Precomputed event-driven score (SCRUM-202)
realtor_score          integer DEFAULT 0   -- total = sum of all components below
score_tier_base        integer DEFAULT 0
score_response_rate    smallint DEFAULT 0  -- 0-200
score_response_speed   smallint DEFAULT 0  -- 0-200
score_listing_activity smallint DEFAULT 0  -- 0-200
score_reviews          smallint DEFAULT 0  -- 0-200
score_profile          smallint DEFAULT 0  -- 0-100
score_tenure           smallint DEFAULT 0  -- 0-99
```

### Separate relational tables

| Table | What it holds |
|---|---|
| `rera_registrations` | Per-state RERA IDs + expiry + verified flag |
| `leads` | Every lead sent to a realtor |
| `realtor_reviews` | Star ratings + text from buyers/sellers |
| `viewings` | Scheduled property visits |
| `realtor_closings` | Completed deals attributed to a realtor |

<!-- ADI:  -->

---

## 3. Leads schema

```sql
leads
  id
  realtor_id          FK → users
  listing_id          FK → listings
  requester_id        FK → users       -- buyer or seller who made enquiry
  requester_phone     text             -- captured at lead time (in case account deleted)
  requester_name      text
  type                enum('buyer_enquiry','seller_listing_request')
  created_at          timestamptz
  responded_at        timestamptz      -- NULL = not yet responded
  response_channel    enum('whatsapp','call','in_app')  -- NULL until responded
  closed_at           timestamptz      -- NULL = still open
  outcome             enum('converted','lost','no_response','duplicate')  -- NULL until closed
  notes               text             -- realtor private notes, not visible to buyer
```

**Lead counting for trial:**
`trial_leads_used` increments when `leads.created_at` is written — when buyer taps "Contact Realtor".
NOT when the realtor responds. (Rewarding response, not gating on it.)

**Response rate score trigger:**
On every `responded_at` update → recalculate `score_response_rate` for that realtor
(event-driven, no cron needed — see SCRUM-202).

<!-- ADI:  -->

---

## 4. Closings schema

```sql
realtor_closings
  id
  realtor_id          FK → users
  listing_id          FK → listings
  lead_id             FK → leads       -- the originating enquiry
  closed_at           date
  sale_price          numeric(12,2)
  commission_pct      numeric(5,2)     -- optional, not mandatory to disclose
  notes               text
```

**Why store closings?**
- Realtor public profile can show "X deals closed" (credibility signal)
- Future: `score_closings` component in ranking
- Foundation for any commission-based model later

**Who enters closings for MVP1?**
Realtor manually marks a lead as `outcome = 'converted'`, which triggers a closing row creation.
Future: auto-detected via TSRERA registry API if it ever exposes one.

<!-- ADI:  -->

---

## 5. Viewings schema

```sql
viewings
  id
  listing_id          FK → listings
  realtor_id          FK → users
  buyer_id            FK → users
  scheduled_at        timestamptz
  duration_mins       smallint DEFAULT 30
  status              enum('pending','confirmed','cancelled','completed')
  cancellation_reason text
  notes               text             -- realtor-only, not shown to buyer
  created_at          timestamptz
  updated_at          timestamptz
```

**Flow:**
1. Buyer taps "Schedule a Visit" on property detail → `status = 'pending'`
2. Realtor confirms in app → `status = 'confirmed'` + push notification to buyer
3. Either side cancels → `status = 'cancelled'` + reason + push notification to other party
4. After visit time passes → realtor marks `status = 'completed'`, adds notes

<!-- ADI:  -->

---

## 6. MVP1 Realtor Portal — what they get on Day 1

The principle: a realtor should be able to run their Blab pipeline entirely in-app.
No spreadsheets, no WhatsApp leads that get lost.

### 6a. Dashboard (realtor home)

| Widget | Data source |
|---|---|
| Open leads | `leads WHERE realtor_id = me AND closed_at IS NULL` |
| Leads this week | `leads WHERE created_at > 7 days ago` |
| Upcoming viewings | `viewings WHERE scheduled_at > now() LIMIT 3` |
| Active listings | `listings WHERE assigned_realtor_id = me AND status = 'active'` |
| Trial leads remaining | `5 - trial_leads_used` (hidden once on Pro) |

### 6b. Leads list

- All leads, newest first
- Card: buyer name + phone, which listing, time received, responded indicator
- Tap → full detail: listing info, Contact buttons (WhatsApp / Call), notes field, mark converted/lost
- Filters: open / responded / converted / lost

### 6c. Listings I'm handling

- `listings WHERE assigned_realtor_id = me`
- Card: property address, price, status, days listed
- Tap → full property detail (same view as buyer)
- Quick action: "Request status update" → notifies listing owner

### 6d. Viewings calendar

- Calendar + list view of viewings for assigned listings
- Card: property address, buyer name, scheduled time, status
- Actions: confirm, cancel (with reason), mark completed + notes

### 6e. Notifications

| Event | Notification |
|---|---|
| New lead received | Push + in-app |
| Viewing scheduled by buyer | Push + in-app |
| Viewing rescheduled / cancelled | Push + in-app |
| Viewing in 1 hour | Push reminder |
| Trial: 1 lead remaining | In-app prompt |
| Trial expired → soft cap | Push + in-app |

### 6f. Public profile (what buyers see)

- Photo, name, agency/firm, years experience
- RERA ID ("Pending verification" badge until SCRUM-TBD validates it)
- Languages spoken
- Active listings count
- Review score (if reviews exist)
- Response rate badge: "Typically responds within 2 hrs"

### 6g. Profile settings (editable by realtor)

- Photo, bio, phone, languages spoken
- Areas served
- Notification preferences

### 6h. OUT OF SCOPE for MVP1

- Analytics / charts (conversion funnel, leads over time)
- Custom availability / block-off calendar
- Internal firm messaging
- Commission tracking
- Stripe self-serve subscription upgrade (admin activates Pro manually for now)
- RERA verification flow (ID collected, not yet verified)

<!-- ADI:  -->

---

## 7. RERA validation — future story

Collecting the RERA ID at signup is MVP1. Actual validation is a separate story (SCRUM-TBD).

**What validation involves:**
- TSRERA has a public search portal but no open API (as of mid-2025)
- Options: scrape portal (brittle), manual admin review of uploaded certificate, or wait for API
- `rera_registrations.verified` defaults to `false` — shown as "RERA Pending" on profile
- Once verified by Blab admin → `verified = true` → profile shows ✓ RERA Verified badge

**RERA at signup — required or optional?**
> Recommended: collected but not blocking. Realtor can sign up without RERA ID but gets a
> persistent "Complete your profile" prompt and `score_profile` stays lower until provided.
> This avoids abandonment at signup while still collecting the data we need.

<!-- ADI:  -->

---

## 8. Open questions — please comment

1. **RERA at signup** — agree with "optional but prompted" approach above, or should it be hard-required?

2. **Areas served** — free text (fast to ship, harder to match) or structured locality dropdown
   (more work but powers accurate H3-based lead routing)?

3. **Viewing confirmation** — realtor manually confirms each viewing, or auto-confirmed?
   Auto-confirm risks no-shows if realtor misses the notification.

4. **Commission disclosure** — store it in `realtor_closings.commission_pct`? Realtor-only
   visibility or Blab admin also sees it?

5. **Realtor portal platform** — a dedicated tab in the existing Expo native app, or a
   separate web-only admin panel? (Opinion: native tab is better for notifications + calendar
   integration. Web panel is faster to ship without native review cycles.)

6. **Leads that come in while realtor is on soft-cap** — do we silently drop them, queue them,
   or still deliver but show the realtor an upgrade prompt?

<!-- ADI:  -->

---

*Last updated: 2026-07-20 by Antigravity*
*Linked stories: SCRUM-201 (seed), SCRUM-202 (nearest realtor API), SCRUM-203 (monetisation), SCRUM-204 (firms)*
