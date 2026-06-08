import { View, Text, Pressable, StyleSheet, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { COLORS } from "@/lib/theme";
import { useColorScheme } from "@/components/useColorScheme";

export default function ProfileScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = isDark ? COLORS.dark : COLORS.light;
  const insets = useSafeAreaInsets();
  const router = useRouter();

  // TODO: Replace with actual auth state
  const isAuthenticated = false;

  if (!isAuthenticated) {
    return (
      <View
        style={[
          styles.container,
          { backgroundColor: colors.background, paddingTop: insets.top },
        ]}
      >
        <View style={styles.content}>
          <View style={[styles.iconContainer, { backgroundColor: `${colors.primary}15` }]}>
            <Ionicons name="person" size={56} color={colors.primary} />
          </View>
          <Text style={[styles.title, { color: colors.foreground }]}>
            Sign In to Blab
          </Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            Manage your listings, save favorites,{"\n"}and connect with property owners.
          </Text>
          <Pressable
            style={[styles.button, { backgroundColor: colors.primary }]}
            onPress={() => router.push("/login")}
          >
            <Ionicons name="log-in-outline" size={18} color={colors.primaryForeground} />
            <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>
              Sign In with Phone
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: 32 }}
    >
      {/* Profile header */}
      <View style={styles.profileHeader}>
        <View style={[styles.avatar, { backgroundColor: colors.secondary }]}>
          <Text style={[styles.avatarText, { color: colors.foreground }]}>US</Text>
        </View>
        <Text style={[styles.profileName, { color: colors.foreground }]}>User Name</Text>
        <Text style={[styles.profileRole, { color: colors.mutedForeground }]}>Buyer</Text>
      </View>

      {/* Menu items */}
      {[
        { icon: "person-outline", label: "Edit Profile" },
        { icon: "heart-outline", label: "Saved Properties" },
        { icon: "document-text-outline", label: "My Listings" },
        { icon: "settings-outline", label: "Settings" },
        { icon: "log-out-outline", label: "Sign Out" },
      ].map((item, i) => (
        <Pressable
          key={i}
          style={[styles.menuItem, { borderBottomColor: colors.border }]}
        >
          <Ionicons name={item.icon as any} size={20} color={colors.foreground} />
          <Text style={[styles.menuLabel, { color: colors.foreground }]}>{item.label}</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 16,
  },
  iconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 22,
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    height: 48,
    paddingHorizontal: 24,
    borderRadius: 24,
    gap: 8,
    marginTop: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: "700",
  },
  profileHeader: {
    alignItems: "center",
    paddingVertical: 24,
    gap: 8,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 24,
    fontWeight: "800",
  },
  profileName: {
    fontSize: 20,
    fontWeight: "800",
  },
  profileRole: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    gap: 14,
  },
  menuLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: "500",
  },
});
