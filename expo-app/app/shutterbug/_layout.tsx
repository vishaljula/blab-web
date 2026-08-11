/**
 * Shutterbug section layout.
 * Guards the /shutterbug/* routes to only allow users with role = 'shutterbug'.
 * Anyone else who accidentally reaches this URL is redirected back.
 */
import { Stack } from "expo-router";
import { useEffect } from "react";
import { useRouter } from "expo-router";
import { useListingsStore } from "@/store/listings";

export default function ShutterbugLayout() {
  const router = useRouter();
  const user = useListingsStore((s) => s.user);
  const token = useListingsStore((s) => s.token);

  useEffect(() => {
    if (!token) {
      router.replace("/login");
    } else if (user && user.role !== "shutterbug") {
      router.replace("/(tabs)");
    }
  }, [token, user, router]);

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerTitle: "📸 Shutterbug",
        headerStyle: { backgroundColor: "#0F0F0F" },
        headerTintColor: "#F5F5F3",
        headerTitleStyle: { fontWeight: "800", fontSize: 18 },
      }}
    />
  );
}
