import { useFonts } from "expo-font";
import { Stack, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { Platform, NativeModules } from "react-native";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import "react-native-reanimated";

import { useColorScheme } from "@/components/useColorScheme";
import { API_BASE_URL } from "@/lib/theme";
import { useListingsStore, saveStoredAuth } from "@/store/listings";

import "../global.css";

export { ErrorBoundary } from "expo-router";

export const unstable_settings = {
  initialRouteName: "(tabs)",
};

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    Inter: require("../assets/fonts/SpaceMono-Regular.ttf"),
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  // Global portrait lock — only the lightbox overrides this temporarily.
  // Guards against Expo Go by checking if the native module is actually registered.
  useEffect(() => {
    if (Platform.OS === "web") return;
    if (!NativeModules.ExpoScreenOrientation) return; // not in Expo Go — skip
    const SO = require("expo-screen-orientation");
    SO.lockAsync(SO.OrientationLock.PORTRAIT_UP);
  }, []);

  if (!loaded) {
    return null;
  }

  return <RootLayoutNav />;
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const { setAuth } = useListingsStore();

  useEffect(() => {
    if (!__DEV__ || Platform.OS === "web") return;
    let lastId = 0;
    const iv = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/dev/sim-nav`);
        const data = await res.json();
        if (data?.target?.route && data.target.id !== lastId) {
          lastId = data.target.id;
          if (data.target.auth?.token && data.target.auth?.user) {
            setAuth(data.target.auth.token, data.target.auth.user);
            saveStoredAuth(data.target.auth.token, data.target.auth.user);
          }
          router.replace(data.target.route as any);
        }
      } catch {}
    }, 1500);
    return () => clearInterval(iv);
  }, [router, setAuth]);

  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="login"
            options={{
              presentation: "modal",
              animation: "slide_from_bottom",
            }}
          />
          <Stack.Screen
            name="property/[id]"
            options={{
              presentation: "containedModal",
              animation: "slide_from_right",
            }}
          />
          <Stack.Screen
            name="list/index"
            options={{
              // Use 'card' with slide_from_bottom so transitioning from /list to /tracking/[id]
              // or /(tabs) stays in the same navigation stack without modal-dismiss flashes.
              presentation: Platform.OS === "web" ? "modal" : "card",
              animation: "slide_from_bottom",
              gestureEnabled: false,
            }}
          />
          <Stack.Screen
            name="shutterbug"
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="tracking/[id]"
            options={{
              // Full-bleed map: no navigation header; the screen draws its own floating back button
              headerShown: false,
              presentation: "card",
            }}
          />
          <Stack.Screen
            name="ops/index"
            options={{
              headerShown: false,
              presentation: "card",
            }}
          />
        </Stack>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}

