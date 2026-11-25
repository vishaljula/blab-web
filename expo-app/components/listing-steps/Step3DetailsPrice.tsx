/**
 * Step3DetailsPrice — Self-list path (Config-Driven via PROPERTY_CONFIGS mapper)
 * Dynamically renders Residential, Commercial, Industrial, or Agricultural fields
 * based on the selected propertyType object in `lib/propertyConfig.ts`.
 */
import { useState } from "react";
import { View, Text, Pressable, TextInput, StyleSheet, Switch } from "react-native";
import { useColorScheme } from "@/components/useColorScheme";
import { COLORS } from "@/lib/theme";
import {
  useListingFormStore,
  type Facing,
  type AreaUnit,
  type Furnishing,
  type PreferredTenant,
} from "@/store/listingForm";
import { getPropertyConfig } from "@/lib/propertyConfig";
import WizardShell, { CtaButton } from "./WizardShell";

const BEDS = [0, 1, 2, 3, 4, 5];
const BATHS = [1, 2, 3, 4];
const FACING_OPTS: { id: Facing; label: string }[] = [
  { id: "E", label: "East" },
  { id: "W", label: "West" },
  { id: "N", label: "North" },
  { id: "S", label: "South" },
  { id: "Corner", label: "Corner" },
];
const FURNISHING_OPTS: { id: Furnishing; label: string }[] = [
  { id: "unfurnished", label: "Unfurnished" },
  { id: "semi",        label: "Semi" },
  { id: "fully",       label: "Full" },
];
const TENANT_OPTS: { id: PreferredTenant; label: string; icon: string }[] = [
  { id: "family",   label: "Family",   icon: "👨‍👩‍👧" },
  { id: "bachelor", label: "Bachelor", icon: "🧑" },
  { id: "any",      label: "Anyone",   icon: "🤝" },
];

function formatINR(n: number): string {
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)} Cr`;
  if (n >= 100000)   return `₹${(n / 100000).toFixed(2)} L`;
  if (n >= 1000)     return `₹${(n / 1000).toFixed(0)}K`;
  return `₹${n}`;
}

export default function Step3DetailsPrice() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const C = isDark ? COLORS.dark : COLORS.light;
  const store = useListingFormStore();
  const { listingType, propertyType, setStep3Self, goNext } = store;
  const isRent = listingType === "rent";
  const cfg = getPropertyConfig(propertyType);

  const [bedrooms, setBedrooms] = useState<number | null>(store.bedrooms);
  const [bathrooms, setBathrooms] = useState<number | null>(store.bathrooms);
  const [area, setArea] = useState(store.carpetArea?.toString() ?? "");
  const [areaUnit, setAreaUnit] = useState<AreaUnit>(store.areaUnit);
  const [facing, setFacing] = useState<Facing | null>(store.facing);
  const [societyName, setSocietyName] = useState(store.societyName ?? "");
  const [specs, setSpecs] = useState<Record<string, any>>(store.propertySpecs ?? {});
  const [price, setPrice] = useState(store.price?.toString() ?? "");
  const [negotiable, setNegotiable] = useState(store.negotiable ?? true);
  const [deposit, setDeposit] = useState(store.securityDeposit?.toString() ?? "");
  const [furnishing, setFurnishing] = useState<Furnishing | null>(store.furnishing);
  const [tenant, setTenant] = useState<PreferredTenant | null>(store.preferredTenant);

  const priceNum = parseInt(price, 10);
  const canProceed = area.trim().length > 0 && price.trim().length > 0 && priceNum > 0;

  const setSpecField = (key: string, val: any) => {
    setSpecs((prev) => ({ ...prev, [key]: val }));
  };

  const handleNext = () => {
    if (!canProceed) return;
    setStep3Self({
      bedrooms: cfg.hasBedBath ? bedrooms : null,
      bathrooms: cfg.hasBedBath ? bathrooms : null,
      carpetArea: area ? parseInt(area, 10) : null,
      areaUnit,
      facing,
      societyName: societyName.trim(),
      propertySpecs: specs,
      price: priceNum,
      negotiable,
      securityDeposit: deposit ? parseInt(deposit, 10) : null,
      furnishing,
      preferredTenant: tenant,
    });
    goNext();
  };

  const chip = (sel: boolean) => [
    s.chip,
    {
      borderColor: sel ? C.primary : C.border,
      backgroundColor: sel ? `${C.primary}15` : C.card,
      borderWidth: sel ? 2 : 1.5,
    },
  ];
  const chipText = (sel: boolean) => ({
    fontSize: 13,
    fontWeight: sel ? ("700" as const) : ("500" as const),
    color: sel ? C.primary : C.foreground,
  });

  return (
    <WizardShell
      heading={`${cfg.shortLabel} details`}
      hint="Key specs and asking price."
      cta={<CtaButton label="Continue →" onPress={handleNext} disabled={!canProceed} />}
    >
      {/* Society / Building Name for Apartments, Villas & Commercial Tech Parks */}
      {(propertyType === "apartment" || propertyType === "villa" || propertyType === "commercial") && (
        <>
          <Text style={[s.sectionLabel, { color: C.mutedForeground }]}>
            {propertyType === "commercial" ? "Building / Tech Park" : "Society / Project Name"}
          </Text>
          <TextInput
            value={societyName}
            onChangeText={setSocietyName}
            placeholder={propertyType === "commercial" ? "e.g. Orbit Tech Park" : "e.g. My Home Bhooja"}
            placeholderTextColor={C.mutedForeground}
            style={[s.areaInput, { borderColor: C.border, backgroundColor: C.card, color: C.foreground, marginBottom: 20 }]}
          />
        </>
      )}

      {/* Bed / Bath (only when cfg.hasBedBath is true) */}
      {cfg.hasBedBath && (
        <>
          <Text style={[s.sectionLabel, { color: C.mutedForeground }]}>Bedrooms</Text>
          <View style={s.chipRow}>
            {BEDS.map((b) => (
              <Pressable key={b} onPress={() => setBedrooms(b)} style={chip(bedrooms === b)}>
                <Text style={chipText(bedrooms === b)}>
                  {b === 0 ? "Studio" : b === 5 ? "5+" : String(b)}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={[s.sectionLabel, { color: C.mutedForeground }]}>Bathrooms</Text>
          <View style={s.chipRow}>
            {BATHS.map((b) => (
              <Pressable key={b} onPress={() => setBathrooms(b)} style={chip(bathrooms === b)}>
                <Text style={chipText(bathrooms === b)}>{b === 4 ? "4+" : String(b)}</Text>
              </Pressable>
            ))}
          </View>
        </>
      )}

      {/* Area */}
      <Text style={[s.sectionLabel, { color: C.mutedForeground }]}>{cfg.areaLabel} *</Text>
      <View style={s.areaRow}>
        <TextInput
          value={area}
          onChangeText={setArea}
          placeholder="e.g. 1800"
          placeholderTextColor={C.mutedForeground}
          keyboardType="numeric"
          style={[s.areaInput, { borderColor: C.border, backgroundColor: C.card, color: C.foreground }]}
        />
        <View style={[s.unitToggle, { borderColor: C.border }]}>
          {(["sqft", "sqm"] as AreaUnit[]).map((u) => (
            <Pressable
              key={u}
              onPress={() => setAreaUnit(u)}
              style={[s.unitBtn, { backgroundColor: areaUnit === u ? C.primary : C.card }]}
            >
              <Text style={{ fontSize: 12, fontWeight: "700", color: areaUnit === u ? C.primaryForeground : C.mutedForeground }}>
                {u}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Dynamic Mapper Fields (Commercial, Industrial, Agricultural, Plot, etc.) */}
      {cfg.dynamicFields.map((field) => (
        <View key={field.key}>
          <Text style={[s.sectionLabel, { color: C.mutedForeground }]}>{field.label}</Text>
          {field.kind === "chips" && field.options ? (
            <View style={s.chipRow}>
              {field.options.map((opt) => {
                const sel = specs[field.key] === opt.id;
                return (
                  <Pressable
                    key={opt.id}
                    onPress={() => setSpecField(field.key, sel ? null : opt.id)}
                    style={chip(sel)}
                  >
                    <Text style={chipText(sel)}>{opt.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <TextInput
              value={specs[field.key] ?? ""}
              onChangeText={(txt) => setSpecField(field.key, txt)}
              placeholder={field.placeholder ?? ""}
              placeholderTextColor={C.mutedForeground}
              keyboardType={field.kind === "number" ? "numeric" : "default"}
              style={[
                s.areaInput,
                { borderColor: C.border, backgroundColor: C.card, color: C.foreground, marginBottom: 20 },
              ]}
            />
          )}
        </View>
      ))}

      {/* Facing */}
      <Text style={[s.sectionLabel, { color: C.mutedForeground }]}>Facing</Text>
      <View style={[s.chipRow, { marginBottom: 24 }]}>
        {FACING_OPTS.map((f) => (
          <Pressable key={f.id} onPress={() => setFacing(facing === f.id ? null : f.id)} style={chip(facing === f.id)}>
            <Text style={chipText(facing === f.id)}>{f.label}</Text>
          </Pressable>
        ))}
      </View>

      <View style={[s.divider, { backgroundColor: C.border }]} />

      {/* Price */}
      <Text style={[s.sectionLabel, { color: C.mutedForeground, marginTop: 20 }]}>
        {isRent ? "Monthly rent (₹) *" : "Asking price (₹) *"}
      </Text>
      <View style={[s.priceWrap, { borderColor: C.border, backgroundColor: C.card }]}>
        <Text style={[s.rupee, { color: C.mutedForeground }]}>₹</Text>
        <TextInput
          value={price}
          onChangeText={setPrice}
          placeholder={isRent ? "25000" : "8500000"}
          placeholderTextColor={C.mutedForeground}
          keyboardType="numeric"
          style={[s.priceInput, { color: C.foreground }]}
        />
      </View>
      {!isNaN(priceNum) && priceNum > 0 && (
        <Text style={[s.priceLabel, { color: C.primary }]}>{formatINR(priceNum)}</Text>
      )}

      <View style={[s.toggleRow, { borderColor: C.border, backgroundColor: C.card }]}>
        <View>
          <Text style={[s.toggleTitle, { color: C.foreground }]}>Negotiable</Text>
          <Text style={[s.toggleDesc, { color: C.mutedForeground }]}>Allow offers</Text>
        </View>
        <Switch value={negotiable} onValueChange={setNegotiable} trackColor={{ false: C.border, true: C.primary }} thumbColor="#fff" />
      </View>

      {isRent && cfg.hasBedBath && (
        <>
          <Text style={[s.sectionLabel, { color: C.mutedForeground }]}>Security deposit</Text>
          <View style={[s.priceWrap, { borderColor: C.border, backgroundColor: C.card, marginBottom: 20 }]}>
            <Text style={[s.rupee, { color: C.mutedForeground }]}>₹</Text>
            <TextInput
              value={deposit}
              onChangeText={setDeposit}
              placeholder="e.g. 100000"
              placeholderTextColor={C.mutedForeground}
              keyboardType="numeric"
              style={[s.priceInput, { color: C.foreground }]}
            />
          </View>

          <Text style={[s.sectionLabel, { color: C.mutedForeground }]}>Furnishing</Text>
          <View style={s.chipRow}>
            {FURNISHING_OPTS.map((f) => (
              <Pressable key={f.id} onPress={() => setFurnishing(furnishing === f.id ? null : f.id)} style={chip(furnishing === f.id)}>
                <Text style={chipText(furnishing === f.id)}>{f.label}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={[s.sectionLabel, { color: C.mutedForeground }]}>Preferred tenant</Text>
          <View style={s.tenantRow}>
            {TENANT_OPTS.map((t) => {
              const sel = tenant === t.id;
              return (
                <Pressable
                  key={t.id}
                  onPress={() => setTenant(sel ? null : t.id)}
                  style={[
                    s.tenantCard,
                    { borderColor: sel ? C.primary : C.border, backgroundColor: C.card, borderWidth: sel ? 2 : 1.5 },
                  ]}
                >
                  <Text style={{ fontSize: 22, marginBottom: 4 }}>{t.icon}</Text>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: sel ? C.primary : C.foreground }}>{t.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </>
      )}
    </WizardShell>
  );
}

const s = StyleSheet.create({
  sectionLabel: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 },
  chipRow:      { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 20 },
  chip:         { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20 },
  areaRow:      { flexDirection: "row", gap: 10, marginBottom: 20 },
  areaInput:    { flex: 1, borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14 },
  unitToggle:   { flexDirection: "row", borderWidth: 1.5, borderRadius: 12, overflow: "hidden" },
  unitBtn:      { paddingHorizontal: 14, paddingVertical: 11, alignItems: "center", justifyContent: "center" },
  divider:      { height: 1, marginBottom: 0 },
  priceWrap:    { flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, marginBottom: 6 },
  rupee:        { fontSize: 18, fontWeight: "700", marginRight: 4 },
  priceInput:   { flex: 1, fontSize: 20, fontWeight: "700", paddingVertical: 12 },
  priceLabel:   { fontSize: 13, fontWeight: "700", marginBottom: 14 },
  toggleRow:    { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1.5, borderRadius: 14, padding: 14, marginBottom: 20 },
  toggleTitle:  { fontSize: 14, fontWeight: "700" },
  toggleDesc:   { fontSize: 12, marginTop: 2 },
  tenantRow:    { flexDirection: "row", gap: 10, marginBottom: 20 },
  tenantCard:   { flex: 1, alignItems: "center", paddingVertical: 12, borderRadius: 14 },
});
