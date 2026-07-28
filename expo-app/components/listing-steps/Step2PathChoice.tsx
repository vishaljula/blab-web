/**
 * Step2PathChoice — Native segmented control layout
 * Tab header slides between Realtor / Myself.
 * Full-width card content per tab — no space constraints.
 */
import { useState, useRef } from "react";
import { View, Text, Pressable, StyleSheet, Animated, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColorScheme } from "@/components/useColorScheme";
import { COLORS } from "@/lib/theme";
import { useListingFormStore, type ListingPath } from "@/store/listingForm";
import WizardShell, { CtaButton } from "./WizardShell";

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

const REALTOR_POINTS: { icon: IoniconName; text: string }[] = [
  { icon: "camera-outline",           text: "Professional photography"          },
  { icon: "megaphone-outline",        text: "Digital marketing & promotion"     },
  { icon: "clipboard-outline",        text: "Realtor fills all listing details" },
  { icon: "call-outline",             text: "Handles all inquiries & viewings"  },
  { icon: "trending-up-outline",      text: "Expert negotiation on your behalf" },
  { icon: "document-text-outline",    text: "Paperwork & legal checks"          },
  { icon: "shield-checkmark-outline", text: "Blab Verified priority listing"    },
];

const SELF_POINTS: { icon: IoniconName; text: string }[] = [
  { icon: "create-outline",    text: "You fill in all listing details"      },
  { icon: "camera-outline",    text: "Professional photography included"    },
  { icon: "megaphone-outline", text: "Digital marketing & promotion"        },
  { icon: "call-outline",      text: "You handle all buyer inquiries"       },
  { icon: "cash-outline",      text: "You negotiate the price directly"     },
];

export default function Step2PathChoice() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const C = isDark ? COLORS.dark : COLORS.light;

  const { listingType, listingPath: savedPath, realtorAvailability, setListingPath, goNext } = useListingFormStore();
  const [selected, setSelected] = useState<ListingPath>(
    savedPath ?? (realtorAvailability === "unavailable" ? "self" : "realtor")
  );

  // Animated slider for segmented control
  const slideAnim = useRef(new Animated.Value(selected === "realtor" ? 0 : 1)).current;

  const handleSelect = (path: ListingPath) => {
    setSelected(path);
    Animated.spring(slideAnim, {
      toValue: path === "realtor" ? 0 : 1,
      useNativeDriver: false,
      tension: 120,
      friction: 10,
    }).start();
  };

  const handleContinue = () => { setListingPath(selected); goNext(); };

  const listingFee = listingType === "rent" ? "₹499" : "₹999";
  const realtorSel = selected === "realtor";
  const realtorUnavailable = realtorAvailability === "unavailable";

  const { width } = useWindowDimensions();
  // Half the segment width in pixels — safe on Android (no % animation)
  const pillWidth = (width - 40 - 8) / 2; // screen - card padding - segWrap padding

  const tabBg = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, pillWidth],
  });

  return (
    <WizardShell
      heading="How do you want to list?"
      hint={realtorSel
        ? "A realtor handles everything — photography, marketing, inquiries & paperwork."
        : "You're in control. We handle photography & marketing, you handle the rest."}
      cta={
        <CtaButton
          label={`Continue with ${realtorSel ? "a Realtor" : "self-listing"} →`}
          onPress={handleContinue}
        />
      }
    >

      {/* ── Segmented Control ───────────────────────────────── */}
      <View style={[s.segWrap, { backgroundColor: isDark ? C.muted : "#EDEAE4", borderColor: C.border }]}>
        {/* Sliding pill */}
        <Animated.View
          style={[
            s.segPill,
            {
              backgroundColor: C.card,
              left: tabBg,
              shadowColor: "#000",
              shadowOpacity: 0.08,
              shadowOffset: { width: 0, height: 2 },
              shadowRadius: 4,
              elevation: 2,
            },
          ]}
        />
        <Pressable style={s.segTab} onPress={() => handleSelect("realtor")}>
          <Text style={[s.segLabel, { color: realtorSel ? C.foreground : C.mutedForeground, fontWeight: realtorSel ? "800" : "500" }]}>
            ★ Realtor
          </Text>
          <Text style={[s.segSub, { color: realtorSel ? C.primary : C.mutedForeground }]}>
            {realtorUnavailable ? "None near you" : "No fee"}
          </Text>
        </Pressable>
        <Pressable style={s.segTab} onPress={() => handleSelect("self")}>
          <Text style={[s.segLabel, { color: !realtorSel ? C.foreground : C.mutedForeground, fontWeight: !realtorSel ? "800" : "500" }]}>
            Myself
          </Text>
          <Text style={[s.segSub, { color: !realtorSel ? C.primary : C.mutedForeground }]}>
            {listingFee} fee
          </Text>
        </Pressable>
      </View>

      {/* ── Card Content ────────────────────────────────────── */}
      <View style={[s.card, { borderColor: realtorSel ? C.primary : C.border, borderWidth: realtorSel ? 2 : 1.5, backgroundColor: isDark ? C.card : "#FAFAF8" }]}>

        {/* Card Header */}
        <View style={s.cardHeader}>
          {realtorSel ? (
            <>
              <View style={[s.recBadge, { backgroundColor: C.primary }]}>
                <Text style={s.recText}>★ Recommended</Text>
              </View>
              <Text style={[s.cardTitle, { color: C.foreground }]}>With a RERA Approved Realtor</Text>
              {realtorUnavailable ? (
                <View style={[s.feeBadge, { backgroundColor: "#FFF3CD", borderColor: "#FFC107" }]}>
                  <Text style={[s.feeText, { color: "#856404" }]}>No realtors in your area yet</Text>
                </View>
              ) : (
                <View style={[s.feeBadge, { backgroundColor: `${C.primary}14`, borderColor: `${C.primary}30` }]}>
                  <Text style={[s.feeText, { color: C.primary }]}>No photography & marketing fee</Text>
                </View>
              )}
            </>
          ) : (
            <>
              <View style={{ height: 26 }} />
              <Text style={[s.cardTitle, { color: C.foreground }]}>I'll do it myself</Text>
              <View style={[s.feeBadge, { backgroundColor: C.muted, borderColor: C.border }]}>
                <Text style={[s.feeText, { color: C.mutedForeground }]}>{listingFee} photography & marketing</Text>
              </View>
            </>
          )}
        </View>

        {/* Unavailable notice (realtor only) */}
        {realtorSel && realtorUnavailable && (
          <View style={[s.unavailBox, { borderColor: C.border, backgroundColor: C.muted }]}>
            <Ionicons name="time-outline" size={24} color={C.mutedForeground} style={{ marginBottom: 8 }} />
            <Text style={[s.unavailTitle, { color: C.foreground }]}>No realtors near you yet</Text>
            <Text style={[s.unavailDesc, { color: C.mutedForeground }]}>
              We're expanding to your area soon. Join the waitlist and we'll match you the moment one is available.
            </Text>
          </View>
        )}

        {/* Feature bullets */}
        {!(realtorSel && realtorUnavailable) && (
          <View style={s.points}>
            {(realtorSel ? REALTOR_POINTS : SELF_POINTS).map((p) => (
              <View key={p.text} style={s.point}>
                <View style={[s.pointIcon, { backgroundColor: realtorSel ? `${C.primary}14` : C.secondary }]}>
                  <Ionicons name={p.icon} size={14} color={realtorSel ? C.primary : C.mutedForeground} />
                </View>
                <Text style={[s.pointText, { color: C.foreground }]}>{p.text}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Footer note */}
        {realtorSel && !realtorUnavailable && (
          <View style={[s.footNote, { borderTopColor: C.border, backgroundColor: isDark ? `${C.muted}60` : "#F5F3EE" }]}>
            <Ionicons name="information-circle-outline" size={13} color={C.mutedForeground} style={{ marginRight: 6, marginTop: 1 }} />
            <Text style={[s.footText, { color: C.mutedForeground }]}>
              Realtor earns industry-standard commission.{" "}
              <Text style={{ fontWeight: "700", color: C.foreground }}>Blab takes zero.</Text>
            </Text>
          </View>
        )}

        {!realtorSel && (
          <View style={[s.footNote, { borderTopColor: C.border, backgroundColor: isDark ? `${C.muted}60` : "#F5F3EE" }]}>
            <Ionicons name="information-circle-outline" size={13} color={C.mutedForeground} style={{ marginRight: 6, marginTop: 1 }} />
            <Text style={[s.footText, { color: C.mutedForeground }]}>
              One-time fee covers photography session & digital marketing campaign.
            </Text>
          </View>
        )}

      </View>

    </WizardShell>
  );
}

const s = StyleSheet.create({
  // Segmented control
  segWrap:  { flexDirection: "row", borderRadius: 14, padding: 4, marginBottom: 16, borderWidth: 1, position: "relative", height: 64 },
  segPill:  { position: "absolute", top: 4, bottom: 4, width: "50%", borderRadius: 11 },
  segTab:   { flex: 1, alignItems: "center", justifyContent: "center", zIndex: 1 },
  segLabel: { fontSize: 14, letterSpacing: -0.2 },
  segSub:   { fontSize: 10, fontWeight: "600", marginTop: 2 },

  // Card
  card:       { borderRadius: 16, overflow: "hidden" },
  cardHeader: { padding: 20, paddingBottom: 16 },
  recBadge:   { alignSelf: "flex-start", flexDirection: "row", paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20, marginBottom: 10 },
  recText:    { color: "#fff", fontSize: 11, fontWeight: "700" },
  cardTitle:  { fontSize: 20, fontWeight: "900", letterSpacing: -0.4, marginBottom: 10 },
  feeBadge:   { alignSelf: "flex-start", paddingHorizontal: 11, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  feeText:    { fontSize: 12, fontWeight: "700" },

  // Unavailable
  unavailBox:   { alignItems: "center", marginHorizontal: 20, marginBottom: 20, padding: 20, borderRadius: 12, borderWidth: 1 },
  unavailTitle: { fontSize: 15, fontWeight: "800", marginBottom: 8, textAlign: "center" },
  unavailDesc:  { fontSize: 13, lineHeight: 19, textAlign: "center" },

  // Bullets
  points:    { gap: 12, paddingHorizontal: 20, paddingBottom: 20 },
  point:     { flexDirection: "row", alignItems: "center", gap: 12 },
  pointIcon: { width: 28, height: 28, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  pointText: { fontSize: 13, flex: 1, lineHeight: 18 },

  // Footer
  footNote: { flexDirection: "row", alignItems: "flex-start", paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1 },
  footText: { fontSize: 11, lineHeight: 16, flex: 1 },
});
