import { useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  StyleSheet,
  Keyboard,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { COLORS } from "@/lib/theme";
import { searchPlaces } from "@/lib/api";
import { useListingsStore } from "@/store/listings";
import { useColorScheme, toggleColorScheme } from "@/components/useColorScheme";

interface SearchResult {
  name: string;
  address: string;
  lat: number;
  lng: number;
  eLoc: string;
  type: string;
}

export default function Header() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = isDark ? COLORS.dark : COLORS.light;
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { setBoundary, viewportBounds, token, user, bumpMapRefresh } = useListingsStore();

  const handleSearch = useCallback(
    (q: string) => {
      setQuery(q);
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

      if (q.trim().length < 2) {
        setResults([]);
        setSearchOpen(false);
        return;
      }

      setSearchOpen(true);
      searchTimerRef.current = setTimeout(async () => {
        setIsSearching(true);
        try {
          let lat = "17.385";
          let lng = "78.4867";
          if (viewportBounds) {
            lat = String((viewportBounds[1] + viewportBounds[3]) / 2);
            lng = String((viewportBounds[0] + viewportBounds[2]) / 2);
          }
          const data = await searchPlaces(q, lat, lng);
          setResults(data);
        } catch {
        } finally {
          setIsSearching(false);
        }
      }, 300);
    },
    [viewportBounds]
  );

  const handleSelectResult = useCallback(
    (result: SearchResult) => {
      setQuery(`${result.name}, ${result.address}`);
      setSearchOpen(false);
      setResults([]);
      Keyboard.dismiss();

      const hasCoords =
        isFinite(result.lat) &&
        isFinite(result.lng) &&
        (result.lat !== 0 || result.lng !== 0);

      if (hasCoords) {
        const type = (result.type || "").toUpperCase();
        const radiusDeg =
          type === "STATE"
            ? 2
            : type === "CITY"
            ? 0.15
            : type.includes("SUB_LOCALITY")
            ? 0.015
            : type.includes("LOCALITY")
            ? 0.03
            : 0.02;

        setBoundary({
          type: "city",
          bbox: [
            result.lng - radiusDeg,
            result.lat - radiusDeg,
            result.lng + radiusDeg,
            result.lat + radiusDeg,
          ],
          label: result.name,
          center: { lat: result.lat, lng: result.lng },
          placeType: type,
        });
      }
    },
    [setBoundary]
  );

  return (
    <View
      style={[
        styles.container,
        {
          paddingTop: insets.top + 4,
          backgroundColor: colors.background,
          borderBottomColor: colors.border,
        },
      ]}
    >
      <View style={styles.inner}>
        {/* Logo */}
        <Text style={[styles.logo, { color: colors.foreground }]}>Blab</Text>

        {/* Search */}
        <View style={styles.searchContainer}>
          <View
            style={[
              styles.searchInputRow,
              { backgroundColor: colors.muted, borderColor: colors.border },
            ]}
          >
            <Ionicons name="search" size={14} color={colors.mutedForeground} />
            <TextInput
              value={query}
              onChangeText={handleSearch}
              placeholder="Search city or area…"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.searchInput, { color: colors.foreground, outlineStyle: "none" } as any]}
              autoCorrect={false}
              returnKeyType="search"
              onSubmitEditing={Keyboard.dismiss}
            />
            {query.length > 0 && (
              <Pressable
                onPress={() => {
                  setQuery("");
                  setResults([]);
                  setSearchOpen(false);
                  setBoundary(null);
                }}
                hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
              >
                <Ionicons name="close" size={14} color={colors.mutedForeground} />
              </Pressable>
            )}
          </View>

          {/* Search dropdown */}
          {searchOpen && (results.length > 0 || isSearching) && (
            <View
              style={[
                styles.dropdown,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  shadowColor: "#000",
                },
              ]}
            >
              {isSearching && results.length === 0 && (
                <Text style={[styles.dropdownHint, { color: colors.mutedForeground }]}>
                  Searching…
                </Text>
              )}
              <FlatList
                data={results}
                keyExtractor={(item, i) => `${item.eLoc}-${i}`}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => (
                  <Pressable
                    onPress={() => handleSelectResult(item)}
                    style={({ pressed }) => [
                      styles.resultItem,
                      pressed && { backgroundColor: colors.muted },
                    ]}
                  >
                    <Ionicons
                      name="location-outline"
                      size={16}
                      color={colors.mutedForeground}
                      style={{ marginTop: 2 }}
                    />
                    <View style={styles.resultText}>
                      <Text
                        style={[styles.resultName, { color: colors.foreground }]}
                        numberOfLines={1}
                      >
                        {item.name}
                      </Text>
                      <Text
                        style={[styles.resultAddress, { color: colors.mutedForeground }]}
                        numberOfLines={1}
                      >
                        {item.address}
                      </Text>
                    </View>
                    <Text style={[styles.resultType, { color: `${colors.mutedForeground}99` }]}>
                      {item.type?.replace("_", " ")}
                    </Text>
                  </Pressable>
                )}
              />
            </View>
          )}
        </View>

        {/* Theme toggle */}
        {toggleColorScheme && (
          <Pressable
          onPress={() => {
              toggleColorScheme();
              bumpMapRefresh(); // Directly triggers marker remount + listing re-fetch in MapView
            }}
            style={[styles.themeToggle, { borderColor: colors.border }]}
          >
            <Ionicons
              name={isDark ? "sunny" : "moon"}
              size={16}
              color={colors.foreground}
            />
          </Pressable>
        )}

        {/* Post button */}
        <Pressable
          style={[styles.postButton, { backgroundColor: colors.primary }]}
          onPress={() => {
            if (!token) {
              router.push("/login");
              return;
            }
            if (user?.role === "buyer") {
              alert("Buyers cannot create listings. Please edit your role in your profile to Owner, Broker, or Developer.");
              return;
            }
            router.push("/list");
          }}
        >
          <Ionicons name="add" size={16} color={colors.primaryForeground} />
          <Text style={[styles.postButtonText, { color: colors.primaryForeground }]}>
            Post
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderBottomWidth: 1,
    zIndex: 50,
  },
  inner: {
    flexDirection: "row",
    alignItems: "center",
    height: 48,
    paddingHorizontal: 12,
    gap: 8,
  },
  logo: {
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  searchContainer: {
    flex: 1,
    position: "relative",
    zIndex: 100,
  },
  searchInputRow: {
    flexDirection: "row",
    alignItems: "center",
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 18,
    borderWidth: 1,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    paddingVertical: 0,
  },
  dropdown: {
    position: "absolute",
    top: 42,
    left: 0,
    right: 0,
    borderRadius: 12,
    borderWidth: 1,
    maxHeight: 280,
    overflow: "hidden",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
  },
  dropdownHint: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 13,
  },
  resultItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
  },
  resultText: {
    flex: 1,
  },
  resultName: {
    fontSize: 13,
    fontWeight: "600",
  },
  resultAddress: {
    fontSize: 11,
    marginTop: 1,
  },
  resultType: {
    fontSize: 9,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 3,
  },
  themeToggle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  postButton: {
    flexDirection: "row",
    alignItems: "center",
    height: 36,
    paddingLeft: 10,
    paddingRight: 14,
    borderRadius: 18,
    gap: 4,
  },
  postButtonText: {
    fontSize: 13,
    fontWeight: "700",
  },
});
