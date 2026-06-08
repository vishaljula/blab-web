import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { COLORS } from "@/lib/theme";
import { useColorScheme } from "@/components/useColorScheme";

export default function PostScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = isDark ? COLORS.dark : COLORS.light;
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.background, paddingTop: insets.top },
      ]}
    >
      <View style={styles.content}>
        <View style={[styles.iconContainer, { backgroundColor: `${colors.primary}15` }]}>
          <Ionicons name="add-circle" size={56} color={colors.primary} />
        </View>
        <Text style={[styles.title, { color: colors.foreground }]}>
          Post a Property
        </Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          List your property for sale or rent.{"\n"}Reach thousands of verified buyers.
        </Text>
        <Pressable
          style={[styles.button, { backgroundColor: colors.primary }]}
          onPress={() => {
            // TODO: Check auth, then open listing wizard
            router.push("/login");
          }}
        >
          <Ionicons name="add" size={18} color={colors.primaryForeground} />
          <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>
            Create Listing
          </Text>
        </Pressable>
      </View>
    </View>
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
});
