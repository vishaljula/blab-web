/**
 * PropertyDetailModal
 * 
 * Web: Renders as a centered dialog over the map with a dark backdrop.
 * Native: No-op (navigation handled by router.push in the callers).
 */
import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Platform,
  Pressable,
  ActivityIndicator,
  NativeSyntheticEvent,
  NativeScrollEvent,
  TextInput,
  Modal,
  Linking,
  Animated,
  Easing,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";

import { useListingsStore, type Listing } from "@/store/listings";
import { COLORS, MAP_STYLES, API_BASE_URL } from "@/lib/theme";
import { useColorScheme } from "@/components/useColorScheme";
import { formatPrice, formatPriceFull, formatArea } from "@/lib/format";
import NeighborhoodMap from "@/components/NeighborhoodMap.web";
import EMICalculator from "@/components/EMICalculator";
import { getPhotos } from "@/lib/stockPhotos";
import { getRoleLabel, getRoleBadge } from "@/lib/listerRole";

// ─── Layout constants ─────────────────────────────────────────────────────────
// Keep these in sync with the StyleSheet values below.
// GALLERY_THRESHOLD is derived so changes to gallery dimensions stay in sync.
const GALLERY_MARGIN_TOP = 16;   // galleryGrid.marginTop
const GALLERY_HEIGHT     = 390;  // galleryGrid.height
const TAB_BAR_HEIGHT     = 48;   // tabBar content height
// Start the curtain animation this many px BEFORE the gallery bottom leaves the
// viewport — animation finishes exactly as gallery disappears.
const GALLERY_THRESHOLD  = GALLERY_MARGIN_TOP + GALLERY_HEIGHT - TAB_BAR_HEIGHT; // 358

// ─── constants ────────────────────────────────────────────────────────────────
// Tour data
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const TOUR_DATES = Array.from({ length: 7 }, (_, i) => {
  const d = new Date(); d.setDate(d.getDate() + i); return d;
});
const TOUR_TIMES = ["9:00 AM", "10:00 AM", "11:00 AM", "12:00 PM", "2:00 PM", "3:00 PM", "4:00 PM", "5:00 PM", "6:00 PM"];

function calcEMI(p: number, r: number, y: number) {
  const mr = r / 12 / 100; const n = y * 12;
  if (mr === 0) return Math.round(p / n);
  return Math.round((p * mr * Math.pow(1 + mr, n)) / (Math.pow(1 + mr, n) - 1));
}

const FACT_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  "Air Conditioning": "snow-outline", "Swimming Pool": "water-outline",
  "Gym / Fitness Center": "barbell-outline", "Covered Parking": "car-outline",
  "Security / CCTV": "shield-checkmark-outline", "Club House": "business-outline",
  "Power Backup": "flash-outline", "Children's Play Area": "happy-outline",
  "Lift / Elevator": "arrow-up-outline", "Modular Kitchen": "restaurant-outline",
  "Garden / Landscape": "leaf-outline", "Vastu Compliant": "compass-outline",
  "Gated Community": "lock-closed-outline",
};

// ─── Component ─────────────────────────────────────────────────────────────────
export default function PropertyDetailModal() {
  const { detailModalId, setDetailModalId } = useListingsStore();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const C = isDark ? COLORS.dark : COLORS.light;

  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(false);
  // lightboxIdx drives the lightbox; activePhotoIdx is kept for potential future
  // deep-link / share-URL sync — currently unused in render.
  const [activeTab, setActiveTab] = useState<"overview" | "features" | "neighborhood" | "calculator">("overview");
  const [favorited, setFavorited] = useState(false);
  const [selectedDate, setSelectedDate] = useState(0);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [tourType, setTourType] = useState<"in-person" | "video">("in-person");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactMessage, setContactMessage] = useState("");
  const [contactSent, setContactSent] = useState(false);
  const [downPct, setDownPct] = useState(20);
  const [loanRate, setLoanRate] = useState(8.5);
  const [loanTenure, setLoanTenure] = useState(20);
  const [openAccordion, setOpenAccordion] = useState<string | null>("Interior");
  const [showLightbox, setShowLightbox] = useState(false);
  const [lightboxIdx, setLightboxIdx] = useState(0);
  const [showTabBar, setShowTabBar] = useState(false);
  // headerH tracks the header bar's measured height so the absolute tab bar
  // can be positioned flush below it without a hardcoded pixel constant.
  // useRef (not useState) avoids a re-render on measurement — the tab bar
  // only appears after scroll so the 1-frame window has no visible impact.
  const headerH = useRef(45);

  const scrollRef = useRef<ScrollView>(null);
  const leftColRef = useRef<View>(null);
  const leftColTop = useRef(0);   // y of leftCol relative to ScrollView content
  const sectionOffsets = useRef<Record<string, number>>({ overview: 0, features: 0, neighborhood: 0, calculator: 0 });

  // Drives the tab-bar curtain animation:
  //   0 = fully hidden  (translateY: -TAB_BAR_HEIGHT, contact card top: 12)
  //   1 = fully visible (translateY: 0,               contact card top: 12 + TAB_BAR_HEIGHT)
  // useNativeDriver:false is required because translateY on an absolute element
  // and the interpolated `top` on the sticky contact card are layout properties.
  const tabBarAnim = useRef(new Animated.Value(0)).current;

  // Animate the tab bar in/out like a curtain falling from the top.
  // maxHeight: 0→48 (clips the height), translateY: -48→0 (slides down from above).
  // useNativeDriver:false required because maxHeight is not natively animatable.
  useEffect(() => {
    Animated.timing(tabBarAnim, {
      toValue: showTabBar ? 1 : 0,
      duration: 280,
      easing: showTabBar ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [showTabBar]);

  // Only meaningful on web — native callers use router.push
  if (Platform.OS !== "web") return null;

  // Fetch when ID changes
  useEffect(() => {
    if (!detailModalId) { setListing(null); return; }
    setLoading(true);
    setActiveTab("overview");
    setContactSent(false);
    setShowTabBar(false);  // always start with tab bar hidden (appears after gallery scrolls away)
    // Reset contact form so stale input from a previous listing is never shown
    setContactName("");
    setContactPhone("");
    setContactMessage("");
    setShowLightbox(false);    // always start on detail view, not photo mode
    fetch(`${API_BASE_URL}/api/listings/${detailModalId}`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(setListing)
      .catch(() => setListing(null))
      .finally(() => setLoading(false));
  }, [detailModalId]);

  // Pre-fill the contact message once the listing data arrives.
  // This runs after the fetch resolves and only when the listing ID changes.
  useEffect(() => {
    if (!listing) return;
    setContactMessage(
      `Hi ${listing.contactName ?? "Agent"}, I\'d like to know more about this property at ${listing.address}, ${listing.city}.`
    );
  }, [listing?.id]);

  const close = () => setDetailModalId(null);

  const scrollToSection = (sec: string) => {
    // sectionOffsets are relative to leftCol; add leftColTop to get ScrollView coords.
    // Subtract headerH (measured) + a small breathing gap so the section title
    // is not flush against the tab bar bottom.
    const gap = 8;
    const y = leftColTop.current + sectionOffsets.current[sec] - (headerH.current + TAB_BAR_HEIGHT + gap);
    scrollRef.current?.scrollTo({ y: Math.max(0, y), animated: true });
    setActiveTab(sec as any);
  };

  // GALLERY_THRESHOLD is derived from named layout constants at the top of
  // this file — see GALLERY_MARGIN_TOP / GALLERY_HEIGHT / TAB_BAR_HEIGHT.

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;

    // Toggle tab bar visibility based on whether gallery has scrolled away
    setShowTabBar(y >= GALLERY_THRESHOLD);

    const adj = y - leftColTop.current;
    const off = sectionOffsets.current;
    if (adj >= off.calculator - 80) setActiveTab("calculator");
    else if (adj >= off.neighborhood - 80) setActiveTab("neighborhood");
    else if (adj >= off.features - 80) setActiveTab("features");
    else setActiveTab("overview");
  };

  if (!detailModalId) return null;

  // ─── Tab bar ─────────────────────────────────────────────────────────────────
  const TABS = [
    { key: "overview", label: "Overview" },
    { key: "features", label: "Facts & features" },
    { key: "neighborhood", label: "Neighborhood" },
    { key: "calculator", label: "EMI calculator" },
  ] as const;

  const renderTabs = () => {
    // Absolute-positioned tab bar — only translateY needed (no maxHeight).
    // The outer clip container (height:48, overflow:hidden) handles clipping.
    const animatedStyle = {
      height: 48,
      transform: [{
        translateY: tabBarAnim.interpolate({ inputRange: [0, 1], outputRange: [-48, 0] }),
      }],
    };

    return (
      <Animated.View style={animatedStyle}>
        <View style={[m.tabBar, { backgroundColor: C.card, borderBottomColor: C.border }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 8 }}>
            {TABS.map(t => {
              const active = activeTab === t.key;
              return (
                <Pressable
                  key={t.key}
                  onPress={() => {
                    if (t.key === "overview") {
                      // Overview scrolls to top and retracts the tab bar
                      scrollRef.current?.scrollTo({ y: 0, animated: true });
                      setActiveTab("overview");
                    } else {
                      scrollToSection(t.key);
                    }
                  }}
                  style={[m.tabBtn, active && { borderBottomColor: C.primary }]}
                >
                  <Text style={[m.tabLabel, { color: active ? C.primary : C.mutedForeground }, active && { fontWeight: "700" }]}>
                    {t.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </Animated.View>
    );
  };

  // ─── Gallery grid ─────────────────────────────────────────────────────────────
  const renderGallery = (photos: string[]) => (
    <View style={[m.galleryGrid, { backgroundColor: C.background }]}>
      {/* Hero — left, full height */}
      <Pressable style={m.heroCell} onPress={() => { setLightboxIdx(0); setShowLightbox(true); }}>
        <Image source={{ uri: photos[0] }} style={m.heroPic} contentFit="cover" />
      </Pressable>

      {/* Right: two rows of two thumbnails each, filling the same height */}
      <View style={m.thumbGrid}>
        {/* Row 1 */}
        <View style={m.thumbRow}>
          <Pressable style={m.thumbCell} onPress={() => { setLightboxIdx(1); setShowLightbox(true); }}>
            <Image source={{ uri: photos[1] ?? photos[0] }} style={m.thumbPic} contentFit="cover" />
          </Pressable>
          <Pressable style={m.thumbCell} onPress={() => { setLightboxIdx(2); setShowLightbox(true); }}>
            <Image source={{ uri: photos[2] ?? photos[0] }} style={m.thumbPic} contentFit="cover" />
          </Pressable>
        </View>
        {/* Row 2 */}
        <View style={m.thumbRow}>
          <Pressable style={m.thumbCell} onPress={() => { setLightboxIdx(3); setShowLightbox(true); }}>
            <Image source={{ uri: photos[3] ?? photos[0] }} style={m.thumbPic} contentFit="cover" />
          </Pressable>
          <Pressable style={m.thumbCell} onPress={() => { setLightboxIdx(4); setShowLightbox(true); }}>
            <Image source={{ uri: photos[4] ?? photos[0] }} style={m.thumbPic} contentFit="cover" />
            <View style={m.moreOverlay}>
              <Ionicons name="images-outline" size={18} color="#fff" />
              <Text style={m.moreText}>+{Math.max(0, photos.length - 4)} photos</Text>
            </View>
          </Pressable>
        </View>
      </View>
    </View>
  );

  // ─── Full-screen photo lightbox ───────────────────────────────────────────────
  const renderLightbox = (photos: string[], l: Listing) => {
    if (!showLightbox) return null;
    const total = photos.length;
    const prev = () => setLightboxIdx(i => (i - 1 + total) % total);
    const next = () => setLightboxIdx(i => (i + 1) % total);
    return (
      <View style={m.lb}>
        {/* Top bar */}
        <View style={m.lbTopBar}>
          <Pressable onPress={() => setShowLightbox(false)} style={m.lbBack}>
            <Ionicons name="chevron-back" size={18} color="#fff" />
            <Text style={m.lbBackText}>Back to listing</Text>
          </Pressable>
          <Text style={m.lbTitle}>Photos</Text>
          <Text style={m.lbCounter}>{lightboxIdx + 1} / {total}</Text>
        </View>

        {/*
          Image row: flex:1 so it takes all space between topbar and strip.
          Left arrow | Image (flex:1) | Right arrow — all in a row.
          expo-image then has an explicit computed width+height and fills it.
        */}
        <View style={m.lbRow}>
          <Pressable onPress={prev} style={m.lbArrow}>
            <View style={m.lbArrowBubble}>
              <Ionicons name="chevron-back" size={22} color="#fff" />
            </View>
          </Pressable>

          {/* Image + caption overlay */}
          <View style={m.lbImgArea}>
            <Image
              source={{ uri: photos[lightboxIdx] }}
              style={{ width: "100%" as any, height: "100%" as any }}
              contentFit="contain"
            />
            <View style={m.lbCaption}>
              <Text style={m.lbCaptionText}>
                {l.listingType === "rent" ? "For Rent" : "For Sale"}: {l.bedrooms} beds · {l.bathrooms} baths
                {l.builtUpArea ? ` · ${l.builtUpArea.toLocaleString("en-IN")} sqft` : ""}
              </Text>
            </View>
          </View>

          <Pressable onPress={next} style={m.lbArrow}>
            <View style={m.lbArrowBubble}>
              <Ionicons name="chevron-forward" size={22} color="#fff" />
            </View>
          </Pressable>
        </View>

        {/* Thumbnail strip — fixed height, no flex growth */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={m.lbStrip}
          contentContainerStyle={{ gap: 6, paddingHorizontal: 16, alignItems: "center" }}
        >
          {photos.map((uri, i) => (
            <Pressable key={i} onPress={() => setLightboxIdx(i)}
              style={[m.lbThumb, i === lightboxIdx && m.lbThumbActive]}>
              <Image source={{ uri }} style={m.lbThumbImg} contentFit="cover" />
            </Pressable>
          ))}
        </ScrollView>
      </View>
    );
  };

  // ─── Overview (Zillow-exact) ──────────────────────────────────────────────────
  const renderOverview = (l: Listing) => {
    const pps = l.builtUpArea && l.builtUpArea > 0 ? Math.round(l.price / l.builtUpArea) : null;
    const tablets = [
      { icon: "business-outline" as const, label: l.propertyType.charAt(0).toUpperCase() + l.propertyType.slice(1) },
      { icon: "calendar-outline" as const, label: l.yearBuilt ? `Built in ${l.yearBuilt}` : "Year N/A" },
      { icon: "expand-outline" as const, label: l.plotArea ? `${l.plotArea?.toLocaleString("en-IN")} sq.yd` : "N/A" },
      { icon: "trending-up-outline" as const, label: l.marketEstimate ? formatPrice(l.marketEstimate) : "—" },
      { icon: "cash-outline" as const, label: pps ? `₹${pps.toLocaleString("en-IN")}/sqft` : "—" },
      { icon: "construct-outline" as const, label: l.maintenance ? `₹${l.maintenance}/mo` : "N/A" },
    ];

    return (
      <View onLayout={e => { sectionOffsets.current.overview = e.nativeEvent.layout.y; }} style={m.section}>
        {/* Price row */}
        <View style={m.overviewTop}>
          <View style={m.overviewLeft}>
            <View style={m.statusRow}>
              <View style={[m.pill, { backgroundColor: l.listingType === "rent" ? "#EFF6FF" : "#ECFDF5" }]}>
                <Text style={[m.pillText, { color: l.listingType === "rent" ? "#1D4ED8" : "#047857" }]}>
                  {l.listingType === "rent" ? "FOR RENT" : "FOR SALE"}
                </Text>
              </View>
            </View>
            <Text style={[m.priceText, { color: C.foreground }]}>
              {formatPriceFull(l.price)}
              {l.listingType === "rent" && <Text style={{ color: C.mutedForeground, fontWeight: "500", fontSize: 17 }}> /mo</Text>}
            </Text>
            <Text style={[m.addressText, { color: C.mutedForeground }]}>{l.address}, {l.city}</Text>
            <View style={[m.emiRow, { backgroundColor: isDark ? "#1E2B3A" : "#EFF6FF", borderColor: isDark ? "#1E3A5F" : "#BFDBFE" }]}>
              <Text style={[m.emiText, { color: isDark ? "#93C5FD" : "#1D4ED8" }]}>
                Est. EMI: ₹{calcEMI(l.price * 0.8, 8.5, 20).toLocaleString("en-IN")}/mo
              </Text>
              <Text style={[m.emiLink, { color: C.primary }]}> · Get pre-approved</Text>
            </View>
          </View>

          {/* Big spec numbers */}
          <View style={m.overviewRight}>
            {l.bedrooms != null && (
              <View style={m.bigCol}>
                <Text style={[m.bigNum, { color: C.foreground }]}>{l.bedrooms}</Text>
                <Text style={[m.bigLabel, { color: C.mutedForeground }]}>beds</Text>
              </View>
            )}
            {l.bedrooms != null && l.bathrooms != null && <View style={[m.bigDivider, { backgroundColor: C.border }]} />}
            {l.bathrooms != null && (
              <View style={m.bigCol}>
                <Text style={[m.bigNum, { color: C.foreground }]}>{l.bathrooms}</Text>
                <Text style={[m.bigLabel, { color: C.mutedForeground }]}>baths</Text>
              </View>
            )}
            {l.builtUpArea != null && (
              <>
                <View style={[m.bigDivider, { backgroundColor: C.border }]} />
                <View style={m.bigCol}>
                  <Text style={[m.bigNum, { color: C.foreground }]}>{l.builtUpArea.toLocaleString("en-IN")}</Text>
                  <Text style={[m.bigLabel, { color: C.mutedForeground }]}>sqft</Text>
                </View>
              </>
            )}
          </View>
        </View>

        {/* Fact tablets — Zillow 3×2 table */}
        <View style={[m.tabletsContainer, { borderColor: C.border }]}>
          {tablets.map((t, i) => (
            <React.Fragment key={i}>
              <View style={[
                m.tablet,
                { backgroundColor: isDark ? "#1A1A1A" : "#F6F6F6" },
                i % 3 !== 0 && { borderLeftWidth: 1, borderLeftColor: C.border },
                i >= 3 && { borderTopWidth: 1, borderTopColor: C.border },
              ]}>
                <Ionicons name={t.icon} size={17} color={isDark ? "#6B6B6B" : "#555"} />
                <Text style={[m.tabletText, { color: C.foreground }]} numberOfLines={1}>{t.label}</Text>
              </View>
            </React.Fragment>
          ))}
        </View>

        {/* About */}
        <View style={[m.divider, { backgroundColor: C.border, marginTop: 20 }]} />
        <Text style={[m.sectionTitle, { color: C.foreground }]}>About this home</Text>
        <Text style={[m.bodyText, { color: C.mutedForeground }]}>
          {l.description ?? "A beautifully crafted property in one of the most sought-after localities. Spacious rooms, modern finishes, and excellent connectivity."}
        </Text>
      </View>
    );
  };

  // ─── Features ─────────────────────────────────────────────────────────────────
  const renderFeatures = (l: Listing) => {
    const features: string[] = Array.isArray(l.features) ? l.features : [];
    const grouped: Record<string, string[]> = { Interior: [], Exterior: [], Community: [] };
    features.forEach(f => {
      if (["Air Conditioning", "Modular Kitchen", "Lift / Elevator", "Intercom"].includes(f)) grouped.Interior.push(f);
      else if (["Garden / Landscape", "Rain Water Harvesting", "24/7 Water Supply"].includes(f)) grouped.Exterior.push(f);
      else grouped.Community.push(f);
    });
    if (features.length === 0) {
      grouped.Community = ["Gated Community", "Covered Parking", "Power Backup"];
    }
    return (
      <View onLayout={e => { sectionOffsets.current.features = e.nativeEvent.layout.y; }}
        style={[m.section, { borderTopWidth: 1, borderTopColor: C.border }]}>
        <Text style={[m.sectionTitle, { color: C.foreground }]}>Facts & Features</Text>
        <View style={m.pillsRow}>
          {features.slice(0, 8).map(f => (
            <View key={f} style={[m.featurePill, { backgroundColor: isDark ? "#1E1E1E" : "#F3F4F6", borderColor: C.border }]}>
              <Ionicons name={FACT_ICON[f] ?? "checkmark-outline"} size={12} color={C.primary} />
              <Text style={[m.featurePillText, { color: C.foreground }]}>{f}</Text>
            </View>
          ))}
        </View>
        {Object.entries(grouped).map(([group, items]) => items.length === 0 ? null : (
          <View key={group} style={[m.accordion, { borderColor: C.border }]}>
            <Pressable style={m.accordionHeader} onPress={() => setOpenAccordion(openAccordion === group ? null : group)}>
              <Text style={[m.accordionTitle, { color: C.foreground }]}>{group}</Text>
              <Ionicons name={openAccordion === group ? "chevron-up" : "chevron-down"} size={16} color={C.mutedForeground} />
            </Pressable>
            {openAccordion === group && (
              <View style={m.accordionBody}>
                {items.map(item => (
                  <View key={item} style={m.accordionRow}>
                    <Ionicons name={FACT_ICON[item] ?? "checkmark-circle-outline"} size={15} color={C.primary} />
                    <Text style={[m.bodyText, { color: C.foreground }]}>{item}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        ))}
      </View>
    );
  };

  // ─── Neighborhood — live map with POI markers ─────────────────────────────────
  const renderNeighborhood = (l: Listing) => (
    <View onLayout={e => { sectionOffsets.current.neighborhood = e.nativeEvent.layout.y; }}
      style={[m.section, { borderTopWidth: 1, borderTopColor: C.border }]}>
      <Text style={[m.sectionTitle, { color: C.foreground }]}>Neighborhood</Text>
      <NeighborhoodMap
        latitude={l.latitude}
        longitude={l.longitude}
        mapStyle={MAP_STYLES[isDark ? "dark" : "light"]}
      />
    </View>
  );

  // ─── EMI Calculator ───────────────────────────────────────────────────────────
  const renderCalculator = (l: Listing) => (
    <View onLayout={e => { sectionOffsets.current.calculator = e.nativeEvent.layout.y; }}
      style={[m.section, { borderTopWidth: 1, borderTopColor: C.border }]}>
      <Text style={[m.sectionTitle, { color: C.foreground }]}>EMI Calculator</Text>
      <EMICalculator
        price={l.price}
        isDark={isDark}
        primaryColor={C.primary}
      />
    </View>
  );

  // ─── CTA widget ────────────────────────────────────────────────────────────
  // Design: homes.com-inspired — prominent agent hero photo, pre-filled message,
  // single Send CTA, phone number shown large. No WhatsApp on desktop (doesn't
  // make sense — WhatsApp stays native mobile only).
  const renderCTA = (l: Listing) => {
    const agentName    = l.contactName ?? "Agent";
    const agentInitial = agentName.charAt(0).toUpperCase();
    // getRoleLabel / getRoleBadge are in lib/listerRole.ts — single source of
    // truth shared with the native route (app/property/[id].tsx).
    const roleLabel = getRoleLabel(l.listerType);
    const roleBadge = getRoleBadge(l.listerType);
    void roleBadge; // reserved for compact contexts; not currently rendered in web modal

    return (
      <View style={[m.ctaBox, { backgroundColor: C.card, borderColor: C.border }]}>

        {/* ── AGENT HERO (homes.com style) ────────────────────────────────
             Photo is LEFT-aligned with a fixed small size, name badge sits
             to the right and bleeds slightly over the photo edge — exactly
             matching the homes.com card layout. */}
        <View style={m.agentHeroRow}>
          {/* LEFT: fixed-size photo block (not full-width) */}
          <View style={m.agentHeroPhotoWrap}>
            {l.contactPhotoUrl ? (
              <Image
                source={{ uri: l.contactPhotoUrl }}
                style={{ width: "100%" as any, height: "100%" as any }}
                contentFit="cover"
              />
            ) : (
              // Fallback when no photo: brand-tinted block with large initial
              <View style={[m.agentHeroFallback, { backgroundColor: C.primary + "22" }]}>
                <Text style={[m.agentHeroInitial, { color: C.primary }]}>{agentInitial}</Text>
              </View>
            )}
          </View>

          {/* RIGHT: name badge (overlaps photo edge) + role label below */}
          <View style={m.agentHeroInfo}>
            {/* Name badge in brand color — marginLeft pulls it slightly over the photo */}
            <View style={[m.agentHeroNameBadge, { backgroundColor: C.primary }]}>
              <Text style={m.agentHeroNameText} numberOfLines={1}>{agentName}</Text>
            </View>
            {/* Role label directly below name badge */}
            <Text style={[m.agentHeroRoleText, { color: C.foreground }]}>
              {roleLabel.toUpperCase()}
            </Text>
          </View>
        </View>

        {/* ── PRE-FILLED MESSAGE ─────────────────────────────────────────
             Single editable textarea pre-filled with a polite enquiry —
             homes.com pattern: less friction than 3 separate inputs. */}
        {!contactSent && (
          <TextInput
            style={[m.heroMessageBox, {
              backgroundColor: isDark ? "#1A1A1A" : "#F4F4F5",
              borderColor: C.border,
              color: C.foreground,
            }]}
            multiline
            value={contactMessage}
            onChangeText={setContactMessage}
            placeholderTextColor={C.mutedForeground}
            placeholder={`Hi ${agentName}, I'd like to know more…`}
          />
        )}

        {/* ── SEND / SUCCESS ─────────────────────────────────────────────
             TODO(auth-gate): Validate OTP for unauthenticated users before
             sending. For now, button immediately transitions to success state
             to demonstrate the happy path. Redirect-to-login-and-back flow
             is tracked in the OTP auth-gate story. */}
        {contactSent ? (
          <View style={[m.successBox, { backgroundColor: isDark ? "#1A2B1A" : "#F0FDF4", borderColor: isDark ? "#2D4A2D" : "#BBF7D0" }]}>
            <Ionicons name="checkmark-circle-outline" size={20} color="#16A34A" />
            <Text style={{ color: isDark ? "#4ADE80" : "#15803D", fontSize: 14, fontWeight: "600", flex: 1 }}>
              Message sent! {agentName} will reach out soon.
            </Text>
          </View>
        ) : (
          <Pressable
            onPress={() => setContactSent(true)}
            style={[m.heroSendBtn, { backgroundColor: C.primary }]}
          >
            <Text style={m.heroSendBtnText}>Send a Message</Text>
          </Pressable>
        )}

        {/* ── PHONE NUMBER (large + clickable) ───────────────────────────
             homes.com displays the number large and centred below the CTA.
             Desktop users can use click-to-call from the browser. */}
        <Pressable onPress={() => Linking.openURL(`tel:${l.contactPhone}`)} style={m.heroPhoneRow}>
          <Ionicons name="call-outline" size={16} color={C.primary} />
          <Text style={[m.heroPhoneNumber, { color: C.foreground }]}>{l.contactPhone}</Text>
        </Pressable>

        {/* Tagline */}
        <Text style={[m.heroTagline, { color: C.mutedForeground }]}>
          Blab connects you directly to the listing agent.
        </Text>

        {/* ── OR divider → TOUR ── */}
        <View style={[m.orRow, { backgroundColor: C.border }]}>
          <Text style={[m.orText, { color: C.mutedForeground, backgroundColor: C.card }]}>or book a tour</Text>
        </View>

        {/* Tour type toggle */}
        <View style={[m.tourTypeRow, { backgroundColor: isDark ? "#1E1E1E" : "#F3F4F6" }]}>
          {(["in-person", "video"] as const).map(t => (
            <Pressable key={t} onPress={() => setTourType(t)}
              style={[m.tourTypePill, tourType === t && { backgroundColor: C.card }]}>
              <Ionicons name={t === "in-person" ? "person-outline" : "videocam-outline"} size={13} color={tourType === t ? C.primary : C.mutedForeground} />
              <Text style={[m.tourTypeText, { color: tourType === t ? C.primary : C.mutedForeground }, tourType === t && { fontWeight: "700" }]}>
                {t === "in-person" ? "In person" : "Video tour"}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={[m.ctaTitle, { color: C.foreground }]}>Request a Tour</Text>

        {/* Date carousel */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          style={{ marginHorizontal: -16 }} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
          {TOUR_DATES.map((d, i) => {
            const active = selectedDate === i;
            return (
              <Pressable key={i} onPress={() => setSelectedDate(i)}
                style={[m.datePill, { borderColor: active ? C.primary : C.border, backgroundColor: active ? C.primary : C.card }]}>
                <Text style={[m.datePillDay, { color: active ? "#fff" : C.mutedForeground }]}>{DAYS[d.getDay()]}</Text>
                <Text style={[m.datePillNum, { color: active ? "#fff" : C.foreground }]}>{d.getDate()}</Text>
                <Text style={[m.datePillMon, { color: active ? "rgba(255,255,255,0.8)" : C.mutedForeground }]}>{MONTHS[d.getMonth()]}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Time slots */}
        <View style={m.timeGrid}>
          {TOUR_TIMES.map(t => {
            const active = selectedTime === t;
            return (
              <Pressable key={t} onPress={() => setSelectedTime(active ? null : t)}
                style={[m.timeSlot, { borderColor: active ? C.primary : C.border, backgroundColor: active ? (isDark ? "#2D0D00" : "#FFF7F5") : C.card }]}>
                <Text style={[m.timeSlotText, { color: active ? C.primary : C.foreground }]}>{t}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* ── REQUEST A TOUR ─────────────────────────────────────────────
             TODO(tour-booking): Wire onPress to tour request API / modal.
             Currently a UI stub — pressing does nothing. */}
        <Pressable style={[m.ctaPrimary, { backgroundColor: C.primary }]}>
          <Ionicons name="calendar-outline" size={15} color="#fff" />
          <Text style={m.ctaPrimaryText}>Request a tour</Text>
        </Pressable>

      </View>
    );
  };

  // ─── Main modal render ────────────────────────────────────────────────────────
  const photos = listing ? getPhotos(listing) : [];

  return (
    <Modal visible={!!detailModalId} transparent animationType="fade" onRequestClose={close}>
      {/* Dark root covers the ENTIRE viewport including safe-area strips */}
      <View style={[m.modalRoot]}>
        {/* Tappable backdrop sitting behind the card */}
        <Pressable style={StyleSheet.absoluteFillObject} onPress={close} />

        {/* Card — full height via flex:1, side margins via calc width */}
        <View style={[m.card, {
          backgroundColor: C.background,
          borderColor: showLightbox ? "transparent" : C.border,
          borderWidth: showLightbox ? 0 : 1,
        }]}>

          {/* Header bar — onLayout writes to headerH ref (not state) so the
              measurement doesn't cause a re-render; the tab bar only becomes
              visible after scrolling so the 1-frame window is imperceptible. */}
          <View
            style={[m.headerBar, { backgroundColor: C.card, borderBottomColor: C.border }]}
            onLayout={e => { headerH.current = e.nativeEvent.layout.height; }}
          >
            <Pressable onPress={close} style={m.backRow}>
              <Ionicons name="chevron-back" size={20} color={C.foreground} />
              <Text style={[m.backText, { color: C.foreground }]}>Back to search</Text>
            </Pressable>
            <View style={m.headerRight}>
              <Pressable onPress={() => setFavorited(!favorited)} style={m.iconBtn}>
                <Ionicons name={favorited ? "heart" : "heart-outline"} size={19} color={favorited ? "#EF4444" : C.foreground} />
              </Pressable>
              <Pressable style={m.iconBtn}>
                <Ionicons name="share-outline" size={19} color={C.foreground} />
              </Pressable>
            </View>
          </View>

          {/* Tab bar — position:absolute so it never pushes content.
              overflow:hidden clips the translateY upward bleed over the header.
              top uses headerH.current (ref, not state) — no re-render needed. */}
          <View style={{
            position: "absolute",
            top: headerH.current,
            left: 0, right: 0,
            height: TAB_BAR_HEIGHT,
            overflow: "hidden",
            zIndex: 10,
          }}>
            {renderTabs()}
          </View>

          {loading ? (
            <View style={[m.loadingBox, { backgroundColor: C.background }]}>
              <ActivityIndicator size="large" color={C.primary} />
            </View>
          ) : !listing ? (
            <View style={m.loadingBox}>
              <Text style={{ color: C.mutedForeground }}>Property not found.</Text>
            </View>
          ) : (
            <ScrollView
              ref={scrollRef}
              onScroll={handleScroll}
              scrollEventThrottle={16}
              contentContainerStyle={{ paddingBottom: 60 }}
            >
              {/* Gallery sits above columns so sticky kicks in after it scrolls away */}
              {renderGallery(photos)}

              {/* Two-column layout — overflow:visible is required so CSS sticky
                  can escape the columns View (RN Web View defaults to overflow:hidden) */}
              <View style={m.columns}>
                <View
                  ref={leftColRef}
                  style={m.leftCol}
                  onLayout={() => {
                    const scrollNode =
                      (scrollRef.current as any)?.getScrollableNode?.() ??
                      (scrollRef.current as any)?._scrollNode;
                    leftColRef.current?.measureLayout(
                      scrollNode,
                      (_x, y) => { leftColTop.current = y; },
                      () => { }
                    );
                  }}
                >
                  {renderOverview(listing)}
                  {renderFeatures(listing)}
                  {renderNeighborhood(listing)}
                  {renderCalculator(listing)}
                </View>

                {/* rightCol: sticky with top animated 12→60 as tab bar slides in.
                    12px gap from header when no tab bar, 12px gap from tab bar
                    bottom when visible — same spacing, no push/bounce. */}
                <Animated.View style={[m.rightCol, {
                  top: tabBarAnim.interpolate({ inputRange: [0, 1], outputRange: [12, 60] }),
                }]}>
                  {renderCTA(listing)}
                </Animated.View>
              </View>
            </ScrollView>
          )}

          {/* Lightbox — absolute overlay inside card */}
          {listing && renderLightbox(photos, listing)}
        </View>
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const m = StyleSheet.create({
  // Modal root — dark overlay covering full viewport
  modalRoot: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",   // centers card horizontally
  },
  card: {
    flex: 1,                           // fills full height
    width: "calc(100% - 36px)" as any, // 18px margin each side
    maxWidth: 1260,
    borderRadius: 0, borderWidth: 1, overflow: "hidden",
    shadowColor: "#000", shadowOffset: { width: 0, height: 24 },
    shadowOpacity: 0.3, shadowRadius: 48, elevation: 24,
  },
  headerBar: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1,
  },
  backRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  backText: { fontSize: 14, fontWeight: "600" },
  headerRight: { flexDirection: "row", gap: 10 },
  iconBtn: { padding: 8 },

  // Tab bar
  tabBar: { borderBottomWidth: 1 },
  tabBtn: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabLabel: { fontSize: 13, fontWeight: "600" },

  loadingBox: { height: 300, justifyContent: "center", alignItems: "center" },

  // Gallery — gap color matches parent background (set inline); overflow clips corners
  galleryGrid: {
    flexDirection: "row", height: 390,  // increased from 340 — reclaims the tab bar space that's now hidden on load
    marginHorizontal: 24, marginTop: 16,
    borderRadius: 10, overflow: "hidden",
    gap: 3,
  },
  heroCell: { flex: 6 },
  heroPic: { width: "100%", height: "100%" },
  // Right side: column of two rows
  thumbGrid: { flex: 5, flexDirection: "column", gap: 3 },
  thumbRow: { flex: 1, flexDirection: "row", gap: 3 },
  thumbCell: { flex: 1, overflow: "hidden" },
  thumbPic: { width: "100%", height: "100%" },
  moreOverlay: {
    position: "absolute", inset: 0,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center", alignItems: "center", gap: 5,
  },
  moreText: { color: "#fff", fontSize: 12, fontWeight: "700" },

  // ─── Lightbox ───────────────────────────────────────────────────────────────
  lb: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "#111", flexDirection: "column", zIndex: 100,
  },
  lbTopBar: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingVertical: 14,
    backgroundColor: "#1A1A1A", borderBottomWidth: 1, borderBottomColor: "#2A2A2A",
  },
  lbBack: { flexDirection: "row", alignItems: "center", gap: 4 },
  lbBackText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  lbTitle: { color: "#fff", fontSize: 15, fontWeight: "800" },
  lbCounter: {
    backgroundColor: "rgba(255,255,255,0.15)", color: "#fff",
    fontSize: 12, fontWeight: "700",
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999,
  },
  // Image frame — flex row: arrow | image | arrow
  lbRow: {
    flex: 1,                        // takes ALL space between topbar and strip
    flexDirection: "row",
    alignItems: "stretch",
    backgroundColor: "#000",
  },
  lbArrow: {
    width: 72, justifyContent: "center", alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  lbArrowBubble: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center", alignItems: "center",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.25)",
  },
  lbImgArea: {
    flex: 1,                        // fills the width between arrows
    position: "relative",           // needed for absolute caption child
  },
  // Caption pinned to bottom of image area
  lbCaption: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    paddingVertical: 12, paddingHorizontal: 20,
    backgroundColor: "rgba(0,0,0,0.55)", zIndex: 2,
  },
  lbCaptionText: {
    color: "rgba(255,255,255,0.9)", fontSize: 13, fontWeight: "600",
    textAlign: "center",
  },
  // Thumbnail strip — fixed height, never grows
  lbStrip: { height: 96, flexGrow: 0, flexShrink: 0, backgroundColor: "#1A1A1A" },
  lbThumb: {
    width: 120, height: 76, borderRadius: 5, overflow: "hidden",
    borderWidth: 2.5, borderColor: "transparent", alignSelf: "center",
  },
  lbThumbActive: { borderColor: "#fff" },
  lbThumbImg: { width: "100%", height: "100%" },

  // overflow:visible on columns is required: RN Web default View has overflow:hidden
  // which silently breaks position:sticky on any descendant.
  // overflow:visible on columns is required: RN Web default View has overflow:hidden
  // which silently breaks position:sticky on any descendant.
  columns: { flexDirection: "row", gap: 28, padding: 24, overflow: "visible" as any },
  leftCol: { flex: 1, minWidth: 0 },
  rightCol: {
    width: 340, flexShrink: 0,
    // alignSelf:flex-start is REQUIRED for sticky: a stretched element
    // (full parent height) would have sticky range = 0, so it never sticks.
    alignSelf: "flex-start",
    position: "sticky" as any,
    // top is applied dynamically via tabBarAnim.interpolate (12→60) on the
    // Animated.View wrapper so the gap tracks the tab bar as it slides in.
    // No overflowY here — that would create a new scroll context, killing sticky
  },

  // Section
  section: { paddingVertical: 24 },
  sectionTitle: { fontSize: 20, fontWeight: "800", letterSpacing: -0.3, marginBottom: 14 },
  bodyText: { fontSize: 14, lineHeight: 22 },
  divider: { height: 1, marginBottom: 20 },

  // Overview
  overviewTop: { flexDirection: "row", justifyContent: "space-between", gap: 16, marginBottom: 18 },
  overviewLeft: { flex: 1, minWidth: 0 },
  overviewRight: { flexDirection: "row", alignItems: "flex-start", gap: 14, paddingTop: 6, flexShrink: 0 },
  statusRow: { flexDirection: "row", marginBottom: 8 },
  pill: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999 },
  pillText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  priceText: { fontSize: 28, fontWeight: "900", letterSpacing: -0.8, marginBottom: 5 },
  addressText: { fontSize: 14, fontWeight: "500", marginBottom: 10 },
  emiRow: {
    flexDirection: "row", alignItems: "center", flexWrap: "wrap",
    paddingHorizontal: 10, paddingVertical: 7, borderRadius: 7, borderWidth: 1,
    gap: 2, alignSelf: "flex-start",
  },
  emiText: { fontSize: 13, fontWeight: "600" },
  emiLink: { fontSize: 13, fontWeight: "700" },
  bigCol: { alignItems: "center", minWidth: 40 },
  bigNum: { fontSize: 28, fontWeight: "900", letterSpacing: -0.5 },
  bigLabel: { fontSize: 12, fontWeight: "500", marginTop: 2 },
  bigDivider: { width: 1, height: 32, marginTop: 4 },

  // Tablets
  tabletsContainer: {
    flexDirection: "row", flexWrap: "wrap",
    borderWidth: 1, borderRadius: 10, overflow: "hidden",
  },
  tablet: {
    width: "33.333%" as any,
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 14, paddingVertical: 14,
  },
  tabletText: { fontSize: 13, fontWeight: "500", flex: 1 },

  // Features
  pillsRow: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginBottom: 16 },
  featurePill: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999, borderWidth: 1 },
  featurePillText: { fontSize: 11, fontWeight: "600" },
  accordion: { borderWidth: 1, borderRadius: 10, marginBottom: 7, overflow: "hidden" },
  accordionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 14, paddingVertical: 13 },
  accordionTitle: { fontSize: 14, fontWeight: "700" },
  accordionBody: { paddingHorizontal: 14, paddingBottom: 14, gap: 10 },
  accordionRow: { flexDirection: "row", alignItems: "center", gap: 8 },

  // Neighborhood
  neighborhoodBox: { borderWidth: 1, borderRadius: 14, minHeight: 160, justifyContent: "center", alignItems: "center", padding: 28 },

  // EMI Calc
  calcCard: { borderWidth: 1, borderRadius: 14, overflow: "hidden" },
  emiResult: { padding: 20, alignItems: "center" },
  emiResLabel: { color: "rgba(255,255,255,0.7)", fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8 },
  emiResAmt: { color: "#fff", fontSize: 32, fontWeight: "900", letterSpacing: -0.8, marginTop: 4 },
  calcBody: { padding: 16 },
  calcRow: { marginBottom: 14 },
  calcRowHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 9 },
  calcRowLabel: { fontSize: 12, fontWeight: "500" },
  calcRowVal: { fontSize: 12, fontWeight: "700" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1 },
  chipText: { fontSize: 12, fontWeight: "600" },
  calcSummary: { borderTopWidth: 1, paddingTop: 14, gap: 8 },
  calcSummaryRow: { flexDirection: "row", justifyContent: "space-between" },

  // CTA
  ctaBox: { borderWidth: 1, borderRadius: 18, padding: 18, gap: 13, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.07, shadowRadius: 14, elevation: 3 },
  ctaTitle: { fontSize: 16, fontWeight: "800", letterSpacing: -0.2 },
  tourTypeRow: { flexDirection: "row", borderRadius: 10, padding: 3, gap: 3 },
  tourTypePill: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 9, borderRadius: 8 },
  tourTypeText: { fontSize: 12, fontWeight: "600" },
  datePill: { borderWidth: 1.5, borderRadius: 12, paddingVertical: 9, paddingHorizontal: 12, alignItems: "center", minWidth: 54 },
  datePillDay: { fontSize: 10, fontWeight: "600", textTransform: "uppercase" },
  datePillNum: { fontSize: 19, fontWeight: "900", letterSpacing: -0.5 },
  datePillMon: { fontSize: 10, fontWeight: "500" },
  timeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  timeSlot: { borderWidth: 1.5, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
  timeSlotText: { fontSize: 11, fontWeight: "600" },
  ctaPrimary: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, paddingVertical: 13, borderRadius: 12 },
  ctaPrimaryText: { color: "#fff", fontSize: 14, fontWeight: "800" },
  orRow: { height: 1, justifyContent: "center", alignItems: "center" },
  orText: { position: "absolute", paddingHorizontal: 10, fontSize: 11, fontWeight: "500" },
  ctaSecondary: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, paddingVertical: 12, borderRadius: 12, borderWidth: 1.5 },
  ctaSecondaryText: { fontSize: 14, fontWeight: "700" },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, fontWeight: "500" },
  successBox: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: 10, borderWidth: 1 },


  // ── Agent Hero (homes.com side-by-side layout) ───────────────────────────────
  // Photo is LEFT-aligned at a fixed small size — NOT full-width.
  // Name badge sits to the right, its left edge bleeds slightly over the photo
  // to replicate the homes.com overlap effect.
  agentHeroRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 0,
  },
  agentHeroPhotoWrap: {
    // Fixed size — same proportion as homes.com thumbnail (portrait crop)
    width: 110,
    height: 118,
    borderRadius: 10,
    overflow: "hidden" as any,
    flexShrink: 0,
    backgroundColor: "#E5E7EB",  // placeholder while image loads
  },
  agentHeroFallback: {
    width: "100%" as any, height: "100%" as any,
    justifyContent: "center", alignItems: "center",
  },
  agentHeroInitial: { fontSize: 36, fontWeight: "900" },

  // RIGHT info block — negative marginLeft creates the badge-over-photo overlap
  agentHeroInfo: {
    flex: 1,
    marginLeft: -8,   // badge bleeds 8px onto the photo — homes.com look
    paddingTop: 16,
    gap: 6,
  },
  agentHeroNameBadge: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderTopRightRadius: 8,
    borderBottomRightRadius: 8,
    alignSelf: "flex-start",
  },
  agentHeroNameText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: -0.2,
  },
  // "LISTING AGENT" / "PROPERTY OWNER" label below the badge
  agentHeroRoleText: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.8,
    paddingLeft: 12,
  },
  // Small pill for Agent / Owner / Developer type label
  agentHeroTypePill: {
    alignSelf: "flex-start",
    marginLeft: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 5,
  },
  agentHeroTypePillText: { fontSize: 10, fontWeight: "700", letterSpacing: 0.3 },

  // ── Contact form (homes.com pattern: single pre-filled textarea) ──────────────
  heroMessageBox: {
    borderWidth: 1.5, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, lineHeight: 22,
    minHeight: 88,
    textAlignVertical: "top" as any,
  },

  // ── Primary send button ───────────────────────────────────────────────────────
  heroSendBtn: {
    paddingVertical: 15, borderRadius: 12,
    alignItems: "center", justifyContent: "center",
  },
  heroSendBtnText: { color: "#fff", fontSize: 15, fontWeight: "800", letterSpacing: -0.2 },

  // ── Phone number row ─────────────────────────────────────────────────────────
  // Shown centered + large below the send button (homes.com style)
  heroPhoneRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    paddingVertical: 6,
  },
  heroPhoneNumber: { fontSize: 19, fontWeight: "800", letterSpacing: -0.5 },

  // Tagline
  heroTagline: { fontSize: 12, textAlign: "center", lineHeight: 18 },
});

