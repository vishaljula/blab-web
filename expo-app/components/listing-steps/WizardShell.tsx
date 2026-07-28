/**
 * WizardShell — v7
 *
 * Layout:
 *   1. White top bar: blab. (center) | Save & exit (right)  — no stepper here
 *   2. White stepper bar: circles + lines + labels, constrained to card width — THIS is the "progress bar"
 *   3. Muted page background with white card (heading + content + Exit/Continue)
 *
 * Completed step circles are tappable → goToStep(n)
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

  const { currentStep, totalSteps, listingPath, goToStep } = useListingFormStore();
  const isWide = width > MAX_CARD_WIDTH + 64;
  const hPad = isWide ? 0 : 20;
  const stepLabels = listingPath === "realtor" ? REALTOR_LABELS : SELF_LABELS;

  return (
    <View style={[s.root, { backgroundColor: isDark ? C.muted : "#EDEBE7" }]}>

      {/* ── 1. Top bar: blab. + Save & exit ──────────────────────── */}
      <View style={[s.topBar, {
        backgroundColor: C.card,
        borderBottomColor: C.border,
        paddingTop: insets.top + 6,
      }]}>
        <View style={{ flex: 1 }} />
        <Text style={[s.wordmark, { color: C.primary }]}>blab.</Text>
        <View style={[{ flex: 1 }, s.topRight]}>
          <Pressable onPress={() => router.back()} hitSlop={14}>
            <Text style={[s.topBtnText, { color: C.mutedForeground }]}>Save & exit</Text>
          </Pressable>
        </View>
      </View>

      {/* ── 2. Stepper bar (the "progress bar") ──────────────────── */}
      {/*    White background, centered, card-width               */}
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
                {/* Connecting line (before this step) */}
                {i > 0 && (
                  <View style={[s.stepLine, {
                    backgroundColor: completed || active ? C.primary : C.border,
                  }]} />
                )}

                {/* Circle */}
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

                {/* Label */}
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

      {/* ── 3. Scrollable content + card ──────────────────────────── */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[
          s.scroll,
          {
            paddingHorizontal: hPad,
            paddingBottom: 32 + insets.bottom,
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
            // 3D pop effect — inline so React Native Web picks it up
            boxShadow:
              "0 2px 4px rgba(0,0,0,0.12), " +    // crisp near edge
              "0 8px 20px rgba(0,0,0,0.18), " +   // mid lift
              "0 40px 80px rgba(0,0,0,0.15)",     // large ambient
            borderWidth: 1,
            borderColor: "rgba(0,0,0,0.09)",
          } as any,
        ]}>
          {/* Heading */}
          <Text style={[s.heading, { color: C.foreground }]}>{heading}</Text>
          {hint && <Text style={[s.hint, { color: C.mutedForeground }]}>{hint}</Text>}
          <View style={[s.divider, { backgroundColor: C.border }]} />

          {children}

          {/* CTA: Exit (left) + Continue (centered, constrained) */}
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

  // ── Top bar
  topBar: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 20, paddingBottom: 12,
    borderBottomWidth: 1,
  },
  wordmark:  { fontSize: 20, fontWeight: "900", letterSpacing: -0.4, textAlign: "center" },
  topRight:  { alignItems: "flex-end" },
  topBtnText:{ fontSize: 13, fontWeight: "500" },

  // ── Stepper bar (the progress indicator)
  stepperBar: {
    borderBottomWidth: 1,
    paddingVertical: 14,
    alignItems: "center",           // centers the constrained inner row
  },
  stepperInner: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  stepItem:  { flexDirection: "column", alignItems: "center", flex: 1, position: "relative" },
  stepLine: {
    position: "absolute",
    top: 13,                        // center of the circle (26px circle / 2)
    left: "-50%", right: "50%",
    height: 2,
  },
  stepCircle: {
    width: 26, height: 26, borderRadius: 13, borderWidth: 2,
    alignItems: "center", justifyContent: "center", marginBottom: 6,
  },
  stepCheck:     { color: "#fff", fontSize: 11, fontWeight: "900" },
  stepActiveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#fff" },
  stepFutureDot: { width: 8, height: 8, borderRadius: 4 },
  stepLabel:     { fontSize: 10, textTransform: "uppercase", letterSpacing: 0.6, textAlign: "center" },

  // ── Content scroll
  scroll: { flexGrow: 1, paddingTop: 28 },

  // ── Card (boxShadow applied inline on the View for RN Web compatibility)
  card: {
    borderRadius: 18, padding: 40, marginBottom: 16,
  },
  heading: {
    fontSize: 36, fontWeight: "900", lineHeight: 44,
    letterSpacing: -0.8, marginBottom: 8,
    textAlign: "center", color: "#111",
  },
  hint: {
    fontSize: 14, lineHeight: 21,
    textAlign: "center", color: "#6B6B6B",
  },
  divider: { height: 1, marginTop: 24, marginBottom: 28 },

  // ── CTA
  ctaRow:  { flexDirection: "row", alignItems: "center", gap: 20, marginTop: 28 },
  exitBtn: { paddingVertical: 15 },
  exitText:{ fontSize: 14, fontWeight: "700" },
});

const cs = StyleSheet.create({
  cta:     { paddingVertical: 13, paddingHorizontal: 48, borderRadius: 12, alignItems: "center", maxWidth: 380 },
  ctaText: { fontSize: 15, fontWeight: "800", letterSpacing: 0.2 },
});
