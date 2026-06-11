import { View, Text, Pressable, StyleSheet, Platform } from "react-native";
import { useState, useEffect } from "react";
import { Ionicons } from "@expo/vector-icons";
import Header from "@/components/Header";
import ControlBar from "@/components/ControlBar";
import MapViewComponent from "@/components/MapView";
import ListView from "@/components/ListView";
import PropertyCard from "@/components/PropertyCard";
import { useListingsStore } from "@/store/listings";
import { COLORS } from "@/lib/theme";
import { useColorScheme } from "@/components/useColorScheme";

export default function MapScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = isDark ? COLORS.dark : COLORS.light;
  const [isDesktop, setIsDesktop] = useState(false);
  const [viewMode, setViewMode] = useState<"map" | "list">("map");

  const { selectedListing, setSelectedListing } = useListingsStore();

  // Detect desktop on web
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const media = window.matchMedia("(min-width: 768px)");
    const listener = () => setIsDesktop(media.matches);
    setIsDesktop(media.matches);
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Header />
      <ControlBar hideDraw={!isDesktop && viewMode === "list"} />

      {isDesktop ? (
        /* Desktop: map left (flex 3), listings right (flex 2) */
        <View style={styles.splitContainer}>
          <View style={styles.mapPane}>
            <MapViewComponent />
          </View>
          <View style={[styles.listPane, { borderLeftColor: colors.border }]}>
            <ListView />
          </View>
        </View>
      ) : (
        /* Mobile: full-screen map or list with floating toggle button */
        <View style={styles.mapContainer}>
          {viewMode === "map" ? (
            <>
              <MapViewComponent />
              {selectedListing && (
                <View style={styles.floatingCard}>
                  <PropertyCard
                    listing={selectedListing}
                    onClose={() => setSelectedListing(null)}
                    selected
                  />
                </View>
              )}
            </>
          ) : (
            <ListView />
          )}

          {(!selectedListing || viewMode === "list") && (
            <Pressable
              onPress={() => setViewMode(viewMode === "map" ? "list" : "map")}
              style={[
                styles.floatingToggle,
                {
                  backgroundColor: colors.primary,
                  bottom: 24,
                },
              ]}
            >
              <Ionicons
                name={viewMode === "map" ? "list" : "map"}
                size={18}
                color={colors.primaryForeground}
              />
              <Text style={[styles.floatingToggleText, { color: colors.primaryForeground }]}>
                {viewMode === "map" ? "List" : "Map"}
              </Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  splitContainer: {
    flex: 1,
    flexDirection: "row",
    overflow: "hidden",
  },
  mapPane: {
    flex: 3,
    position: "relative",
    overflow: "hidden",
  },
  listPane: {
    flex: 2,
    overflow: "hidden",
    borderLeftWidth: 1,
  },
  mapContainer: {
    flex: 1,
    position: "relative",
  },
  floatingCard: {
    position: "absolute",
    bottom: 12,
    left: 8,
    right: 8,
    zIndex: 40,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  floatingToggle: {
    position: "absolute",
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 24,
    gap: 8,
    zIndex: 50,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  floatingToggleText: {
    fontSize: 14,
    fontWeight: "700",
  },
});
