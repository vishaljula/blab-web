/**
 * Step4Review — Self-list path, Step 4 of 4
 * Optional description + full review → pay → submit
 */
import { useState } from "react";
import {
  View, Text, Pressable, TextInput, StyleSheet, ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { useColorScheme } from "@/components/useColorScheme";
import { COLORS, API_BASE_URL } from "@/lib/theme";
import { useListingFormStore, buildListingPayload } from "@/store/listingForm";
import { useListingsStore } from "@/store/listings";
import WizardShell, { CtaButton } from "./WizardShell";

const PROPERTY_LABELS: Record<string, string> = {
  apartment: "Apartment", independent_house: "Independent House", villa: "Villa",
  plot: "Plot / Land", commercial: "Commercial", pg: "PG / Co-living",
};

function formatINR(n: number): string {
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)} Cr`;
  if (n >= 100000)   return `₹${(n / 100000).toFixed(2)} L`;
  if (n >= 1000)     return `₹${(n / 1000).toFixed(0)}K`;
  return `₹${n}`;
}

function Row({ label, value }: { label: string; value?: string | null }) {
  const colorScheme = useColorScheme();
  const C = colorScheme === "dark" ? COLORS.dark : COLORS.light;
  if (!value) return null;
  return (
    <View style={[r.row, { borderBottomColor: `${C.border}60` }]}>
      <Text style={[r.label, { color: C.mutedForeground }]}>{label}</Text>
      <Text style={[r.value, { color: C.foreground }]}>{value}</Text>
    </View>
  );
}
const r = StyleSheet.create({
  row:   { flexDirection: "row", justifyContent: "space-between", paddingVertical: 7, borderBottomWidth: 1 },
  label: { fontSize: 12, flex: 1 },
  value: { fontSize: 12, fontWeight: "600", flex: 1, textAlign: "right" },
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const colorScheme = useColorScheme();
  const C = colorScheme === "dark" ? COLORS.dark : COLORS.light;
  return (
    <View style={[s.section, { borderColor: C.border, backgroundColor: C.card }]}>
      <Text style={[s.sectionTitle, { color: C.mutedForeground }]}>{title}</Text>
      {children}
    </View>
  );
}

export default function Step4Review() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const C = isDark ? COLORS.dark : COLORS.light;
  const router = useRouter();
  const store = useListingFormStore();
  const { token } = useListingsStore();

  const [description, setDescription] = useState(store.description || "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const listingFee = store.listingType === "rent" ? 499 : 999;

  const handleSubmit = async () => {
    store.setDescription(description);
    setSubmitting(true);
    setError(null);
    try {
      const payload = buildListingPayload({ ...store, description });
      const res = await fetch(`${API_BASE_URL}/api/listings`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
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
        <Text style={[s.successTitle, { color: C.foreground }]}>Listing submitted!</Text>
        <Text style={[s.successDesc, { color: C.mutedForeground }]}>
          Our photographer will contact you within 24 hours to schedule the shoot.
          Your property goes live after photography.
        </Text>
        <Pressable onPress={() => router.replace("/(tabs)")} style={[s.successCta, { backgroundColor: C.primary }]}>
          <Text style={{ color: C.primaryForeground, fontSize: 15, fontWeight: "800" }}>Back to map</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <WizardShell
      heading="Almost done!"
      hint="Review your listing and optionally add a description."
      cta={
        <CtaButton
          label={submitting ? "Submitting…" : `Pay ₹${listingFee} & submit →`}
          onPress={handleSubmit}
          disabled={submitting}
        />
      }
    >
      {/* Optional description */}
      <Text style={[s.descLabel, { color: C.foreground }]}>
        Add a description{" "}
        <Text style={{ color: C.mutedForeground, fontWeight: "400", fontSize: 13 }}>(optional)</Text>
      </Text>
      <Text style={[s.descHint, { color: C.mutedForeground }]}>
        A good description gets 3× more inquiries. You can also skip and add it later.
      </Text>
      <TextInput
        value={description}
        onChangeText={(t) => setDescription(t.slice(0, 1000))}
        placeholder="e.g. Spacious 3 BHK in a well-maintained gated community, close to metro..."
        placeholderTextColor={`${C.mutedForeground}80`}
        multiline
        numberOfLines={5}
        textAlignVertical="top"
        style={[s.textarea, { borderColor: C.border, backgroundColor: C.card, color: C.foreground }]}
      />
      <Text style={[s.charCount, { color: C.mutedForeground }]}>{description.length} / 1000</Text>

      {/* Review */}
      <Text style={[s.reviewHeading, { color: C.foreground }]}>Review your listing</Text>

      <Section title="Property">
        <Row label="Type" value={store.listingType === "rent" ? "For Rent" : "For Sale"} />
        <Row label="Property" value={store.propertyType ? PROPERTY_LABELS[store.propertyType] : null} />
        <Row label="Bedrooms" value={store.bedrooms != null ? String(store.bedrooms) : null} />
        <Row label="Area" value={store.carpetArea ? `${store.carpetArea} ${store.areaUnit}` : null} />
        <Row label="Facing" value={store.facing} />
      </Section>

      <Section title="Location">
        <Row label="Address" value={store.address || null} />
        <Row label="Floor" value={store.floorNumber != null ? `${store.floorNumber} / ${store.totalFloors ?? "?"}` : null} />
        <Row label="Society" value={store.societyName || null} />
      </Section>

      <Section title="Price">
        <Row label={store.listingType === "rent" ? "Rent/month" : "Price"} value={store.price ? formatINR(store.price) : null} />
        <Row label="Negotiable" value={store.negotiable ? "Yes" : "No"} />
        <Row label="Deposit" value={store.securityDeposit ? formatINR(store.securityDeposit) : null} />
        <Row label="Furnishing" value={store.furnishing} />
      </Section>

      {/* Fee card */}
      <View style={[s.feeCard, { backgroundColor: `${C.primary}0D`, borderColor: `${C.primary}30` }]}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <Text style={[s.feeLabel, { color: C.foreground }]}>Listing fee</Text>
          <Text style={[s.feeAmount, { color: C.primary }]}>₹{listingFee}</Text>
        </View>
        <Text style={[s.feeDesc, { color: C.mutedForeground }]}>
          Includes professional photography + listing verification. Goes live within 24–48h of photo shoot.
        </Text>
      </View>

      {error && (
        <View style={[s.errorBox, { backgroundColor: `${C.destructive}15`, borderColor: `${C.destructive}40` }]}>
          <Text style={{ color: C.destructive, fontSize: 13 }}>{error}</Text>
        </View>
      )}

      <Text style={[s.footNote, { color: C.mutedForeground }]}>
        Razorpay payment coming soon — listing created in draft for now.
      </Text>
    </WizardShell>
  );
}

const s = StyleSheet.create({
  descLabel:    { fontSize: 16, fontWeight: "800", marginBottom: 4 },
  descHint:     { fontSize: 13, lineHeight: 19, marginBottom: 12 },
  textarea:     { borderWidth: 1.5, borderRadius: 14, padding: 14, fontSize: 14, lineHeight: 22, minHeight: 120, marginBottom: 4 },
  charCount:    { fontSize: 11, textAlign: "right", marginBottom: 28 },
  reviewHeading:{ fontSize: 18, fontWeight: "800", marginBottom: 14 },
  section:      { borderRadius: 14, borderWidth: 1.5, padding: 14, marginBottom: 12 },
  sectionTitle: { fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 },
  feeCard:      { padding: 16, borderRadius: 16, borderWidth: 1.5, marginBottom: 12 },
  feeLabel:     { fontSize: 15, fontWeight: "700" },
  feeAmount:    { fontSize: 28, fontWeight: "900" },
  feeDesc:      { fontSize: 12, lineHeight: 18 },
  errorBox:     { padding: 14, borderRadius: 12, borderWidth: 1.5, marginBottom: 8 },
  footNote:     { fontSize: 11, textAlign: "center", marginBottom: 8 },
  successWrap:  { flex: 1, alignItems: "center", justifyContent: "center", padding: 40 },
  successIcon:  { fontSize: 60, marginBottom: 20 },
  successTitle: { fontSize: 24, fontWeight: "800", marginBottom: 12 },
  successDesc:  { fontSize: 14, lineHeight: 22, textAlign: "center", marginBottom: 32 },
  successCta:   { paddingVertical: 14, paddingHorizontal: 40, borderRadius: 16 },
});
