import { useState, useRef, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  NativeSyntheticEvent,
  NativeScrollEvent,
  StyleSheet,
  Platform,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { formatPrice, formatSpecs } from "@/lib/format";
import { COLORS, LISTER_COLORS } from "@/lib/theme";
import type { Listing } from "@/store/listings";
import { useColorScheme } from "@/components/useColorScheme";

const Haptics = Platform.OS !== "web" ? require("expo-haptics") : null;

interface PropertyCardProps {
  listing: Listing;
  onPress?: () => void;
  onClose?: () => void;
  selected?: boolean;
}

const STOCK_GALLERY = [
  "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1600566753376-12c8ab7fb75b?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1600585154526-990dced4db0d?auto=format&fit=crop&w=800&q=80",
];

function getListingPhotos(listing: Listing): string[] {
  const photos: string[] = [];
  if (listing.imageUrl) {
    photos.push(listing.imageUrl);
  } else {
    const exteriors = [
      "https://images.unsplash.com/photo-1570129477492-45c003edd2be?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1580587771525-78b9dba3b914?auto=format&fit=crop&w=800&q=80",
    ];
    const seed = listing.price || 0;
    photos.push(exteriors[seed % exteriors.length]);
  }

  const idNum = listing.price || 0;
  for (let i = 0; i < 3; i++) {
    const idx = (idNum + i) % STOCK_GALLERY.length;
    photos.push(STOCK_GALLERY[idx]);
  }
  return photos;
}



export default function PropertyCard({ listing, onPress, onClose, selected }: PropertyCardProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = isDark ? COLORS.dark : COLORS.light;
  const [activeIdx, setActiveIdx] = useState(0);
  const [cardWidth, setCardWidth] = useState(300);
  const scrollRef = useRef<ScrollView>(null);
  const photos = getListingPhotos(listing);
  const imageHeight = Math.min(cardWidth * 0.45, 180);

  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetX = e.nativeEvent.contentOffset.x;
    const width = e.nativeEvent.layoutMeasurement.width;
    if (width > 0) {
      const idx = Math.round(offsetX / width);
      setActiveIdx(idx);
    }
  }, []);

  const handleFavorite = useCallback(() => {
    Haptics?.impactAsync(Haptics?.ImpactFeedbackStyle?.Light);
  }, []);

  const listerType = listing.listerType || "broker";
  const listerColor = LISTER_COLORS[listerType as keyof typeof LISTER_COLORS] || LISTER_COLORS.broker;
  const badgeColors = isDark ? listerColor.dark : listerColor.light;

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: selected ? colors.primary : colors.border,
          borderWidth: selected ? 2 : 1,
        },
      ]}
    >
      {/* Image Carousel */}
      <View
        style={{ position: "relative", height: imageHeight, overflow: "hidden" }}
        onLayout={(e) => setCardWidth(e.nativeEvent.layout.width)}
      >
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          decelerationRate="fast"
          bounces={false}
        >
          {photos.map((url, i) => (
            <Image
              key={i}
              source={{ uri: url }}
              style={{ width: cardWidth, height: imageHeight }}
              contentFit="cover"
              transition={200}
              priority={i === 0 ? "high" : "low"}
            />
          ))}
        </ScrollView>

        {/* Property type label */}
        <View style={styles.typeLabel}>
          <Text style={styles.typeLabelText}>
            {listing.propertyType.toUpperCase()}
          </Text>
        </View>

        {/* Favorite button */}
        <Pressable
          onPress={(e) => {
            e.stopPropagation?.();
            handleFavorite();
          }}
          style={[styles.iconButton, styles.favoriteButton, { backgroundColor: `${colors.background}CC` }]}
          hitSlop={8}
        >
          <Ionicons name="heart-outline" size={18} color={colors.foreground} />
        </Pressable>

        {/* Close button */}
        {onClose && (
          <Pressable
            onPress={(e) => {
              e.stopPropagation?.();
              onClose();
            }}
            style={[styles.iconButton, styles.closeButton, { backgroundColor: `${colors.background}CC` }]}
            hitSlop={8}
          >
            <Ionicons name="close" size={18} color={colors.foreground} />
          </Pressable>
        )}

        {/* Page dots */}
        {photos.length > 1 && (
          <View style={styles.dotsContainer}>
            {photos.map((_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  activeIdx === i ? styles.dotActive : styles.dotInactive,
                ]}
              />
            ))}
          </View>
        )}
      </View>

      {/* Property Info */}
      <View style={styles.infoContainer}>
        {/* Price + lister badge */}
        <View style={styles.priceRow}>
          <Text style={[styles.price, { color: colors.foreground }]}>
            {formatPrice(listing.price)}
          </Text>
          <View
            style={[
              styles.listerBadge,
              { backgroundColor: badgeColors.bg, borderColor: badgeColors.border },
            ]}
          >
            <Text style={[styles.listerBadgeText, { color: badgeColors.text }]}>
              {listerType}
            </Text>
          </View>
        </View>

        {/* Specs */}
        <Text style={[styles.specs, { color: colors.mutedForeground }]}>
          {formatSpecs(listing)}
        </Text>

        {/* Address */}
        <Text
          style={[styles.address, { color: colors.mutedForeground }]}
          numberOfLines={1}
        >
          {listing.address}, {listing.city}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 10,
  },
  typeLabel: {
    position: "absolute",
    top: 10,
    left: 10,
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  typeLabelText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  iconButton: {
    position: "absolute",
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  favoriteButton: {
    top: 10,
    right: 10,
  },
  closeButton: {
    top: 10,
    right: 50,
  },
  dotsContainer: {
    position: "absolute",
    bottom: 10,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 5,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dotActive: {
    backgroundColor: "#fff",
    transform: [{ scale: 1.1 }],
  },
  dotInactive: {
    backgroundColor: "rgba(255,255,255,0.5)",
  },
  infoContainer: {
    padding: 10,
    gap: 2,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  price: {
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  listerBadge: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  listerBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "capitalize",
  },
  specs: {
    fontSize: 11,
    marginTop: 2,
  },
  address: {
    fontSize: 11,
    marginTop: 1,
  },
});
