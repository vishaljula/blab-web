/**
 * Step2PathChoice.web.tsx — Web layout (original side-by-side cards)
 *
 * Metro picks this file on web; native uses Step2PathChoice.tsx.
 * Restored to the original two-column comparison layout that was
 * working fine before native A/B/C layout testing.
 */
import { useState } from "react";
import { View, Text, Pressable, StyleSheet, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColorScheme } from "@/components/useColorScheme";
import { COLORS } from "@/lib/theme";
import { useListingFormStore, type ListingPath } from "@/store/listingForm";
import WizardShell, { CtaButton } from "./WizardShell";

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

const REALTOR_POINTS: { icon: IoniconName; text: string }[] = [
  { icon: "camera-outline",           text: "Professional photography"          },
  { icon: "megaphone-outline",        text: "Digital marketing & social promotion" },
  { icon: "clipboard-outline",        text: "Realtor fills all listing details" },
  { icon: "call-outline",             text: "Handles inquiries & viewings"      },
  { icon: "trending-up-outline",      text: "Expert negotiation"                },
  { icon: "document-text-outline",    text: "Paperwork & legal checks"          },
  { icon: "shield-checkmark-outline", text: "Blab Verified priority listing"    },
];

const SELF_POINTS: { icon: IoniconName; text: string }[] = [
  { icon: "create-outline",    text: "You fill in all details"            },
  { icon: "camera-outline",    text: "Professional photography session"   },
  { icon: "megaphone-outline", text: "Digital marketing & social promotion" },
  { icon: "call-outline",      text: "You handle all inquiries"           },
  { icon: "cash-outline",      text: "You negotiate directly"             },
];

export default function Step2PathChoice() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const C = isDark ? COLORS.dark : COLORS.light;
  const { width } = useWindowDimensions();

  const { listingType, realtorAvailability, setListingPath, goNext } = useListingFormStore();
  const [selected, setSelected] = useState<ListingPath>(
    realtorAvailability === "unavailable" ? "self" : "realtor"
  );

  const handleContinue = () => {
    setListingPath(selected);
    goNext();
  };

  const isNarrow = width < 600;
  const listingFee = listingType === "rent" ? "₹499" : "₹999";
  const realtorSel = selected === "realtor";
  const selfSel = selected === "self";
  const realtorUnavailable = realtorAvailability === "unavailable";

  return (
    <WizardShell
      heading="How do you want to list?"
      hint="Listing with a realtor means zero effort from you — they handle everything end-to-end."
      cta={
        <CtaButton
          label={`Continue with ${selected === "realtor" ? "a Realtor" : "self-listing"} →`}
          onPress={handleContinue}
        />
      }
    >
      <View style={[s.columns, { flexDirection: isNarrow ? "column" : "row" }]}>

        {/* ── LEFT: Realtor ─────────────────────────────────────── */}
        <Pressable
          onPress={() => setSelected("realtor")}
          style={[
            s.column,
            {
              borderColor: realtorSel ? C.primary : C.border,
              borderWidth: realtorSel ? 2.5 : 1.5,
              backgroundColor: realtorSel ? `${C.primary}07` : C.muted,
              flex: 1,
            },
          ]}
        >
          <View style={s.colHeader}>
            <View style={[s.recommendedPill, { backgroundColor: C.primary }]}>
              <Ionicons name="star" size={10} color="#fff" style={{ marginRight: 4 }} />
              <Text style={s.recommendedText}>Recommended</Text>
            </View>
            <Text style={[s.colTitle, { color: C.foreground }]}>With a RERA Approved Realtor</Text>
            {realtorUnavailable ? (
              <View style={[s.noFeeBadge, { backgroundColor: "#FFF3CD", borderColor: "#FFC107" }]}>
                <Text style={[s.noFeeText, { color: "#856404" }]}>No realtors in your area yet</Text>
              </View>
            ) : (
              <View style={[s.noFeeBadge, { backgroundColor: `${C.primary}14`, borderColor: `${C.primary}30` }]}>
                <Text style={[s.noFeeText, { color: C.primary }]}>No photography & marketing fee</Text>
              </View>
            )}
          </View>

          {realtorUnavailable ? (
            <View style={[s.unavailableBox, { borderColor: C.border, backgroundColor: C.muted }]}>
              <Ionicons name="time-outline" size={22} color={C.mutedForeground} style={{ marginBottom: 8 }} />
              <Text style={[s.unavailableTitle, { color: C.foreground }]}>No realtors near you yet</Text>
              <Text style={[s.unavailableDesc, { color: C.mutedForeground }]}>
                We're expanding to your area soon. Tap below to join the waitlist — we'll match you the moment one is available.
              </Text>
            </View>
          ) : (
            <View style={s.points}>
              {REALTOR_POINTS.map((p) => (
                <View key={p.text} style={s.point}>
                  <View style={[s.pointIcon, { backgroundColor: `${C.primary}12` }]}>
                    <Ionicons name={p.icon} size={14} color={C.primary} />
                  </View>
                  <Text style={[s.pointText, { color: C.foreground }]}>{p.text}</Text>
                </View>
              ))}
            </View>
          )}

          <Text style={[s.feeNote, { color: C.mutedForeground }]}>
            Realtor's commission per industry standard.{" "}
            <Text style={{ fontWeight: "700", color: C.foreground }}>Blab takes zero commission.</Text>
          </Text>

          <View style={[s.selRow, { borderTopColor: C.border }]}>
            <View style={[s.selCircle, {
              backgroundColor: realtorSel ? C.primary : "transparent",
              borderColor: realtorSel ? C.primary : C.border,
            }]}>
              {realtorSel && <Ionicons name="checkmark" size={14} color="#fff" />}
            </View>
            <Text style={[s.selLabel, { color: realtorSel ? C.primary : C.mutedForeground, fontWeight: realtorSel ? "700" : "400" }]}>
              {realtorUnavailable
                ? (realtorSel ? "Notify me when available" : "Join waitlist")
                : (realtorSel ? "Selected" : "Choose this")}
            </Text>
          </View>
        </Pressable>

        {/* Divider */}
        {!isNarrow && (
          <View style={s.orWrap}>
            <View style={[s.orLine, { backgroundColor: C.border }]} />
            <Text style={[s.orText, { color: C.mutedForeground, backgroundColor: isDark ? C.muted : "#EDEBE7" }]}>or</Text>
            <View style={[s.orLine, { backgroundColor: C.border }]} />
          </View>
        )}

        {/* ── RIGHT: Self ───────────────────────────────────────── */}
        <Pressable
          onPress={() => setSelected("self")}
          style={[
            s.column,
            {
              borderColor: selfSel ? C.primary : C.border,
              borderWidth: selfSel ? 2.5 : 1.5,
              backgroundColor: selfSel ? `${C.primary}07` : C.muted,
              flex: 1,
            },
          ]}
        >
          <View style={s.colHeader}>
            <View style={{ height: 26 }} />
            <Text style={[s.colTitle, { color: C.foreground }]}>I'll do it myself</Text>
            <View style={[s.feeBadge, { backgroundColor: C.muted, borderColor: C.border }]}>
              <Text style={[s.feeText, { color: C.mutedForeground }]}>{listingFee} photography & marketing</Text>
            </View>
          </View>

          <View style={s.points}>
            {SELF_POINTS.map((p) => (
              <View key={p.text} style={s.point}>
                <View style={[s.pointIcon, { backgroundColor: C.secondary }]}>
                  <Ionicons name={p.icon} size={14} color={C.mutedForeground} />
                </View>
                <Text style={[s.pointText, { color: C.foreground }]}>{p.text}</Text>
              </View>
            ))}
          </View>

          <View style={{ flex: 1 }} />

          <View style={[s.selRow, { borderTopColor: C.border }]}>
            <View style={[s.selCircle, {
              backgroundColor: selfSel ? C.primary : "transparent",
              borderColor: selfSel ? C.primary : C.border,
            }]}>
              {selfSel && <Ionicons name="checkmark" size={14} color="#fff" />}
            </View>
            <Text style={[s.selLabel, { color: selfSel ? C.primary : C.mutedForeground, fontWeight: selfSel ? "700" : "400" }]}>
              {selfSel ? "Selected" : "Choose this"}
            </Text>
          </View>
        </Pressable>

      </View>
    </WizardShell>
  );
}

const s = StyleSheet.create({
  columns: { gap: 0, alignItems: "stretch" },
  orWrap:  { width: 32, alignItems: "center", justifyContent: "center" },
  orLine:  { flex: 1, width: 1 },
  orText:  { fontSize: 12, fontWeight: "600", paddingVertical: 6, paddingHorizontal: 4 },

  column: { borderRadius: 14, padding: 20, overflow: "hidden" },

  colHeader:       { marginBottom: 18 },
  recommendedPill: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20, marginBottom: 8 },
  recommendedText: { color: "#fff", fontSize: 10, fontWeight: "700" },
  colTitle:        { fontSize: 20, fontWeight: "900", marginBottom: 10, letterSpacing: -0.3 },
  noFeeBadge:      { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 1 },
  noFeeText:       { fontSize: 12, fontWeight: "700" },
  feeBadge:        { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 1 },
  feeText:         { fontSize: 12, fontWeight: "600" },

  points:    { gap: 10, marginBottom: 14 },
  point:     { flexDirection: "row", alignItems: "center", gap: 10 },
  pointIcon: { width: 26, height: 26, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  pointText: { fontSize: 13, flex: 1, lineHeight: 18 },

  feeNote: { fontSize: 11, lineHeight: 16, marginBottom: 14 },

  selRow:    { flexDirection: "row", alignItems: "center", gap: 8, borderTopWidth: 1, paddingTop: 14 },
  selCircle: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  selLabel:  { fontSize: 13 },

  unavailableBox:   { alignItems: "center", padding: 20, borderRadius: 12, borderWidth: 1, marginBottom: 14 },
  unavailableTitle: { fontSize: 14, fontWeight: "800", marginBottom: 6, textAlign: "center" },
  unavailableDesc:  { fontSize: 12, lineHeight: 18, textAlign: "center" },
});
