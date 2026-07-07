/**
 * WizardShell.native.tsx — Compact native version
 *
 * Identical structure to WizardShell.tsx (web) but with tightened
 * spacing/fonts optimised for phone screens:
 *   - Card padding:    40 → 20
 *   - Heading size:    36 → 22
 *   - Divider margins: 24+28 → 10+16
 *   - Stepper padding: 14 → 8
 *   - Scroll top:      28 → 12
 *
 * Metro automatically picks this file on iOS & Android;
 * web continues to use WizardShell.tsx.
 */
import { useRouter } from "expo-router";
import {
  View, Text, Pressable, ScrollView, StyleSheet,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColorScheme } from "@/components/useColorScheme";
import { COLORS } from "@/lib/theme";
import { useListingFormStore } from "@/store/listingForm";

const MAX_CARD_WIDTH = 860;

const SELF_LABELS    = ["Type", "Location", "Path", "Details", "Review"];
const REALTOR_LABELS = ["Type", "Location", "Path", "Realtor"];

interface WizardShellProps {
  heading: string;
  hint?: string;
  children: React.ReactNode;
  cta: React.ReactNode;
}

export default function WizardShell({ heading, hint, children, cta }: WizardShellProps) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const C = isDark ? COLORS.dark : COLORS.light;

  const { currentStep, listingPath, goToStep } = useListingFormStore();
  const isWide = width > MAX_CARD_WIDTH + 64;
  const hPad = isWide ? 0 : 16;           // tighter than web's 20
  const stepLabels = listingPath === "realtor" ? REALTOR_LABELS : SELF_LABELS;

  return (
    <View style={[s.root, { backgroundColor: isDark ? C.muted : "#EDEBE7" }]}>

      {/* ── 1. Top bar ─────────────────────────────────────────────── */}
      <View style={[s.topBar, {
        backgroundColor: C.card,
        borderBottomColor: C.border,
        paddingTop: insets.top + 4,   // tighter than web's +6
      }]}>
        <View style={{ flex: 1 }} />
        <Text style={[s.wordmark, { color: C.primary }]}>blab.</Text>
        <View style={[{ flex: 1 }, s.topRight]}>
          <Pressable onPress={() => router.back()} hitSlop={14}>
            <Text style={[s.topBtnText, { color: C.mutedForeground }]}>Save & exit</Text>
          </Pressable>
        </View>
      </View>

      {/* ── 2. Stepper bar ─────────────────────────────────────────── */}
      <View style={[s.stepperBar, { backgroundColor: C.card, borderBottomColor: C.border }]}>
        <View style={[s.stepperInner, {
          maxWidth: MAX_CARD_WIDTH,
          width: "100%",
          paddingHorizontal: hPad,
        }]}>
          {stepLabels.map((label, i) => {
            const sn        = i + 1;
            const completed = sn < currentStep;
            const active    = sn === currentStep;

            return (
              <View key={label} style={s.stepItem}>
                {i > 0 && (
                  <View style={[s.stepLine, {
                    backgroundColor: completed || active ? C.primary : C.border,
                  }]} />
                )}
                <Pressable
                  onPress={completed ? () => goToStep(sn) : undefined}
                  hitSlop={10}
                  style={[
                    s.stepCircle,
                    active || completed
                      ? { backgroundColor: C.primary, borderColor: C.primary }
                      : { backgroundColor: C.card, borderColor: C.border },
                  ]}
                >
                  {completed
                    ? <Text style={s.stepCheck}>✓</Text>
                    : active
                      ? <View style={s.stepActiveDot} />
                      : <View style={[s.stepFutureDot, { backgroundColor: C.border }]} />
                  }
                </Pressable>
                <Text style={[s.stepLabel, {
                  color:      active ? C.primary : completed ? C.primary : C.mutedForeground,
                  fontWeight: active ? "800" : "500",
                }]}>
                  {label}
                </Text>
              </View>
            );
          })}
        </View>
      </View>

      {/* ── 3. Scrollable content ──────────────────────────────────── */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[
          s.scroll,
          {
            paddingHorizontal: hPad,
            paddingBottom: 24 + insets.bottom,
            alignItems: isWide ? "center" : "stretch",
          },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[
          s.card,
          {
            backgroundColor: C.card,
            maxWidth: MAX_CARD_WIDTH,
            width: isWide ? MAX_CARD_WIDTH : "100%",
            shadowColor: isDark ? "#000" : "#1A1A1A",
          },
        ]}>
          {/* Heading */}
          <Text style={[s.heading, { color: C.foreground }]}>{heading}</Text>
          {hint && <Text style={[s.hint, { color: C.mutedForeground }]}>{hint}</Text>}
          <View style={[s.divider, { backgroundColor: C.border }]} />

          {children}

          {/* CTA row */}
          <View style={s.ctaRow}>
            <Pressable onPress={() => router.back()} hitSlop={12} style={s.exitBtn}>
              <Text style={[s.exitText, { color: C.primary }]}>Exit</Text>
            </Pressable>
            <View style={{ flex: 1, alignItems: "center" }}>{cta}</View>
          </View>
        </View>
      </ScrollView>

    </View>
  );
}

// ── CTA Button ─────────────────────────────────────────────────────────────────

interface CtaButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}

export function CtaButton({ label, onPress, disabled = false }: CtaButtonProps) {
  const colorScheme = useColorScheme();
  const C = colorScheme === "dark" ? COLORS.dark : COLORS.light;
  return (
    <Pressable
      onPress={!disabled ? onPress : undefined}
      style={[cs.cta, { backgroundColor: disabled ? C.muted : C.primary }]}
    >
      <Text style={[cs.ctaText, { color: disabled ? C.mutedForeground : C.primaryForeground }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },

  // ── Top bar (compact)
  topBar: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingBottom: 8,   // was 20/12
    borderBottomWidth: 1,
  },
  wordmark:   { fontSize: 18, fontWeight: "900", letterSpacing: -0.4, textAlign: "center" }, // was 20
  topRight:   { alignItems: "flex-end" },
  topBtnText: { fontSize: 12, fontWeight: "500" },                                           // was 13

  // ── Stepper bar (compact)
  stepperBar: {
    borderBottomWidth: 1,
    paddingVertical: 8,           // was 14
    alignItems: "center",
  },
  stepperInner: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  stepItem:  { flexDirection: "column", alignItems: "center", flex: 1, position: "relative" },
  stepLine: {
    position: "absolute",
    top: 11,                      // center of 22px circle
    left: "-50%", right: "50%",
    height: 2,
  },
  stepCircle: {
    width: 22, height: 22, borderRadius: 11, borderWidth: 2,  // was 26/13
    alignItems: "center", justifyContent: "center", marginBottom: 4,
  },
  stepCheck:     { color: "#fff", fontSize: 10, fontWeight: "900" },
  stepActiveDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: "#fff" },
  stepFutureDot: { width: 7, height: 7, borderRadius: 3.5 },
  stepLabel:     { fontSize: 9, textTransform: "uppercase", letterSpacing: 0.5, textAlign: "center" }, // was 10

  // ── Content scroll (compact)
  scroll: { flexGrow: 1, paddingTop: 12 },   // was 28

  // ── Card (compact)
  card: {
    borderRadius: 14, padding: 20, marginBottom: 12,  // was borderRadius:18, padding:40
    shadowOpacity: 0.06, shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 }, elevation: 4,
  },
  heading: {
    fontSize: 22, fontWeight: "900", lineHeight: 28,  // was 36/44
    letterSpacing: -0.5, marginBottom: 6,
    textAlign: "center",
  },
  hint: {
    fontSize: 13, lineHeight: 18,                      // was 14/21
    textAlign: "center",
  },
  divider: { height: 1, marginTop: 10, marginBottom: 16 },  // was 24/28

  // ── CTA (compact)
  ctaRow:  { flexDirection: "row", alignItems: "center", gap: 16, marginTop: 16 },  // was gap:20, marginTop:28
  exitBtn: { paddingVertical: 12 },
  exitText:{ fontSize: 13, fontWeight: "700" },
});

const cs = StyleSheet.create({
  cta:     { paddingVertical: 12, paddingHorizontal: 32, borderRadius: 10, alignItems: "center", maxWidth: 380 }, // was 13/48
  ctaText: { fontSize: 14, fontWeight: "800", letterSpacing: 0.2 },
});
