import { useMemo, useCallback, useState, useEffect } from "react";
import { View, Text, FlatList, ScrollView, StyleSheet, Platform, RefreshControl } from "react-native";
import { useRouter } from "expo-router";
import { useListingsStore } from "@/store/listings";
import { COLORS } from "@/lib/theme";
import PropertyCard from "./PropertyCard";
import type { Listing } from "@/store/listings";
import { useColorScheme } from "@/components/useColorScheme";

// Parsed once at module load — matches VIEWPORT_STREET_ZOOM on the server.
// At this zoom and above, the API returns ALL listings (no H3 grouping),
// so the "X of N properties" breakdown is meaningless and should be hidden.
const STREET_ZOOM = parseInt(process.env.EXPO_PUBLIC_VIEWPORT_STREET_ZOOM ?? "13", 10);

export default function ListView() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = isDark ? COLORS.dark : COLORS.light;
  const [numColumns, setNumColumns] = useState(1);

  const { listings, setSelectedListing, selectedListing, viewportBounds, boundary, isLoading, setDetailModalId } =
    useListingsStore();
  const total = useListingsStore((s) => s.total);
  const currentZoom = useListingsStore((s) => s.currentZoom);

  // At street-level zoom the server returns ALL listings — no H3 grouping.
  // "X of N" is meaningless here; just show the count.
  const isStreetLevel = currentZoom >= STREET_ZOOM;

  const openDetail = (id: string) => {
    if (Platform.OS === "web") {
      setDetailModalId(id);
    } else {
      router.push(`/property/${id}`);
    }
  };

  // Detect desktop for 2-column grid
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const media = window.matchMedia("(min-width: 768px)");
    const listener = () => setNumColumns(media.matches ? 2 : 1);
    setNumColumns(media.matches ? 2 : 1);
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, []);

  const visibleListings = useMemo(() => {
    if (!viewportBounds || boundary) return listings;
    const [swLng, swLat, neLng, neLat] = viewportBounds;
    return listings.filter(
      (l) =>
        l.longitude >= swLng &&
        l.longitude <= neLng &&
        l.latitude >= swLat &&
        l.latitude <= neLat
    );
  }, [listings, viewportBounds, boundary]);

  // Auto-scroll to selected listing on web when clicked on the map.
  // Note: On Web, React Native's FlatList uses aggressive virtualization (removeClippedSubviews),
  // which can unmount off-screen items from the DOM, causing document.getElementById to fail.
  // We conditionally use a standard ScrollView on Web so all listings remain in the DOM.
  useEffect(() => {
    if (!selectedListing) return;
    if (Platform.OS !== "web") return;
    const el = document.getElementById(`property-card-${selectedListing.id}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [selectedListing]);

  // ── Web Layout: Plain ScrollView to ensure DOM elements exist for auto-scrolling ──
  if (Platform.OS === "web") {
    // Build rows for grid layout
    const rows: Listing[][] = [];
    for (let i = 0; i < visibleListings.length; i += numColumns) {
      rows.push(visibleListings.slice(i, i + numColumns));
    }

    return (
      <View style={[styles.container, { backgroundColor: `${colors.muted}66` }]}>
        <View style={styles.header}>
          <Text style={[styles.headerText, { color: colors.mutedForeground }]}>
            {!isStreetLevel && total > 0 && total > visibleListings.length
              ? `${visibleListings.length} of ${total.toLocaleString()} properties`
              : `${visibleListings.length} ${visibleListings.length === 1 ? "property" : "properties"}`}
          </Text>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        >
          {visibleListings.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>🏠</Text>
              <Text style={[styles.emptyTitle, { color: colors.mutedForeground }]}>
                No properties found in this area
              </Text>
              <Text style={[styles.emptySubtitle, { color: `${colors.mutedForeground}B3` }]}>
                Try searching a different city or adjusting the map
              </Text>
            </View>
          ) : (
            rows.map((row, rowIdx) => (
              <View
                key={rowIdx}
                style={numColumns === 2 ? styles.columnWrapper : undefined}
              >
                {row.map((item) => (
                  <View
                    key={item.id}
                    style={numColumns === 2 ? styles.gridItem : undefined}
                    nativeID={`property-card-${item.id}`}
                  >
                    <PropertyCard
                      listing={item}
                      onPress={() => openDetail(item.id)}
                      selected={selectedListing?.id === item.id}
                    />
                  </View>
                ))}
                {/* Fill empty slot in last row for 2-col grid */}
                {numColumns === 2 && row.length < 2 && (
                  <View style={styles.gridItem} />
                )}
              </View>
            ))
          )}
        </ScrollView>
      </View>
    );
  }

  // ── Native: keep FlatList for performance ──
  const renderItem = useCallback(
    ({ item }: { item: Listing }) => (
      <View style={numColumns === 2 ? styles.gridItem : undefined}>
        <PropertyCard
          listing={item}
          onPress={() => openDetail(item.id)}
          selected={selectedListing?.id === item.id}
        />
      </View>
    ),
    [router, numColumns, selectedListing]
  );

  const keyExtractor = useCallback((item: Listing) => item.id, []);

  return (
    <View style={[styles.container, { backgroundColor: `${colors.muted}66` }]}>
      <View style={styles.header}>
        <Text style={[styles.headerText, { color: colors.mutedForeground }]}>
          {!isStreetLevel && total > 0 && total > visibleListings.length
            ? `${visibleListings.length} of ${total.toLocaleString()} properties`
            : `${visibleListings.length} ${visibleListings.length === 1 ? "property" : "properties"}`}
        </Text>
      </View>

      <FlatList
        key={`list-${numColumns}`}
        data={visibleListings}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        numColumns={numColumns}
        contentContainerStyle={styles.listContent}
        columnWrapperStyle={numColumns === 2 ? styles.columnWrapper : undefined}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>🏠</Text>
            <Text style={[styles.emptyTitle, { color: colors.mutedForeground }]}>
              No properties found in this area
            </Text>
            <Text style={[styles.emptySubtitle, { color: `${colors.mutedForeground}B3` }]}>
              Try searching a different city or adjusting the map
            </Text>
          </View>
        }
        showsVerticalScrollIndicator={false}
        removeClippedSubviews
        maxToRenderPerBatch={6}
        windowSize={7}
        initialNumToRender={4}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  headerText: {
    fontSize: 13,
  },
  listContent: {
    paddingHorizontal: 12,
    paddingBottom: 80,
  },
  columnWrapper: {
    flexDirection: "row",
    gap: 12,
  },
  gridItem: {
    flex: 1,
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 100,
    gap: 12,
  },
  emptyIcon: {
    fontSize: 40,
  },
  emptyTitle: {
    fontSize: 15,
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize: 13,
    textAlign: "center",
  },
});
