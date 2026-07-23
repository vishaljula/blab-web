import { View, Text, Pressable, StyleSheet, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColorScheme } from "@/components/useColorScheme";
import { COLORS } from "@/lib/theme";
import { useListingsStore } from "@/store/listings";
import { useRouter } from "expo-router";
import RealtorDashboard from "@/components/realtor/RealtorDashboard";

export default function DashboardScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = isDark ? COLORS.dark : COLORS.light;
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, user } = useListingsStore();

  // Not a realtor — show lock screen
  if (!token || user?.role !== "realtor") {
    return (
      <View style={[s.gateContainer, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <View style={[s.gateCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[s.gateIconWrap, { backgroundColor: `${colors.primary}15` }]}>
            <Ionicons name="briefcase-outline" size={44} color={colors.primary} />
          </View>
          <Text style={[s.gateTitle, { color: colors.foreground }]}>Realtor Dashboard</Text>
          <Text style={[s.gateSub, { color: colors.mutedForeground }]}>
            This area is exclusively for registered realtors. Sign up or switch your account role to unlock your professional portal.
          </Text>
          {!token && (
            <Pressable
              onPress={() => router.push("/login")}
              style={[
                s.gateBtn,
                { backgroundColor: colors.primary },
                Platform.OS === "web" ? { cursor: "pointer" } as any : {},
              ]}
            >
              <Ionicons name="log-in-outline" size={16} color={colors.primaryForeground} />
              <Text style={[s.gateBtnText, { color: colors.primaryForeground }]}>Sign In</Text>
            </Pressable>
          )}
        </View>
      </View>
    );
  }

  // Single unified dashboard — section tabs are inside RealtorDashboard
  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <RealtorDashboard token={token} />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  gateContainer: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  gateCard: {
    width: "100%", borderRadius: 20, borderWidth: 1,
    padding: 28, alignItems: "center", gap: 14,
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08, shadowRadius: 12, elevation: 4,
  },
  gateIconWrap: {
    width: 80, height: 80, borderRadius: 40,
    alignItems: "center", justifyContent: "center", marginBottom: 4,
  },
  gateTitle: { fontSize: 22, fontWeight: "800", letterSpacing: -0.5, textAlign: "center" },
  gateSub: { fontSize: 14, textAlign: "center", lineHeight: 22 },
  gateBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 24, paddingVertical: 12,
    borderRadius: 12, marginTop: 4,
  },
  gateBtnText: { fontSize: 15, fontWeight: "700" },
});

