/**
 * PropertyPin — the map pin used for a property (same shape as the listing flow's location pin:
 * round head with a white ring + pointed tail whose TIP is the exact spot), with a clean line
 * icon inside that depends on the property type.
 *
 * `size` = head diameter in px; the whole pin is ~1.4× that tall. Anchor the TIP (bottom-centre).
 * Works on native and web (react-native-web).
 */
import React from "react";
import { View, Platform } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

export function propertyIcon(type?: string | null): IconName {
  const t = (type ?? "").toLowerCase();
  if (/apart|flat|condo/.test(t)) return "office-building";
  if (/villa/.test(t)) return "home-city";
  if (/plot|land|farm|site/.test(t)) return "terrain";
  if (/warehouse|industrial|godown|factory/.test(t)) return "warehouse";
  if (/commercial|office|shop|retail/.test(t)) return "storefront";
  if (/pg|hostel|co-?living/.test(t)) return "bed";
  return "home";
}

export default function PropertyPin({
  type,
  size = 36,
  color,
}: {
  type?: string | null;
  size?: number;
  color: string;
}) {
  const ring = Math.max(2, Math.round(size / 10));
  const tailHalf = size * 0.27;
  const tailH = size * 0.47;
  const shadow: any = Platform.select({
    ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.35, shadowRadius: 5 },
    android: { elevation: 6 },
    web: { boxShadow: "0 3px 8px rgba(0,0,0,0.35)" },
  });
  return (
    <View style={{ alignItems: "center", width: size }}>
      <View
        style={[
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: color,
            borderWidth: ring,
            borderColor: "#fff",
            alignItems: "center",
            justifyContent: "center",
          },
          shadow,
        ]}
      >
        <MaterialCommunityIcons name={propertyIcon(type)} size={size * 0.52} color="#fff" />
      </View>
      <View
        style={{
          width: 0,
          height: 0,
          borderLeftWidth: tailHalf,
          borderRightWidth: tailHalf,
          borderTopWidth: tailH,
          borderLeftColor: "transparent",
          borderRightColor: "transparent",
          borderTopColor: color,
          marginTop: -ring - 1,
        }}
      />
    </View>
  );
}

