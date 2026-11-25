import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { COLORS, API_BASE_URL } from "@/lib/theme";
import { useColorScheme } from "@/components/useColorScheme";
import { useListingsStore, saveStoredAuth } from "@/store/listings";
import { formatPrice } from "@/lib/format";

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

const webCursor: any = Platform.OS === "web" ? { cursor: "pointer" } : {};

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
          <Pressable
            style={[styles.button, { backgroundColor: colors.primary }, webCursor]}
            onPress={() => router.push("/login")}
          >
            <Ionicons name="log-in-outline" size={18} color={colors.primaryForeground} />
            <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>
              Sign In with Phone
            </Text>
          </Pressable>

          {/* 1-Tap Founder Command Center Entry (Always Accessible) */}
          <Pressable
            onPress={() => router.push("/ops" as any)}
            style={[
              {
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                marginTop: 18,
                paddingHorizontal: 16,
                paddingVertical: 11,
                borderRadius: 12,
                backgroundColor: "#0F172A",
                borderWidth: 1,
                borderColor: "#1E293B",
              },
              webCursor,
            ]}
          >
            <Ionicons name="pulse" size={16} color="#38BDF8" />
            <Text style={{ fontSize: 12, fontWeight: "800", color: "#F8FAFC" }}>
              Open Founder Ops Command Center →
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const activeRoleCard = ROLE_CARDS.find((r) => r.id === selectedRole) ?? ROLE_CARDS[0];
  const roleChanged = selectedRole !== (user?.role || "user");

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
        <Pressable onPress={handleSignOut} style={[styles.signOutPill, { borderColor: colors.border }, webCursor]}>
          <Ionicons name="log-out-outline" size={16} color={colors.mutedForeground} />
        </Pressable>
      </View>

      {/* Founder Ops Command Center & UAT Simulator Entry Card */}
      <Pressable
        onPress={() => router.push("/ops" as any)}
        style={[
          {
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            padding: 13,
            borderRadius: 14,
            backgroundColor: "#0F172A",
            borderWidth: 1,
            borderColor: "#1E293B",
            marginBottom: 14,
          },
          webCursor,
        ]}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
          <View
            style={{
              width: 34,
              height: 34,
              borderRadius: 10,
              backgroundColor: "#38BDF820",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="pulse" size={18} color="#38BDF8" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, fontWeight: "800", color: "#F8FAFC" }}>
              Founder Ops Command Center
            </Text>
            <Text style={{ fontSize: 11, color: "#94A3B8", marginTop: 1 }}>
              1,000-Listing Blitz · Founding 500 Realtors · UAT Simulator & QA
            </Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={16} color="#94A3B8" />
      </Pressable>

      {/* Partner Mode / Role Switcher (Mapper-driven) */}
      <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>WORKSPACE MODE</Text>
      <View style={styles.roleGrid}>
        {ROLE_CARDS.map((rc) => {
          const sel = selectedRole === rc.id;
          return (
            <Pressable
              key={rc.id}
              onPress={() => {
                setSelectedRole(rc.id);
                if (!rc.needsRera && rc.id !== user?.role) {
                  handleRoleSwitch(rc.id);
                }
              }}
              style={[
                styles.roleCard,
                {
                  backgroundColor: sel ? `${colors.primary}12` : colors.card,
                  borderColor: sel ? colors.primary : colors.border,
                  borderWidth: sel ? 2 : 1,
                },
                webCursor,
              ]}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
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
            </Pressable>
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
            <TextInput
              value={companyName}
              onChangeText={setCompanyName}
              placeholder="Agency / Builder Name"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.input, { flex: 1, color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
            />
            <TextInput
              value={reraNumber}
              onChangeText={setReraNumber}
              placeholder="RERA ID"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.input, { flex: 1, color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
            />
          </View>
          <Pressable
            onPress={() => handleRoleSwitch(selectedRole)}
            disabled={savingRole}
            style={[styles.activateBtn, { backgroundColor: colors.primary }, webCursor]}
          >
            {savingRole ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.activateBtnText}>
                {roleChanged ? `Activate Free ${activeRoleCard.label} Pass →` : `Update ${activeRoleCard.label} Profile`}
              </Text>
            )}
          </Pressable>
        </View>
      )}

      {/* Activity Tabs: My Listings | My Shoots */}
      <View style={[styles.tabRow, { borderColor: colors.border }]}>
        {[
          { id: "listings" as const, label: `My Listings (${myListings.length})` },
          { id: "shoots" as const,   label: `My Shoots (${myShoots.length})` },
        ].map((t) => {
          const active = activeTab === t.id;
          return (
            <Pressable
              key={t.id}
              onPress={() => setActiveTab(t.id)}
              style={[
                styles.tabPill,
                active && { backgroundColor: colors.primary },
                webCursor,
              ]}
            >
              <Text style={{ fontSize: 13, fontWeight: "700", color: active ? "#fff" : colors.mutedForeground }}>
                {t.label}
              </Text>
            </Pressable>
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
          myListings.map((item) => (
            <Pressable
              key={item.id}
              onPress={() => router.push(`/property/${item.id}` as any)}
              style={[styles.itemCard, { backgroundColor: colors.card, borderColor: colors.border }, webCursor]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.itemTitle, { color: colors.foreground }]} numberOfLines={1}>
                  {item.societyName || item.address}
                </Text>
                <Text style={[styles.itemSub, { color: colors.mutedForeground }]}>
                  {formatPrice(item.price)} · {String(item.propertyType).toUpperCase()}
                </Text>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: item.status === "active" ? "#22C55E20" : "#F59E0B20" }]}>
                <Text style={{ fontSize: 11, fontWeight: "700", color: item.status === "active" ? "#16A34A" : "#D97706" }}>
                  {item.status === "active" ? "LIVE" : "SHOOT PENDING"}
                </Text>
              </View>
            </Pressable>
          ))
        )
      ) : myShoots.length === 0 ? (
        <View style={[styles.emptyCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>No shoots booked yet.</Text>
        </View>
      ) : (
        myShoots.map((sh) => (
          <Pressable
            key={sh.id}
            onPress={() => router.push(`/tracking/${sh.id}` as any)}
            style={[styles.itemCard, { backgroundColor: colors.card, borderColor: colors.border }, webCursor]}
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
          </Pressable>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32, gap: 14 },
  iconContainer: { width: 88, height: 88, borderRadius: 44, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 22, fontWeight: "800" },
  subtitle: { fontSize: 14, textAlign: "center" },
  button: { flexDirection: "row", alignItems: "center", height: 46, paddingHorizontal: 22, borderRadius: 23, gap: 8, marginTop: 8 },
  buttonText: { fontSize: 14, fontWeight: "700" },
  headerCard: {
    flexDirection: "row", alignItems: "center", gap: 12,
    padding: 14, borderRadius: 16, borderWidth: 1, marginBottom: 20,
  },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 18, fontWeight: "800" },
  profileName: { fontSize: 17, fontWeight: "800" },
  profilePhone: { fontSize: 12, marginTop: 2 },
  signOutPill: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  sectionTitle: { fontSize: 11, fontWeight: "800", letterSpacing: 0.8, marginBottom: 10 },
  roleGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 16 },
  roleCard: { width: "48%" as any, flexGrow: 1, padding: 12, borderRadius: 14, gap: 4 },
  roleLabel: { fontSize: 14, fontWeight: "800", marginTop: 4 },
  roleSub: { fontSize: 11 },
  freeTag: { backgroundColor: "#22C55E20", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  freeTagText: { fontSize: 9, fontWeight: "800", color: "#16A34A" },
  partnerBox: { padding: 14, borderRadius: 14, borderWidth: 1, gap: 10, marginBottom: 18 },
  promoRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  input: { height: 40, borderRadius: 10, borderWidth: 1, paddingHorizontal: 10, fontSize: 13 },
  activateBtn: { height: 42, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  activateBtnText: { color: "#fff", fontSize: 13, fontWeight: "800" },
  tabRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  tabPill: { flex: 1, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  emptyCard: { padding: 20, borderRadius: 14, borderWidth: 1, alignItems: "center" },
  itemCard: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    padding: 14, borderRadius: 14, borderWidth: 1, marginBottom: 10,
  },
  itemTitle: { fontSize: 14, fontWeight: "700" },
  itemSub: { fontSize: 12, marginTop: 2 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
});
