/**
 * RealtorDashboard — property-centric view with 3 tabs.
 *
 * Layout:
 *  ┌─ Sticky top ────────────────────────────────────────┐
 *  │  Hero (greeting + score + tier badge)               │
 *  │  3 stat pills (buyer contacts / new 7d / properties)│
 *  │  (Starter: free_trial + soft_cap) Option-B cap bars │
 *  │  (pro / pro_plus) compact Pro confirmation strip    │
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
import { COLORS, TIER_COLORS, API_BASE_URL } from "@/lib/theme";
// AUDIT-001 / T3 — raw Pressable is banned in this file by scripts/a11y-guard.mjs;
// A11yPressable makes a label + role structurally mandatory and applies the 44pt floor.
import { A11yPressable, HIT } from "@/components/a11y/AccessiblePressable";
import {
  useRealtorStore,
  deriveCapState,
  overflowLabel,
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

// ── Viewing status (dot + text label) ────────────────────────────────────────
// uxd-critique.md §F1 / §H8: the 8x8 `viewingDot` encoded viewing status in colour alone
// (WCAG 2.2 §1.4.1). The colour stays; a text label now travels with it everywhere.

const VIEWING_STATUS_COLOR: Record<string, string> = {
  confirmed: "#10B981",
  pending:   "#F59E0B",
  completed: "#6B7280",
};
const CANCELLED_COLOR = "#EF4444";

function viewingStatusColor(status: string): string {
  return VIEWING_STATUS_COLOR[status] ?? CANCELLED_COLOR;
}

function viewingStatusLabel(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

/** 8pt status dot plus its text equivalent — never colour on its own. */
function StatusDot({ status, labelColor }: { status: string; labelColor: string }) {
  return (
    <View style={s.statusDotRow}>
      <View style={[s.viewingDot, { backgroundColor: viewingStatusColor(status) }]} />
      <Text style={[s.statusDotLabel, { color: labelColor }]}>{viewingStatusLabel(status)}</Text>
    </View>
  );
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
    // §H7: a real tablist, so a screen reader can report which tab is active instead of
    // leaving that to a 2px underline and a colour shift.
    <View style={[s.tabBar, { borderBottomColor: colors.border }]} accessibilityRole="tablist">
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        return (
          <A11yPressable
            key={tab.id}
            onPress={() => onSelect(tab.id)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={`${tab.label}, ${tab.count} item${tab.count === 1 ? "" : "s"}`}
            style={[
              s.tabBtn,
              isActive && { borderBottomColor: colors.primary, borderBottomWidth: 2 },
            ]}
          >
            <Ionicons
              name={tab.icon as any}
              size={13}
              color={isActive ? colors.primary : colors.mutedForeground}
            />
            {/* §H7: single line — the 11px label wrapped on 360pt devices. */}
            <Text
              numberOfLines={1}
              style={[s.tabLabel, { color: isActive ? colors.primary : colors.mutedForeground, fontWeight: isActive ? "700" : "500" }]}
            >
              {tab.label}
            </Text>
            {tab.count > 0 && (
              <View style={[s.tabBadge, { backgroundColor: isActive ? colors.primary : colors.muted }]}>
                <Text style={[s.tabBadgeText, { color: isActive ? "#fff" : colors.mutedForeground }]}>{tab.count}</Text>
              </View>
            )}
          </A11yPressable>
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
  const buyerName = enquiry.requesterName ?? "Buyer";

  return (
    <View style={[s.enquiryRow, { borderTopColor: colors.border }]}>
      {/* The avatar tint duplicates the responded/open state carried in text below, so it
          is hidden from the screen reader rather than announced as a bare initial. */}
      <View
        style={[s.enquiryAvatar, { backgroundColor: isResponded ? "#D1FAE5" : "#FEF3C7" }]}
        importantForAccessibility="no"
        accessibilityElementsHidden
      >
        <Text style={[s.enquiryInitials, { color: isResponded ? "#065F46" : "#92400E" }]} allowFontScaling={false}>{initials}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[s.enquiryName, { color: colors.foreground }]}>{buyerName}</Text>
        <Text style={[s.enquiryTime, { color: colors.mutedForeground }]}>
          {timeAgo(enquiry.createdAt)}
          {isResponded ? "  ·  Responded ✓" : ""}
        </Text>
      </View>
      {!isResponded && (
        <View style={s.enquiryActions}>
          <A11yPressable
            onPress={handleWhatsApp}
            accessibilityRole="button"
            accessibilityLabel={`WhatsApp ${buyerName}`}
            accessibilityHint="Opens WhatsApp and marks this contact as responded"
            style={[s.actionBtn, s.waBtn]}
          >
            <Ionicons name="logo-whatsapp" size={14} color="#25D366" />
          </A11yPressable>
          <A11yPressable
            onPress={handleCall}
            accessibilityRole="button"
            accessibilityLabel={`Call ${buyerName}`}
            accessibilityHint="Starts a phone call and marks this contact as responded"
            style={[s.actionBtn, { borderColor: colors.border }]}
          >
            <Ionicons name="call-outline" size={14} color={colors.primary} />
          </A11yPressable>
        </View>
      )}
    </View>
  );
}

// ── ViewingRow (accordion nested version) ─────────────────────────────────────

function ViewingRow({ viewing, isDark }: { viewing: ViewingSlot; isDark: boolean }) {
  const colors = isDark ? COLORS.dark : COLORS.light;
  const isPast = new Date(viewing.scheduledAt) < new Date();
  const dateLabel = viewingDateLabel(viewing.scheduledAt);
  const timeLabel = viewingTimeLabel(viewing.scheduledAt);
  return (
    <View
      style={[s.viewingRow, { borderTopColor: colors.border }]}
      // One announcement per row rather than four disconnected fragments.
      accessible
      accessibilityLabel={`Site visit ${dateLabel}${timeLabel ? ` at ${timeLabel}` : ""}, ${viewing.durationMins} minutes, ${viewingStatusLabel(viewing.status)}${isPast ? ", past" : ""}`}
    >
      <View style={[s.viewingDot, { backgroundColor: viewingStatusColor(viewing.status) }]} />
      <View style={{ flex: 1 }}>
        <Text style={[s.viewingDate, { color: isPast ? colors.mutedForeground : colors.foreground }]}>
          {dateLabel}
          {timeLabel ? `  ·  ${timeLabel}` : ""}
        </Text>
        {/* Text equivalent for the dot colour (§H8) — already present here, kept. */}
        <Text style={[s.viewingDuration, { color: colors.mutedForeground }]}>
          {viewing.durationMins} min · {viewingStatusLabel(viewing.status)}
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

  const listingTypeBg    = visit.listingType === "sale" ? "#FEF3C7" : "#EFF6FF";
  const listingTypeColor = visit.listingType === "sale" ? "#92400E" : "#1D4ED8";
  const listingTypeLabel = visit.listingType === "sale" ? "For Sale" : "For Rent";
  const dateLabel = viewingDateLabel(visit.scheduledAt);
  const timeLabel = viewingTimeLabel(visit.scheduledAt);

  return (
    <A11yPressable
      onPress={() => router.push(`/property/${visit.listingId}` as any)}
      accessibilityRole="button"
      accessibilityLabel={`${listingTypeLabel}, ${visit.propertyAddress}, ${visit.propertyCity}. Site visit ${dateLabel}${timeLabel ? ` at ${timeLabel}` : ""}, ${visit.durationMins} minutes, ${viewingStatusLabel(visit.status)}${isSoon ? ", upcoming soon" : ""}`}
      accessibilityHint="Opens the property detail page"
      style={[
        s.flatCard,
        { backgroundColor: colors.card, borderColor: isSoon ? "#10B981" : colors.border },
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
        <Text style={[s.flatCity, { color: colors.mutedForeground }]} numberOfLines={1}>
          {visit.propertyCity}
        </Text>
        <View style={s.flatDateRow}>
          <Text style={[s.flatDateText, { color: isPast ? colors.mutedForeground : colors.foreground }]}>
            {dateLabel}
            {timeLabel ? `  ·  ${timeLabel}` : ""}
          </Text>
          <Text style={[s.flatDuration, { color: colors.mutedForeground }]}>
            · {visit.durationMins} min
          </Text>
        </View>
        {/* §H8: this dot previously had NO text equivalent anywhere in the card. */}
        <StatusDot status={visit.status} labelColor={colors.mutedForeground} />
      </View>
    </A11yPressable>
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
  const buyerName = contact.requesterName ?? "Buyer";

  return (
    <View style={[s.flatCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Image source={{ uri: contact.imageUrl }} style={s.flatThumb} resizeMode="cover" />
      <View style={{ flex: 1, padding: 10, gap: 4 }}>
        {/* Property context */}
        <A11yPressable
          onPress={() => router.push(`/property/${contact.listingId}` as any)}
          accessibilityRole="button"
          accessibilityLabel={`${listingTypeLabel}, ${contact.propertyAddress}, ${contact.propertyCity}`}
          accessibilityHint="Opens the property detail page"
          style={s.flatContextBtn}
        >
          <View style={s.flatTagRow}>
            <View style={[s.tag, { backgroundColor: listingTypeBg }]}>
              <Text style={[s.tagText, { color: listingTypeColor }]}>{listingTypeLabel}</Text>
            </View>
          </View>
          <Text style={[s.flatAddress, { color: colors.foreground }]} numberOfLines={1}>
            {contact.propertyAddress}
          </Text>
          <Text style={[s.flatCity, { color: colors.mutedForeground }]} numberOfLines={1}>
            {contact.propertyCity}
          </Text>
        </A11yPressable>
        {/* Buyer row */}
        <View style={[s.enquiryRow, { borderTopColor: colors.border, marginTop: 4 }]}>
          <View
            style={[s.enquiryAvatar, { backgroundColor: isResponded ? "#D1FAE5" : "#FEF3C7" }]}
            importantForAccessibility="no"
            accessibilityElementsHidden
          >
            <Text style={[s.enquiryInitials, { color: isResponded ? "#065F46" : "#92400E" }]} allowFontScaling={false}>{initials}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.enquiryName, { color: colors.foreground }]}>{buyerName}</Text>
            <Text style={[s.enquiryTime, { color: colors.mutedForeground }]}>
              {timeAgo(contact.createdAt)}
              {isResponded ? "  ·  Responded ✓" : ""}
            </Text>
          </View>
          {!isResponded && (
            <View style={s.enquiryActions}>
              <A11yPressable
                onPress={handleWhatsApp}
                accessibilityRole="button"
                accessibilityLabel={`WhatsApp ${buyerName} about ${contact.propertyAddress}`}
                accessibilityHint="Opens WhatsApp and marks this contact as responded"
                style={[s.actionBtn, s.waBtn]}
              >
                <Ionicons name="logo-whatsapp" size={14} color="#25D366" />
              </A11yPressable>
              <A11yPressable
                onPress={handleCall}
                accessibilityRole="button"
                accessibilityLabel={`Call ${buyerName} about ${contact.propertyAddress}`}
                accessibilityHint="Starts a phone call and marks this contact as responded"
                style={[s.actionBtn, { borderColor: colors.border }]}
              >
                <Ionicons name="call-outline" size={14} color={colors.primary} />
              </A11yPressable>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

// ── PropertyActivityCard (accordion — My Properties tab) ──────────────────────

function PropertyActivityCard({ listing, token, isDark, onRefresh }: {
  listing: ManagedListing; token: string; isDark: boolean; onRefresh?: () => void;
}) {
  const colors = isDark ? COLORS.dark : COLORS.light;
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const handlePublishDraft = async () => {
    setPublishing(true);
    try {
      await fetch(`${API_BASE_URL}/api/realtors/dashboard`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "publish_and_schedule", listingId: listing.id }),
      });
      onRefresh?.();
    } finally {
      setPublishing(false);
    }
  };

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

  // Owner-handoff drafts are genuinely unpriced (price = 0), so both the visible
  // line and the spoken label drop the price segment rather than claiming "₹0".
  // BLA-14 §5 — would occur in PROD, not just on UAT fixtures.
  const isUnpricedDraft = listing.status === "draft" && !listing.price;
  const priceLabel = isUnpricedDraft ? null : formatPrice(listing.price);

  // Spoken summary of the count chips, which are otherwise read as loose fragments.
  const activitySummary = hasActivity
    ? [
        listing.enquiryCount > 0
          ? `${listing.enquiryCount} buyer ${listing.enquiryCount === 1 ? "contact" : "contacts"}${listing.openEnquiryCount > 0 ? `, ${listing.openEnquiryCount} new` : ""}`
          : null,
        listing.upcomingViewingCount > 0
          ? `${listing.upcomingViewingCount} upcoming site ${listing.upcomingViewingCount === 1 ? "visit" : "visits"}`
          : null,
      ]
        .filter(Boolean)
        .join(", ")
    : "No contacts or visits yet";

  return (
    <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {/*
        When hasActivity: outer Pressable toggles accordion.
        When !hasActivity: outer Pressable navigates directly to listing.

        Nothing pressable may be nested inside this header. On iOS `accessible`
        defaults to true on Pressable, so UIKit treats the header as an
        accessibility leaf and never exposes its descendants; an explicit
        accessibilityLabel here also short-circuits child-label aggregation.
        A nested CTA would be both unfocusable and unannounced, and its press
        would route to this handler. The draft CTA is therefore a sibling
        below the header, not a child. BLA-14 §2 / §6 option 1.
      */}
      <A11yPressable
        onPress={hasActivity ? toggle : () => router.push(`/property/${listing.id}` as any)}
        accessibilityRole="button"
        accessibilityLabel={`${listing.address}, ${listing.city}${priceLabel ? `, ${priceLabel}` : ""}, ${listingTypeLabel}${listing.status === "draft" ? ", new owner handoff" : ""}. ${activitySummary}`}
        accessibilityHint={hasActivity ? "Expands buyer contacts and site visits for this property" : "Opens the property detail page"}
        // Expanded state must be announced, not inferred from the chevron glyph.
        accessibilityState={hasActivity ? { expanded } : undefined}
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
            {listing.city}{priceLabel ? `  ·  ${priceLabel}` : ""}
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
            {listing.status === "draft" && (
              <View style={[s.tag, { backgroundColor: "#F59E0B20" }]}>
                <Text style={[s.tagText, { color: "#D97706" }]}>New Owner Handoff</Text>
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
      </A11yPressable>

      {/*
        Accept-handoff CTA — a SIBLING of the header, never a child of it.
        See the header comment above: nesting makes this unreachable to
        VoiceOver, which would leave a screen-reader Realtor unable to accept
        an owner handoff at all (adjacent to Marketplace Invariants #2/#3).
        Left-inset to line up with the info column rather than the thumbnail.

        Nesting also broke web, independently of iOS: accessibilityRole="button"
        makes react-native-web render a real <button> element (roleComponents in
        AccessibilityUtil/propsToAccessibilityComponent), so a nested CTA emitted
        <button> inside <button> — invalid HTML plus React's "cannot be a
        descendant of" hydration warning on every dashboard render.
        BLA-12 Layer-2 QA FAIL #1; BLA-14 §6 option 1.
      */}
      {listing.status === "draft" && (
        <View style={s.draftCtaRow}>
          <A11yPressable
            onPress={handlePublishDraft}
            disabled={publishing}
            accessibilityRole="button"
            accessibilityLabel={publishing ? "Booking shoot" : `Accept handoff and schedule shoot for ${listing.address}`}
            accessibilityState={{ disabled: publishing, busy: publishing }}
            style={[s.publishDraftBtn, { backgroundColor: colors.primary }]}
          >
            <Ionicons name="camera-outline" size={13} color="#fff" />
            <Text style={s.publishDraftText}>
              {publishing ? "Booking Shoot…" : "Accept & Schedule Shoot"}
            </Text>
          </A11yPressable>
        </View>
      )}

      {/* Expanded section */}
      {expanded && (
        <View style={[s.expandedSection, { borderTopColor: colors.border }]}>
          <A11yPressable
            onPress={() => router.push(`/property/${listing.id}` as any)}
            accessibilityRole="button"
            accessibilityLabel={`View listing for ${listing.address}`}
            style={[s.viewListingBtn, { borderColor: colors.border }]}
          >
            <Ionicons name="home-outline" size={13} color={colors.primary} />
            <Text style={[s.viewListingText, { color: colors.primary }]}>View listing</Text>
          </A11yPressable>

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
        <A11yPressable
          onPress={() => fetchDashboard(token)}
          accessibilityRole="button"
          accessibilityLabel="Retry loading dashboard"
          style={[s.retryBtn, { borderColor: colors.border }]}
        >
          <Text style={{ color: colors.foreground, fontWeight: "600" }}>Retry</Text>
        </A11yPressable>
      </View>
    );
  }

  const { realtor, foundingProgram, stats, myListings } = dashboard;
  const tierMeta  = TIER_COLORS[realtor.subscriptionTier] ?? TIER_COLORS.free_trial;
  const hour      = new Date().getHours();
  const greeting  = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const firstName = realtor.name.split(" ")[0];

  // ── Server-authoritative Option-B cap state (Protected Surface #4) ────────
  // Every cap number below comes from the server via `deriveCapState`; nothing
  // is re-computed here and `myListings.length` is never used as an active-count
  // proxy (AUDIT-001 / E1, E2). See `store/realtorCaps.ts` for the full contract.
  const {
    isPaidPro, listingCap, handoffCap,
    activeListings, activeHandoffs, overflowCount,
    listingFill, handoffFill,
  } = deriveCapState(realtor);

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
            {/* The green `avatarDot` is colour-only, so the online state is spoken here. */}
            <View
              style={s.avatarRingOuter}
              accessible
              accessibilityRole="image"
              accessibilityLabel={`${realtor.name}, online`}
            >
              <View style={s.avatarRingInner}>
                {realtor.photoUrl ? (
                  <Image
                    source={{ uri: realtor.photoUrl }}
                    style={s.avatarImage}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={[s.avatarImage, s.avatarFallback]}>
                    {/* Decorative: the name is spoken by the ring's label. Exempt from font
                        scaling so it cannot clip out of the fixed 76pt ring. */}
                    <Text style={s.avatarInitials} allowFontScaling={false}>
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
              <View
                style={s.scoreRow}
                accessible
                accessibilityLabel={`Realtor score ${(realtor.realtorScore ?? 0).toLocaleString()} points, ${tierMeta.label} tier`}
              >
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

      {/* Stat pills — §F3: the hardcoded "\n" is gone; `statLabel.lineHeight` wraps it now,
          so the label reflows at larger text sizes instead of breaking at a fixed point. */}
      <View style={s.statRow}>
        <StatPill label="Buyer Contacts"          value={myListings.reduce((acc, l) => acc + l.enquiryCount, 0)} icon="mail-outline"      color="#EF4444"        isDark={isDark} />
        <StatPill label="New Contacts (7 days)"   value={stats.newEnquiries7d}                                   icon="bar-chart-outline" color="#3B82F6"        isDark={isDark} />
        <StatPill label="My Properties"           value={myListings.length}                                      icon="home-outline"      color={colors.primary} isDark={isDark} />
      </View>

      {/* Starter Tier / Founding 500 Pro Banner — gated on server capacity, not tier */}
      {!isPaidPro ? (
        <View style={[s.trialRow, { borderColor: "#1E293B", backgroundColor: "#0F172A" }]}>
          <View style={s.trialHeader}>
            <Ionicons name="flash" size={13} color="#F97316" />
            <Text style={[s.trialTitle, { color: "rgba(255,255,255,0.95)" }]}>
              Starter Tier ({listingCap} Active · {handoffCap} Handoff Cap)
            </Text>
            <A11yPressable
              accessibilityRole="button"
              accessibilityLabel="Claim your Founding 500 seat — free until 31 March 2027"
              accessibilityHint="Locks in ₹10,000 per year instead of ₹3,000 per month"
              style={s.upgradeChip}
              onPress={async () => {
                await fetch(`${API_BASE_URL}/api/realtors/dashboard`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                  body: JSON.stringify({ action: "upgrade_pro" }),
                });
                fetchDashboard(token);
              }}
            >
              <Text style={s.upgradeCrownIcon}>👑</Text>
              <Text style={s.upgradeChipText} numberOfLines={1}>Founding 500 · ₹0 till Mar 31</Text>
            </A11yPressable>
          </View>
          <Text style={{ fontSize: 11, color: "rgba(255,255,255,0.72)", marginBottom: 8 }}>
            First 500 Realtors lock in ₹10,000/yr after Mar 31 (vs ₹3,000/mo standard) + 5 Free HD & Reel Shoots.
          </Text>
          <View style={s.trialBars}>
            <View style={s.trialBarGroup}>
              <Text style={[s.trialBarLabel, { color: "rgba(255,255,255,0.6)" }]}>Active Map Listings</Text>
              <View style={[s.trialBarTrack, { backgroundColor: "rgba(255,255,255,0.12)" }]}>
                <View style={[s.trialBarFill, { width: `${listingFill * 100}%`, backgroundColor: "#F97316" }]} />
              </View>
              <Text style={[s.trialBarCount, { color: "#fff" }]}>
                {activeListings} of {listingCap} Free Cap ({overflowLabel(overflowCount)})
              </Text>
            </View>
            <View style={[s.trialBarGroup, { marginLeft: 16 }]}>
              <Text style={[s.trialBarLabel, { color: "rgba(255,255,255,0.6)" }]}>Seller Handoff Slot</Text>
              <View style={[s.trialBarTrack, { backgroundColor: "rgba(255,255,255,0.12)" }]}>
                <View style={[s.trialBarFill, { width: `${handoffFill * 100}%`, backgroundColor: "#3B82F6" }]} />
              </View>
              <Text style={[s.trialBarCount, { color: "#fff" }]}>
                {activeHandoffs} of {handoffCap} Active
                {/* D3: live 14-day count, not the hardcoded "🔥 4 … this week" literal */}
                {foundingProgram
                  ? ` · ${foundingProgram.nearbyHandoffs14d} nearby handoffs in the last 14 days`
                  : ""}
              </Text>
            </View>
          </View>
        </View>
      ) : (
        /* Reachable only for `pro` / `pro_plus` (999/999 server capacity).
           "Unlimited" may never be asserted for free_trial or soft_cap — CEO D1. */
        <View style={[s.trialRow, { borderColor: "#065F46", backgroundColor: "#064E3B", paddingVertical: 10 }]}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={{ fontSize: 13 }}>👑</Text>
              <Text style={{ fontSize: 12, fontWeight: "800", color: "#ECFDF5" }}>
                Founding 500 Pro Active · Free through Mar 31 (₹10,000/yr locked)
              </Text>
            </View>
            <Text style={{ fontSize: 11, fontWeight: "700", color: "#A7F3D0" }}>
              Unlimited Listings & Handoffs
            </Text>
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
                  onRefresh={() => fetchDashboard(token)}
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
  retryBtn:    { marginTop: 8, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8, borderWidth: 1, alignItems: "center", justifyContent: "center" },

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
  scoreRow:     { flexDirection: "row", alignItems: "center", gap: 5, flexWrap: "wrap" },
  scoreValue:   { color: "#fff", fontSize: 13, fontWeight: "700" },
  // §F2 contrast: 0.55 alpha measured 3.70:1 on #8B2500 and failed AA for normal text;
  // 0.78 measured 5.97:1 and passes. Verified by scripts/a11y-guard contrast output in the PR.
  scoreLabel:   { color: "rgba(255,255,255,0.78)", fontSize: 12 },
  tierPill:     { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, borderWidth: 1, marginLeft: 4 },
  // 10px -> 11px floor (§F3).
  tierPillText: { fontSize: 11, fontWeight: "700" },

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
  // §F3: `lineHeight` replaces the hardcoded "\n" in "New Contacts (7 days)".
  statLabel:    { fontSize: 12, fontWeight: "600", lineHeight: 16 },

  // Trial quota
  trialRow:      { marginHorizontal: 14, borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 2 },
  trialHeader:   { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
  trialTitle:    { fontSize: 12, fontWeight: "700", flex: 1 },
  upgradeChip:   {
    backgroundColor: "#0F172A",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    flexShrink: 1,
    ...Platform.select({
      ios:     { shadowColor: "#0F172A", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.4, shadowRadius: 6 },
      android: { elevation: 3 },
      web:     { boxShadow: "0 2px 8px rgba(15,23,42,0.5)" } as any,
    }),
  },
  upgradeCrownIcon: { fontSize: 12 },
  upgradeChipText: { fontSize: 12, fontWeight: "700", color: "#fff", letterSpacing: 0.2, flexShrink: 1 },
  trialBars:     { flexDirection: "row" },
  trialBarGroup: { flex: 1, gap: 4 },
  trialBarLabel: { fontSize: 11, lineHeight: 15 },
  trialBarTrack: { height: 6, borderRadius: 3, overflow: "hidden" },
  trialBarFill:  { height: 6, borderRadius: 3 },
  trialBarCount: { fontSize: 11, lineHeight: 15, fontWeight: "600" },

  // Tab bar — §H7: was ~33pt tall (paddingVertical 10 + 13px icon).
  tabBar: { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth, marginTop: 4, marginHorizontal: 14 },
  tabBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 4, paddingVertical: 10, paddingHorizontal: 4, minHeight: HIT,
  },
  tabLabel: { fontSize: 11, letterSpacing: 0.1, flexShrink: 1 },
  // 10px -> 11px floor (§F3); minWidth raised to keep the pill circular at 11px.
  tabBadge: { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 9, minWidth: 20, alignItems: "center" },
  tabBadgeText: { fontSize: 11, fontWeight: "700" },

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

  // Hoisted out of `cardHeader` (BLA-14). Left inset = cardThumb width (88) +
  // cardInfo padding (10), so the CTA stays optically aligned with the address.
  draftCtaRow: { paddingLeft: 98, paddingRight: 10, paddingBottom: 10 },

  // §F3 / §H8: the draft CTA was ~25pt tall.
  publishDraftBtn: {
    alignSelf: "flex-start", flexDirection: "row", alignItems: "center",
    justifyContent: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 8, minHeight: HIT,
  },
  publishDraftText: { color: "#fff", fontSize: 12, fontWeight: "700" },

  tag:     { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5 },
  tagText: { fontSize: 11, fontWeight: "600" },
  countChip:   { flexDirection: "row", alignItems: "center", gap: 3 },
  countText:   { fontSize: 11, lineHeight: 15, fontWeight: "600" },
  nextViewing: { fontSize: 11, lineHeight: 15 },

  // Expanded section (accordion)
  expandedSection: { borderTopWidth: 1, paddingHorizontal: 12, paddingBottom: 12 },
  // ~23pt -> HIT (§F3).
  viewListingBtn:  {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, alignSelf: "flex-start",
    marginVertical: 10, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8, borderWidth: 1,
    minHeight: HIT,
  },
  viewListingText:    { fontSize: 12, fontWeight: "600" },
  expandedGroup:      { marginTop: 8 },
  // 10px -> 11px floor (§F3).
  expandedGroupLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 0.8, marginBottom: 4 },

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
  flatCity:     { fontSize: 11, lineHeight: 15 },
  flatDateRow:  { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 4, flexWrap: "wrap" },
  flatDateText: { fontSize: 12, fontWeight: "600" },
  flatDuration: { fontSize: 11, lineHeight: 15 },
  // 10px -> 11px floor (§F3).
  flatGroupHeader: { fontSize: 11, fontWeight: "800", letterSpacing: 1, marginBottom: 6 },
  flatContextBtn:  { justifyContent: "center" },

  // Enquiry row (shared between accordion + flat)
  enquiryRow:      { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth },
  enquiryAvatar:   { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  enquiryInitials: { fontSize: 12, fontWeight: "700" },
  enquiryName:     { fontSize: 13, fontWeight: "600" },
  enquiryTime:     { fontSize: 11, lineHeight: 15, marginTop: 1 },
  enquiryActions:  { flexDirection: "row", gap: 6 },
  // §H8 / §F3: 30x30 -> HIT. This is the buyer-contact path Invariant #1 protects, so it
  // was the single most serious target violation on the screen.
  actionBtn:       { width: HIT, height: HIT, borderRadius: HIT / 2, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "transparent" },
  waBtn:           { backgroundColor: "#F0FFF4" },

  // Viewing row (accordion nested)
  viewingRow:     { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth },
  viewingDot:     { width: 8, height: 8, borderRadius: 4 },
  viewingDate:    { fontSize: 13, fontWeight: "600" },
  viewingDuration:{ fontSize: 11, lineHeight: 15, marginTop: 1 },

  // Status dot + its text equivalent (§H8 — no colour-only status).
  statusDotRow:   { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 },
  statusDotLabel: { fontSize: 11, lineHeight: 15, fontWeight: "600" },

  // Empty states
  emptyState: { alignItems: "center", paddingTop: 48, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: "700" },
  emptySub:   { fontSize: 13, textAlign: "center", maxWidth: 260 },
});
