/**
 * Step4RealtorList — Realtor path, Step 4 of 4
 * User is already authenticated (phone OTP) — no contact form needed.
 * Show available realtors (no ratings, Thumbtack-style).
 * Optional selection; submit auto-assigns if none chosen.
 */
import { useState, useEffect } from "react";
import {
  View, Text, Pressable, StyleSheet, ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { useColorScheme } from "@/components/useColorScheme";
import { COLORS, API_BASE_URL } from "@/lib/theme";
import { useListingFormStore, buildListingPayload, type RealtorOption } from "@/store/listingForm";
import { useListingsStore } from "@/store/listings";
import WizardShell, { CtaButton } from "./WizardShell";

export default function Step4RealtorList() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const C = isDark ? COLORS.dark : COLORS.light;
  const router = useRouter();
  const store = useListingFormStore();
  const { token } = useListingsStore();
  const { latitude, longitude } = store;

  const [chosenRealtor, setChosenRealtor] = useState<string | null>(store.assignedRealtorId);
  const [realtors, setRealtors] = useState<RealtorOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    // Pass lat/lng so backend can geo-filter once geo-search is live.
    const geo = latitude && longitude ? `?lat=${latitude}&lng=${longitude}` : "";
    fetch(`${API_BASE_URL}/api/realtors/available${geo}`)
      .then((r) => r.ok ? r.json() : [])
      .then(setRealtors)
      .catch(() => setRealtors([]))
      .finally(() => setLoading(false));
  }, [latitude, longitude]);

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      store.setRealtorContact({ contactName: "", contactPhone: "", assignedRealtorId: chosenRealtor });
      const payload = buildListingPayload({ ...store, assignedRealtorId: chosenRealtor });
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

  if (done) {
    return (
      <View style={[s.successWrap, { backgroundColor: C.background }]}>
        <Text style={s.successIcon}>🎉</Text>
        <Text style={[s.successTitle, { color: C.foreground }]}>Realtor request sent!</Text>
        <Text style={[s.successDesc, { color: C.mutedForeground }]}>
          {chosenRealtor
            ? "Your chosen realtor will contact you within a few hours."
            : "We'll match you with a RERA-approved realtor nearby — expect a call within a few hours."}
        </Text>
        <Pressable onPress={() => router.replace("/(tabs)")} style={[s.successCta, { backgroundColor: C.primary }]}>
          <Text style={{ color: C.primaryForeground, fontSize: 15, fontWeight: "800" }}>Back to map</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <WizardShell
      heading="Choose your realtor"
      hint="Pick one or let us auto-assign the best available in your area."
      cta={
        <CtaButton
          label={submitting ? "Submitting…" : chosenRealtor ? "Confirm realtor →" : "Auto-assign me a realtor →"}
          onPress={handleSubmit}
          disabled={submitting}
        />
      }
    >
      <Text style={[s.intro, { color: C.mutedForeground }]}>
        Pick a realtor or let us auto-assign the best available one — they'll reach out to schedule a visit.
      </Text>

      {loading ? (
        <View style={s.loadingWrap}>
          <ActivityIndicator color={C.primary} size="large" />
          <Text style={[s.loadingText, { color: C.mutedForeground }]}>Finding realtors near you…</Text>
        </View>
      ) : realtors.length === 0 ? (
        <View style={[s.emptyBox, { backgroundColor: C.muted, borderColor: C.border }]}>
          <Text style={s.emptyIcon}>🔍</Text>
          <Text style={[s.emptyTitle, { color: C.foreground }]}>No realtors in your area yet</Text>
          <Text style={[s.emptyDesc, { color: C.mutedForeground }]}>
            We're expanding to your area soon. Leave your details and we'll notify you the moment a RERA-approved realtor is available nearby.
          </Text>
        </View>
      ) : (
        <>
          {realtors.map((r) => {
            const sel = chosenRealtor === r.id;
            return (
              <Pressable
                key={r.id}
                onPress={() => setChosenRealtor(sel ? null : r.id)}
                style={[
                  s.realtorCard,
                  {
                    borderColor: sel ? C.primary : C.border,
                    backgroundColor: C.card,
                    borderWidth: sel ? 2 : 1.5,
                    shadowOpacity: sel ? 0.1 : 0.04,
                  },
                ]}
              >
                {/* Avatar */}
                <View style={[s.avatar, { backgroundColor: C.primary }]}>
                  <Text style={s.avatarText}>{r.name.charAt(0).toUpperCase()}</Text>
                </View>

                {/* Info */}
                <View style={{ flex: 1 }}>
                  <View style={s.nameRow}>
                    <Text style={[s.realtorName, { color: C.foreground }]}>{r.name}</Text>
                    {r.isVerified && (
                      <View style={[s.verifiedBadge, { backgroundColor: `${C.primary}18` }]}>
                        <Text style={[s.verifiedText, { color: C.primary }]}>✓ Blab Verified</Text>
                      </View>
                    )}
                  </View>
                  <View style={s.statsRow}>
                    <View style={[s.statPill, { backgroundColor: C.muted }]}>
                      <Text style={[s.statText, { color: C.mutedForeground }]}>🏠 {r.dealsCount} deals</Text>
                    </View>
                    <View style={[s.statPill, { backgroundColor: C.muted }]}>
                      <Text style={[s.statText, { color: C.mutedForeground }]}>⚡ ~{r.avgResponseHours}h response</Text>
                    </View>
                  </View>
                </View>

                {/* Selection indicator */}
                <View style={[s.selCircle, { backgroundColor: sel ? C.primary : C.muted }]}>
                  <Text style={{ color: sel ? "#fff" : C.mutedForeground, fontSize: 12, fontWeight: "800" }}>
                    {sel ? "✓" : "○"}
                  </Text>
                </View>
              </Pressable>
            );
          })}

          {!chosenRealtor && (
            <Text style={[s.autoNote, { color: C.mutedForeground }]}>
              Not sure? Skip selection — we'll match you with the best available realtor nearby.
            </Text>
          )}
        </>
      )}

      <View style={[s.feeNote, { backgroundColor: C.muted, borderColor: C.border }]}>
        <Text style={[s.feeNoteText, { color: C.mutedForeground }]}>
          Realtor's commission per industry standard.{" "}
          <Text style={{ fontWeight: "700", color: C.foreground }}>Blab takes zero commission.</Text>
        </Text>
      </View>

      {error && (
        <View style={[s.errorBox, { backgroundColor: `${C.destructive}15`, borderColor: `${C.destructive}40` }]}>
          <Text style={{ color: C.destructive, fontSize: 13 }}>{error}</Text>
        </View>
      )}
    </WizardShell>
  );
}

const s = StyleSheet.create({
  intro:       { fontSize: 14, lineHeight: 22, marginBottom: 22 },
  loadingWrap: { alignItems: "center", paddingVertical: 40, gap: 12 },
  loadingText: { fontSize: 13 },
  emptyBox:    { padding: 24, borderRadius: 16, borderWidth: 1.5, alignItems: "center", marginBottom: 16 },
  emptyIcon:   { fontSize: 36, marginBottom: 10 },
  emptyTitle:  { fontSize: 15, fontWeight: "800", marginBottom: 6 },
  emptyDesc:   { fontSize: 13, lineHeight: 19, textAlign: "center" },
  realtorCard: {
    flexDirection: "row", alignItems: "center", gap: 14,
    padding: 14, borderRadius: 16, marginBottom: 10,
    shadowColor: "#000", shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 3,
  },
  avatar:       { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  avatarText:   { color: "#fff", fontSize: 22, fontWeight: "800" },
  nameRow:      { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6, flexWrap: "wrap" },
  realtorName:  { fontSize: 15, fontWeight: "800" },
  verifiedBadge:{ paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8 },
  verifiedText: { fontSize: 10, fontWeight: "700" },
  statsRow:     { flexDirection: "row", gap: 6 },
  statPill:     { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  statText:     { fontSize: 11, fontWeight: "500" },
  selCircle:    { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  autoNote:     { fontSize: 12, textAlign: "center", marginBottom: 16 },
  feeNote:      { padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 12 },
  feeNoteText:  { fontSize: 12, lineHeight: 18 },
  errorBox:     { padding: 14, borderRadius: 12, borderWidth: 1.5, marginBottom: 8 },
  // Success
  successWrap:  { flex: 1, alignItems: "center", justifyContent: "center", padding: 40 },
  successIcon:  { fontSize: 60, marginBottom: 20 },
  successTitle: { fontSize: 24, fontWeight: "800", marginBottom: 12 },
  successDesc:  { fontSize: 14, lineHeight: 22, textAlign: "center", marginBottom: 32 },
  successCta:   { paddingVertical: 14, paddingHorizontal: 40, borderRadius: 16 },
});
