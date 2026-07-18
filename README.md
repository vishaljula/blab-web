# Blab Web

Real estate listing platform — Next.js (web backend + SSR) + Expo (React Native cross-platform app).

---

## Project Structure

```
blab-web/
├── src/                    # Next.js app (web frontend + API backend)
│   └── app/api/            # API routes consumed by both web and Expo
├── expo-app/               # Expo app (iOS, Android, Expo Web)
│   ├── app/                # Expo Router screens
│   ├── components/         # Shared RN components (MapView, ListView, etc.)
│   ├── store/              # Zustand global state (listings, auth, boundary)
│   └── lib/                # API client, theme, formatting utils
```

---

## Getting Started

```bash
# Next.js dev server (API + web frontend)
npm run dev                   # → http://localhost:3000

# Expo dev server (iOS / Android / Expo Web)
cd expo-app && npx expo start # → http://localhost:8081 (web)
```

---

## Environment Variables

Copy `.env.local.example` → `.env.local` and fill in values.

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | Postgres connection string |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | ✅ | Mapbox GL JS token (web) |
| `EXPO_PUBLIC_MAPBOX_TOKEN` | ✅ | Mapbox token (Expo native/web) |
| `NEXTAUTH_SECRET` | ✅ | NextAuth session secret |
| `MAPPLS_API_KEY` | ✅ | Mappls (MapmyIndia) API key for place search & boundary |
| `VIEWPORT_STREET_ZOOM` | ☑️ | See below — defaults to `13` |

---

## Map Viewport System

The map API (`GET /api/listings/viewport`) uses **H3 hexagonal indexing** to return
one representative listing pin per geographic cell at low zoom levels, switching to
raw listings at street level.

### Zoom → Resolution Ladder

| Zoom | Mode | H3 Resolution | Cell size |
|---|---|---|---|
| < 8 | Empty (guard) | — | Viewport too large |
| 8–9 | H3 representative pins | res5 | ~252 km² (state/region) |
| 10–11 | H3 representative pins | res6 | ~36 km² (city area) |
| 12 | H3 representative pins | res7 | ~5 km² (neighbourhood) |
| 13 | H3 representative pins | res8 | ~0.74 km² (block) |
| ≥ `VIEWPORT_STREET_ZOOM` | **All listings** | — | Raw, no grouping |

### `VIEWPORT_STREET_ZOOM`

Controls the zoom level at which H3 grouping stops and every active listing is returned individually.

```bash
# MVP default — show all listings from zoom 13 (sparse data)
VIEWPORT_STREET_ZOOM=13

# Production — enable H3 grouping all the way to block level
VIEWPORT_STREET_ZOOM=14
```

**Why this exists:** Early in the MVP, you have sparse data. Setting this low (13) means
every listing is always visible without needing to drill to street zoom. Once you have
enough listings that the map becomes visually cluttered at city zoom, bump this to 14
so H3 grouping kicks in and one representative pin per block is shown instead.

No code change needed — restart the Next.js server after changing the env var.

---

## Database

PostgreSQL with the `h3` extension for H3 cell type support.

### Key indexes on `listings`

```sql
-- H3 composite partial indexes for fast DISTINCT ON viewport queries
CREATE INDEX idx_listings_h3_res5_rank ON listings (h3_index_res5, created_at DESC) WHERE status = 'active';
CREATE INDEX idx_listings_h3_res6_rank ON listings (h3_index_res6, created_at DESC) WHERE status = 'active';
CREATE INDEX idx_listings_h3_res7_rank ON listings (h3_index_res7, created_at DESC) WHERE status = 'active';
CREATE INDEX idx_listings_h3_res8_rank ON listings (h3_index_res8, created_at DESC) WHERE status = 'active';

-- GIST index for polygon/boundary search
CREATE INDEX idx_listings_location ON listings USING GIST (ST_MakePoint(longitude, latitude));
```

### `boost_score` column

```sql
ALTER TABLE listings ADD COLUMN boost_score smallint NOT NULL DEFAULT 0;
```

Future monetisation hook — when enabled, listings with `boost_score > 0` win their
H3 cell (shown as the representative pin) over equally-recent organic listings.
Currently defaults to 0 for all listings.
