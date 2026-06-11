import { View, Text, Pressable, ScrollView, StyleSheet, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "@/lib/theme";
import { useListingsStore } from "@/store/listings";
import { useColorScheme } from "@/components/useColorScheme";

// Haptics only on native
const Haptics = Platform.OS !== "web" ? require("expo-haptics") : null;


interface ControlBarProps {
  hideDraw?: boolean;
}

export default function ControlBar({ hideDraw }: ControlBarProps = {}) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = isDark ? COLORS.dark : COLORS.light;

  const { listingType, setListingType, drawActive, toggleDraw, boundary, clearBoundary } =
    useListingsStore();

  const handleToggleType = (type: "sale" | "rent") => {
    Haptics?.selectionAsync();
    setListingType(type);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* For Sale / For Rent toggle */}
        <Pressable
          onPress={() => handleToggleType(listingType === "sale" ? "rent" : "sale")}
          style={[
            styles.chip,
            {
              backgroundColor: colors.background,
              borderColor: colors.border,
            },
          ]}
        >
          <Text style={[styles.chipText, { color: colors.foreground }]}>
            {listingType === "sale" ? "For Sale" : "For Rent"}
          </Text>
          <Ionicons name="chevron-down" size={12} color={colors.mutedForeground} />
        </Pressable>

        {/* Draw — morphs to Done when active */}
        {!hideDraw && (
          <Pressable
            onPress={() => {
              Haptics?.impactAsync(Haptics?.ImpactFeedbackStyle?.Light);
              toggleDraw();
            }}
            style={[
              styles.chip,
              {
                backgroundColor: drawActive ? colors.foreground : colors.background,
                borderColor: drawActive ? colors.foreground : colors.border,
              },
            ]}
          >
            <Ionicons
              name={drawActive ? "checkmark" : "pencil"}
              size={13}
              color={drawActive ? colors.background : colors.foreground}
            />
            <Text
              style={[
                styles.chipText,
                { color: drawActive ? colors.background : colors.foreground },
              ]}
            >
              {drawActive ? "Done" : "Draw"}
            </Text>
          </Pressable>
        )}

        {/* Clear boundary — always visible when a boundary exists, even in list mode */}
        {boundary && (
          <Pressable
            onPress={() => {
              Haptics?.notificationAsync(Haptics?.NotificationFeedbackType?.Warning);
              clearBoundary();
            }}
            style={[
              styles.chip,
              {
                backgroundColor: colors.background,
                borderColor: `${colors.destructive}80`,
              },
            ]}
          >
            <Ionicons name="close-circle-outline" size={14} color={colors.destructive} />
            <Text style={[styles.chipText, { color: colors.destructive }]}>Remove</Text>
          </Pressable>
        )}

        {/* Filters placeholder */}
        <Pressable
          style={[
            styles.chip,
            {
              backgroundColor: colors.background,
              borderColor: colors.border,
              opacity: 0.4,
            },
          ]}
          disabled
        >
          <Ionicons name="options-outline" size={14} color={colors.mutedForeground} />
          <Text style={[styles.chipText, { color: colors.mutedForeground }]}>Filters</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderBottomWidth: 1,
    height: 48,
    justifyContent: "center",
  },
  scrollContent: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    gap: 8,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    gap: 5,
  },
  chipText: {
    fontSize: 12,
    fontWeight: "600",
  },
});
