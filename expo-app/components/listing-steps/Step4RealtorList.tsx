/**
 * Step4RealtorList — Realtor path, Step 4 of 4
 *
 * Layout:
 *   - 3 cards always in a horizontal row (same rank level)
 *   - Web: wider cards with more detail visible
 *   - Native: compact portrait cards (photo + essentials)
 *
 * Card shows only marketing-relevant info (no tier badge):
 *   photo, name, company, years experience, areas served, response quality
 *
 * Search: by company name or RERA number (names are AES-encrypted in DB).
 * Concurrency: Redis soft-reserves shown realtors server-side for 5 min.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import {
  View, Text, Pressable, StyleSheet, ActivityIndicator,
  TextInput, ScrollView, Platform, useWindowDimensions,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useColorScheme } from "@/components/useColorScheme";
import { COLORS, API_BASE_URL } from "@/lib/theme";
import { useListingFormStore, buildListingPayload, type RealtorOption } from "@/store/listingForm";
import { useListingsStore } from "@/store/listings";
import WizardShell, { CtaButton } from "./WizardShell";
import { reraSearchPlaceholder } from "@/lib/reraFormats";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Truncate array and return first N items. */
function first<T>(arr: T[] | null | undefined, n: number): T[] {
  if (!arr || arr.length === 0) return [];
  return arr.slice(0, n);
}

/** Format distance in km or m. */
function distanceLabel(m?: number | null): string | null {
  if (m == null) return null;
  if (m < 1000) return `${m} m away`;
  return `${(m / 1000).toFixed(1)} km away`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Step4RealtorList() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const C = isDark ? COLORS.dark : COLORS.light;
  const router = useRouter();
  const { width: screenW } = useWindowDimensions();
  const isWide = Platform.OS === "web" && screenW > 500;

  const store = useListingFormStore();
  const { token } = useListingsStore();
  const { latitude, longitude, address } = store;
  const reraPlaceholder = reraSearchPlaceholder(address);

  const [chosenId, setChosenId]         = useState<string | null>(store.assignedRealtorId);
  const [suggestions, setSuggestions]   = useState<RealtorOption[]>([]);
  const [loading, setLoading]           = useState(true);

  const [searchQuery, setSearchQuery]   = useState("");
  const [searchResults, setSearchResults] = useState<RealtorOption[]>([]);
  const [searching, setSearching]       = useState(false);
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [submitting, setSubmitting]     = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [done, setDone]                 = useState(false);

  // ── Fetch top-3 suggestions ───────────────────────────────────────────────
  useEffect(() => {
    const geo     = latitude && longitude ? `&lat=${latitude}&lng=${longitude}` : "";
    const exclude = store.assignedRealtorId ? `&exclude=${store.assignedRealtorId}` : "";
    fetch(`${API_BASE_URL}/api/realtors/available?limit=3${geo}${exclude}`)
      .then((r) => r.ok ? r.json() : [])
      .then(setSuggestions)
      .catch(() => setSuggestions([]))
      .finally(() => setLoading(false));
  }, [latitude, longitude]);

  // ── Debounced search ──────────────────────────────────────────────────────
  const handleSearchChange = useCallback((text: string) => {
    setSearchQuery(text);
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    if (!text.trim()) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    searchDebounce.current = setTimeout(async () => {
      try {
        const geo = latitude && longitude ? `&lat=${latitude}&lng=${longitude}` : "";
        const res = await fetch(
          `${API_BASE_URL}/api/realtors/available?q=${encodeURIComponent(text.trim())}&limit=3${geo}`
        );
        const data = res.ok ? await res.json() : [];
        setSearchResults(data);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);
  }, [latitude, longitude]);

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      store.setRealtorContact({ contactName: "", contactPhone: "", assignedRealtorId: chosenId });
      const payload = buildListingPayload({ ...store, assignedRealtorId: chosenId });
      const res = await fetch(`${API_BASE_URL}/api/listings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      setDone(true);
      store.reset();
    } catch (e: any) {
      setError(e.message ?? "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Success screen ────────────────────────────────────────────────────────
  if (done) {
    return (
      <View style={[s.successWrap, { backgroundColor: C.background }]}>
        <Text style={s.successIcon}>🎉</Text>
        <Text style={[s.successTitle, { color: C.foreground }]}>Realtor request sent!</Text>
        <Text style={[s.successDesc, { color: C.mutedForeground }]}>
          {chosenId
            ? "Your chosen realtor will contact you within a few hours."
            : "We'll match you with a RERA-approved realtor nearby — expect a call within a few hours."}
        </Text>
        <Pressable
          onPress={() => router.replace("/(tabs)")}
          style={[s.successCta, { backgroundColor: C.primary }]}
        >
          <Text style={{ color: C.primaryForeground, fontSize: 15, fontWeight: "800" }}>
            Back to map
          </Text>
        </Pressable>
      </View>
    );
  }

  // Decide which cards to show
  const isSearchActive = searchQuery.trim().length > 0;
  const displayCards   = isSearchActive ? searchResults : suggestions;
  const chosenRealtor  = displayCards.find((r) => r.id === chosenId) ?? null;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <WizardShell
      heading="Choose your realtor"
      hint="Pick one or let us auto-assign the best available in your area."
      cta={
        <CtaButton
          label={
            submitting
              ? "Submitting…"
              : chosenRealtor
              ? `Confirm ${chosenRealtor.name.split(" ")[0]} →`
              : "Auto-assign me a realtor →"
          }
          onPress={handleSubmit}
          disabled={submitting}
        />
      }
    >
      {/* ── Card grid ─────────────────────────────────────────────────────── */}
      {loading ? (
        <View style={s.loadingWrap}>
          <ActivityIndicator color={C.primary} size="large" />
          <Text style={[s.loadingText, { color: C.mutedForeground }]}>
            Finding realtors near you…
          </Text>
        </View>
      ) : (
        <>
          {/* Row of 3 cards */}
          <View style={s.cardRow}>
            {displayCards.length === 0 && !isSearchActive && !searching ? (
              <View style={[s.emptyBox, { backgroundColor: C.muted, borderColor: C.border }]}>
                <Text style={s.emptyIcon}>🔍</Text>
                <Text style={[s.emptyTitle, { color: C.foreground }]}>No realtors in your area yet</Text>
                <Text style={[s.emptyDesc, { color: C.mutedForeground }]}>
                  We're expanding soon. Submit and we'll match you automatically.
                </Text>
              </View>
            ) : searching ? (
              <ActivityIndicator color={C.primary} style={{ flex: 1, paddingVertical: 24 }} />
            ) : displayCards.length === 0 && isSearchActive ? (
              <View style={[s.emptyBox, { backgroundColor: C.muted, borderColor: C.border }]}>
                <Text style={s.emptyIcon}>🔍</Text>
                <Text style={[s.emptyTitle, { color: C.foreground }]}>No match found</Text>
                <Text style={[s.emptyDesc, { color: C.mutedForeground }]}>
                  Try a different company name or RERA number.
                </Text>
              </View>
            ) : (
              displayCards.map((r) => (
                <RealtorCard
                  key={r.id}
                  realtor={r}
                  selected={chosenId === r.id}
                  onPress={() => setChosenId(chosenId === r.id ? null : r.id)}
                  C={C}
                  isWide={isWide}
                />
              ))
            )}
          </View>

          {/* ── Search section ──────────────────────────────────────────────── */}
          <View style={[s.searchSection, { borderTopColor: C.border }]}>
            <Text style={[s.searchLabel, { color: C.mutedForeground }]}>
              Already know a realtor?
            </Text>
            <View style={[s.searchInput, { backgroundColor: C.muted, borderColor: C.border }]}>
              <Ionicons name="search-outline" size={16} color={C.mutedForeground} />
              <TextInput
                value={searchQuery}
                onChangeText={handleSearchChange}
                placeholder={reraPlaceholder}
                placeholderTextColor={C.mutedForeground}
                style={[s.searchField, { color: C.foreground }]}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
              />
              {searchQuery.length > 0 && (
                <Pressable onPress={() => { setSearchQuery(""); setSearchResults([]); }}>
                  <Ionicons name="close-circle" size={16} color={C.mutedForeground} />
                </Pressable>
              )}
            </View>
          </View>

          {/* ── Fee note ────────────────────────────────────────────────────── */}
          <View style={[s.feeNote, { backgroundColor: C.muted, borderColor: C.border }]}>
            <Text style={[s.feeNoteText, { color: C.mutedForeground }]}>
              Realtor's commission per industry standard.{" "}
              <Text style={{ fontWeight: "700", color: C.foreground }}>
                Blab takes zero commission.
              </Text>
            </Text>
          </View>
        </>
      )}

      {error && (
        <View style={[s.errorBox, { backgroundColor: `${C.destructive}15`, borderColor: `${C.destructive}40` }]}>
          <Text style={{ color: C.destructive, fontSize: 13 }}>{error}</Text>
        </View>
      )}
    </WizardShell>
  );
}

// ── RealtorCard ───────────────────────────────────────────────────────────────

interface RealtorCardProps {
  realtor: RealtorOption;
  selected: boolean;
  onPress: () => void;
  C: ReturnType<typeof COLORS.dark extends infer T ? () => T : never> extends never
    ? any
    : any;
  isWide: boolean;
}

function RealtorCard({ realtor: r, selected, onPress, C, isWide }: RealtorCardProps) {
  const photoSize  = isWide ? 100 : 80;
  const initial    = r.name.charAt(0).toUpperCase();
  const areas      = first(r.areasServed, 2);
  const dist       = distanceLabel(r.distanceM);
  const years      = r.yearsExperience;
  const deals      = r.totalDeals ?? 0;
  const langs      = first(r.languagesSpoken, 3);
  const reraShort  = r.reraNumber ? r.reraNumber.slice(-8) : null;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        s.card,
        {
          backgroundColor: C.card,
          borderColor: selected ? C.primary : C.border,
          borderWidth: selected ? 2 : 1.5,
          opacity: pressed ? 0.9 : 1,
          ...Platform.select({
            ios: {
              shadowColor: selected ? C.primary : "#000",
              shadowOffset: { width: 0, height: selected ? 4 : 2 },
              shadowOpacity: selected ? 0.22 : 0.07,
              shadowRadius: selected ? 12 : 6,
            },
            android: { elevation: selected ? 6 : 3 },
            web: {
              boxShadow: selected
                ? `0 0 0 2px ${C.primary}, 0 6px 20px rgba(0,0,0,0.12)`
                : "0 2px 8px rgba(0,0,0,0.07)",
            } as any,
          }),
        },
      ]}
    >
      {/* Photo */}
      <View style={[s.photoWrap, { width: photoSize, height: photoSize, borderRadius: photoSize / 2 }]}>
        {r.photoUrl ? (
          <Image
            source={{ uri: r.photoUrl }}
            style={[s.photo, { width: photoSize, height: photoSize, borderRadius: photoSize / 2 }]}
            contentFit="cover"
          />
        ) : (
          <View
            style={[
              s.photoFallback,
              {
                width: photoSize,
                height: photoSize,
                borderRadius: photoSize / 2,
                backgroundColor: C.primary,
              },
            ]}
          >
            <Text style={[s.initial, { fontSize: photoSize * 0.38 }]}>{initial}</Text>
          </View>
        )}
        {/* Selection checkmark overlay */}
        {selected && (
          <View style={s.checkOverlay}>
            <Ionicons name="checkmark" size={14} color="#fff" />
          </View>
        )}
      </View>

      {/* Name */}
      <Text
        style={[s.name, { color: C.foreground }]}
        numberOfLines={2}
      >
        {r.name}
      </Text>

      {/* Company */}
      {r.companyName ? (
        <Text style={[s.company, { color: C.mutedForeground }]} numberOfLines={1}>
          {r.companyName}
        </Text>
      ) : null}

      {/* Years experience + deal count */}
      {(years || deals > 0) ? (
        <Text style={[s.years, { color: C.mutedForeground }]}>
          {[years ? `${years} yrs` : null, deals > 0 ? `${deals} deals` : null]
            .filter(Boolean).join(" · ")}
        </Text>
      ) : null}

      {/* RERA trust badge — abbreviated by default, full number on selection */}
      {r.reraNumber ? (
        <View style={[s.reraPill, { backgroundColor: `${C.primary}12`, borderColor: `${C.primary}30` }]}>
          <Text style={[s.reraText, { color: C.primary }]}>
            {selected ? `✓ RERA ${r.reraNumber}` : `✓ RERA ···${reraShort}`}
          </Text>
        </View>
      ) : null}


      {dist ? (
        <Text style={[s.dist, { color: C.mutedForeground }]}>{dist}</Text>
      ) : null}

      {/* Languages spoken */}
      {langs.length > 0 && (
        <View style={s.areaPills}>
          {langs.map((l, i) => (
            <View key={i} style={[s.langPill, { backgroundColor: C.muted }]}>
              <Text style={[s.areaText, { color: C.mutedForeground }]}>{l}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Area pills */}
      {areas.length > 0 && (
        <View style={s.areaPills}>
          {areas.map((a, i) => (
            <View key={i} style={[s.areaPill, { backgroundColor: C.muted }]}>
              <Text style={[s.areaText, { color: C.mutedForeground }]} numberOfLines={1}>
                {a}
              </Text>
            </View>
          ))}
        </View>
      )}
      {/* Bio — expands inline when card is selected */}
      {selected && r.bio ? (
        <View style={[s.bioBox, { borderTopColor: C.border }]}>
          <Text style={[s.bioText, { color: C.mutedForeground }]} numberOfLines={3}>
            {r.bio}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  // Grid
  cardRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 24,
  },

  // Card
  card: {
    flex: 1,
    borderRadius: 16,
    padding: 12,
    alignItems: "center",
    gap: 6,
  },

  // Photo
  photoWrap:    { position: "relative" },
  photo:        { },
  photoFallback:{ alignItems: "center", justifyContent: "center" },
  initial:      { color: "#fff", fontWeight: "800" },
  checkOverlay: {
    position: "absolute", bottom: -2, right: -2,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: "#22C55E",
    alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: "#fff",
  },

  // Text
  name:    { fontSize: 13, fontWeight: "800", textAlign: "center", lineHeight: 17 },
  company: { fontSize: 11, textAlign: "center" },
  years:   { fontSize: 10, textAlign: "center" },

  // RERA pill
  reraPill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, borderWidth: 1, marginTop: 2 },
  reraText: { fontSize: 9, fontWeight: "700" },

  // Distance
  dist: { fontSize: 9, textAlign: "center" },

  // Area pills
  areaPills: { flexDirection: "row", flexWrap: "wrap", gap: 3, justifyContent: "center", marginTop: 2 },
  langPill:  { paddingHorizontal: 5, paddingVertical: 2, borderRadius: 8 },
  areaPill:  { paddingHorizontal: 5, paddingVertical: 2, borderRadius: 8 },
  areaText:  { fontSize: 9 },

  // Loading / empty
  loadingWrap: { alignItems: "center", paddingVertical: 40, gap: 12 },
  loadingText: { fontSize: 13 },
  emptyBox:    { flex: 1, padding: 24, borderRadius: 16, borderWidth: 1.5, alignItems: "center" },
  emptyIcon:   { fontSize: 32, marginBottom: 8 },
  emptyTitle:  { fontSize: 14, fontWeight: "800", marginBottom: 4, textAlign: "center" },
  emptyDesc:   { fontSize: 12, lineHeight: 18, textAlign: "center" },

  // Search
  searchSection: { borderTopWidth: 1, paddingTop: 18, marginBottom: 16 },
  searchLabel:   { fontSize: 13, fontWeight: "600", marginBottom: 8 },
  searchInput: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 12, paddingVertical: 10,
    borderRadius: 12, borderWidth: 1.5,
  },
  searchField: { flex: 1, fontSize: 13, padding: 0 },

  // Fee note
  feeNote:     { padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 12 },
  feeNoteText: { fontSize: 12, lineHeight: 18 },

  // Bio expand (shown when card is selected)
  bioBox:  { width: "100%", marginTop: 8, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
  bioText: { fontSize: 10, lineHeight: 14, textAlign: "center", fontStyle: "italic" },

  // Error
  errorBox: { padding: 14, borderRadius: 12, borderWidth: 1.5, marginBottom: 8 },

  // Success
  successWrap:  { flex: 1, alignItems: "center", justifyContent: "center", padding: 40 },
  successIcon:  { fontSize: 60, marginBottom: 20 },
  successTitle: { fontSize: 24, fontWeight: "800", marginBottom: 12 },
  successDesc:  { fontSize: 14, lineHeight: 22, textAlign: "center", marginBottom: 32 },
  successCta:   { paddingVertical: 14, paddingHorizontal: 40, borderRadius: 16 },
});
