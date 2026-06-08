/**
 * MapView placeholder — renders a styled placeholder until
 * @rnmapbox/maps is configured with native builds.
 *
 * For initial testing with Expo Go, we show a placeholder.
 * Once the user has a development build set up, we swap in the native Mapbox SDK.
 */

import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "@/lib/theme";
import { useColorScheme } from "@/components/useColorScheme";

export default function MapView() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = isDark ? COLORS.dark : COLORS.light;

  return (
    <View style={[styles.container, { backgroundColor: isDark ? "#1a1a2e" : "#e8e8e8" }]}>
      {/* Placeholder map background pattern */}
      <View style={styles.gridOverlay}>
        {Array.from({ length: 20 }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.gridLine,
              { backgroundColor: isDark ? "#2a2a3e" : "#d0d0d0" },
              i % 2 === 0 ? styles.gridHorizontal : styles.gridVertical,
              { top: `${(i * 5) % 100}%`, left: `${(i * 7) % 100}%` },
            ]}
          />
        ))}
      </View>

      {/* Center content */}
      <View style={styles.centerContent}>
        <View style={[styles.iconContainer, { backgroundColor: `${colors.primary}20` }]}>
          <Ionicons name="map" size={48} color={colors.primary} />
        </View>
        <Text style={[styles.title, { color: colors.foreground }]}>Native Map</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Map requires a development build.{"\n"}
          Run `npx expo run:ios` to enable.
        </Text>
      </View>

      {/* Fake zoom controls */}
      <View style={[styles.zoomControls, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={[styles.zoomButton, { borderBottomColor: colors.border }]}>
          <Ionicons name="add" size={22} color={colors.foreground} />
        </View>
        <View style={styles.zoomButton}>
          <Ionicons name="remove" size={22} color={colors.foreground} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: "relative",
    overflow: "hidden",
  },
  gridOverlay: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.3,
  },
  gridLine: {
    position: "absolute",
    borderRadius: 1,
  },
  gridHorizontal: {
    height: 1,
    width: "100%",
  },
  gridVertical: {
    width: 1,
    height: "100%",
  },
  centerContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 40,
  },
  iconContainer: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 13,
    textAlign: "center",
    lineHeight: 20,
  },
  zoomControls: {
    position: "absolute",
    top: 12,
    right: 12,
    borderRadius: 10,
    borderWidth: 1,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  zoomButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderBottomWidth: 1,
  },
});
