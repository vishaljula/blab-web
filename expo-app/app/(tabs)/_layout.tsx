import { Tabs, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Platform, View } from "react-native";
import { useState, useEffect } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLORS } from "@/lib/theme";
import { useColorScheme } from "@/components/useColorScheme";
import { useListingsStore } from "@/store/listings";

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = isDark ? COLORS.dark : COLORS.light;
  const [isDesktop, setIsDesktop] = useState(false);
  const insets = useSafeAreaInsets();
  const { user } = useListingsStore();
  const router = useRouter();

  const isRealtor = user?.role === "realtor";

  // Redirect shutterbugs away from the consumer app
  useEffect(() => {
    if (user?.role === "shutterbug") {
      router.replace("/shutterbug/jobs" as any);
    }
  }, [user?.role]);

  // Detect desktop on web — hide bottom tabs
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const media = window.matchMedia("(min-width: 768px)");
    const listener = () => setIsDesktop(media.matches);
    setIsDesktop(media.matches);
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, []);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        // BLA-19: the bar was 60pt tall with 8pt of padding at both ends, leaving a 44pt
        // content box. react-navigation gives each item 5pt of its own padding, so the
        // icon + label had 34pt to live in — the 24pt icon won and the label was squeezed
        // to a 5pt line box, clipping the text at DEFAULT type size. Each item also
        // measured 43x43, one point under the WCAG 2.2 §2.5.8 / HIG 44pt floor T3 set
        // everywhere else in this flow.
        //
        // Height budget, outside in: 1 border + 6 top + 8 bottom bar padding, 5 + 5 item
        // padding, then 28 icon box (the Post tab's icon is size + 4) + 1 + 14 label line
        // = 43 of content. 68 - 1 - 14 - 10 = 43.
        //
        // Only the no-inset branch grows. A device with a home indicator already cleared
        // the budget (56 + inset, half of it as bottom padding, leaves 50 + inset/2 = 67
        // of content at inset 34), so its geometry is left as it was.
        tabBarStyle: isDesktop
          ? { display: "none" }
          : {
              backgroundColor: colors.card,
              borderTopColor: colors.border,
              borderTopWidth: 1,
              height: insets.bottom > 0 ? 56 + insets.bottom : 68,
              paddingBottom: insets.bottom > 0 ? insets.bottom / 2 : 8,
              paddingTop: 6,
            },
        tabBarItemStyle: { minHeight: 44 },
        tabBarLabelStyle: {
          // 10px was under the 11px floor T3 established (§F3); lineHeight is explicit so
          // the label reserves a real line box instead of inheriting a collapsed one.
          fontSize: 11,
          lineHeight: 14,
          fontWeight: "600",
          marginTop: 1,
          // The label is the flex child react-navigation lets shrink; without this the
          // icon box wins any shortfall and the text is silently clipped again.
          flexShrink: 0,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Explore",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="search" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="list"
        options={{
          title: "List",
          // Integrated into the map screen
          href: null,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="list" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="post"
        options={{
          title: "Post",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="add-circle" size={size + 4} color={colors.primary} />
          ),
        }}
      />
      {/* Dashboard tab — realtors only. href:null removes it from the tab bar entirely for other roles. */}
      {/* NOTE: this is a UX gate only. The dashboard screen itself enforces role checks. */}
      <Tabs.Screen
        name="dashboard"
        options={{
          title: "Dashboard",
          href: isRealtor ? undefined : null,
          tabBarIcon: ({ color, size }) => (
            <View>
              <Ionicons name="grid-outline" size={size} color={color} />
              {/* Gold dot — signals active professional feature */}
              <View
                style={{
                  position: "absolute",
                  top: -2,
                  right: -4,
                  width: 7,
                  height: 7,
                  borderRadius: 3.5,
                  backgroundColor: "#F59E0B",
                  borderWidth: 1.5,
                  borderColor: colors.card,
                }}
              />
            </View>
          ),
        }}
      />

      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
