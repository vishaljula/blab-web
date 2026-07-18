# Blab — Agent Rules

## Paired File Rule (CRITICAL)

This project has **platform-paired files** — every feature change made in the web
implementation MUST be mirrored in the native implementation in the same session,
and vice versa. Failing to do this causes divergence that only surfaces at native
test time, wastes a full debug cycle, and breaks parity between platforms.

### Paired file registry

| Web file | Native counterpart | What must stay in sync |
|---|---|---|
| `expo-app/components/MapView.web.tsx` | `expo-app/components/MapView.tsx` | Fetch logic, store calls (`setListings`, `setTotal`, `setCurrentZoom`), rendering strategy (cluster vs direct), all H3-related changes |
| `expo-app/components/ListView.tsx` | same file (web + native in one) | Both `Platform.OS === 'web'` render branches |

### Mandatory checklist before ending any session that touches a paired file

- [ ] Open the counterpart file and audit the same section that was edited
- [ ] Confirm both files call identical store actions with identical defensive guards
- [ ] Confirm both files use identical API response destructuring (`data.listings`, `data.total`)
- [ ] If a UI pattern was removed from one (e.g. cluster badges), verify it is absent from the other
- [ ] State this check explicitly in the response: "Checked counterpart MapView.tsx — in sync ✅"

### Why this rule exists

SCRUM-196/197 (commit b1d4c26) added H3 cluster badges to both files.
A later session removed cluster UI from MapView.web.tsx but missed MapView.tsx.
The divergence was invisible until native was tested.

---

## Store Defensive Guard Rule

Any call to setListings() MUST be wrapped with Array.isArray():

```ts
// Correct
setListings(Array.isArray(data.listings) ? data.listings : []);

// Wrong — crashes if API returns unexpected shape
setListings(data.listings);
setListings(data); // passing whole response object
```

Both MapView.web.tsx and MapView.tsx must follow this pattern.
setTotal must always be called in the same try block as setListings.

---

## Env Var Pairing Rule

Env vars used by the Expo client must have the EXPO_PUBLIC_ prefix and must exist
in expo-app/.env (NOT the root .env.local which Expo does not read).

Server-side vars (Next.js API routes) live in the root .env.local.

When adding a new env var that both sides need:
- Root .env.local → server (no prefix)
- expo-app/.env → client (must have EXPO_PUBLIC_ prefix)
- Vercel → both keys must be added (use vercel env add for each)

| Expo client var                      | Server var                 | Purpose                            |
|--------------------------------------|----------------------------|------------------------------------|
| EXPO_PUBLIC_VIEWPORT_STREET_ZOOM     | VIEWPORT_STREET_ZOOM       | H3 → raw listing zoom threshold    |
| EXPO_PUBLIC_API_URL                  | —                          | Native device → Next.js LAN IP     |
| EXPO_PUBLIC_WEB_API_URL              | —                          | Web browser → Next.js URL          |
| EXPO_PUBLIC_MAPBOX_TOKEN             | NEXT_PUBLIC_MAPBOX_TOKEN   | Mapbox GL token                    |
