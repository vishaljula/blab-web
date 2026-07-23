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
| EXPO_PUBLIC_VIEWPORT_STREET_ZOOM     | VIEWPORT_STREET_ZOOM       | H3 → raw listing zoom threshold    |
| EXPO_PUBLIC_API_URL                  | —                          | Native device → Next.js LAN IP     |
| EXPO_PUBLIC_WEB_API_URL              | —                          | Web browser → Next.js URL          |
| EXPO_PUBLIC_MAPBOX_TOKEN             | NEXT_PUBLIC_MAPBOX_TOKEN   | Mapbox GL token                    |

---

## UI Platform Rule (CRITICAL)

**Next.js UI is legacy and must NOT be touched for any new feature work.**

The Expo app (`expo-app/`) is the sole UI for both web and native. All feature UI
is built there. Next.js (`src/`) is used ONLY for:
- API routes (`src/app/api/`)
- Server actions (`src/app/actions/`)
- Database (`src/db/`)
- Shared server-side utilities (`src/lib/`)

Never create or modify pages, components, or styles under `src/app/` (except the
`api/` and `actions/` subdirectories) or `src/components/` as part of any feature.

---

## Web vs Native Differentiation Rule

Every Expo component that renders UI MUST explicitly handle both platforms.
Failure to do so causes visual breakage on one platform silently.

### Required patterns

**1. Platform-specific styles** — use `Platform.select()` or `Platform.OS` checks:
```tsx
import { Platform, StyleSheet } from "react-native";

const s = StyleSheet.create({
  card: {
    borderRadius: 16,
    // Shadow: iOS uses shadowColor/shadowOffset, Android uses elevation,
    // Web uses boxShadow (via style prop, not StyleSheet)
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
      },
      android: { elevation: 4 },
      web: { boxShadow: "0 4px 12px rgba(0,0,0,0.08)" },
    }),
  },
});
```

**2. Web-only CSS properties** — only valid on web, must be gated:
```tsx
// scrollbar hiding, cursor, userSelect, etc.
const webStyle = Platform.OS === "web" ? { cursor: "pointer" as any, userSelect: "none" as any } : {};
```

**3. Paired files for divergent layout** — if web and native layouts are
significantly different, create paired files:
- `ComponentName.web.tsx` — web-specific rendering
- `ComponentName.tsx` — native rendering
Both must be registered in the Paired File Registry above.

**4. ScrollView vs web scroll** — on web, prefer `overflow: "auto"` on a plain
`View` when the content needs native-feeling scroll without a scrollbar. On native,
always use `ScrollView` or `FlatList`.

**5. Touch targets** — on native, minimum tap target is 44×44pt. On web,
`cursor: "pointer"` must be added to all Pressable/TouchableOpacity elements.

### Mandatory checklist for any new Expo component

- [ ] `Platform.select()` used for shadows (not just one platform's syntax)
- [ ] `cursor: "pointer"` added to all interactive elements via `Platform.OS === "web"` guard
- [ ] `ScrollView`/`FlatList` on native, `overflow: "auto"` considered for web
- [ ] No raw CSS properties (e.g. `boxShadow` string) used without a web guard
- [ ] Fonts load correctly on both (Expo Font or system fonts — no Google Fonts CDN)
