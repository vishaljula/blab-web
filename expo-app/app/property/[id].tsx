import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Platform,
  Pressable,
  ActivityIndicator,
  Dimensions,
  NativeModules,
  NativeSyntheticEvent,
  NativeScrollEvent,
  TextInput,
  Modal,
  TouchableOpacity,
  useWindowDimensions,
  Linking,
  Share,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Image } from "expo-image";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useListingsStore, type Listing } from "@/store/listings";
import { COLORS, API_BASE_URL } from "@/lib/theme";
import { useColorScheme } from "@/components/useColorScheme";
import { formatPrice, formatPriceFull, formatArea } from "@/lib/format";
import { getPhotos } from "@/lib/stockPhotos";
import { getRoleLabel, getRoleBadge } from "@/lib/listerRole";

const { width: SCREEN_W } = Dimensions.get("window");

// Stock photos and getPhotos() live in lib/stockPhotos.ts (shared with web modal).

// ─── Tour date carousel data ──────────────────────────────────────────────────
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function getNextDates(n: number): Date[] {
  const arr: Date[] = [];
  const today = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    arr.push(d);
  }
  return arr;
}
const TOUR_DATES = getNextDates(7);
const TOUR_TIMES = ["9:00 AM", "10:00 AM", "11:00 AM", "12:00 PM", "2:00 PM", "3:00 PM", "4:00 PM", "5:00 PM", "6:00 PM"];

// ─── Price / EMI calc helper ──────────────────────────────────────────────────
function calcEMI(principal: number, annualRatePercent: number, tenureYears: number): number {
  const r = annualRatePercent / 12 / 100;
  const n = tenureYears * 12;
  if (r === 0) return Math.round(principal / n);
  return Math.round((principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1));
}

// ─── Feature icons map ────────────────────────────────────────────────────────
const FEATURE_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  "Air Conditioning": "snow-outline",
  "Swimming Pool": "water-outline",
  "Gym / Fitness Center": "barbell-outline",
  "Covered Parking": "car-outline",
  "Security / CCTV": "shield-checkmark-outline",
  "Club House": "business-outline",
  "Power Backup": "flash-outline",
  "Children's Play Area": "happy-outline",
  "Lift / Elevator": "arrow-up-outline",
  "Modular Kitchen": "restaurant-outline",
  "Garden / Landscape": "leaf-outline",
  "Vastu Compliant": "compass-outline",
  "Rain Water Harvesting": "cloud-outline",
  "Intercom": "call-outline",
  "24/7 Water Supply": "water-outline",
  "Gated Community": "lock-closed-outline",
};

export default function PropertyDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const C = isDark ? COLORS.dark : COLORS.light;

  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDesktop, setIsDesktop] = useState(false);
  const [activePhotoIdx, setActivePhotoIdx] = useState(0);
  const [activeTab, setActiveTab] = useState<"overview" | "features" | "neighborhood" | "calculator">("overview");
  const [favorited, setFavorited] = useState(false);

  const handleShare = async () => {
    const shareId = id || listing?.id;
    if (!shareId) return;
    const url = `https://blab.in/listing/${shareId}`;
    const msg = listing
      ? `${listing.address}, ${listing.city} — Check this on Blab: ${url}`
      : url;
    try {
      if (Platform.OS === "web") {
        if (typeof navigator !== "undefined" && navigator.share) {
          await navigator.share({ title: listing?.address ?? "Property", text: msg, url });
        } else {
          await navigator.clipboard?.writeText(url);
        }
      } else {
        await Share.share({ message: msg, url });
      }
    } catch {}
  };

  const [showAllPhotos, setShowAllPhotos] = useState(false);
  const [selectedDate, setSelectedDate] = useState(0);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [tourType, setTourType] = useState<"in-person" | "video">("in-person");

  // Contact form state
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactMessage, setContactMessage] = useState("");
  const [contactSent, setContactSent] = useState(false);

  // EMI calculator state
  const [downPct, setDownPct] = useState(20);
  const [loanRate, setLoanRate] = useState(8.5);
  const [loanTenure, setLoanTenure] = useState(20);

  // Features accordion
  const [openAccordion, setOpenAccordion] = useState<string | null>("Interior");

  // Mobile UX state
  const [headerOpaque, setHeaderOpaque] = useState(false);
  const [lbShowChrome, setLbShowChrome] = useState(true);
  const [showMoreDesc, setShowMoreDesc] = useState(false);

  const mainScrollRef = useRef<ScrollView>(null);
  const lightboxScrollRef = useRef<ScrollView>(null);
  const galleryHeightRef = useRef<number>(450);
  const { width: winW, height: winH } = useWindowDimensions();
  const sectionOffsets = useRef<Record<string, number>>({
    overview: 0,
    features: 0,
    neighborhood: 0,
    calculator: 0,
  });

  // ── Responsive detection ────────────────────────────────────────────────────
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const media = window.matchMedia("(min-width: 1024px)");
    const listener = () => setIsDesktop(media.matches);
    setIsDesktop(media.matches);
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, []);

  // ── Fetch listing ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetch(`${API_BASE_URL}/api/listings/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setListing)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  // ── Re-anchor lightbox on orientation change ─────────────────────────────────
  // contentOffset is initial-only; scrollTo() is needed when winW changes on rotation
  useEffect(() => {
    if (!showAllPhotos) return;
    const t = setTimeout(() => {
      lightboxScrollRef.current?.scrollTo({ x: activePhotoIdx * winW, animated: false });
    }, 50); // small delay lets the new layout settle first
    return () => clearTimeout(t);
  }, [winW, showAllPhotos]);

  // ── Lock portrait normally; unlock for lightbox on native ────────────────────
  // NativeModules check is the reliable way to detect Expo Go vs real builds
  useEffect(() => {
    if (Platform.OS === "web") return;
    if (!NativeModules.ExpoScreenOrientation) return; // not in Expo Go — skip
    const SO = require("expo-screen-orientation");
    if (showAllPhotos) {
      SO.unlockAsync();
    } else {
      SO.lockAsync(SO.OrientationLock.PORTRAIT_UP);
    }
    return () => {
      if (NativeModules.ExpoScreenOrientation) {
        const SO2 = require("expo-screen-orientation");
        SO2.lockAsync(SO2.OrientationLock.PORTRAIT_UP);
      }
    };
  }, [showAllPhotos]);

  // ── Scroll handler ──────────────────────────────────────────────────────────
  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    // Mobile: toggle header opacity when photo is scrolled past
    if (!isDesktop) setHeaderOpaque(y > 240);
    const off = sectionOffsets.current;
    if (y >= off.calculator - 120) setActiveTab("calculator");
    else if (y >= off.neighborhood - 120) setActiveTab("neighborhood");
    else if (y >= off.features - 120) setActiveTab("features");
    else setActiveTab("overview");
  };

  const scrollToSection = (section: string) => {
    mainScrollRef.current?.scrollTo({ y: sectionOffsets.current[section] - 104, animated: true });
    setActiveTab(section as any);
  };

  // ─────────────────────────────────────────────────────────────────────────────
  //  RENDER GUARDS
  // ─────────────────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={[s.fill, s.center, { backgroundColor: C.background }]}>
        <ActivityIndicator size="large" color={C.primary} />
        <Text style={[s.loadingText, { color: C.mutedForeground }]}>Loading property…</Text>
      </View>
    );
  }

  if (!listing) {
    return (
      <View style={[s.fill, s.center, { backgroundColor: C.background }]}>
        <Ionicons name="home-outline" size={64} color={C.mutedForeground} />
        <Text style={[s.errorTitle, { color: C.foreground }]}>Property not found</Text>
        <Pressable onPress={() => router.back()} style={[s.backPill, { backgroundColor: C.primary }]}>
          <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>← Back to search</Text>
        </Pressable>
      </View>
    );
  }

  const photos = getPhotos(listing);
  const features: string[] = Array.isArray(listing.features) ? listing.features : [];
  const loanAmount = listing.price * (1 - downPct / 100);
  const emi = calcEMI(loanAmount, loanRate, loanTenure);

  // ─────────────────────────────────────────────────────────────────────────────
  //  SUB-COMPONENTS
  // ─────────────────────────────────────────────────────────────────────────────

  // ── Photo gallery: desktop 2+4 grid ──────────────────────────────────────────
  const renderDesktopGallery = () => (
    <View
      style={s.desktopGrid}
      onLayout={(e) => { galleryHeightRef.current = e.nativeEvent.layout.height; }}
    >
      {/* Hero */}
      <Pressable style={s.heroCell} onPress={() => setShowAllPhotos(true)}>
        <Image source={{ uri: photos[0] }} style={s.heroPic} contentFit="cover" />
      </Pressable>
      {/* 4 thumbnails */}
      <View style={s.thumbGrid}>
        {[1, 2, 3, 4].map((i) => (
          <Pressable
            key={i}
            style={[s.thumbCell, i === 2 && { borderTopRightRadius: 12 }, i === 4 && { borderBottomRightRadius: 12 }]}
            onPress={() => setShowAllPhotos(true)}
          >
            <Image source={{ uri: photos[i] ?? photos[0] }} style={s.thumbPic} contentFit="cover" />
            {i === 4 && (
              <View style={s.moreOverlay}>
                <Ionicons name="images-outline" size={20} color="#fff" />
                <Text style={s.moreText}>+{photos.length - 4} photos</Text>
              </View>
            )}
          </Pressable>
        ))}
      </View>
    </View>
  );

  // ── Photo gallery: mobile carousel ───────────────────────────────────────────
  const renderMobileCarousel = () => (
    <View
      style={{ width: SCREEN_W, height: 300, position: "relative" }}
      onLayout={(e) => { galleryHeightRef.current = e.nativeEvent.layout.height; }}
    >
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={(e) => {
          const x = e.nativeEvent.contentOffset.x;
          const w = e.nativeEvent.layoutMeasurement.width || SCREEN_W;
          setActivePhotoIdx(Math.round(x / w));
        }}
        scrollEventThrottle={16}
      >
        {photos.map((url, i) => (
          <Pressable key={i} onPress={() => { setActivePhotoIdx(i); setShowAllPhotos(true); }}>
            <Image source={{ uri: url }} style={{ width: SCREEN_W, height: 300 }} contentFit="cover" />
          </Pressable>
        ))}
      </ScrollView>
      {/* Counter badge */}
      <Pressable style={s.carouselBadge} onPress={() => setShowAllPhotos(true)}>
        <Ionicons name="camera-outline" size={12} color="#fff" />
        <Text style={s.carouselBadgeText}> {activePhotoIdx + 1} / {photos.length}</Text>
      </Pressable>
      {/* View all photos */}
      <Pressable style={s.viewAllBtn} onPress={() => setShowAllPhotos(true)}>
        <Ionicons name="images-outline" size={13} color="#fff" />
        <Text style={s.viewAllBtnText}>View all photos</Text>
      </Pressable>
      {/* Dot indicators */}
      <View style={s.dotRow}>
        {photos.slice(0, 5).map((_, i) => (
          <View
            key={i}
            style={[s.dot, i === activePhotoIdx && s.dotActive]}
          />
        ))}
      </View>
    </View>
  );

  // ── Scroll-spy tab bar ────────────────────────────────────────────────────────
  const TABS = [
    { key: "overview", label: "Overview" },
    { key: "features", label: "Facts & features" },
    { key: "neighborhood", label: "Neighborhood" },
    { key: "calculator", label: "EMI calculator" },
  ] as const;

  // Only one tab bar — always rendered outside the ScrollView as a sticky element
  const renderTabBar = () => (
    <View
      style={[
        s.tabBar,
        { backgroundColor: C.card, borderBottomColor: C.border },
      ]}
    >
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 8 }}>
        {TABS.map((t) => {
          const active = activeTab === t.key;
          return (
            <Pressable
              key={t.key}
              onPress={() => scrollToSection(t.key)}
              style={[s.tabBtn, active && { borderBottomColor: C.primary }]}
            >
              <Text style={[s.tabLabel, { color: active ? C.primary : C.mutedForeground }, active && s.tabLabelActive]}>
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );

  // ── Price + quick-specs block (Zillow-exact layout) ─────────────────────────
  const renderOverview = () => {
    const pricePerSqft = listing.builtUpArea && listing.builtUpArea > 0
      ? Math.round(listing.price / listing.builtUpArea)
      : null;

    const factTablets = [
      { icon: "business-outline" as const, label: listing.propertyType.charAt(0).toUpperCase() + listing.propertyType.slice(1), sub: "Type" },
      { icon: "calendar-outline" as const, label: listing.yearBuilt ? `Built in ${listing.yearBuilt}` : "Year N/A", sub: "Year built" },
      { icon: "expand-outline" as const, label: listing.plotArea ? `${listing.plotArea?.toLocaleString("en-IN")} sq.yd lot` : "N/A", sub: "Lot size" },
      { icon: "trending-up-outline" as const, label: listing.marketEstimate ? formatPrice(listing.marketEstimate) : "—", sub: "Blab Estimate" },
      { icon: "cash-outline" as const, label: pricePerSqft ? `₹${pricePerSqft.toLocaleString("en-IN")}/sqft` : "—", sub: "Price per sqft" },
      { icon: "construct-outline" as const, label: listing.maintenance ? `₹${listing.maintenance}/mo` : "N/A", sub: "Maintenance" },
    ];

    return (
      <View
        onLayout={(e) => { sectionOffsets.current.overview = e.nativeEvent.layout.y; }}
        style={s.section}
      >
        {/* ── TOP BLOCK: price left + spec numbers right ── */}
        <View style={s.overviewTopRow}>
          {/* Left: price + address */}
          <View style={s.overviewLeft}>
            {/* Status pills */}
            <View style={s.statusRow}>
              <View style={[s.statusPill, { backgroundColor: listing.listingType === "rent" ? "#EFF6FF" : "#ECFDF5" }]}>
                <Text style={[s.statusPillText, { color: listing.listingType === "rent" ? "#1D4ED8" : "#047857" }]}>
                  {listing.listingType === "rent" ? "For Rent" : "For Sale"}
                </Text>
              </View>
            </View>
            <Text style={[s.priceHeading, { color: C.foreground }]}>
              {formatPriceFull(listing.price)}
              {listing.listingType === "rent" && (
                <Text style={[s.priceUnit, { color: C.mutedForeground }]}> /mo</Text>
              )}
            </Text>
            <Text style={[s.addressText, { color: C.mutedForeground }]} numberOfLines={2}>
              {listing.address}, {listing.city}
            </Text>

            {/* EMI estimate line */}
            {listing.price > 0 && (
              <View style={[s.emiEstimateRow, { backgroundColor: isDark ? "#1E2B3A" : "#EFF6FF", borderColor: isDark ? "#1E3A5F" : "#BFDBFE" }]}>
                <Text style={[s.emiEstimateText, { color: isDark ? "#93C5FD" : "#1D4ED8" }]}>
                  Est. EMI: ₹{calcEMI(listing.price * 0.8, 8.5, 20).toLocaleString("en-IN")}/mo
                </Text>
                <Text style={[s.emiEstimateLink, { color: C.primary }]}> · Get pre-approved</Text>
              </View>
            )}
          </View>

          {/* Right: 3 big spec numbers */}
          {(listing.bedrooms != null || listing.bathrooms != null || listing.builtUpArea) && (
            <View style={s.overviewRight}>
              {listing.bedrooms != null && (
                <View style={s.bigSpecCol}>
                  <Text style={[s.bigSpecNum, { color: C.foreground }]}>{listing.bedrooms}</Text>
                  <Text style={[s.bigSpecLabel, { color: C.mutedForeground }]}>beds</Text>
                </View>
              )}
              {listing.bedrooms != null && listing.bathrooms != null && (
                <View style={[s.bigSpecDivider, { backgroundColor: C.border }]} />
              )}
              {listing.bathrooms != null && (
                <View style={s.bigSpecCol}>
                  <Text style={[s.bigSpecNum, { color: C.foreground }]}>{listing.bathrooms}</Text>
                  <Text style={[s.bigSpecLabel, { color: C.mutedForeground }]}>baths</Text>
                </View>
              )}
              {listing.builtUpArea != null && (
                <>
                  <View style={[s.bigSpecDivider, { backgroundColor: C.border }]} />
                  <View style={s.bigSpecCol}>
                    <Text style={[s.bigSpecNum, { color: C.foreground }]}>
                      {listing.builtUpArea.toLocaleString("en-IN")}
                    </Text>
                    <Text style={[s.bigSpecLabel, { color: C.mutedForeground }]}>sqft</Text>
                  </View>
                </>
              )}
            </View>
          )}
        </View>

        {/* ── FACT TABLETS GRID (3 columns, Zillow-style table) ── */}
        <View style={[s.factTabletsGrid, { borderColor: C.border }]}>
          {factTablets.map((f, i) => (
            <View key={f.sub} style={[
              s.factTablet,
              { backgroundColor: isDark ? "#1A1A1A" : "#F6F6F6" },
              i % 3 !== 0 && { borderLeftWidth: 1, borderLeftColor: C.border },
              i >= 3 && { borderTopWidth: 1, borderTopColor: C.border },
            ]}>
              <Ionicons name={f.icon} size={17} color={isDark ? "#6B6B6B" : "#555"} />
              <Text style={[s.factTabletText, { color: C.foreground }]} numberOfLines={1}>{f.label}</Text>
            </View>
          ))}
        </View>

        {/* ── ABOUT THIS HOME ── */}
        <View style={[s.divider, { backgroundColor: C.border, marginTop: 20 }]} />
        <Text style={[s.sectionHeading, { color: C.foreground }]}>About this home</Text>
        <Text style={[s.bodyText, { color: C.mutedForeground }]}>
          {listing.description ?? "A beautifully crafted property in one of the most sought-after localities. Spacious rooms, modern finishes, and excellent connectivity to key areas of the city."}
        </Text>
      </View>
    );
  };

  // ── Facts & Features accordion ────────────────────────────────────────────────
  const renderFeatures = () => {
    const grouped: Record<string, { icon: keyof typeof Ionicons.glyphMap; label: string }[]> = {
      Interior: [],
      Exterior: [],
      Community: [],
    };

    features.forEach((f) => {
      const icon = FEATURE_ICONS[f] ?? "checkmark-circle-outline";
      if (["Air Conditioning", "Modular Kitchen", "Lift / Elevator", "Intercom"].includes(f)) {
        grouped.Interior.push({ icon, label: f });
      } else if (["Garden / Landscape", "Rain Water Harvesting", "24/7 Water Supply"].includes(f)) {
        grouped.Exterior.push({ icon, label: f });
      } else {
        grouped.Community.push({ icon, label: f });
      }
    });

    // fallback if empty
    if (features.length === 0) {
      grouped.Community = [
        { icon: "shield-checkmark-outline", label: "Gated Community" },
        { icon: "car-outline", label: "Covered Parking" },
        { icon: "flash-outline", label: "Power Backup" },
      ];
    }

    return (
      <View
        onLayout={(e) => { sectionOffsets.current.features = e.nativeEvent.layout.y; }}
        style={[s.section, { borderTopWidth: 1, borderTopColor: C.border }]}
      >
        <Text style={[s.sectionHeading, { color: C.foreground }]}>Facts & Features</Text>

        {/* Feature pills */}
        <View style={s.pillsWrap}>
          {features.slice(0, 8).map((f) => (
            <View key={f} style={[s.featurePill, { backgroundColor: isDark ? "#1E1E1E" : "#F3F4F6", borderColor: C.border }]}>
              <Ionicons name={FEATURE_ICONS[f] ?? "checkmark-outline"} size={13} color={C.primary} />
              <Text style={[s.pillText, { color: C.foreground }]}>{f}</Text>
            </View>
          ))}
        </View>

        {/* Accordion sections */}
        {Object.entries(grouped).map(([groupName, items]) => {
          if (items.length === 0) return null;
          const open = openAccordion === groupName;
          return (
            <View key={groupName} style={[s.accordion, { borderColor: C.border }]}>
              <Pressable style={s.accordionHeader} onPress={() => setOpenAccordion(open ? null : groupName)}>
                <Text style={[s.accordionTitle, { color: C.foreground }]}>{groupName}</Text>
                <Ionicons name={open ? "chevron-up" : "chevron-down"} size={18} color={C.mutedForeground} />
              </Pressable>
              {open && (
                <View style={s.accordionBody}>
                  {items.map((item) => (
                    <View key={item.label} style={s.accordionRow}>
                      <Ionicons name={item.icon} size={16} color={C.primary} />
                      <Text style={[s.accordionRowText, { color: C.foreground }]}>{item.label}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          );
        })}
      </View>
    );
  };

  // ── Neighborhood placeholder ──────────────────────────────────────────────────
  const renderNeighborhood = () => (
    <View
      onLayout={(e) => { sectionOffsets.current.neighborhood = e.nativeEvent.layout.y; }}
      style={[s.section, { borderTopWidth: 1, borderTopColor: C.border }]}
    >
      <Text style={[s.sectionHeading, { color: C.foreground }]}>Neighborhood</Text>
      <View style={[s.neighborhoodBox, { backgroundColor: isDark ? "#111" : "#F3F4F6", borderColor: C.border }]}>
        <Ionicons name="map-outline" size={48} color={C.mutedForeground} />
        <Text style={[s.bodyText, { color: C.mutedForeground, textAlign: "center", marginTop: 12 }]}>
          Interactive neighborhood map with transit, schools & essentials coming soon.
        </Text>
      </View>
    </View>
  );

  // ── EMI Calculator ────────────────────────────────────────────────────────────
  const renderCalculator = () => {
    const totalPayment = emi * loanTenure * 12;
    const totalInterest = totalPayment - loanAmount;

    return (
      <View
        onLayout={(e) => { sectionOffsets.current.calculator = e.nativeEvent.layout.y; }}
        style={[s.section, { borderTopWidth: 1, borderTopColor: C.border }]}
      >
        <Text style={[s.sectionHeading, { color: C.foreground }]}>EMI Calculator</Text>
        <Text style={[s.bodyText, { color: C.mutedForeground, marginBottom: 20 }]}>
          Estimate your monthly home loan EMI.
        </Text>

        <View style={[s.calcCard, { backgroundColor: isDark ? "#1A1A1A" : "#F9FAFB", borderColor: C.border }]}>
          {/* EMI Result */}
          <View style={[s.emiResult, { backgroundColor: C.primary }]}>
            <Text style={s.emiResultLabel}>Monthly EMI</Text>
            <Text style={s.emiResultAmount}>₹{emi.toLocaleString("en-IN")}</Text>
            <Text style={s.emiResultSub}>Principal + Interest</Text>
          </View>

          {/* Sliders */}
          <View style={s.calcInputs}>
            <CalcRow label="Down Payment" value={`${downPct}%`} sub={`₹${(listing.price * downPct / 100 / 100000).toFixed(1)}L`}>
              <View style={s.sliderRow}>
                {[10, 15, 20, 25, 30].map((v) => (
                  <Pressable key={v} onPress={() => setDownPct(v)} style={[s.sliderPill, { backgroundColor: downPct === v ? C.primary : (isDark ? "#2A2A2A" : "#E5E7EB"), borderColor: C.border }]}>
                    <Text style={[s.sliderPillText, { color: downPct === v ? "#fff" : C.foreground }]}>{v}%</Text>
                  </Pressable>
                ))}
              </View>
            </CalcRow>
            <View style={[s.calcDivider, { backgroundColor: C.border }]} />
            <CalcRow label="Interest Rate" value={`${loanRate}% p.a.`}>
              <View style={s.sliderRow}>
                {[7.5, 8.0, 8.5, 9.0, 9.5].map((v) => (
                  <Pressable key={v} onPress={() => setLoanRate(v)} style={[s.sliderPill, { backgroundColor: loanRate === v ? C.primary : (isDark ? "#2A2A2A" : "#E5E7EB"), borderColor: C.border }]}>
                    <Text style={[s.sliderPillText, { color: loanRate === v ? "#fff" : C.foreground }]}>{v}%</Text>
                  </Pressable>
                ))}
              </View>
            </CalcRow>
            <View style={[s.calcDivider, { backgroundColor: C.border }]} />
            <CalcRow label="Loan Tenure" value={`${loanTenure} yrs`}>
              <View style={s.sliderRow}>
                {[10, 15, 20, 25, 30].map((v) => (
                  <Pressable key={v} onPress={() => setLoanTenure(v)} style={[s.sliderPill, { backgroundColor: loanTenure === v ? C.primary : (isDark ? "#2A2A2A" : "#E5E7EB"), borderColor: C.border }]}>
                    <Text style={[s.sliderPillText, { color: loanTenure === v ? "#fff" : C.foreground }]}>{v}y</Text>
                  </Pressable>
                ))}
              </View>
            </CalcRow>
          </View>

          {/* Summary */}
          <View style={[s.calcSummary, { borderTopColor: C.border }]}>
            {[
              { label: "Loan Amount", value: `₹${(loanAmount / 100000).toFixed(1)}L` },
              { label: "Total Interest", value: `₹${(totalInterest / 100000).toFixed(1)}L` },
              { label: "Total Payment", value: `₹${(totalPayment / 100000).toFixed(1)}L` },
            ].map((r) => (
              <View key={r.label} style={s.calcSummaryRow}>
                <Text style={[s.calcSummaryLabel, { color: C.mutedForeground }]}>{r.label}</Text>
                <Text style={[s.calcSummaryValue, { color: C.foreground }]}>{r.value}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>
    );
  };

  // ── Desktop WhatsApp / Call helper ───────────────────────────────────────────
  const handleDesktopWhatsApp = () => {
    if (!listing.contactPhone) return;
    const digits = listing.contactPhone.replace(/\D/g, "");
    const deepLink = `https://blab.in/property/${listing.id}`;
    const msg = encodeURIComponent(
      `Hi ${listing.contactName ?? "there"}, I'm interested in your property at ${listing.address}, ${listing.city} listed on Blab.\n\nView it here: ${deepLink}`
    );
    // wa.me opens WhatsApp Web / desktop app if installed
    const url = `https://wa.me/${digits}?text=${msg}`;
    if (Platform.OS === "web") {
      (window as any).open(url, "_blank", "noopener");
    } else {
      Linking.openURL(url);
    }
  };

  // ── Tour & Contact CTA widget (Contact-first ordering) ────────────────────────
  const renderCTAWidget = () => {
    const agentName    = listing.contactName ?? "Agent";
    const agentInitial = agentName.charAt(0).toUpperCase();
    // When an assigned realtor is handling the listing, override the role label
    const isRealtorHandled = !!(listing as any).handledByRealtor;
    const roleLabel = isRealtorHandled ? "Licensed Realtor · Blab" : getRoleLabel(listing.listerType);
    const hasPhone  = !!listing.contactPhone;

    return (
      <View style={[s.ctaWidget, { backgroundColor: C.card, borderColor: C.border }]}>

        {/* ── AGENT CARD (homes.com style, contact-first) ── */}
        <View style={[s.desktopAgentCard, { borderColor: C.primary + "44", backgroundColor: isDark ? "#1A0A00" : "#FFF8F5" }]}>
          {/* Agent photo or initials */}
          {listing.contactPhotoUrl ? (
            <Image
              source={{ uri: listing.contactPhotoUrl }}
              style={s.desktopAgentPhoto as any}
              contentFit="cover"
            />
          ) : (
            <View style={[s.desktopAgentAvatarFallback, { backgroundColor: C.primary }]}>
              <Text style={s.desktopAgentAvatarText}>{agentInitial}</Text>
            </View>
          )}

          <View style={s.desktopAgentInfo}>
            <View style={s.desktopAgentNameRow}>
              <Text style={[s.desktopAgentName, { color: C.foreground }]} numberOfLines={1}>{agentName}</Text>
              <View style={[s.desktopAgentBadge, { backgroundColor: isRealtorHandled ? "#10B981" : C.primary }]}>
                <Text style={s.desktopAgentBadgeText}>
                  {isRealtorHandled ? "Realtor" : getRoleBadge(listing.listerType)}
                </Text>
              </View>
            </View>
            <Text style={[s.desktopAgentRole, { color: C.mutedForeground }]} numberOfLines={1}>{roleLabel}</Text>
          </View>
        </View>

        {/* ── CONTACT ACTIONS ── */}
        <View style={s.desktopContactActions}>
          {/* WhatsApp CTA — primary if phone available */}
          {hasPhone ? (
            <Pressable
              onPress={handleDesktopWhatsApp}
              style={s.desktopWhatsAppBtn}
            >
              <MaterialCommunityIcons name="whatsapp" size={18} color="#fff" />
              <Text style={s.desktopWhatsAppText}>Message on WhatsApp</Text>
            </Pressable>
          ) : null}

          {/* Call link */}
          {hasPhone && (
            <Pressable
              onPress={() => Linking.openURL(`tel:${listing.contactPhone}`)}
              style={[s.desktopCallBtn, { borderColor: C.border }]}
            >
              <Ionicons name="call-outline" size={16} color={C.primary} />
              <Text style={[s.desktopCallBtnText, { color: C.primary }]}>
                {listing.contactPhone}
              </Text>
            </Pressable>
          )}
        </View>

        {/* Message form — secondary fallback */}
        {!hasPhone || !contactSent ? (
          <>
            <View style={[s.ctaDivider, { backgroundColor: C.border }]}>
              <Text style={[s.ctaDividerText, { color: C.mutedForeground, backgroundColor: C.card }]}>
                {hasPhone ? "or send a message" : "Contact Agent"}
              </Text>
            </View>

            {contactSent ? (
              <View style={[s.contactSuccess, { backgroundColor: isDark ? "#1A2B1A" : "#F0FDF4", borderColor: isDark ? "#2D4A2D" : "#BBF7D0" }]}>
                <Ionicons name="checkmark-circle-outline" size={20} color="#16A34A" />
                <Text style={[s.contactSuccessText, { color: isDark ? "#4ADE80" : "#15803D" }]}>Message sent! Agent will reach out soon.</Text>
              </View>
            ) : (
              <>
                <TextInput
                  style={[s.input, { backgroundColor: isDark ? "#1A1A1A" : "#F9FAFB", borderColor: C.border, color: C.foreground }]}
                  placeholder="Your name"
                  placeholderTextColor={C.mutedForeground}
                  value={contactName}
                  onChangeText={setContactName}
                />
                <TextInput
                  style={[s.input, { backgroundColor: isDark ? "#1A1A1A" : "#F9FAFB", borderColor: C.border, color: C.foreground }]}
                  placeholder="Phone number"
                  placeholderTextColor={C.mutedForeground}
                  keyboardType="phone-pad"
                  value={contactPhone}
                  onChangeText={setContactPhone}
                />
                <TextInput
                  style={[s.input, s.inputMultiline, { backgroundColor: isDark ? "#1A1A1A" : "#F9FAFB", borderColor: C.border, color: C.foreground }]}
                  placeholder="I'm interested in this property…"
                  placeholderTextColor={C.mutedForeground}
                  multiline
                  numberOfLines={3}
                  value={contactMessage}
                  onChangeText={setContactMessage}
                />
                <Pressable
                  onPress={() => { if (contactName && contactPhone) setContactSent(true); }}
                  style={[s.ctaSecondary, { borderColor: C.primary }]}
                >
                  <Ionicons name="mail-outline" size={16} color={C.primary} />
                  <Text style={[s.ctaSecondaryText, { color: C.primary }]}>Send Message</Text>
                </Pressable>
              </>
            )}
          </>
        ) : (
          contactSent && (
            <View style={[s.contactSuccess, { backgroundColor: isDark ? "#1A2B1A" : "#F0FDF4", borderColor: isDark ? "#2D4A2D" : "#BBF7D0" }]}>
              <Ionicons name="checkmark-circle-outline" size={20} color="#16A34A" />
              <Text style={[s.contactSuccessText, { color: isDark ? "#4ADE80" : "#15803D" }]}>Message sent! Agent will reach out soon.</Text>
            </View>
          )
        )}

        {/* ── DIVIDER ── */}
        <View style={[s.ctaDivider, { backgroundColor: C.border }]}>
          <Text style={[s.ctaDividerText, { color: C.mutedForeground, backgroundColor: C.card }]}>or</Text>
        </View>

        {/* ── REQUEST A TOUR (below contact) ── */}
        <Text style={[s.ctaSectionTitle, { color: C.foreground }]}>Request a Tour</Text>

        {/* Tour type toggle */}
        <View style={[s.tourTypeRow, { backgroundColor: isDark ? "#1E1E1E" : "#F3F4F6" }]}>
          {(["in-person", "video"] as const).map((t) => (
            <Pressable
              key={t}
              onPress={() => setTourType(t)}
              style={[s.tourTypePill, tourType === t && { backgroundColor: C.card, shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 2 }]}
            >
              <Ionicons name={t === "in-person" ? "person-outline" : "videocam-outline"} size={14} color={tourType === t ? C.primary : C.mutedForeground} />
              <Text style={[s.tourTypeText, { color: tourType === t ? C.primary : C.mutedForeground }, tourType === t && { fontWeight: "700" }]}>
                {t === "in-person" ? "In person" : "Video tour"}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Date carousel */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16 }} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
          {TOUR_DATES.map((date, i) => {
            const active = selectedDate === i;
            return (
              <Pressable
                key={i}
                onPress={() => setSelectedDate(i)}
                style={[s.datePill, { borderColor: active ? C.primary : C.border, backgroundColor: active ? C.primary : C.card }]}
              >
                <Text style={[s.datePillDay, { color: active ? "#fff" : C.mutedForeground }]}>
                  {DAYS[date.getDay()]}
                </Text>
                <Text style={[s.datePillNum, { color: active ? "#fff" : C.foreground }]}>
                  {date.getDate()}
                </Text>
                <Text style={[s.datePillMon, { color: active ? "rgba(255,255,255,0.8)" : C.mutedForeground }]}>
                  {MONTHS[date.getMonth()]}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Time slots */}
        <View style={s.timeSlotsGrid}>
          {TOUR_TIMES.map((t) => {
            const active = selectedTime === t;
            return (
              <Pressable
                key={t}
                onPress={() => setSelectedTime(active ? null : t)}
                style={[s.timeSlot, { borderColor: active ? C.primary : C.border, backgroundColor: active ? (isDark ? "#2D0D00" : "#FFF7F5") : C.card }]}
              >
                <Text style={[s.timeSlotText, { color: active ? C.primary : C.foreground }]}>{t}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* Request tour button */}
        <Pressable style={[s.ctaPrimary, { backgroundColor: C.primary }]}>
          <Ionicons name="calendar-outline" size={16} color="#fff" />
          <Text style={s.ctaPrimaryText}>
            {selectedTime ? `Request tour · ${TOUR_TIMES[TOUR_DATES[selectedDate].getDay() % TOUR_TIMES.length]}` : "Request a tour"}
          </Text>
        </Pressable>

      </View>
    );
  };

  // ── Fullscreen photo lightbox (presentation view) ───────────────────────
  const renderLightbox = () => {
    const isLandscape = winW > winH;

    return (
      <Modal
        visible={showAllPhotos}
        animationType="fade"
        statusBarTranslucent
        presentationStyle="fullScreen"
        supportedOrientations={["portrait", "landscape", "landscape-left", "landscape-right"]}
        onRequestClose={() => setShowAllPhotos(false)}
      >
        <View style={s.lbRoot}>
          {/* Tappable photo area */}
          <ScrollView
            ref={lightboxScrollRef}
            horizontal pagingEnabled
            showsHorizontalScrollIndicator={false}
            style={{ flex: 1 }}
            contentOffset={{ x: activePhotoIdx * winW, y: 0 }}
            onMomentumScrollEnd={(e) => {
              const x = e.nativeEvent.contentOffset.x;
              setActivePhotoIdx(Math.round(x / winW));
            }}
            scrollEventThrottle={32}
          >
            {photos.map((url, i) => (
              <Pressable
                key={i}
                style={{ width: winW, height: winH, justifyContent: "center", backgroundColor: "#000" }}
                onPress={() => setLbShowChrome(!lbShowChrome)}
              >
                <Image
                  source={{ uri: url }}
                  style={{ width: winW, height: winH }}
                  contentFit={isLandscape ? "cover" : "contain"}
                />
              </Pressable>
            ))}
          </ScrollView>

          {/* Chrome: toggle on tap */}
          {lbShowChrome && (
            <>
              {/* Top bar: X | Photos + counter | ♡ */}
              <View style={s.lbTopBar} pointerEvents="box-none">
                <Pressable onPress={() => setShowAllPhotos(false)} style={s.lbClose}>
                  <Ionicons name="close" size={26} color="#fff" />
                </Pressable>
                <View style={{ alignItems: "center" }}>
                  <Text style={s.lbTitle}>Photos</Text>
                  <Text style={s.lbCounter}>{activePhotoIdx + 1} of {photos.length}</Text>
                </View>
                <Pressable onPress={() => setFavorited(!favorited)} style={s.lbClose}>
                  <Ionicons
                    name={favorited ? "heart" : "heart-outline"}
                    size={24}
                    color={favorited ? "#EF4444" : "#fff"}
                  />
                </Pressable>
              </View>

              {/* Prev / Next arrows */}
              {activePhotoIdx > 0 && (
                <Pressable
                  style={[s.lbArrow, s.lbArrowLeft]}
                  onPress={() => {
                    const next = activePhotoIdx - 1;
                    setActivePhotoIdx(next);
                    lightboxScrollRef.current?.scrollTo({ x: next * winW, animated: true });
                  }}
                >
                  <Ionicons name="chevron-back" size={28} color="#fff" />
                </Pressable>
              )}
              {activePhotoIdx < photos.length - 1 && (
                <Pressable
                  style={[s.lbArrow, s.lbArrowRight]}
                  onPress={() => {
                    const next = activePhotoIdx + 1;
                    setActivePhotoIdx(next);
                    lightboxScrollRef.current?.scrollTo({ x: next * winW, animated: true });
                  }}
                >
                  <Ionicons name="chevron-forward" size={28} color="#fff" />
                </Pressable>
              )}

              {/* Bottom dot indicators */}
              <View style={s.lbDots} pointerEvents="none">
                {photos.slice(0, 7).map((_, i) => (
                  <View key={i} style={[s.lbDot, i === activePhotoIdx && s.lbDotActive]} />
                ))}
              </View>
            </>
          )}
        </View>
      </Modal>
    );
  };



  // ── Native WhatsApp / SMS contact helper ─────────────────────────────────────
  const handleNativeContact = async () => {
    const phone = listing.contactPhone;
    if (!phone) return;

    // Strip all non-digits (wa.me expects digits only, no '+')
    const digits = phone.replace(/\D/g, "");

    // Property deep link
    const deepLink = `https://blab.in/property/${listing.id}`;
    const msg = encodeURIComponent(
      `Hi ${listing.contactName ?? "there"}, I'm interested in your property at ${listing.address}, ${listing.city} listed on Blab.\n\nView it here: ${deepLink}`
    );

    // Use https://wa.me/ — universal link that works whether WhatsApp is installed
    // or not (opens WhatsApp Web). No LSApplicationQueriesSchemes entry needed.
    const waUrl = `https://wa.me/${digits}?text=${msg}`;
    Linking.openURL(waUrl).catch(() => {
      // Last resort fallback: SMS
      // iOS uses semicolon before body=, Android uses ?body=
      const smsUrl = Platform.OS === "ios"
        ? `sms:${phone};body=${msg}`
        : `sms:${phone}?body=${msg}`;
      Linking.openURL(smsUrl).catch(() => {});
    });
  };

  const handleNativeCall = () => {
    const phone = listing.contactPhone;
    if (phone) Linking.openURL(`tel:${phone}`);
  };

  // ── Mobile sticky bottom CTA ──────────────────────────────────────────────────
  const renderMobileBottomBar = () => {
    const isRealtorHandled = !!(listing as any).handledByRealtor;
    // Owner self-list with no realtor assigned: show simple Call + Tour buttons
    const isOwner  = listing.listerType === "owner" && !isRealtorHandled;
    const name     = listing.contactName ?? "Agent";
    const initial  = name.charAt(0).toUpperCase();
    const roleLabel = isRealtorHandled ? "Licensed Realtor · Blab" : getRoleLabel(listing.listerType);
    const hasPhone = !!listing.contactPhone;

    if (isOwner) {
      // Owner self-list: simple Call + Request Tour
      return (
        <View style={[s.mobileBottomBar, { backgroundColor: C.card, borderTopColor: C.border }]}>
          <Pressable
            style={[s.mobileBottomBtnSecondary, { borderColor: C.primary }]}
            onPress={handleNativeCall}
          >
            <Ionicons name="call-outline" size={18} color={C.primary} />
            <Text style={[s.mobileBottomBtnTextSecondary, { color: C.primary }]}>Call Owner</Text>
          </Pressable>
          <Pressable style={[s.mobileBottomBtnPrimary, { backgroundColor: C.primary }]}>
            <Ionicons name="calendar-outline" size={18} color="#fff" />
            <Text style={s.mobileBottomBtnTextPrimary}>Request Tour</Text>
          </Pressable>
        </View>
      );
    }

    // Realtor / Developer / Broker — homes.com style elevated agent bar
    return (
      <View style={[s.agentBottomBar, { backgroundColor: C.card, borderTopColor: C.border }]}>
        {/* Left: avatar + name + role */}
        <View style={s.agentBarLeft}>
          {listing.contactPhotoUrl ? (
            <Image
              source={{ uri: listing.contactPhotoUrl }}
              style={[s.agentBarAvatar, { overflow: "hidden" }] as any}
              contentFit="cover"
            />
          ) : (
            <View style={[s.agentBarAvatar, { backgroundColor: C.primary }]}>
              <Text style={s.agentBarAvatarText}>{initial}</Text>
            </View>
          )}
          <View style={s.agentBarInfo}>
            <View style={s.agentBarNameRow}>
              <Text style={[s.agentBarName, { color: C.foreground }]} numberOfLines={1}>{name}</Text>
              <View style={[s.agentBarBadge, { backgroundColor: isRealtorHandled ? "#10B981" : C.primary }]}>
                <Text style={s.agentBarBadgeText}>
                  {isRealtorHandled ? "Realtor" : getRoleBadge(listing.listerType)}
                </Text>
              </View>
            </View>
            <Text style={[s.agentBarRole, { color: C.mutedForeground }]} numberOfLines={1}>{roleLabel}</Text>
          </View>
        </View>

        {/* Right: Call circle + WhatsApp/Contact button */}
        <View style={s.agentBarActions}>
          <Pressable
            style={[s.agentCallCircle, { borderColor: C.border }]}
            onPress={handleNativeCall}
          >
            <Ionicons name="call-outline" size={18} color={C.primary} />
          </Pressable>
          {/* WhatsApp green — always active */}
          <Pressable
            style={[s.agentContactBtn, { backgroundColor: "#25D366" }]}
            onPress={handleNativeContact}
          >
            <MaterialCommunityIcons name="whatsapp" size={15} color="#fff" />
            <Text style={s.agentContactBtnText}>WhatsApp</Text>
          </Pressable>
        </View>
      </View>
    );
  };


  // ── Mobile quick-stats (below photo, above cards) ────────────────────────────
  const renderMobileQuickStats = () => {
    const beds   = listing.bedrooms;
    const baths  = listing.bathrooms;
    const sqft   = listing.builtUpArea;

    return (
      <View style={[s.quickStats, { backgroundColor: C.card }]}>
        {/* Status pill */}
        <View style={s.statusRow}>
          <View style={[s.statusPill, { backgroundColor: listing.listingType === "rent" ? "#EFF6FF" : "#ECFDF5" }]}>
            <Text style={[s.statusPillText, { color: listing.listingType === "rent" ? "#1D4ED8" : "#047857" }]}>
              {listing.listingType === "rent" ? "For Rent" : "For Sale"}
            </Text>
          </View>
        </View>

        {/* Price */}
        <Text style={[s.mobilePriceHeading, { color: C.foreground }]}>
          {formatPriceFull(listing.price)}
          {listing.listingType === "rent" && (
            <Text style={[s.priceUnit, { color: C.mutedForeground }]}> /mo</Text>
          )}
        </Text>

        {/* Beds / baths / sqft inline */}
        <View style={s.mobileSpecRow}>
          {beds != null && (
            <>
              <Ionicons name="bed-outline" size={14} color={C.mutedForeground} />
              <Text style={[s.mobileSpecText, { color: C.foreground }]}>{beds} beds</Text>
            </>
          )}
          {beds != null && baths != null && <Text style={[s.mobileSpecDot, { color: C.mutedForeground }]}>·</Text>}
          {baths != null && (
            <>
              <Ionicons name="water-outline" size={14} color={C.mutedForeground} />
              <Text style={[s.mobileSpecText, { color: C.foreground }]}>{baths} baths</Text>
            </>
          )}
          {sqft != null && (
            <>
              <Text style={[s.mobileSpecDot, { color: C.mutedForeground }]}>·</Text>
              <Ionicons name="resize-outline" size={14} color={C.mutedForeground} />
              <Text style={[s.mobileSpecText, { color: C.foreground }]}>{sqft.toLocaleString("en-IN")} sqft</Text>
            </>
          )}
        </View>

        {/* Address */}
        <Text style={[s.mobileAddress, { color: C.mutedForeground }]} numberOfLines={2}>
          {listing.address}, {listing.city}
        </Text>

        {/* EMI estimate */}
        {listing.listingType !== "rent" && listing.price > 0 && (
          <View style={[s.emiEstimateRow, { backgroundColor: isDark ? "#1E2B3A" : "#EFF6FF", borderColor: isDark ? "#1E3A5F" : "#BFDBFE" }]}>
            <Text style={[s.emiEstimateText, { color: isDark ? "#93C5FD" : "#1D4ED8" }]}>
              Est. EMI: ₹{calcEMI(listing.price * 0.8, 8.5, 20).toLocaleString("en-IN")}/mo
            </Text>
            <Text style={[s.emiEstimateLink, { color: C.primary }]}> · Get pre-approved</Text>
          </View>
        )}
      </View>
    );
  };

  // ── Mobile section cards ─────────────────────────────────────────────────────
  const renderMobileOverviewCard = () => (
    <View
      style={[s.mobileCard, { backgroundColor: C.card }]}
      onLayout={(e) => { sectionOffsets.current.overview = e.nativeEvent.layout.y; }}
    >
      <Text style={[s.mobileCardHeading, { color: C.foreground }]}>Overview</Text>
      <Text style={[s.bodyText, { color: C.mutedForeground }]} numberOfLines={showMoreDesc ? undefined : 4}>
        {listing.description ?? "A beautifully crafted property in one of the most sought-after localities. Spacious rooms, modern finishes, and excellent connectivity to key areas of the city."}
      </Text>
      <Pressable onPress={() => setShowMoreDesc(!showMoreDesc)} style={{ marginTop: 10 }}>
        <Text style={{ color: C.primary, fontWeight: "700", fontSize: 14 }}>
          {showMoreDesc ? "Show less ↑" : "Show more ↓"}
        </Text>
      </Pressable>
    </View>
  );

  const renderMobileFeaturesCard = () => {
    const pricePerSqft = listing.builtUpArea && listing.builtUpArea > 0
      ? Math.round(listing.price / listing.builtUpArea) : null;

    const factItems = [
      { icon: "trending-up-outline" as const, val: listing.marketEstimate ? formatPrice(listing.marketEstimate) : "—", sub: "Blab Estimate" },
      { icon: "business-outline" as const, val: listing.propertyType.charAt(0).toUpperCase() + listing.propertyType.slice(1), sub: "Type" },
      { icon: "cash-outline" as const, val: pricePerSqft ? `₹${pricePerSqft.toLocaleString("en-IN")}/sqft` : "—", sub: "Price/sqft" },
      { icon: "calendar-outline" as const, val: listing.yearBuilt ? `Built ${listing.yearBuilt}` : "N/A", sub: "Year built" },
      { icon: "expand-outline" as const, val: listing.plotArea ? `${listing.plotArea.toLocaleString("en-IN")} sq.yd` : "N/A", sub: "Lot size" },
      { icon: "construct-outline" as const, val: listing.maintenance ? `₹${listing.maintenance}/mo` : "N/A", sub: "Maintenance" },
    ];

    return (
      <View
        style={[s.mobileCard, { backgroundColor: C.card }]}
        onLayout={(e) => { sectionOffsets.current.features = e.nativeEvent.layout.y; }}
      >
        <Text style={[s.mobileCardHeading, { color: C.foreground }]}>Facts & Features</Text>

        {/* 2-col grid */}
        <View style={s.factsGrid}>
          {factItems.map((item, i) => (
            <View
              key={item.sub}
              style={[
                s.factItem,
                i >= 2 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
                i % 2 === 1 && { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: C.border },
              ]}
            >
              <Ionicons name={item.icon} size={18} color={C.primary} />
              <View style={{ flex: 1 }}>
                <Text style={[s.factItemVal, { color: C.foreground }]} numberOfLines={1}>{item.val}</Text>
                <Text style={[s.factItemSub, { color: C.mutedForeground }]}>{item.sub}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Feature pills */}
        {features.length > 0 && (
          <>
            <View style={[s.divider, { backgroundColor: C.border, marginVertical: 14 }]} />
            <View style={s.pillsWrap}>
              {features.slice(0, 8).map((f) => (
                <View key={f} style={[s.featurePill, { backgroundColor: isDark ? "#1E1E1E" : "#F3F4F6", borderColor: C.border }]}>
                  <Ionicons name={FEATURE_ICONS[f] ?? "checkmark-outline"} size={12} color={C.primary} />
                  <Text style={[s.pillText, { color: C.foreground }]}>{f}</Text>
                </View>
              ))}
            </View>
          </>
        )}
      </View>
    );
  };

  const renderMobileNeighborhoodCard = () => (
    <View
      style={[s.mobileCard, { backgroundColor: C.card }]}
      onLayout={(e) => { sectionOffsets.current.neighborhood = e.nativeEvent.layout.y; }}
    >
      <Text style={[s.mobileCardHeading, { color: C.foreground }]}>Neighborhood</Text>
      <View style={[s.neighborhoodBox, { backgroundColor: isDark ? "#111" : "#F3F4F6", borderColor: C.border, minHeight: 140 }]}>
        <Ionicons name="map-outline" size={40} color={C.mutedForeground} />
        <Text style={[s.bodyText, { color: C.mutedForeground, textAlign: "center", marginTop: 10 }]}>
          Interactive map with transit, schools & essentials coming soon.
        </Text>
      </View>
    </View>
  );

  const renderMobileCalculatorCard = () => {
    const loanAmount = listing.price * (1 - downPct / 100);
    const totalPayment = emi * loanTenure * 12;
    const totalInterest = totalPayment - loanAmount;
    return (
      <View
        style={[s.mobileCard, { backgroundColor: C.card }]}
        onLayout={(e) => { sectionOffsets.current.calculator = e.nativeEvent.layout.y; }}
      >
        <Text style={[s.mobileCardHeading, { color: C.foreground }]}>EMI Calculator</Text>

        {/* EMI result banner */}
        <View style={[s.emiResult, { backgroundColor: C.primary, borderRadius: 12, marginBottom: 16 }]}>
          <Text style={s.emiResultLabel}>Monthly EMI</Text>
          <Text style={s.emiResultAmount}>₹{emi.toLocaleString("en-IN")}</Text>
          <Text style={s.emiResultSub}>Principal + Interest</Text>
        </View>

        <CalcRow label="Down Payment" value={`${downPct}%`} sub={`₹${(listing.price * downPct / 100 / 100000).toFixed(1)}L`}>
          <View style={s.sliderRow}>
            {[10, 15, 20, 25, 30].map((v) => (
              <Pressable key={v} onPress={() => setDownPct(v)} style={[s.sliderPill, { backgroundColor: downPct === v ? C.primary : (isDark ? "#2A2A2A" : "#E5E7EB"), borderColor: C.border }]}>
                <Text style={[s.sliderPillText, { color: downPct === v ? "#fff" : C.foreground }]}>{v}%</Text>
              </Pressable>
            ))}
          </View>
        </CalcRow>
        <View style={[s.calcDivider, { backgroundColor: C.border }]} />
        <CalcRow label="Interest Rate" value={`${loanRate}% p.a.`}>
          <View style={s.sliderRow}>
            {[7.5, 8.0, 8.5, 9.0, 9.5].map((v) => (
              <Pressable key={v} onPress={() => setLoanRate(v)} style={[s.sliderPill, { backgroundColor: loanRate === v ? C.primary : (isDark ? "#2A2A2A" : "#E5E7EB"), borderColor: C.border }]}>
                <Text style={[s.sliderPillText, { color: loanRate === v ? "#fff" : C.foreground }]}>{v}%</Text>
              </Pressable>
            ))}
          </View>
        </CalcRow>
        <View style={[s.calcDivider, { backgroundColor: C.border }]} />
        <CalcRow label="Loan Tenure" value={`${loanTenure} yrs`}>
          <View style={s.sliderRow}>
            {[10, 15, 20, 25, 30].map((v) => (
              <Pressable key={v} onPress={() => setLoanTenure(v)} style={[s.sliderPill, { backgroundColor: loanTenure === v ? C.primary : (isDark ? "#2A2A2A" : "#E5E7EB"), borderColor: C.border }]}>
                <Text style={[s.sliderPillText, { color: loanTenure === v ? "#fff" : C.foreground }]}>{v}y</Text>
              </Pressable>
            ))}
          </View>
        </CalcRow>

        <View style={[s.calcSummary, { borderTopColor: C.border }]}>
          {[
            { label: "Loan Amount", value: `₹${(loanAmount / 100000).toFixed(1)}L` },
            { label: "Total Interest", value: `₹${(totalInterest / 100000).toFixed(1)}L` },
            { label: "Total Payment", value: `₹${(totalPayment / 100000).toFixed(1)}L` },
          ].map((r) => (
            <View key={r.label} style={s.calcSummaryRow}>
              <Text style={[s.calcSummaryLabel, { color: C.mutedForeground }]}>{r.label}</Text>
              <Text style={[s.calcSummaryValue, { color: C.foreground }]}>{r.value}</Text>
            </View>
          ))}
        </View>
      </View>
    );
  };

  const renderMobileCTACard = () => (
    <View style={[s.mobileCard, { backgroundColor: C.card }]}>
      <Text style={[s.mobileCardHeading, { color: C.foreground }]}>Request a Tour</Text>

      {/* Tour type toggle */}
      <View style={[s.tourTypeRow, { backgroundColor: isDark ? "#1E1E1E" : "#F3F4F6" }]}>
        {(["in-person", "video"] as const).map((t) => (
          <Pressable
            key={t}
            onPress={() => setTourType(t)}
            style={[s.tourTypePill, tourType === t && { backgroundColor: C.card, shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 2 }]}
          >
            <Ionicons name={t === "in-person" ? "person-outline" : "videocam-outline"} size={14} color={tourType === t ? C.primary : C.mutedForeground} />
            <Text style={[s.tourTypeText, { color: tourType === t ? C.primary : C.mutedForeground }, tourType === t && { fontWeight: "700" }]}>
              {t === "in-person" ? "In person" : "Video tour"}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Date strip */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16, marginTop: 12 }} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
        {TOUR_DATES.map((date, i) => {
          const active = selectedDate === i;
          return (
            <Pressable
              key={i}
              onPress={() => setSelectedDate(i)}
              style={[s.datePill, { borderColor: active ? C.primary : C.border, backgroundColor: active ? C.primary : C.card }]}
            >
              <Text style={[s.datePillDay, { color: active ? "#fff" : C.mutedForeground }]}>{DAYS[date.getDay()]}</Text>
              <Text style={[s.datePillNum, { color: active ? "#fff" : C.foreground }]}>{date.getDate()}</Text>
              <Text style={[s.datePillMon, { color: active ? "rgba(255,255,255,0.8)" : C.mutedForeground }]}>{MONTHS[date.getMonth()]}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Time slots */}
      <View style={[s.timeSlotsGrid, { marginTop: 12 }]}>
        {TOUR_TIMES.map((t) => {
          const active = selectedTime === t;
          return (
            <Pressable
              key={t}
              onPress={() => setSelectedTime(active ? null : t)}
              style={[s.timeSlot, { borderColor: active ? C.primary : C.border, backgroundColor: active ? (isDark ? "#2D0D00" : "#FFF7F5") : C.card }]}
            >
              <Text style={[s.timeSlotText, { color: active ? C.primary : C.foreground }]}>{t}</Text>
            </Pressable>
          );
        })}
      </View>

      <Pressable style={[s.ctaPrimary, { backgroundColor: C.primary, marginTop: 14 }]}>
        <Ionicons name="calendar-outline" size={16} color="#fff" />
        <Text style={s.ctaPrimaryText}>Request a tour</Text>
      </Pressable>

    </View>
  );


  // ─────────────────────────────────────────────────────────────────────────────
  //  MAIN RENDER
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <View style={[s.root, { backgroundColor: isDesktop ? C.background : (isDark ? "#111" : "#F0F0F0") }]}>

      {/* ── DESKTOP: solid top bar ── */}
      {isDesktop && (
        <View style={[s.topBar, { backgroundColor: C.card, borderBottomColor: C.border }]}>
          <Pressable onPress={() => router.back()} style={s.backRow}>
            <Ionicons name="chevron-back" size={22} color={C.foreground} />
            <Text style={[s.backText, { color: C.foreground }]}>Back to search</Text>
          </Pressable>
          <View style={s.topBarRight}>
            <Pressable onPress={() => setFavorited(!favorited)} style={s.iconBtn}>
              <Ionicons name={favorited ? "heart" : "heart-outline"} size={20} color={favorited ? "#EF4444" : C.foreground} />
            </Pressable>
            <Pressable style={s.iconBtn} onPress={handleShare}>
              <Ionicons name="share-outline" size={20} color={C.foreground} />
            </Pressable>
          </View>
        </View>
      )}

      {/* ── DESKTOP: tab bar ── */}
      {isDesktop && renderTabBar()}

      {/* ── MOBILE: floating overlay top bar ── */}
      {!isDesktop && (
        <View style={[
          s.topBarOverlay,
          {
            backgroundColor: headerOpaque ? C.card : "transparent",
            borderBottomWidth: headerOpaque ? StyleSheet.hairlineWidth : 0,
            borderBottomColor: C.border,
          },
        ]}>
          <Pressable onPress={() => router.back()} style={s.iconBtn}>
            <Ionicons
              name="close"
              size={24}
              color={headerOpaque ? C.foreground : "#fff"}
            />
          </Pressable>
          <View style={s.topBarRight}>
            <Pressable onPress={() => setFavorited(!favorited)} style={s.iconBtn}>
              <Ionicons
                name={favorited ? "heart" : "heart-outline"}
                size={22}
                color={favorited ? "#EF4444" : (headerOpaque ? C.foreground : "#fff")}
              />
            </Pressable>
            <Pressable style={s.iconBtn} onPress={handleShare}>
              <Ionicons name="share-outline" size={22} color={headerOpaque ? C.foreground : "#fff"} />
            </Pressable>
          </View>
        </View>
      )}

      {/* ── MAIN SCROLL ── */}
      <ScrollView
        ref={mainScrollRef}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: isDesktop ? 60 : 120 }}
      >
        {/* Gallery */}
        {isDesktop && Platform.OS === "web" ? renderDesktopGallery() : renderMobileCarousel()}

        {isDesktop ? (
          /* ── DESKTOP two-column layout ── */
          <View style={s.desktopCols}>
            <View style={s.leftCol}>
              {renderOverview()}
              {renderFeatures()}
              {renderNeighborhood()}
              {renderCalculator()}
            </View>
            <View style={s.rightCol}>
              {renderCTAWidget()}
            </View>
          </View>
        ) : (
          /* ── MOBILE card layout ── */
          <>
            {renderMobileQuickStats()}
            <View style={s.mobileSections}>
              {renderMobileOverviewCard()}
              {renderMobileFeaturesCard()}
              {renderMobileNeighborhoodCard()}
              {renderMobileCalculatorCard()}
              {renderMobileCTACard()}
            </View>
          </>
        )}
      </ScrollView>

      {/* Mobile sticky bottom bar */}
      {!isDesktop && renderMobileBottomBar()}

      {/* Fullscreen photo lightbox */}
      {renderLightbox()}
    </View>
  );
}


// ─── Small helper component ───────────────────────────────────────────────────
function CalcRow({ label, value, sub, children }: { label: string; value: string; sub?: string; children: React.ReactNode }) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const C = isDark ? COLORS.dark : COLORS.light;
  return (
    <View style={{ marginBottom: 16 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 10 }}>
        <Text style={{ fontSize: 13, color: C.mutedForeground, fontWeight: "500" }}>{label}</Text>
        <Text style={{ fontSize: 13, color: C.foreground, fontWeight: "700" }}>
          {value}{sub && <Text style={{ color: C.mutedForeground, fontWeight: "400" }}> ({sub})</Text>}
        </Text>
      </View>
      {children}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  STYLES
// ─────────────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1 },
  fill: { flex: 1 },
  center: { justifyContent: "center", alignItems: "center", gap: 16, padding: 24 },
  loadingText: { fontSize: 14, marginTop: 8, fontWeight: "500" },
  errorTitle: { fontSize: 20, fontWeight: "700", marginTop: 12 },
  backPill: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 999, marginTop: 8 },

  // Top bar
  topBar: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, zIndex: 10,
  },
  backRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  backText: { fontSize: 14, fontWeight: "600" },
  topBarRight: { flexDirection: "row", alignItems: "center", gap: 12 },
  iconBtn: { padding: 8 },

  // Desktop grid gallery
  desktopGrid: {
    flexDirection: "row", height: 480, gap: 4,
    overflow: "hidden",
  },
  heroCell: { flex: 7, overflow: "hidden" },
  heroPic: { width: "100%", height: "100%" },
  thumbGrid: {
    flex: 5, flexDirection: "row", flexWrap: "wrap", gap: 4,
  },
  thumbCell: {
    width: "calc(50% - 2px)" as any, height: "calc(50% - 2px)" as any,
    overflow: "hidden", position: "relative",
  },
  thumbPic: { width: "100%", height: "100%" },
  moreOverlay: {
    position: "absolute", inset: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center", alignItems: "center", gap: 6,
  },
  moreText: { color: "#fff", fontSize: 13, fontWeight: "700" },

  // Carousel
  carouselBadge: {
    position: "absolute", top: 12, right: 12,
    flexDirection: "row", alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.65)",
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999,
  },
  carouselBadgeText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  viewAllBtn: {
    position: "absolute", bottom: 38, right: 12,
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
  },
  viewAllBtnText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  dotRow: {
    position: "absolute", bottom: 12, left: 0, right: 0,
    flexDirection: "row", justifyContent: "center", gap: 5,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.45)" },
  dotActive: { backgroundColor: "#fff", width: 16, borderRadius: 3 },

  // Tab bar — always present, sticky on web via position:sticky
  tabBar: {
    borderBottomWidth: 1, zIndex: 20,
    ...(Platform.OS === "web" ? { position: "sticky" as any, top: 0 } : {}),
  },
  tabBtn: {
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 2, borderBottomColor: "transparent",
  },
  tabLabel: { fontSize: 13, fontWeight: "600" },
  tabLabelActive: { fontWeight: "700" },

  // Layout
  desktopCols: {
    flexDirection: "row", maxWidth: 1280, alignSelf: "center",
    width: "100%", paddingHorizontal: 24, marginTop: 24, gap: 32,
  },
  mobileCols: { flexDirection: "column", paddingHorizontal: 16, marginTop: 16 },
  leftCol: { flex: 3, minWidth: 0 },
  rightCol: {
    width: 380, flexShrink: 0, alignSelf: "flex-start",
    ...(Platform.OS === "web" ? {
      position: "sticky" as any,
      top: 80,
      maxHeight: "calc(100vh - 100px)" as any,
      overflowY: "auto" as any,
    } : {}),
  },
  mobileCtaWrap: { marginTop: 32, marginBottom: 16 },

  // Sections
  section: { paddingVertical: 20 },
  sectionHeading: { fontSize: 18, fontWeight: "800", marginBottom: 14, letterSpacing: -0.3 },
  bodyText: { fontSize: 14, lineHeight: 22, fontWeight: "400" },
  divider: { height: 1, marginVertical: 16 },

  // Overview
  statusRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  statusPillText: { fontSize: 11, fontWeight: "700", letterSpacing: 0.3, textTransform: "uppercase" },

  // Zillow-exact overview top block
  overviewTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 24,
    marginBottom: 20,
  },
  overviewLeft: { flex: 1, minWidth: 0 },
  overviewRight: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 16,
    paddingTop: 8,
    flexShrink: 0,
  },
  bigSpecCol: { alignItems: "center", minWidth: 44 },
  bigSpecNum: { fontSize: 30, fontWeight: "900", letterSpacing: -0.5 },
  bigSpecLabel: { fontSize: 13, fontWeight: "500", marginTop: 2 },
  bigSpecDivider: { width: 1, height: 36, marginTop: 4 },

  priceHeading: { fontSize: 26, fontWeight: "900", letterSpacing: -0.8, marginBottom: 6 },
  priceUnit: { fontSize: 17, fontWeight: "500" },
  addressText: { fontSize: 14, fontWeight: "500", marginBottom: 10 },

  // EMI estimate inline row (Zillow's "Est.: $4,435/mo  Get pre-qualified")
  emiEstimateRow: {
    flexDirection: "row", alignItems: "center", flexWrap: "wrap",
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1,
    gap: 2, alignSelf: "flex-start",
  },
  emiEstimateText: { fontSize: 14, fontWeight: "600" },
  emiEstimateLink: { fontSize: 14, fontWeight: "700" },

  // Fact tablets grid — Zillow 3-column table style
  factTabletsGrid: {
    flexDirection: "row", flexWrap: "wrap",
    borderWidth: 1, borderRadius: 10, overflow: "hidden",
    marginBottom: 4,
  },
  factTablet: {
    width: "33.333%" as any,
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 14, paddingVertical: 14,
  },
  factTabletText: { fontSize: 13, fontWeight: "500", flex: 1 },

  // Features
  pillsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 20 },
  featurePill: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1,
  },
  pillText: { fontSize: 12, fontWeight: "600" },
  accordion: { borderWidth: 1, borderRadius: 12, marginBottom: 8, overflow: "hidden" },
  accordionHeader: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 14,
  },
  accordionTitle: { fontSize: 15, fontWeight: "700" },
  accordionBody: { paddingHorizontal: 16, paddingBottom: 16, gap: 12 },
  accordionRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  accordionRowText: { fontSize: 14, fontWeight: "500" },

  // Neighborhood
  neighborhoodBox: {
    borderWidth: 1, borderRadius: 16, minHeight: 200,
    justifyContent: "center", alignItems: "center", padding: 32,
  },

  // EMI Calculator
  calcCard: { borderWidth: 1, borderRadius: 16, overflow: "hidden", marginTop: 4 },
  emiResult: {
    padding: 24, alignItems: "center",
  },
  emiResultLabel: { color: "rgba(255,255,255,0.75)", fontSize: 12, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.8 },
  emiResultAmount: { color: "#fff", fontSize: 36, fontWeight: "900", letterSpacing: -1, marginTop: 4 },
  emiResultSub: { color: "rgba(255,255,255,0.65)", fontSize: 12, marginTop: 4 },
  calcInputs: { padding: 20 },
  sliderRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  sliderPill: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1,
  },
  sliderPillText: { fontSize: 13, fontWeight: "600" },
  calcDivider: { height: 1, marginBottom: 16 },
  calcSummary: { borderTopWidth: 1, padding: 16, gap: 10 },
  calcSummaryRow: { flexDirection: "row", justifyContent: "space-between" },
  calcSummaryLabel: { fontSize: 13, fontWeight: "500" },
  calcSummaryValue: { fontSize: 13, fontWeight: "700" },

  // CTA Widget
  ctaWidget: {
    borderWidth: 1, borderRadius: 20, padding: 20, gap: 14,
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08, shadowRadius: 16, elevation: 4,
  },
  // Desktop agent card (homes.com style)
  desktopAgentCard: {
    flexDirection: "row", alignItems: "center", gap: 12,
    borderWidth: 1.5, borderRadius: 14,
    padding: 14, borderLeftWidth: 4,
  },
  desktopAgentPhoto: {
    width: 52, height: 52, borderRadius: 26, flexShrink: 0, overflow: "hidden",
  },
  desktopAgentAvatarFallback: {
    width: 52, height: 52, borderRadius: 26, flexShrink: 0,
    justifyContent: "center", alignItems: "center",
  },
  desktopAgentAvatarText: { color: "#fff", fontSize: 20, fontWeight: "800" },
  desktopAgentInfo: { flex: 1, minWidth: 0 },
  desktopAgentNameRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 3 },
  desktopAgentName: { fontSize: 15, fontWeight: "800", flexShrink: 1 },
  desktopAgentBadge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 5, flexShrink: 0 },
  desktopAgentBadgeText: { color: "#fff", fontSize: 10, fontWeight: "700", letterSpacing: 0.3 },
  desktopAgentRole: { fontSize: 12, fontWeight: "400" },
  // Desktop contact action row
  desktopContactActions: { gap: 8 },
  desktopWhatsAppBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 13, borderRadius: 14,
    backgroundColor: "#25D366",
  },
  desktopWhatsAppText: { color: "#fff", fontSize: 14, fontWeight: "800" },
  desktopCallBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 11, borderRadius: 14, borderWidth: 1.5,
  },
  desktopCallBtnText: { fontSize: 14, fontWeight: "600" },
  ctaSectionTitle: { fontSize: 17, fontWeight: "800", letterSpacing: -0.2 },
  tourTypeRow: {
    flexDirection: "row", borderRadius: 12, padding: 4, gap: 4,
  },
  tourTypePill: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, paddingVertical: 10, borderRadius: 10,
  },
  tourTypeText: { fontSize: 13, fontWeight: "600" },
  datePill: {
    borderWidth: 1.5, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 14,
    alignItems: "center", minWidth: 58,
  },
  datePillDay: { fontSize: 11, fontWeight: "600", textTransform: "uppercase" },
  datePillNum: { fontSize: 20, fontWeight: "900", letterSpacing: -0.5 },
  datePillMon: { fontSize: 11, fontWeight: "500" },
  timeSlotsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  timeSlot: {
    borderWidth: 1.5, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8,
  },
  timeSlotText: { fontSize: 12, fontWeight: "600" },
  ctaPrimary: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 15, borderRadius: 14,
  },
  ctaPrimaryText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  ctaDivider: {
    height: 1, position: "relative",
    justifyContent: "center", alignItems: "center",
  },
  ctaDividerText: {
    position: "absolute", paddingHorizontal: 12,
    fontSize: 12, fontWeight: "500",
  },
  ctaSecondary: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 14, borderRadius: 14, borderWidth: 1.5,
  },
  ctaSecondaryText: { fontSize: 15, fontWeight: "700" },
  agentRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  agentAvatar: {
    width: 44, height: 44, borderRadius: 22,
    justifyContent: "center", alignItems: "center",
  },
  agentAvatarText: { color: "#fff", fontSize: 18, fontWeight: "800" },
  agentName: { fontSize: 15, fontWeight: "700" },
  agentRole: { fontSize: 12, fontWeight: "500", marginTop: 1 },
  callBtn: {
    width: 40, height: 40, borderRadius: 20, borderWidth: 1.5,
    justifyContent: "center", alignItems: "center",
  },
  input: {
    borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, fontWeight: "500",
  },
  inputMultiline: { minHeight: 80, textAlignVertical: "top" },
  contactSuccess: {
    flexDirection: "row", alignItems: "center", gap: 8,
    padding: 14, borderRadius: 12, borderWidth: 1,
  },
  contactSuccessText: { fontSize: 14, fontWeight: "600", flex: 1 },

  // Mobile bottom bar
  mobileBottomBar: {
    flexDirection: "row", gap: 12,
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24,
    borderTopWidth: 1,
  },
  mobileBottomBtnSecondary: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, borderWidth: 1.5, borderRadius: 14,
    paddingVertical: 14, flex: 1,
  },
  mobileBottomBtnTextSecondary: { fontSize: 15, fontWeight: "700" },
  mobileBottomBtnPrimary: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, borderRadius: 14, paddingVertical: 14, flex: 2,
  },
  mobileBottomBtnTextPrimary: { color: "#fff", fontSize: 15, fontWeight: "800" },

  // Homes.com-style agent sticky bottom bar
  agentBottomBar: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingTop: 10, paddingBottom: 26,
    borderTopWidth: 1, gap: 10,
  },
  agentBarLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1, overflow: "hidden" },
  agentBarAvatar: {
    width: 46, height: 46, borderRadius: 23,
    justifyContent: "center", alignItems: "center",
    flexShrink: 0,
  },
  agentBarAvatarText: { color: "#fff", fontSize: 18, fontWeight: "800" },
  agentBarInfo: { flex: 1, overflow: "hidden" },
  agentBarNameRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 },
  agentBarName: { fontSize: 14, fontWeight: "800", flexShrink: 1 },
  agentBarBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, flexShrink: 0 },
  agentBarBadgeText: { color: "#fff", fontSize: 10, fontWeight: "700", letterSpacing: 0.3 },
  agentBarRole: { fontSize: 12, fontWeight: "400" },
  agentBarActions: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 0 },
  agentCallCircle: {
    width: 40, height: 40, borderRadius: 20,
    borderWidth: 1.5, justifyContent: "center", alignItems: "center",
  },
  agentContactBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 5, paddingHorizontal: 18, paddingVertical: 11,
    borderRadius: 12,
  },
  agentContactBtnText: { color: "#fff", fontSize: 14, fontWeight: "800" },

  // Lightbox — Zillow-style (fullscreen, absolute top bar, tap-to-toggle)
  lbRoot: { flex: 1, backgroundColor: "#000" },
  lbTopBar: {
    position: "absolute", top: 0, left: 0, right: 0, zIndex: 30,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingTop: 52, paddingBottom: 16,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  lbClose: { padding: 8 },
  lbTitle: { color: "#fff", fontSize: 15, fontWeight: "700", textAlign: "center" },
  lbCounter: { color: "rgba(255,255,255,0.75)", fontSize: 12, fontWeight: "500", textAlign: "center", marginTop: 2 },
  lbArrow: {
    position: "absolute", top: "50%" as any, marginTop: -28,
    width: 44, height: 56,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center", alignItems: "center",
  },
  lbArrowLeft:  { left: 0,  borderTopRightRadius: 8, borderBottomRightRadius: 8 },
  lbArrowRight: { right: 0, borderTopLeftRadius: 8, borderBottomLeftRadius: 8 },
  lbDots: {
    position: "absolute", bottom: 32, left: 0, right: 0,
    flexDirection: "row", justifyContent: "center", gap: 5,
  },
  lbDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.4)" },
  lbDotActive: { backgroundColor: "#fff", width: 16 },

  // Mobile overlay top bar (floats over photo)
  topBarOverlay: {
    position: "absolute", top: 0, left: 0, right: 0,
    zIndex: 20,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 8, paddingTop: 44, paddingBottom: 10,
  },

  // Mobile quick stats (below photo)
  quickStats: {
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 14,
    gap: 4,
  },
  mobilePriceHeading: { fontSize: 28, fontWeight: "900", letterSpacing: -0.8, marginBottom: 2 },
  mobileSpecRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6, marginVertical: 4 },
  mobileSpecText: { fontSize: 15, fontWeight: "500" },
  mobileSpecDot: { fontSize: 15, fontWeight: "300" },
  mobileAddress: { fontSize: 14, fontWeight: "400", lineHeight: 20, marginTop: 2 },

  // Mobile section cards
  mobileSections: { gap: 8, paddingBottom: 8 },
  mobileCard: {
    paddingHorizontal: 16, paddingVertical: 20,
  },
  mobileCardHeading: { fontSize: 20, fontWeight: "800", marginBottom: 12, letterSpacing: -0.3 },

  // 2-col facts grid
  factsGrid: { flexDirection: "row", flexWrap: "wrap" },
  factItem: {
    width: "50%", flexDirection: "row", alignItems: "flex-start",
    gap: 10, paddingVertical: 12, paddingHorizontal: 4,
  },
  factItemVal: { fontSize: 14, fontWeight: "600", lineHeight: 18 },
  factItemSub: { fontSize: 11, fontWeight: "400", marginTop: 1 },
});


