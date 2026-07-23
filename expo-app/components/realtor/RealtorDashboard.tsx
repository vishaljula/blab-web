/**
 * RealtorDashboard — property-centric view with 3 tabs.
 *
 * Layout:
 *  ┌─ Sticky top ────────────────────────────────────────┐
 *  │  Hero (greeting + score + tier badge)               │
 *  │  3 stat pills (buyer contacts / new 7d / properties)│
 *  │  (free_trial) trial quota bar                       │
 *  │  [My Properties] [Site Visits] [Buyer Contacts]     │  ← tab bar
 *  └─────────────────────────────────────────────────────┘
 *  ┌─ Scrollable content ────────────────────────────────┐
 *  │  Tab 1 — PropertyActivityCard × N (accordion)       │
 *  │  Tab 2 — All site visits flat sorted by date        │
 *  │  Tab 3 — All buyer contacts flat sorted by date     │
 *  └─────────────────────────────────────────────────────┘
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  Animated,
  LayoutAnimation,
  ActivityIndicator,
  Linking,
  Platform,
  Image,
  UIManager,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColorScheme } from "@/components/useColorScheme";
import { useRouter } from "expo-router";
import { COLORS, TIER_COLORS } from "@/lib/theme";
import {
  useRealtorStore,
  ManagedListing,
  Enquiry,
  ViewingSlot,
} from "@/store/realtor";
import { formatPrice } from "@/lib/format";

// Enable LayoutAnimation on Android
if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface Props { token: string; }

type TabId = "properties" | "siteVisits" | "buyerContacts";

// ── Flat types (for Site Visits + Buyer Contacts tabs) ────────────────────────

interface FlatSiteVisit extends ViewingSlot {
  propertyAddress: string;
  propertyCity: string;
  listingType: "sale" | "rent";
  listingId: string;
  imageUrl?: string;
}

interface FlatBuyerContact extends Enquiry {
  propertyAddress: string;
  propertyCity: string;
  listingType: "sale" | "rent";
  listingId: string;
  imageUrl?: string;
}

// ── Stock photos ──────────────────────────────────────────────────────────────

const STOCK = [
  "https://images.unsplash.com/photo-1570129477492-45c003edd2be?auto=format&fit=crop&w=400&q=70",
  "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=400&q=70",
  "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=400&q=70",
  "https://images.unsplash.com/photo-1580587771525-78b9dba3b914?auto=format&fit=crop&w=400&q=70",
  "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=400&q=70",
  "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=400&q=70",
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(dateStr?: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  const diff = Date.now() - d.getTime();
  if (diff < 0) return "upcoming";
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function viewingDateLabel(iso?: string | null): string {
  if (!iso) return "Date unavailable";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "Date unavailable";
  const today    = new Date();
  const tomorrow = new Date(today.getTime() + 86400000);
  if (d.toDateString() === today.toDateString())    return "Today";
  if (d.toDateString() === tomorrow.toDateString()) return "Tomorrow";
  return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}

function viewingTimeLabel(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
}

// ── StatPill ──────────────────────────────────────────────────────────────────

function StatPill({
  label, value, icon, color, isDark,
}: { label: string; value: number | string; icon: string; color: string; isDark: boolean }) {
  const scaleAnim   = useRef(new Animated.Value(0.9)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const colors = isDark ? COLORS.dark : COLORS.light;
  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim,   { toValue: 1, useNativeDriver: true, tension: 80, friction: 8 }),
      Animated.timing(opacityAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start();
  }, []);
  return (
    <Animated.View style={[s.statPill, { backgroundColor: colors.card, borderColor: colors.border, transform: [{ scale: scaleAnim }], opacity: opacityAnim }]}>
      <View style={s.statTopRow}>
        <View style={[s.statIconWrap, { backgroundColor: `${color}18` }]}>
          <Ionicons name={icon as any} size={18} color={color} />
        </View>
        <Text style={[s.statValue, { color: colors.foreground }]}>{value}</Text>
      </View>
      <Text style={[s.statLabel, { color: colors.mutedForeground }]}>{label}</Text>
    </Animated.View>
  );
}

// ── Tab bar ───────────────────────────────────────────────────────────────────

function TabBar({ active, onSelect, counts, isDark }: {
  active: TabId;
  onSelect: (t: TabId) => void;
  counts: { properties: number; siteVisits: number; buyerContacts: number };
  isDark: boolean;
}) {
  const colors = isDark ? COLORS.dark : COLORS.light;
  const tabs: { id: TabId; label: string; count: number; icon: string }[] = [
    { id: "properties",    label: "My Properties",  count: counts.properties,    icon: "home-outline" },
    { id: "siteVisits",    label: "Site Visits",    count: counts.siteVisits,    icon: "calendar-outline" },
    { id: "buyerContacts", label: "Buyer Contacts", count: counts.buyerContacts, icon: "mail-outline" },
  ];
  return (
    <View style={[s.tabBar, { borderBottomColor: colors.border }]}>
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        return (
          <Pressable
            key={tab.id}
            onPress={() => onSelect(tab.id)}
            style={[
              s.tabBtn,
              isActive && { borderBottomColor: colors.primary, borderBottomWidth: 2 },
              Platform.OS === "web" ? { cursor: "pointer" } as any : {},
            ]}
          >
            <Ionicons
              name={tab.icon as any}
              size={13}
              color={isActive ? colors.primary : colors.mutedForeground}
            />
            <Text style={[s.tabLabel, { color: isActive ? colors.primary : colors.mutedForeground, fontWeight: isActive ? "700" : "500" }]}>
              {tab.label}
            </Text>
            {tab.count > 0 && (
              <View style={[s.tabBadge, { backgroundColor: isActive ? colors.primary : colors.muted }]}>
                <Text style={[s.tabBadgeText, { color: isActive ? "#fff" : colors.mutedForeground }]}>{tab.count}</Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

// ── EnquiryRow ────────────────────────────────────────────────────────────────

function EnquiryRow({
  enquiry, token, listingId, isDark,
}: { enquiry: Enquiry; token: string; listingId: string; isDark: boolean }) {
  const colors = isDark ? COLORS.dark : COLORS.light;
  const { respondToEnquiry } = useRealtorStore();
  const isResponded = !!enquiry.respondedAt;

  const handleWhatsApp = async () => {
    if (!enquiry.requesterPhone) return;
    const ph = enquiry.requesterPhone.replace(/\D/g, "");
    await Linking.openURL(`https://wa.me/${ph}`);
    if (!isResponded) respondToEnquiry(token, enquiry.id, "whatsapp", listingId);
  };
  const handleCall = async () => {
    if (!enquiry.requesterPhone) return;
    await Linking.openURL(`tel:${enquiry.requesterPhone}`);
    if (!isResponded) respondToEnquiry(token, enquiry.id, "call", listingId);
  };

  const initials = (enquiry.requesterName ?? "?")
    .split(" ").slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");

  return (
    <View style={[s.enquiryRow, { borderTopColor: colors.border }]}>
      <View style={[s.enquiryAvatar, { backgroundColor: isResponded ? "#D1FAE5" : "#FEF3C7" }]}>
        <Text style={[s.enquiryInitials, { color: isResponded ? "#065F46" : "#92400E" }]}>{initials}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[s.enquiryName, { color: colors.foreground }]}>
          {enquiry.requesterName ?? "Buyer"}
        </Text>
        <Text style={[s.enquiryTime, { color: colors.mutedForeground }]}>
          {timeAgo(enquiry.createdAt)}
          {isResponded ? "  ·  Responded ✓" : ""}
        </Text>
      </View>
      {!isResponded && (
        <View style={s.enquiryActions}>
          <Pressable
            onPress={handleWhatsApp}
            style={[s.actionBtn, s.waBtn, Platform.OS === "web" ? { cursor: "pointer" } as any : {}]}
          >
            <Ionicons name="logo-whatsapp" size={14} color="#25D366" />
          </Pressable>
          <Pressable
            onPress={handleCall}
            style={[s.actionBtn, { borderColor: colors.border }, Platform.OS === "web" ? { cursor: "pointer" } as any : {}]}
          >
            <Ionicons name="call-outline" size={14} color={colors.primary} />
          </Pressable>
        </View>
      )}
    </View>
  );
}

// ── ViewingRow (accordion nested version) ─────────────────────────────────────

function ViewingRow({ viewing, isDark }: { viewing: ViewingSlot; isDark: boolean }) {
  const colors = isDark ? COLORS.dark : COLORS.light;
  const isPast = new Date(viewing.scheduledAt) < new Date();
  const statusColor =
    viewing.status === "confirmed"  ? "#10B981"
    : viewing.status === "pending"  ? "#F59E0B"
    : viewing.status === "completed"? "#6B7280"
    : "#EF4444";
  return (
    <View style={[s.viewingRow, { borderTopColor: colors.border }]}>
      <View style={[s.viewingDot, { backgroundColor: statusColor }]} />
      <View style={{ flex: 1 }}>
        <Text style={[s.viewingDate, { color: isPast ? colors.mutedForeground : colors.foreground }]}>
          {viewingDateLabel(viewing.scheduledAt)}
          {viewingTimeLabel(viewing.scheduledAt) ? `  ·  ${viewingTimeLabel(viewing.scheduledAt)}` : ""}
        </Text>
        <Text style={[s.viewingDuration, { color: colors.mutedForeground }]}>
          {viewing.durationMins} min · {viewing.status.charAt(0).toUpperCase() + viewing.status.slice(1)}
        </Text>
      </View>
      {isPast && <Ionicons name="checkmark-circle-outline" size={16} color={colors.mutedForeground} />}
    </View>
  );
}

// ── FlatSiteVisitCard (Site Visits tab) ───────────────────────────────────────

function FlatSiteVisitCard({ visit, isDark }: { visit: FlatSiteVisit; isDark: boolean }) {
  const colors = isDark ? COLORS.dark : COLORS.light;
  const router = useRouter();
  const isPast = new Date(visit.scheduledAt) < new Date();
  const isSoon = !isPast && (new Date(visit.scheduledAt).getTime() - Date.now()) < 86400000 * 2;

  const statusColor =
    visit.status === "confirmed"  ? "#10B981"
    : visit.status === "pending"  ? "#F59E0B"
    : visit.status === "completed"? "#6B7280"
    : "#EF4444";

  const listingTypeBg    = visit.listingType === "sale" ? "#FEF3C7" : "#EFF6FF";
  const listingTypeColor = visit.listingType === "sale" ? "#92400E" : "#1D4ED8";
  const listingTypeLabel = visit.listingType === "sale" ? "For Sale" : "For Rent";

  return (
    <Pressable
      onPress={() => router.push(`/property/${visit.listingId}` as any)}
      style={[
        s.flatCard,
        { backgroundColor: colors.card, borderColor: isSoon ? "#10B981" : colors.border },
        Platform.OS === "web" ? { cursor: "pointer" } as any : {},
      ]}
    >
      <Image source={{ uri: visit.imageUrl }} style={s.flatThumb} resizeMode="cover" />
      <View style={{ flex: 1, padding: 10, gap: 4 }}>
        <View style={s.flatTagRow}>
          <View style={[s.tag, { backgroundColor: listingTypeBg }]}>
            <Text style={[s.tagText, { color: listingTypeColor }]}>{listingTypeLabel}</Text>
          </View>
          {isSoon && (
            <View style={[s.tag, { backgroundColor: "#ECFDF5" }]}>
              <Text style={[s.tagText, { color: "#065F46" }]}>Upcoming soon</Text>
            </View>
          )}
        </View>
        <Text style={[s.flatAddress, { color: colors.foreground }]} numberOfLines={1}>
          {visit.propertyAddress}
        </Text>
        <Text style={[s.flatCity, { color: colors.mutedForeground }]}>
          {visit.propertyCity}
        </Text>
        <View style={[s.flatDateRow]}>
          <View style={[s.viewingDot, { backgroundColor: statusColor }]} />
          <Text style={[s.flatDateText, { color: isPast ? colors.mutedForeground : colors.foreground }]}>
            {viewingDateLabel(visit.scheduledAt)}
            {viewingTimeLabel(visit.scheduledAt) ? `  ·  ${viewingTimeLabel(visit.scheduledAt)}` : ""}
          </Text>
          <Text style={[s.flatDuration, { color: colors.mutedForeground }]}>
            · {visit.durationMins} min
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

// ── FlatBuyerContactCard (Buyer Contacts tab) ─────────────────────────────────

function FlatBuyerContactCard({ contact, token, isDark }: {
  contact: FlatBuyerContact; token: string; isDark: boolean;
}) {
  const colors = isDark ? COLORS.dark : COLORS.light;
  const router = useRouter();
  const { respondToEnquiry } = useRealtorStore();
  const isResponded = !!contact.respondedAt;

  const handleWhatsApp = async () => {
    if (!contact.requesterPhone) return;
    const ph = contact.requesterPhone.replace(/\D/g, "");
    await Linking.openURL(`https://wa.me/${ph}`);
    if (!isResponded) respondToEnquiry(token, contact.id, "whatsapp", contact.listingId);
  };
  const handleCall = async () => {
    if (!contact.requesterPhone) return;
    await Linking.openURL(`tel:${contact.requesterPhone}`);
    if (!isResponded) respondToEnquiry(token, contact.id, "call", contact.listingId);
  };

  const initials = (contact.requesterName ?? "?")
    .split(" ").slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");

  const listingTypeBg    = contact.listingType === "sale" ? "#FEF3C7" : "#EFF6FF";
  const listingTypeColor = contact.listingType === "sale" ? "#92400E" : "#1D4ED8";
  const listingTypeLabel = contact.listingType === "sale" ? "For Sale" : "For Rent";

  return (
    <View style={[s.flatCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Image source={{ uri: contact.imageUrl }} style={s.flatThumb} resizeMode="cover" />
      <View style={{ flex: 1, padding: 10, gap: 4 }}>
        {/* Property context */}
        <Pressable
          onPress={() => router.push(`/property/${contact.listingId}` as any)}
          style={Platform.OS === "web" ? { cursor: "pointer" } as any : {}}
        >
          <View style={s.flatTagRow}>
            <View style={[s.tag, { backgroundColor: listingTypeBg }]}>
              <Text style={[s.tagText, { color: listingTypeColor }]}>{listingTypeLabel}</Text>
            </View>
          </View>
          <Text style={[s.flatAddress, { color: colors.foreground }]} numberOfLines={1}>
            {contact.propertyAddress}
          </Text>
          <Text style={[s.flatCity, { color: colors.mutedForeground }]}>{contact.propertyCity}</Text>
        </Pressable>
        {/* Buyer row */}
        <View style={[s.enquiryRow, { borderTopColor: colors.border, marginTop: 4 }]}>
          <View style={[s.enquiryAvatar, { backgroundColor: isResponded ? "#D1FAE5" : "#FEF3C7" }]}>
            <Text style={[s.enquiryInitials, { color: isResponded ? "#065F46" : "#92400E" }]}>{initials}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.enquiryName, { color: colors.foreground }]}>
              {contact.requesterName ?? "Buyer"}
            </Text>
            <Text style={[s.enquiryTime, { color: colors.mutedForeground }]}>
              {timeAgo(contact.createdAt)}
              {isResponded ? "  ·  Responded ✓" : ""}
            </Text>
          </View>
          {!isResponded && (
            <View style={s.enquiryActions}>
              <Pressable
                onPress={handleWhatsApp}
                style={[s.actionBtn, s.waBtn, Platform.OS === "web" ? { cursor: "pointer" } as any : {}]}
              >
                <Ionicons name="logo-whatsapp" size={14} color="#25D366" />
              </Pressable>
              <Pressable
                onPress={handleCall}
                style={[s.actionBtn, { borderColor: colors.border }, Platform.OS === "web" ? { cursor: "pointer" } as any : {}]}
              >
                <Ionicons name="call-outline" size={14} color={colors.primary} />
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

// ── PropertyActivityCard (accordion — My Properties tab) ──────────────────────

function PropertyActivityCard({ listing, token, isDark }: {
  listing: ManagedListing; token: string; isDark: boolean;
}) {
  const colors = isDark ? COLORS.dark : COLORS.light;
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);

  const imageUri = listing.imageUrl ||
    STOCK[Math.abs((listing.price ?? 0) + (listing.address?.charCodeAt(0) ?? 0)) % STOCK.length];

  const toggle = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((v) => !v);
  }, []);

  const listingTypeLabel = listing.listingType === "sale" ? "For Sale" : "For Rent";
  const listingTypeColor = listing.listingType === "sale" ? "#92400E" : "#1D4ED8";
  const listingTypeBg    = listing.listingType === "sale" ? "#FEF3C7" : "#EFF6FF";
  const ptLabel = listing.propertyType
    ? listing.propertyType.charAt(0).toUpperCase() + listing.propertyType.slice(1)
    : null;

  const hasActivity = listing.enquiryCount > 0 || listing.totalViewingCount > 0;

  return (
    <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {/*
        When hasActivity: outer Pressable toggles accordion.
        When !hasActivity: outer Pressable navigates directly to listing.
        Avoids nesting a Pressable inside a Pressable (iOS touch conflict).
      */}
      <Pressable
        onPress={hasActivity ? toggle : () => router.push(`/property/${listing.id}` as any)}
        style={s.cardHeader}
        android_ripple={{ color: `${colors.border}40` }}
      >
        {/* Full-height thumbnail — alignSelf stretch fills full card height */}
        <Image source={{ uri: imageUri }} style={s.cardThumb} resizeMode="cover" />

        {/* Info column */}
        <View style={s.cardInfo}>
          <Text style={[s.cardAddress, { color: colors.foreground }]} numberOfLines={1}>
            {listing.address}
          </Text>
          <Text style={[s.cardCity, { color: colors.mutedForeground }]} numberOfLines={1}>
            {listing.city}  ·  {formatPrice(listing.price)}
          </Text>

          <View style={s.cardTagRow}>
            <View style={[s.tag, { backgroundColor: listingTypeBg }]}>
              <Text style={[s.tagText, { color: listingTypeColor }]}>{listingTypeLabel}</Text>
            </View>
            {ptLabel && (
              <View style={[s.tag, { backgroundColor: `${colors.primary}12` }]}>
                <Text style={[s.tagText, { color: colors.primary }]}>{ptLabel}</Text>
              </View>
            )}
          </View>

          <View style={s.cardCountRow}>
            {listing.enquiryCount > 0 && (
              <View style={s.countChip}>
                <Ionicons name="mail-outline" size={11} color={listing.openEnquiryCount > 0 ? "#EF4444" : colors.mutedForeground} />
                <Text style={[s.countText, { color: listing.openEnquiryCount > 0 ? "#EF4444" : colors.mutedForeground }]}>
                  {listing.enquiryCount} {listing.enquiryCount === 1 ? "contact" : "contacts"}
                  {listing.openEnquiryCount > 0 ? ` (${listing.openEnquiryCount} new)` : ""}
                </Text>
              </View>
            )}
            {listing.upcomingViewingCount > 0 && (
              <View style={s.countChip}>
                <Ionicons name="calendar-outline" size={11} color="#10B981" />
                <Text style={[s.countText, { color: "#10B981" }]}>
                  {listing.upcomingViewingCount} visit{listing.upcomingViewingCount !== 1 ? "s" : ""}
                </Text>
              </View>
            )}
            {listing.nextViewingAt && (
              <Text style={[s.nextViewing, { color: colors.mutedForeground }]}>
                Next: {viewingDateLabel(listing.nextViewingAt)}
              </Text>
            )}
            {!hasActivity && (
              <Text style={[s.countText, { color: colors.mutedForeground }]}>No contacts or visits yet</Text>
            )}
          </View>
        </View>

        {/* Chevron / arrow */}
        <View style={s.cardRight}>
          {hasActivity ? (
            <Ionicons
              name={expanded ? "chevron-up" : "chevron-down"}
              size={16}
              color={colors.mutedForeground}
            />
          ) : (
            <Ionicons name="arrow-forward-circle-outline" size={20} color={colors.mutedForeground} />
          )}
        </View>
      </Pressable>

      {/* Expanded section */}
      {expanded && (
        <View style={[s.expandedSection, { borderTopColor: colors.border }]}>
          <Pressable
            onPress={() => router.push(`/property/${listing.id}` as any)}
            style={[s.viewListingBtn, { borderColor: colors.border }, Platform.OS === "web" ? { cursor: "pointer" } as any : {}]}
          >
            <Ionicons name="home-outline" size={13} color={colors.primary} />
            <Text style={[s.viewListingText, { color: colors.primary }]}>View listing</Text>
          </Pressable>

          {listing.recentEnquiries.length > 0 && (
            <View style={s.expandedGroup}>
              <Text style={[s.expandedGroupLabel, { color: colors.mutedForeground }]}>
                BUYER CONTACTS  ({listing.enquiryCount})
              </Text>
              {listing.recentEnquiries.map((e) => (
                <EnquiryRow key={e.id} enquiry={e} token={token} listingId={listing.id} isDark={isDark} />
              ))}
            </View>
          )}

          {listing.viewings.length > 0 && (
            <View style={s.expandedGroup}>
              <Text style={[s.expandedGroupLabel, { color: colors.mutedForeground }]}>
                SITE VISITS  ({listing.totalViewingCount})
              </Text>
              {listing.viewings.map((v) => (
                <ViewingRow key={v.id} viewing={v} isDark={isDark} />
              ))}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function RealtorDashboard({ token }: Props) {
  const colorScheme = useColorScheme();
  const isDark  = colorScheme === "dark";
  const colors  = isDark ? COLORS.dark : COLORS.light;
  const insets  = useSafeAreaInsets();
  const { dashboard, isLoadingDashboard, fetchDashboard } = useRealtorStore();
  const [activeTab, setActiveTab] = useState<TabId>("properties");

  useEffect(() => { fetchDashboard(token); }, [token]);

  // ── Loading / error ───────────────────────────────────────────────────────

  if (isLoadingDashboard && !dashboard) {
    return (
      <View style={[s.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={[s.loadingText, { color: colors.mutedForeground }]}>Loading dashboard…</Text>
      </View>
    );
  }

  if (!dashboard) {
    return (
      <View style={[s.centered, { backgroundColor: colors.background }]}>
        <Ionicons name="alert-circle-outline" size={48} color={colors.mutedForeground} />
        <Text style={[s.loadingText, { color: colors.mutedForeground }]}>Couldn't load dashboard</Text>
        <Pressable
          onPress={() => fetchDashboard(token)}
          style={[s.retryBtn, { borderColor: colors.border }]}
        >
          <Text style={{ color: colors.foreground, fontWeight: "600" }}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  const { realtor, stats, myListings } = dashboard;
  const tierMeta  = TIER_COLORS[realtor.subscriptionTier] ?? TIER_COLORS.free_trial;
  const hour      = new Date().getHours();
  const greeting  = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const firstName = realtor.name.split(" ")[0];
  const isTrial   = realtor.subscriptionTier === "free_trial";

  // ── Flatten data for the two flat tabs ───────────────────────────────────
  const allSiteVisits: FlatSiteVisit[] = myListings
    .flatMap((l) =>
      l.viewings.map((v) => ({
        ...v,
        propertyAddress: l.address,
        propertyCity:    l.city,
        listingType:     l.listingType,
        listingId:       l.id,
        imageUrl:        l.imageUrl,
      }))
    )
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());

  const allBuyerContacts: FlatBuyerContact[] = myListings
    .flatMap((l) =>
      l.recentEnquiries.map((e) => ({
        ...e,
        propertyAddress: l.address,
        propertyCity:    l.city,
        listingType:     l.listingType,
        listingId:       l.id,
        imageUrl:        l.imageUrl,
      }))
    )
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const trialSalePct   = realtor.trialSaleLeadsMax   > 0 ? realtor.trialSaleLeadsUsed   / realtor.trialSaleLeadsMax   : 0;
  const trialRentalPct = realtor.trialRentalLeadsMax > 0 ? realtor.trialRentalLeadsUsed / realtor.trialRentalLeadsMax : 0;

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>

      {/* ══ STICKY TOP ═══════════════════════════════════════════════════════ */}

      {/* Hero */}
      <View style={[s.hero, { paddingTop: insets.top + 4 }]}>
        <View style={s.heroBg1} />
        <View style={s.heroBg2} />
        <View style={s.heroContent}>
          <View style={s.heroTopRow}>

            {/* ── Avatar: double ring + active dot ──────────────────── */}
            <View style={s.avatarRingOuter}>
              <View style={s.avatarRingInner}>
                {realtor.photoUrl ? (
                  <Image
                    source={{ uri: realtor.photoUrl }}
                    style={s.avatarImage}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={[s.avatarImage, s.avatarFallback]}>
                    <Text style={s.avatarInitials}>
                      {realtor.name.split(" ").slice(0, 2).map((w: string) => w[0]?.toUpperCase() ?? "").join("")}
                    </Text>
                  </View>
                )}
              </View>
              {/* Active / online dot */}
              <View style={s.avatarDot} />
            </View>

            {/* ── Greeting + name + score + tier badge ───────────── */}
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={s.greeting}>{greeting}</Text>
              <Text style={s.heroName}>{firstName} 👋</Text>
              {/* Score + tier badge on same row */}
              <View style={s.scoreRow}>
                <Ionicons name="trending-up-outline" size={12} color="rgba(255,255,255,0.65)" />
                <Text style={s.scoreValue}>{(realtor.realtorScore ?? 0).toLocaleString()}</Text>
                <Text style={s.scoreLabel}>pts</Text>
                <View style={[s.tierPill, { backgroundColor: tierMeta.bg, borderColor: tierMeta.border }]}>
                  {realtor.subscriptionTier === "pro_plus" && (
                    <Ionicons name="star" size={9} color="#92400E" style={{ marginRight: 2 }} />
                  )}
                  <Text style={[s.tierPillText, { color: tierMeta.text }]}>{tierMeta.label}</Text>
                </View>
              </View>
            </View>

          </View>
        </View>
      </View>

      {/* Stat pills */}
      <View style={s.statRow}>
        <StatPill label="Buyer Contacts"            value={myListings.reduce((acc, l) => acc + l.enquiryCount, 0)} icon="mail-outline"      color="#EF4444"        isDark={isDark} />
        <StatPill label={"New Contacts\n(7 days)"}  value={stats.newEnquiries7d}                                   icon="bar-chart-outline" color="#3B82F6"        isDark={isDark} />
        <StatPill label="My Properties"             value={myListings.length}                                      icon="home-outline"      color={colors.primary} isDark={isDark} />
      </View>

      {/* Trial quota (free_trial only) */}
      {isTrial && (
        <View style={[s.trialRow, { borderColor: "#1E293B", backgroundColor: "#0F172A" }]}>
          <View style={s.trialHeader}>
            <Ionicons name="flash" size={13} color="#F97316" />
            <Text style={[s.trialTitle, { color: "rgba(255,255,255,0.9)" }]}>Seller leads — free trial</Text>
            <Pressable
              style={[s.upgradeChip, Platform.OS === "web" ? { cursor: "pointer" } as any : {}]}
              onPress={() => { /* TODO: navigate to upgrade screen */ }}
            >
              <Text style={s.upgradeCrownIcon}>👑</Text>
              <Text style={s.upgradeChipText}>Upgrade</Text>
            </Pressable>
          </View>
          <View style={s.trialBars}>
            <View style={s.trialBarGroup}>
              <Text style={[s.trialBarLabel, { color: "rgba(255,255,255,0.6)" }]}>Sale properties</Text>
              <View style={[s.trialBarTrack, { backgroundColor: "rgba(255,255,255,0.12)" }]}>
                <View style={[s.trialBarFill, { width: `${Math.min(trialSalePct, 1) * 100}%`, backgroundColor: "#F97316" }]} />
              </View>
              <Text style={[s.trialBarCount, { color: "#fff" }]}>
                {realtor.trialSaleLeadsUsed} of {realtor.trialSaleLeadsMax} used
              </Text>
            </View>
            <View style={[s.trialBarGroup, { marginLeft: 16 }]}>
              <Text style={[s.trialBarLabel, { color: "rgba(255,255,255,0.6)" }]}>Rental properties</Text>
              <View style={[s.trialBarTrack, { backgroundColor: "rgba(255,255,255,0.12)" }]}>
                <View style={[s.trialBarFill, { width: `${Math.min(trialRentalPct, 1) * 100}%`, backgroundColor: "#3B82F6" }]} />
              </View>
              <Text style={[s.trialBarCount, { color: "#fff" }]}>
                {realtor.trialRentalLeadsUsed} of {realtor.trialRentalLeadsMax} used
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* Tab bar */}
      <TabBar
        active={activeTab}
        onSelect={setActiveTab}
        counts={{
          properties:    myListings.length,
          siteVisits:    allSiteVisits.length,
          buyerContacts: allBuyerContacts.length,
        }}
        isDark={isDark}
      />

      {/* ══ SCROLLABLE CONTENT ════════════════════════════════════════════════ */}

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={s.listContent}
        showsVerticalScrollIndicator={false}
        key={activeTab}  // remount scrollview on tab switch to reset scroll position
      >
        {/* ── Tab 1: My Properties ── */}
        {activeTab === "properties" && (
          <>
            {myListings.length === 0 ? (
              <View style={s.emptyState}>
                <Ionicons name="home-outline" size={40} color={colors.mutedForeground} />
                <Text style={[s.emptyTitle, { color: colors.foreground }]}>No properties yet</Text>
                <Text style={[s.emptySub, { color: colors.mutedForeground }]}>
                  When a seller assigns you to their listing, it will appear here.
                </Text>
              </View>
            ) : (
              myListings.map((listing) => (
                <PropertyActivityCard
                  key={listing.id}
                  listing={listing}
                  token={token}
                  isDark={isDark}
                />
              ))
            )}
          </>
        )}

        {/* ── Tab 2: Site Visits ── */}
        {activeTab === "siteVisits" && (
          <>
            {allSiteVisits.length === 0 ? (
              <View style={s.emptyState}>
                <Ionicons name="calendar-outline" size={40} color={colors.mutedForeground} />
                <Text style={[s.emptyTitle, { color: colors.foreground }]}>No site visits</Text>
                <Text style={[s.emptySub, { color: colors.mutedForeground }]}>
                  Scheduled property visits from buyers will appear here.
                </Text>
              </View>
            ) : (
              <>
                {/* Group: Upcoming */}
                {allSiteVisits.filter(v => new Date(v.scheduledAt) >= new Date()).length > 0 && (
                  <>
                    <Text style={[s.flatGroupHeader, { color: colors.mutedForeground }]}>UPCOMING</Text>
                    {allSiteVisits
                      .filter(v => new Date(v.scheduledAt) >= new Date() && v.status !== "cancelled")
                      .map(v => <FlatSiteVisitCard key={v.id} visit={v} isDark={isDark} />)
                    }
                  </>
                )}
                {/* Group: Past */}
                {allSiteVisits.filter(v => new Date(v.scheduledAt) < new Date()).length > 0 && (
                  <>
                    <Text style={[s.flatGroupHeader, { color: colors.mutedForeground, marginTop: 16 }]}>PAST</Text>
                    {allSiteVisits
                      .filter(v => new Date(v.scheduledAt) < new Date())
                      .reverse()
                      .map(v => <FlatSiteVisitCard key={v.id} visit={v} isDark={isDark} />)
                    }
                  </>
                )}
              </>
            )}
          </>
        )}

        {/* ── Tab 3: Buyer Contacts ── */}
        {activeTab === "buyerContacts" && (
          <>
            {allBuyerContacts.length === 0 ? (
              <View style={s.emptyState}>
                <Ionicons name="mail-outline" size={40} color={colors.mutedForeground} />
                <Text style={[s.emptyTitle, { color: colors.foreground }]}>No buyer contacts</Text>
                <Text style={[s.emptySub, { color: colors.mutedForeground }]}>
                  When buyers enquire about your properties, they'll appear here.
                </Text>
              </View>
            ) : (
              allBuyerContacts.map(c => (
                <FlatBuyerContactCard key={c.id} contact={c} token={token} isDark={isDark} />
              ))
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root:        { flex: 1 },
  centered:    { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText: { fontSize: 14, marginTop: 8 },
  retryBtn:    { marginTop: 8, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8, borderWidth: 1 },

  // Hero
  hero: {
    backgroundColor: "#8B2500",
    paddingHorizontal: 20,
    paddingBottom: 24,
    position: "relative",
    overflow: "hidden",
  },
  heroBg1: { position: "absolute", top: -40, right: -40, width: 160, height: 160, borderRadius: 80, backgroundColor: "rgba(255,255,255,0.06)" },
  heroBg2: { position: "absolute", bottom: -20, left: -20, width: 100, height: 100, borderRadius: 50, backgroundColor: "rgba(255,255,255,0.04)" },
  heroContent:  { position: "relative", zIndex: 1 },
  heroTopRow:   { flexDirection: "row", alignItems: "center" },

  // ── Premium glow-ring avatar ────────────────────────────────────────────────
  // Outer ring: brand accent colour, acts as the visible coloured border
  avatarRingOuter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: "#E05C1A",   // orange accent ring
    padding: 2.5,
    position: "relative",
    ...Platform.select({
      ios:     { shadowColor: "#E05C1A", shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.7, shadowRadius: 10 },
      android: { elevation: 6 },
      web:     { boxShadow: "0 0 16px rgba(224,92,26,0.65)" } as any,
    }),
  },
  // Inner ring: dark spacer that creates the double-ring gap effect
  avatarRingInner: {
    flex: 1,
    borderRadius: 35,
    backgroundColor: "rgba(0,0,0,0.35)",
    padding: 2,
    overflow: "hidden",
  },
  avatarImage: {
    flex: 1,
    borderRadius: 33,
  },
  avatarFallback: {
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitials: {
    fontSize: 22,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: 1,
  },
  // Active / online status dot
  avatarDot: {
    position: "absolute",
    bottom: 2,
    right: 2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#22C55E",   // green = active
    borderWidth: 2.5,
    borderColor: "#8B2500",       // matches hero bg so it 'cuts out'
  },

  greeting:  { color: "rgba(255,255,255,0.7)", fontSize: 13, fontWeight: "400", marginBottom: 1 },
  heroName:  { color: "#fff", fontSize: 26, fontWeight: "800", letterSpacing: -0.5, marginBottom: 4 },

  // Score + tier pill on same row
  scoreRow:     { flexDirection: "row", alignItems: "center", gap: 5 },
  scoreValue:   { color: "#fff", fontSize: 13, fontWeight: "700" },
  scoreLabel:   { color: "rgba(255,255,255,0.55)", fontSize: 12 },
  tierPill:     { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, borderWidth: 1, marginLeft: 4 },
  tierPillText: { fontSize: 10, fontWeight: "700" },

  // Keep old names as aliases so nothing else breaks
  tierBadge:    { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 1, flexDirection: "row", alignItems: "center" },
  tierBadgeText:{ fontSize: 11, fontWeight: "700" },

  // Stat pills
  statRow: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  statPill: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 14,
    gap: 6,
    ...Platform.select({
      ios:     { shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6 },
      android: { elevation: 2 },
      web:     { boxShadow: "0 1px 6px rgba(0,0,0,0.06)" } as any,
    }),
  },
  statTopRow:   { flexDirection: "row", alignItems: "center", gap: 10 },
  statIconWrap: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  statValue:    { fontSize: 28, fontWeight: "800", letterSpacing: -1 },
  statLabel:    { fontSize: 12, fontWeight: "600" },

  // Trial quota
  trialRow:      { marginHorizontal: 14, borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 2 },
  trialHeader:   { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
  trialTitle:    { fontSize: 12, fontWeight: "700", flex: 1 },
  upgradeChip:   {
    backgroundColor: "#0F172A",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    ...Platform.select({
      ios:     { shadowColor: "#0F172A", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.4, shadowRadius: 6 },
      android: { elevation: 3 },
      web:     { boxShadow: "0 2px 8px rgba(15,23,42,0.5)" } as any,
    }),
  },
  upgradeCrownIcon: { fontSize: 12 },
  upgradeChipText: { fontSize: 12, fontWeight: "700", color: "#fff", letterSpacing: 0.2 },
  trialBars:     { flexDirection: "row" },
  trialBarGroup: { flex: 1, gap: 4 },
  trialBarLabel: { fontSize: 11 },
  trialBarTrack: { height: 6, borderRadius: 3, overflow: "hidden" },
  trialBarFill:  { height: 6, borderRadius: 3 },
  trialBarCount: { fontSize: 11, fontWeight: "600" },

  // Tab bar
  tabBar: { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth, marginTop: 4, marginHorizontal: 14 },
  tabBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 4, paddingVertical: 10, paddingHorizontal: 4,
  },
  tabLabel: { fontSize: 11, letterSpacing: 0.1 },
  tabBadge: { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 8, minWidth: 18, alignItems: "center" },
  tabBadgeText: { fontSize: 10, fontWeight: "700" },

  // Scrollable content
  listContent: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 40, gap: 10 },

  // Property accordion card
  card: {
    borderRadius: 16, borderWidth: 1, overflow: "hidden",
    ...Platform.select({
      ios:     { shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 10 },
      android: { elevation: 3 },
      web:     { boxShadow: "0 2px 10px rgba(0,0,0,0.08)" } as any,
    }),
  },
  cardHeader:  { flexDirection: "row", minHeight: 90 },
  cardThumb:   { width: 88, alignSelf: "stretch" },
  cardInfo:    { flex: 1, padding: 10, gap: 3 },
  cardAddress: { fontSize: 14, fontWeight: "700" },
  cardCity:    { fontSize: 12 },
  cardTagRow:  { flexDirection: "row", gap: 5, marginTop: 2 },
  cardCountRow:{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
  cardRight:   { justifyContent: "center", paddingRight: 10 },

  tag:     { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5 },
  tagText: { fontSize: 11, fontWeight: "600" },
  countChip:   { flexDirection: "row", alignItems: "center", gap: 3 },
  countText:   { fontSize: 11, fontWeight: "600" },
  nextViewing: { fontSize: 11 },

  // Expanded section (accordion)
  expandedSection: { borderTopWidth: 1, paddingHorizontal: 12, paddingBottom: 12 },
  viewListingBtn:  {
    flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start",
    marginVertical: 10, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1,
  },
  viewListingText:    { fontSize: 12, fontWeight: "600" },
  expandedGroup:      { marginTop: 8 },
  expandedGroupLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 0.8, marginBottom: 4 },

  // Flat cards (Site Visits + Buyer Contacts tabs)
  flatCard: {
    borderRadius: 14, borderWidth: 1, flexDirection: "row", overflow: "hidden",
    ...Platform.select({
      ios:     { shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6 },
      android: { elevation: 2 },
      web:     { boxShadow: "0 1px 6px rgba(0,0,0,0.07)" } as any,
    }),
  },
  flatThumb:    { width: 72, alignSelf: "stretch" },
  flatTagRow:   { flexDirection: "row", gap: 5, marginBottom: 2 },
  flatAddress:  { fontSize: 13, fontWeight: "700" },
  flatCity:     { fontSize: 11 },
  flatDateRow:  { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 4 },
  flatDateText: { fontSize: 12, fontWeight: "600" },
  flatDuration: { fontSize: 11 },
  flatGroupHeader: { fontSize: 10, fontWeight: "800", letterSpacing: 1, marginBottom: 6 },

  // Enquiry row (shared between accordion + flat)
  enquiryRow:      { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth },
  enquiryAvatar:   { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  enquiryInitials: { fontSize: 12, fontWeight: "700" },
  enquiryName:     { fontSize: 13, fontWeight: "600" },
  enquiryTime:     { fontSize: 11, marginTop: 1 },
  enquiryActions:  { flexDirection: "row", gap: 6 },
  actionBtn:       { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "transparent" },
  waBtn:           { backgroundColor: "#F0FFF4" },

  // Viewing row (accordion nested)
  viewingRow:     { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth },
  viewingDot:     { width: 8, height: 8, borderRadius: 4 },
  viewingDate:    { fontSize: 13, fontWeight: "600" },
  viewingDuration:{ fontSize: 11, marginTop: 1 },

  // Empty states
  emptyState: { alignItems: "center", paddingTop: 48, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: "700" },
  emptySub:   { fontSize: 13, textAlign: "center", maxWidth: 260 },
});
