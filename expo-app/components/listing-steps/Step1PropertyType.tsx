/**
 * Step1PropertyType
 * Purpose: 2 square cards (For Sale / For Rent)
 * Property type: custom inline dropdown (no native picker)
 */
import { useState } from "react";
import { View, Text, Pressable, StyleSheet, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColorScheme } from "@/components/useColorScheme";
import { COLORS } from "@/lib/theme";
import { useListingFormStore, type ListingType, type PropertyType } from "@/store/listingForm";
import WizardShell, { CtaButton } from "./WizardShell";

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

const PURPOSE: { id: ListingType; label: string; icon: IoniconName; desc: string }[] = [
  { id: "sale", label: "For Sale", icon: "pricetag-outline", desc: "Sell your property" },
  { id: "rent", label: "For Rent", icon: "key-outline",      desc: "Find a tenant" },
];

const PROPERTY_TYPES: { id: PropertyType; label: string; icon: IoniconName }[] = [
  { id: "apartment",         label: "Apartment",      icon: "business-outline"      },
  { id: "independent_house", label: "Independent House", icon: "home-outline"       },
  { id: "villa",             label: "Villa",          icon: "leaf-outline"          },
  { id: "plot",              label: "Plot / Land",    icon: "map-outline"           },
  { id: "commercial",        label: "Commercial",     icon: "storefront-outline"    },
  { id: "pg",                label: "PG / Co-living", icon: "people-outline"        },
];

export default function Step1PropertyType() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const C = isDark ? COLORS.dark : COLORS.light;
  const { width } = useWindowDimensions();

  const { setStep1, goNext } = useListingFormStore();
  const [listingType, setListingType]   = useState<ListingType | null>(null);
  const [propertyType, setPropertyType] = useState<PropertyType | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const canProceed = !!listingType && !!propertyType;
  const selectedPT = PROPERTY_TYPES.find((p) => p.id === propertyType);

  const handleContinue = () => {
    if (!canProceed) return;
    setStep1({ listingType: listingType!, propertyType: propertyType! });
    goNext();
  };

  const GAP = 14;

  const purposeCard = (sel: boolean): object[] => [
    s.purposeCard,
    {
      flex: 1,
      borderColor:     sel ? C.primary : C.border,
      backgroundColor: sel ? `${C.primary}08` : C.muted,
      borderWidth:     sel ? 2 : 1.5,
    },
  ];

  return (
    <WizardShell
      heading="What are you listing?"
      hint="Choose the purpose and type of property."
      cta={<CtaButton label="Continue →" onPress={handleContinue} disabled={!canProceed} />}
    >
      {/* Purpose — fixed-size cards, centered */}
      <Text style={[s.sectionLabel, { color: C.foreground }]}>Purpose</Text>
      <View style={[s.purposeRow, { gap: GAP }]}>
        {PURPOSE.map((p) => {
          const sel = listingType === p.id;
          return (
            <Pressable key={p.id} onPress={() => setListingType(p.id)} style={purposeCard(sel) as any}>
              <Ionicons name={p.icon} size={30} color={sel ? C.primary : C.mutedForeground} />
              <Text style={[s.purposeLabel, { color: sel ? C.primary : C.foreground }]}>{p.label}</Text>
              <Text style={[s.purposeDesc, { color: C.mutedForeground }]}>{p.desc}</Text>
              {sel && (
                <View style={[s.selCheck, { backgroundColor: C.primary }]}>
                  <Text style={s.selCheckText}>✓</Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </View>

      {/* Property type dropdown */}
      <Text style={[s.sectionLabel, { color: C.foreground }]}>Property type</Text>

      {/* Trigger */}
      <Pressable
        onPress={() => setDropdownOpen(!dropdownOpen)}
        style={[
          s.dropdownTrigger,
          {
            borderColor: dropdownOpen ? C.primary : propertyType ? C.primary : C.border,
            backgroundColor: C.muted,
            borderWidth: propertyType ? 2 : 1.5,
            borderBottomLeftRadius: dropdownOpen ? 0 : 12,
            borderBottomRightRadius: dropdownOpen ? 0 : 12,
          },
        ]}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
          {selectedPT
            ? <Ionicons name={selectedPT.icon} size={20} color={C.primary} />
            : <Ionicons name="chevron-down-circle-outline" size={20} color={C.mutedForeground} />
          }
          <Text style={[s.dropdownValue, { color: selectedPT ? C.foreground : C.mutedForeground }]}>
            {selectedPT ? selectedPT.label : "Select property type…"}
          </Text>
        </View>
        <Ionicons
          name={dropdownOpen ? "chevron-up" : "chevron-down"}
          size={18}
          color={C.mutedForeground}
        />
      </Pressable>

      {/* Inline dropdown list */}
      {dropdownOpen && (
        <View style={[s.dropdownMenu, { borderColor: C.primary, backgroundColor: C.card }]}>
          {PROPERTY_TYPES.map((pt, i) => {
            const sel = propertyType === pt.id;
            return (
              <Pressable
                key={pt.id}
                onPress={() => {
                  setPropertyType(pt.id);
                  setDropdownOpen(false);
                }}
                style={[
                  s.dropdownItem,
                  { borderBottomColor: C.border },
                  i === PROPERTY_TYPES.length - 1 && { borderBottomWidth: 0 },
                  sel && { backgroundColor: `${C.primary}08` },
                ]}
              >
                <Ionicons name={pt.icon} size={20} color={sel ? C.primary : C.mutedForeground} />
                <Text style={[s.dropdownItemLabel, { color: sel ? C.primary : C.foreground, fontWeight: sel ? "700" : "500" }]}>
                  {pt.label}
                </Text>
                {sel && <Ionicons name="checkmark" size={16} color={C.primary} />}
              </Pressable>
            );
          })}
        </View>
      )}
    </WizardShell>
  );
}

const s = StyleSheet.create({
  sectionLabel: {
    fontSize: 16, fontWeight: "800",
    marginBottom: 14, color: "#111",
  },
  // Purpose cards — full width rectangles
  purposeRow:   { flexDirection: "row", marginBottom: 24 },
  purposeCard:  { borderRadius: 14, alignItems: "center", justifyContent: "center", paddingVertical: 28, paddingHorizontal: 12, position: "relative", gap: 8 },
  purposeLabel: { fontSize: 14, fontWeight: "800" },
  purposeDesc:  { fontSize: 11 },
  selCheck:      { position: "absolute", top: 10, right: 10, width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  selCheckText:  { color: "#fff", fontSize: 10, fontWeight: "900" },
  // Dropdown
  dropdownTrigger: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 14, borderRadius: 12,
  },
  dropdownValue:  { fontSize: 15, fontWeight: "500" },
  dropdownMenu: {
    borderWidth: 2, borderTopWidth: 0,
    borderBottomLeftRadius: 12, borderBottomRightRadius: 12,
    overflow: "hidden", marginBottom: 4,
  },
  dropdownItem: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 16, paddingVertical: 13,
    borderBottomWidth: 1,
  },
  dropdownItemLabel: { flex: 1, fontSize: 14 },
});
