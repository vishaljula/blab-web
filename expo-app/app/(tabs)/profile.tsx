import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { COLORS, API_BASE_URL } from "@/lib/theme";
import { useColorScheme } from "@/components/useColorScheme";
import { useListingsStore, saveStoredAuth } from "@/store/listings";
import { formatPrice } from "@/lib/format";
// AUDIT-001 / T3 — raw Pressable / TextInput are banned in this file by
// scripts/a11y-guard.mjs; these wrappers make a label + role structurally mandatory.
import { A11yPressable, A11yTextInput, HIT } from "@/components/a11y/AccessiblePressable";

type RoleId = "user" | "realtor" | "developer" | "shutterbug";

const ROLE_CARDS: {
  id: RoleId;
  label: string;
  sub: string;
  icon: keyof typeof Ionicons.glyphMap;
  needsRera?: boolean;
  priceAnchor?: string;
}[] = [
  { id: "user",       label: "Member",     sub: "Buy · Rent · Sell",    icon: "person-outline" },
  { id: "realtor",    label: "Realtor",    sub: "Founding 500 · ₹10k/yr", icon: "briefcase-outline", needsRera: true, priceAnchor: "₹36,000/yr" },
  { id: "developer",  label: "Builder",    sub: "Projects & Towers",    icon: "business-outline",  needsRera: true, priceAnchor: "₹4,999/mo" },
  { id: "shutterbug", label: "Shutterbug", sub: "Field Shoot Queue",    icon: "camera-outline" },
];

export default function ProfileScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = isDark ? COLORS.dark : COLORS.light;
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, user, setAuth } = useListingsStore();

  const [selectedRole, setSelectedRole] = useState<RoleId>((user?.role as RoleId) || "user");
  const [companyName, setCompanyName] = useState(user?.companyName ?? "");
  const [reraNumber, setReraNumber] = useState(user?.reraNumber ?? "");
  const [savingRole, setSavingRole] = useState(false);

  const [activeTab, setActiveTab] = useState<"listings" | "shoots">("listings");
  const [myListings, setMyListings] = useState<any[]>([]);
  const [myShoots, setMyShoots] = useState<any[]>([]);
  const [loadingActivity, setLoadingActivity] = useState(false);

  const fetchActivity = useCallback(async () => {
    if (!token) return;
    setLoadingActivity(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/users/my-activity`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setMyListings(Array.isArray(data.myListings) ? data.myListings : []);
        setMyShoots(Array.isArray(data.myShoots) ? data.myShoots : []);
      }
    } catch {
      // ignore
    } finally {
      setLoadingActivity(false);
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      if (user?.role) setSelectedRole(user.role as RoleId);
      fetchActivity();
    }, [user?.role, fetchActivity])
  );

  const handleRoleSwitch = async (targetRole: RoleId) => {
    if (!token) return;
    setSavingRole(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/mobile-auth/onboarding`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: user?.name || "Blab Partner",
          role: targetRole,
          companyName: companyName.trim() || undefined,
          reraNumber: reraNumber.trim() || undefined,
          subscriptionTier: targetRole === "realtor" ? "pro" : undefined,
        }),
      });
      const data = await res.json();
      if (data.success && data.user) {
        await saveStoredAuth(token, data.user);
        setAuth(token, data.user);
        if (targetRole === "shutterbug") {
          router.replace("/shutterbug/jobs" as any);
        } else if (targetRole === "realtor") {
          router.navigate("/(tabs)/dashboard" as any);
        }
      }
    } finally {
      setSavingRole(false);
    }
  };

  const handleSignOut = async () => {
    await saveStoredAuth(null, null);
    setAuth(null, null);
    router.replace("/(tabs)");
  };

  if (!token) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <View style={styles.content}>
          <View style={[styles.iconContainer, { backgroundColor: `${colors.primary}15` }]}>
            <Ionicons name="person" size={48} color={colors.primary} />
          </View>
          <Text style={[styles.title, { color: colors.foreground }]}>Sign In to Blab</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            Manage listings, shoots & partner tools.
          </Text>
          <A11yPressable
            style={[styles.button, { backgroundColor: colors.primary }]}
            onPress={() => router.push("/login")}
            accessibilityRole="button"
            accessibilityLabel="Sign in with phone number"
            accessibilityHint="Opens phone OTP sign-in"
          >
            <Ionicons name="log-in-outline" size={18} color={colors.primaryForeground} />
            <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>
              Sign In with Phone
            </Text>
          </A11yPressable>

          {/* 1-Tap Founder Command Center Entry (Always Accessible) */}
          <A11yPressable
            onPress={() => router.push("/ops" as any)}
            accessibilityRole="button"
            accessibilityLabel="Open Founder Ops Command Center"
            style={styles.opsPillSignedOut}
          >
            <Ionicons name="pulse" size={16} color="#38BDF8" />
            <Text style={styles.opsPillSignedOutText}>
              Open Founder Ops Command Center →
            </Text>
          </A11yPressable>
        </View>
      </View>
    );
  }

  const activeRoleCard = ROLE_CARDS.find((r) => r.id === selectedRole) ?? ROLE_CARDS[0];
  const roleChanged = selectedRole !== (user?.role || "user");
  const activateLabel = roleChanged
    ? `Activate Free ${activeRoleCard.label} Pass →`
    : `Update ${activeRoleCard.label} Profile`;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: 40, paddingHorizontal: 18 }}
    >
      {/* Compact Header */}
      <View style={[styles.headerCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={[styles.avatar, { backgroundColor: `${colors.primary}18` }]}>
          <Text style={[styles.avatarText, { color: colors.primary }]}>
            {(user?.name || "BM").slice(0, 2).toUpperCase()}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.profileName, { color: colors.foreground }]}>
            {user?.name || "Blab Member"}
          </Text>
          <Text style={[styles.profilePhone, { color: colors.mutedForeground }]}>
            {user?.phone || "Verified Account"} · {(user?.role || "member").toUpperCase()}
          </Text>
        </View>
        <A11yPressable
          onPress={handleSignOut}
          style={[styles.signOutPill, { borderColor: colors.border }]}
          accessibilityRole="button"
          accessibilityLabel="Sign out"
        >
          <Ionicons name="log-out-outline" size={16} color={colors.mutedForeground} />
        </A11yPressable>
      </View>

      {/* Founder Ops Command Center & UAT Simulator Entry Card */}
      <A11yPressable
        onPress={() => router.push("/ops" as any)}
        accessibilityRole="button"
        accessibilityLabel="Founder Ops Command Center"
        accessibilityHint="1,000-listing blitz, Founding 500 realtors, UAT simulator and QA"
        style={styles.opsCard}
      >
        <View style={styles.opsCardMain}>
          <View style={styles.opsCardIcon}>
            <Ionicons name="pulse" size={18} color="#38BDF8" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.opsCardTitle}>Founder Ops Command Center</Text>
            <Text style={styles.opsCardSub}>
              1,000-Listing Blitz · Founding 500 Realtors · UAT Simulator & QA
            </Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={16} color="#94A3B8" />
      </A11yPressable>

      {/* Partner Mode / Role Switcher (Mapper-driven) */}
      <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>WORKSPACE MODE</Text>
      <View style={styles.roleGrid} accessibilityRole="radiogroup" accessibilityLabel="Workspace mode">
        {ROLE_CARDS.map((rc) => {
          const sel = selectedRole === rc.id;
          return (
            <A11yPressable
              key={rc.id}
              onPress={() => {
                setSelectedRole(rc.id);
                if (!rc.needsRera && rc.id !== user?.role) {
                  handleRoleSwitch(rc.id);
                }
              }}
              // Role + selected state, so the active card is not conveyed by colour and
              // border-width alone (uxd-critique.md §F1).
              accessibilityRole="radio"
              accessibilityState={{ selected: sel, checked: sel }}
              accessibilityLabel={`${rc.label} mode — ${rc.sub}${rc.priceAnchor ? ", free for 3 months" : ""}`}
              accessibilityHint={rc.needsRera ? "Requires a RERA ID below to activate" : "Switches workspace mode"}
              style={[
                styles.roleCard,
                {
                  backgroundColor: sel ? `${colors.primary}12` : colors.card,
                  borderColor: sel ? colors.primary : colors.border,
                  borderWidth: sel ? 2 : 1,
                },
              ]}
            >
              <View style={styles.roleCardTopRow}>
                <Ionicons name={rc.icon} size={20} color={sel ? colors.primary : colors.mutedForeground} />
                {rc.priceAnchor && (
                  <View style={styles.freeTag}>
                    <Text style={styles.freeTagText}>FREE 3M</Text>
                  </View>
                )}
              </View>
              <Text style={[styles.roleLabel, { color: sel ? colors.primary : colors.foreground }]}>
                {rc.label}
              </Text>
              <Text style={[styles.roleSub, { color: colors.mutedForeground }]} numberOfLines={1}>
                {rc.sub}
              </Text>
            </A11yPressable>
          );
        })}
      </View>

      {/* Inline RERA + 3-Month Launch Promo Activation for Realtor / Builder */}
      {activeRoleCard.needsRera && (
        <View style={[styles.partnerBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.promoRow}>
            <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, flex: 1, paddingRight: 8 }}>
              {selectedRole === "realtor" ? "Founding 500 Pass (₹10k/yr)" : `${activeRoleCard.label} Pro Pass`}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 0 }}>
              <Text style={{ fontSize: 12, color: colors.mutedForeground, textDecorationLine: "line-through" }}>
                {activeRoleCard.priceAnchor}
              </Text>
              <Text style={{ fontSize: 13, fontWeight: "900", color: "#16A34A" }}>₹0 till Mar 31</Text>
            </View>
          </View>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <A11yTextInput
              value={companyName}
              onChangeText={setCompanyName}
              placeholder="Agency / Builder Name"
              placeholderTextColor={colors.mutedForeground}
              // A placeholder is not an accessible name — it vanishes once text is entered.
              accessibilityLabel={`${activeRoleCard.label} agency or builder name`}
              style={[styles.input, { flex: 1, color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
            />
            <A11yTextInput
              value={reraNumber}
              onChangeText={setReraNumber}
              placeholder="RERA ID"
              placeholderTextColor={colors.mutedForeground}
              accessibilityLabel="RERA registration ID"
              style={[styles.input, { flex: 1, color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
            />
          </View>
          <A11yPressable
            onPress={() => handleRoleSwitch(selectedRole)}
            disabled={savingRole}
            accessibilityRole="button"
            accessibilityLabel={savingRole ? `Saving ${activeRoleCard.label} profile` : activateLabel}
            accessibilityState={{ disabled: savingRole, busy: savingRole }}
            style={[styles.activateBtn, { backgroundColor: colors.primary }]}
          >
            {savingRole ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.activateBtnText}>{activateLabel}</Text>
            )}
          </A11yPressable>
        </View>
      )}

      {/* Activity Tabs: My Listings | My Shoots */}
      <View style={[styles.tabRow, { borderColor: colors.border }]} accessibilityRole="tablist">
        {[
          { id: "listings" as const, label: `My Listings (${myListings.length})`, count: myListings.length, noun: "listings" },
          { id: "shoots" as const,   label: `My Shoots (${myShoots.length})`,     count: myShoots.length,   noun: "shoots" },
        ].map((t) => {
          const active = activeTab === t.id;
          return (
            <A11yPressable
              key={t.id}
              onPress={() => setActiveTab(t.id)}
              // Active state carries weight + fill + accessibilityState, not colour alone.
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`My ${t.noun}, ${t.count} item${t.count === 1 ? "" : "s"}`}
              style={[styles.tabPill, active && { backgroundColor: colors.primary }]}
            >
              <Text
                numberOfLines={1}
                style={[
                  styles.tabPillText,
                  { color: active ? "#fff" : colors.mutedForeground, fontWeight: active ? "800" : "600" },
                ]}
              >
                {t.label}
              </Text>
            </A11yPressable>
          );
        })}
      </View>

      {loadingActivity ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
      ) : activeTab === "listings" ? (
        myListings.length === 0 ? (
          <View style={[styles.emptyCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>No listings posted yet.</Text>
          </View>
        ) : (
          myListings.map((item) => {
            const isLive = item.status === "active";
            const statusLabel = isLive ? "LIVE" : "SHOOT PENDING";
            return (
              <A11yPressable
                key={item.id}
                onPress={() => router.push(`/property/${item.id}` as any)}
                accessibilityRole="button"
                accessibilityLabel={`${item.societyName || item.address}, ${formatPrice(item.price)}, ${String(item.propertyType)}, status ${statusLabel.toLowerCase()}`}
                accessibilityHint="Opens the property detail page"
                style={[styles.itemCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.itemTitle, { color: colors.foreground }]} numberOfLines={1}>
                    {item.societyName || item.address}
                  </Text>
                  <Text style={[styles.itemSub, { color: colors.mutedForeground }]}>
                    {formatPrice(item.price)} · {String(item.propertyType).toUpperCase()}
                  </Text>
                </View>
                {/* Status is carried by the word, not only the chip colour. */}
                <View style={[styles.statusBadge, { backgroundColor: isLive ? "#22C55E20" : "#F59E0B20" }]}>
                  <Text style={[styles.statusBadgeText, { color: isLive ? "#16A34A" : "#D97706" }]}>
                    {statusLabel}
                  </Text>
                </View>
              </A11yPressable>
            );
          })
        )
      ) : myShoots.length === 0 ? (
        <View style={[styles.emptyCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>No shoots booked yet.</Text>
        </View>
      ) : (
        myShoots.map((sh) => (
          <A11yPressable
            key={sh.id}
            onPress={() => router.push(`/tracking/${sh.id}` as any)}
            accessibilityRole="button"
            accessibilityLabel={`Track shoot at ${sh.address}, ${sh.slotDate}, window ${sh.slotWindow}${sh.arrivalOtp ? `, gate code ${sh.arrivalOtp}` : ""}`}
            accessibilityHint="Opens live shutterbug tracking"
            style={[styles.itemCard, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.itemTitle, { color: colors.foreground }]} numberOfLines={1}>
                {sh.address}
              </Text>
              <Text style={[styles.itemSub, { color: colors.mutedForeground }]}>
                {sh.slotDate} · Window {sh.slotWindow} {sh.arrivalOtp ? `· Gate Code ${sh.arrivalOtp}` : ""}
              </Text>
            </View>
            <Ionicons name="navigate-circle-outline" size={22} color={colors.primary} />
          </A11yPressable>
        ))
      )}
    </ScrollView>
  );
}

/**
 * AUDIT-001 / T3 styling notes:
 *  - Every fixed `height` on a control that contains text is a `minHeight`, so Dynamic Type
 *    reflows instead of clipping (uxd-critique.md §F2).
 *  - Every interactive control is >= HIT (44pt). The `A11yPressable` wrapper applies the
 *    floor itself; the values here are the *visual* sizes, raised to 44 where they were below.
 *  - No text label below the 11px floor (§F3).
 */
const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32, gap: 14 },
  iconContainer: { width: 88, height: 88, borderRadius: 44, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 22, fontWeight: "800" },
  subtitle: { fontSize: 14, textAlign: "center" },
  button: { flexDirection: "row", alignItems: "center", justifyContent: "center", minHeight: 46, paddingHorizontal: 22, paddingVertical: 8, borderRadius: 23, gap: 8, marginTop: 8 },
  buttonText: { fontSize: 14, fontWeight: "700" },

  // Signed-out Founder Ops entry
  opsPillSignedOut: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    marginTop: 18, paddingHorizontal: 16, paddingVertical: 11, borderRadius: 12,
    backgroundColor: "#0F172A", borderWidth: 1, borderColor: "#1E293B",
  },
  opsPillSignedOutText: { fontSize: 12, fontWeight: "800", color: "#F8FAFC" },

  headerCard: {
    flexDirection: "row", alignItems: "center", gap: 12,
    padding: 14, borderRadius: 16, borderWidth: 1, marginBottom: 20,
  },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 18, fontWeight: "800" },
  profileName: { fontSize: 17, fontWeight: "800" },
  profilePhone: { fontSize: 12, marginTop: 2 },
  // 38x38 -> HIT: this is an icon-only destructive control (§F3).
  signOutPill: { width: HIT, height: HIT, borderRadius: HIT / 2, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  sectionTitle: { fontSize: 11, fontWeight: "800", letterSpacing: 0.8, marginBottom: 10 },

  // Signed-in Founder Ops entry card
  opsCard: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    padding: 13, borderRadius: 14, backgroundColor: "#0F172A",
    borderWidth: 1, borderColor: "#1E293B", marginBottom: 14,
  },
  opsCardMain: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  opsCardIcon: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: "#38BDF820", alignItems: "center", justifyContent: "center",
  },
  opsCardTitle: { fontSize: 13, fontWeight: "800", color: "#F8FAFC" },
  opsCardSub: { fontSize: 11, lineHeight: 15, color: "#94A3B8", marginTop: 1 },

  roleGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 16 },
  roleCard: { width: "48%" as any, flexGrow: 1, padding: 12, borderRadius: 14, gap: 4 },
  roleCardTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  roleLabel: { fontSize: 14, fontWeight: "800", marginTop: 4 },
  roleSub: { fontSize: 11, lineHeight: 15 },
  freeTag: { backgroundColor: "#22C55E20", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  // 9px -> 11px floor (§F3).
  freeTagText: { fontSize: 11, fontWeight: "800", color: "#16A34A" },
  partnerBox: { padding: 14, borderRadius: 14, borderWidth: 1, gap: 10, marginBottom: 18 },
  promoRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  // height 40 -> minHeight HIT (§F2 + §F3).
  input: { minHeight: HIT, borderRadius: 10, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13 },
  // height 42 -> minHeight HIT.
  activateBtn: { minHeight: HIT, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, alignItems: "center", justifyContent: "center" },
  activateBtnText: { color: "#fff", fontSize: 13, fontWeight: "800", textAlign: "center" },
  tabRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  // height 38 -> minHeight HIT.
  tabPill: { flex: 1, minHeight: HIT, borderRadius: 10, paddingHorizontal: 8, alignItems: "center", justifyContent: "center" },
  tabPillText: { fontSize: 13 },
  emptyCard: { padding: 20, borderRadius: 14, borderWidth: 1, alignItems: "center" },
  itemCard: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    padding: 14, borderRadius: 14, borderWidth: 1, marginBottom: 10,
  },
  itemTitle: { fontSize: 14, fontWeight: "700" },
  itemSub: { fontSize: 12, lineHeight: 16, marginTop: 2 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, flexShrink: 0 },
  statusBadgeText: { fontSize: 11, fontWeight: "700" },
});
