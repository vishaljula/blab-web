/**
 * Config-Driven Property Type Mapper
 *
 * Single array-of-objects source of truth that dynamically drives:
 *  1. Step 1 Property Type selector & Map category filters
 *  2. Step 3 Details & Price dynamic inputs/chips (stored in `propertySpecs`)
 *  3. Property Detail Page 3-column headline stats & 3×2 fact tablets
 */
import { formatPrice } from "@/lib/format";

export type PropertyTypeId =
  | "apartment"
  | "independent_house"
  | "villa"
  | "plot"
  | "commercial"
  | "industrial"
  | "agricultural"
  | "pg";

export interface DynamicFieldDef {
  key: string;
  label: string;
  kind: "chips" | "number" | "text";
  placeholder?: string;
  suffix?: string;
  options?: { id: string; label: string }[];
}

export interface BigStatItem {
  value: string;
  label: string;
}

export interface FactTabletItem {
  icon: string;
  label: string;
  sub: string;
}

export interface PropertyCategoryConfig {
  id: PropertyTypeId;
  label: string;
  shortLabel: string;
  icon: string;
  group: "residential" | "commercial" | "industrial" | "agricultural";
  hasBedBath: boolean;
  areaLabel: string;
  defaultAreaUnit: "sqft" | "sqm";
  aboutHeading: string;
  dynamicFields: DynamicFieldDef[];
  buildBigStats: (listing: any) => BigStatItem[];
  buildTablets: (listing: any) => FactTabletItem[];
}

export const PROPERTY_CONFIGS: PropertyCategoryConfig[] = [
  {
    id: "apartment",
    label: "Apartment / Society",
    shortLabel: "Apartment",
    icon: "business-outline",
    group: "residential",
    hasBedBath: true,
    areaLabel: "Carpet area",
    defaultAreaUnit: "sqft",
    aboutHeading: "About this apartment",
    dynamicFields: [
      {
        key: "possessionStatus",
        label: "Possession",
        kind: "chips",
        options: [
          { id: "Ready to Move", label: "Ready" },
          { id: "Under Construction", label: "Under Const." },
          { id: "New Launch", label: "New Launch" },
        ],
      },
    ],
    buildBigStats: (l) => [
      ...(l.bedrooms != null ? [{ value: String(l.bedrooms), label: "beds" }] : []),
      ...(l.bathrooms != null ? [{ value: String(l.bathrooms), label: "baths" }] : []),
      ...(l.builtUpArea || l.carpetArea
        ? [{ value: Number(l.builtUpArea || l.carpetArea).toLocaleString("en-IN"), label: "sqft" }]
        : []),
    ],
    buildTablets: (l) => {
      const area = l.builtUpArea || l.carpetArea;
      const pps = area && area > 0 ? Math.round(l.price / area) : null;
      const specs = l.propertySpecs || {};
      return [
        { icon: "business-outline", label: l.societyName || "Apartment", sub: "Society" },
        { icon: "layers-outline", label: l.floorNumber ? `Floor ${l.floorNumber}${l.totalFloors ? `/${l.totalFloors}` : ""}` : "Mid Floor", sub: "Floor" },
        { icon: "compass-outline", label: l.facing ? `${l.facing} Facing` : "East Facing", sub: "Facing" },
        { icon: "checkmark-done-outline", label: specs.possessionStatus || "Ready to Move", sub: "Possession" },
        { icon: "cash-outline", label: pps ? `₹${pps.toLocaleString("en-IN")}/sqft` : "—", sub: "Price/sqft" },
        { icon: "construct-outline", label: l.maintenance ? `₹${l.maintenance}/mo` : "₹4,500/mo", sub: "Maintenance" },
      ];
    },
  },
  {
    id: "independent_house",
    label: "Independent House",
    shortLabel: "House",
    icon: "home-outline",
    group: "residential",
    hasBedBath: true,
    areaLabel: "Built-up area",
    defaultAreaUnit: "sqft",
    aboutHeading: "About this house",
    dynamicFields: [
      { key: "plotSqyd", label: "Plot Size (sq.yd)", kind: "number", placeholder: "e.g. 240", suffix: "sq.yd" },
    ],
    buildBigStats: (l) => [
      ...(l.bedrooms != null ? [{ value: String(l.bedrooms), label: "beds" }] : []),
      ...(l.bathrooms != null ? [{ value: String(l.bathrooms), label: "baths" }] : []),
      ...(l.builtUpArea || l.carpetArea
        ? [{ value: Number(l.builtUpArea || l.carpetArea).toLocaleString("en-IN"), label: "sqft" }]
        : []),
    ],
    buildTablets: (l) => {
      const area = l.builtUpArea || l.carpetArea;
      const pps = area && area > 0 ? Math.round(l.price / area) : null;
      const specs = l.propertySpecs || {};
      return [
        { icon: "home-outline", label: "Indep. House", sub: "Type" },
        { icon: "expand-outline", label: specs.plotSqyd ? `${specs.plotSqyd} sq.yd` : l.plotArea ? `${l.plotArea} sq.yd` : "200 sq.yd", sub: "Plot" },
        { icon: "compass-outline", label: l.facing ? `${l.facing} Facing` : "North Facing", sub: "Facing" },
        { icon: "calendar-outline", label: l.yearBuilt ? `Built ${l.yearBuilt}` : "Ready", sub: "Age" },
        { icon: "cash-outline", label: pps ? `₹${pps.toLocaleString("en-IN")}/sqft` : "—", sub: "Price/sqft" },
        { icon: "car-outline", label: "2 Covered", sub: "Parking" },
      ];
    },
  },
  {
    id: "villa",
    label: "Villa",
    shortLabel: "Villa",
    icon: "leaf-outline",
    group: "residential",
    hasBedBath: true,
    areaLabel: "Built-up area",
    defaultAreaUnit: "sqft",
    aboutHeading: "About this villa",
    dynamicFields: [
      { key: "plotSqyd", label: "Plot Size (sq.yd)", kind: "number", placeholder: "e.g. 350", suffix: "sq.yd" },
    ],
    buildBigStats: (l) => [
      ...(l.bedrooms != null ? [{ value: String(l.bedrooms), label: "beds" }] : []),
      ...(l.bathrooms != null ? [{ value: String(l.bathrooms), label: "baths" }] : []),
      ...(l.builtUpArea || l.carpetArea
        ? [{ value: Number(l.builtUpArea || l.carpetArea).toLocaleString("en-IN"), label: "sqft" }]
        : []),
    ],
    buildTablets: (l) => {
      const area = l.builtUpArea || l.carpetArea;
      const pps = area && area > 0 ? Math.round(l.price / area) : null;
      const specs = l.propertySpecs || {};
      return [
        { icon: "leaf-outline", label: "Gated Villa", sub: "Type" },
        { icon: "expand-outline", label: specs.plotSqyd ? `${specs.plotSqyd} sq.yd` : l.plotArea ? `${l.plotArea} sq.yd` : "300 sq.yd", sub: "Plot" },
        { icon: "compass-outline", label: l.facing ? `${l.facing} Facing` : "East Facing", sub: "Facing" },
        { icon: "shield-checkmark-outline", label: l.societyName || "Clubhouse", sub: "Community" },
        { icon: "cash-outline", label: pps ? `₹${pps.toLocaleString("en-IN")}/sqft` : "—", sub: "Price/sqft" },
        { icon: "construct-outline", label: l.maintenance ? `₹${l.maintenance}/mo` : "₹6,000/mo", sub: "Maintenance" },
      ];
    },
  },
  {
    id: "plot",
    label: "Residential Plot",
    shortLabel: "Plot",
    icon: "map-outline",
    group: "residential",
    hasBedBath: false,
    areaLabel: "Plot area",
    defaultAreaUnit: "sqft",
    aboutHeading: "About this plot",
    dynamicFields: [
      {
        key: "approvalType",
        label: "Approval",
        kind: "chips",
        options: [
          { id: "HMDA Approved", label: "HMDA" },
          { id: "DTCP Approved", label: "DTCP" },
          { id: "GHMC Layout", label: "GHMC" },
        ],
      },
      { key: "roadWidthFt", label: "Road Width (ft)", kind: "number", placeholder: "e.g. 40", suffix: "ft" },
    ],
    buildBigStats: (l) => {
      const area = l.builtUpArea || l.carpetArea || l.plotArea || 2400;
      const sqyd = Math.round(area / 9);
      return [
        { value: sqyd.toLocaleString("en-IN"), label: "sq.yd" },
        { value: Number(area).toLocaleString("en-IN"), label: "sqft" },
        { value: l.facing || "East", label: "facing" },
      ];
    },
    buildTablets: (l) => {
      const area = l.builtUpArea || l.carpetArea || 2400;
      const pps = area > 0 ? Math.round(l.price / area) : null;
      const specs = l.propertySpecs || {};
      return [
        { icon: "ribbon-outline", label: specs.approvalType || "HMDA Approved", sub: "Approval" },
        { icon: "trail-sign-outline", label: specs.roadWidthFt ? `${specs.roadWidthFt} ft Road` : "40 ft Road", sub: "Approach" },
        { icon: "compass-outline", label: l.facing ? `${l.facing} Facing` : "East Facing", sub: "Facing" },
        { icon: "cash-outline", label: pps ? `₹${pps.toLocaleString("en-IN")}/sqft` : "—", sub: "Price/sqft" },
        { icon: "lock-closed-outline", label: "Clear Title", sub: "Ownership" },
        { icon: "flash-outline", label: "Ready Infra", sub: "Utilities" },
      ];
    },
  },
  {
    id: "commercial",
    label: "Commercial · Office / Retail",
    shortLabel: "Commercial",
    icon: "storefront-outline",
    group: "commercial",
    hasBedBath: false,
    areaLabel: "Leasable area",
    defaultAreaUnit: "sqft",
    aboutHeading: "Commercial investment summary",
    dynamicFields: [
      {
        key: "subType",
        label: "Asset Type",
        kind: "chips",
        options: [
          { id: "Office Space", label: "Office" },
          { id: "Retail / Shop", label: "Retail" },
          { id: "Showroom", label: "Showroom" },
        ],
      },
      {
        key: "shellStatus",
        label: "Fit-Out Condition",
        kind: "chips",
        options: [
          { id: "Plug & Play", label: "Plug & Play" },
          { id: "Warm Shell", label: "Warm Shell" },
          { id: "Bare Shell", label: "Bare Shell" },
        ],
      },
      {
        key: "occupancyStatus",
        label: "Tenancy Status",
        kind: "chips",
        options: [
          { id: "Pre-Leased", label: "Pre-Leased" },
          { id: "Vacant", label: "Vacant" },
        ],
      },
      { key: "capRatePct", label: "Target Cap Rate / ROI (%)", kind: "text", placeholder: "e.g. 8.4%" },
      { key: "powerLoadKva", label: "Power Backup (kVA)", kind: "text", placeholder: "e.g. 120 kVA" },
    ],
    buildBigStats: (l) => {
      const specs = l.propertySpecs || {};
      const area = l.builtUpArea || l.carpetArea || 3500;
      return [
        { value: specs.capRatePct || "8.2%", label: "Cap Rate" },
        { value: Number(area).toLocaleString("en-IN"), label: "sqft" },
        { value: specs.occupancyStatus || "Pre-Leased", label: "tenancy" },
      ];
    },
    buildTablets: (l) => {
      const specs = l.propertySpecs || {};
      const area = l.builtUpArea || l.carpetArea || 3500;
      const pps = area > 0 ? Math.round(l.price / area) : null;
      return [
        { icon: "business-outline", label: specs.subType || "Grade-A Office", sub: "Asset" },
        { icon: "construct-outline", label: specs.shellStatus || "Plug & Play", sub: "Shell" },
        { icon: "trending-up-outline", label: `Cap Rate ${specs.capRatePct || "8.2%"}`, sub: "Yield" },
        { icon: "document-text-outline", label: specs.lockInYears ? `${specs.lockInYears} Lock-in` : specs.occupancyStatus || "Pre-Leased", sub: "Lease" },
        { icon: "flash-outline", label: specs.powerLoadKva || "100% DG Backup", sub: "Power" },
        { icon: "cash-outline", label: pps ? `₹${pps.toLocaleString("en-IN")}/sqft` : "—", sub: "Price/sqft" },
      ];
    },
  },
  {
    id: "industrial",
    label: "Industrial · Warehouse / Shed",
    shortLabel: "Industrial",
    icon: "cube-outline",
    group: "industrial",
    hasBedBath: false,
    areaLabel: "Shed / Built area",
    defaultAreaUnit: "sqft",
    aboutHeading: "Industrial facility specs",
    dynamicFields: [
      {
        key: "subType",
        label: "Facility Type",
        kind: "chips",
        options: [
          { id: "Warehouse / Godown", label: "Warehouse" },
          { id: "Industrial Shed", label: "Ind. Shed" },
          { id: "Factory Unit", label: "Factory" },
        ],
      },
      { key: "ceilingHeightFt", label: "Clear Height (ft)", kind: "text", placeholder: "e.g. 36 ft" },
      {
        key: "loadingDocks",
        label: "Loading Docks",
        kind: "chips",
        options: [
          { id: "2 Docks", label: "2 Docks" },
          { id: "4 Docks", label: "4 Docks" },
          { id: "6+ Docks", label: "6+ Docks" },
        ],
      },
      { key: "powerLoadKva", label: "Power Sanction (kVA / HP)", kind: "text", placeholder: "e.g. 250 kVA" },
      {
        key: "zoningType",
        label: "Pollution Zone",
        kind: "chips",
        options: [
          { id: "Green Zone", label: "Green" },
          { id: "Orange Zone", label: "Orange" },
          { id: "SEZ / IALA", label: "SEZ / IALA" },
        ],
      },
    ],
    buildBigStats: (l) => {
      const specs = l.propertySpecs || {};
      const area = l.builtUpArea || l.carpetArea || 15000;
      return [
        { value: specs.ceilingHeightFt || "34 ft", label: "clear ht" },
        { value: specs.loadingDocks || "4 Docks", label: "loading" },
        { value: Number(area).toLocaleString("en-IN"), label: "sqft" },
      ];
    },
    buildTablets: (l) => {
      const specs = l.propertySpecs || {};
      const area = l.builtUpArea || l.carpetArea || 15000;
      const pps = area > 0 ? Math.round(l.price / area) : null;
      return [
        { icon: "cube-outline", label: specs.subType || "PEB Warehouse", sub: "Facility" },
        { icon: "resize-outline", label: `${specs.ceilingHeightFt || "34 ft"} Height`, sub: "Clearance" },
        { icon: "bus-outline", label: specs.loadingDocks || "4 Dock Bays", sub: "Loading" },
        { icon: "flash-outline", label: specs.powerLoadKva || "250 kVA HT", sub: "Power" },
        { icon: "navigate-outline", label: specs.orrDistanceKm ? `${specs.orrDistanceKm} to ORR` : "Near ORR", sub: "Transit" },
        { icon: "cash-outline", label: pps ? `₹${pps.toLocaleString("en-IN")}/sqft` : "—", sub: "Price/sqft" },
      ];
    },
  },
  {
    id: "agricultural",
    label: "Agricultural · Farm / Land",
    shortLabel: "Agri Land",
    icon: "leaf-outline",
    group: "agricultural",
    hasBedBath: false,
    areaLabel: "Total area (sqft)",
    defaultAreaUnit: "sqft",
    aboutHeading: "Land & soil highlights",
    dynamicFields: [
      { key: "acres", label: "Extent (Acres & Guntas)", kind: "text", placeholder: "e.g. 2.5 Acres (2 Ac 20 Gu)" },
      {
        key: "waterSource",
        label: "Water Source",
        kind: "chips",
        options: [
          { id: "Borewell + Drip", label: "Borewell" },
          { id: "Canal Access", label: "Canal" },
          { id: "Rainfed", label: "Rainfed" },
        ],
      },
      {
        key: "soilType",
        label: "Soil Type",
        kind: "chips",
        options: [
          { id: "Red Soil", label: "Red Soil" },
          { id: "Black Soil", label: "Black Soil" },
          { id: "Alluvial", label: "Alluvial" },
        ],
      },
      {
        key: "roadWidthFt",
        label: "Road Approach",
        kind: "chips",
        options: [
          { id: "40 ft BT Road", label: "40ft BT" },
          { id: "30 ft Road", label: "30ft Road" },
          { id: "Chak Road", label: "Chak Road" },
        ],
      },
      {
        key: "titleStatus",
        label: "Records",
        kind: "chips",
        options: [
          { id: "Dharani Clear", label: "Dharani Passbook" },
          { id: "Fenced Boundary", label: "Fenced" },
        ],
      },
    ],
    buildBigStats: (l) => {
      const specs = l.propertySpecs || {};
      return [
        { value: specs.acres || "2.5 Ac", label: "extent" },
        { value: specs.soilType || "Red Soil", label: "terrain" },
        { value: specs.titleStatus || "Dharani", label: "records" },
      ];
    },
    buildTablets: (l) => {
      const specs = l.propertySpecs || {};
      return [
        { icon: "expand-outline", label: specs.acres || "2.5 Acres", sub: "Extent" },
        { icon: "water-outline", label: specs.waterSource || "2 Borewells", sub: "Water" },
        { icon: "earth-outline", label: specs.soilType || "Fertile Red", sub: "Soil" },
        { icon: "trail-sign-outline", label: specs.roadWidthFt || "40 ft BT Road", sub: "Approach" },
        { icon: "shield-checkmark-outline", label: specs.titleStatus || "Dharani Clear", sub: "Records" },
        { icon: "pricetag-outline", label: specs.pricePerAcre || formatPrice(l.price), sub: "Rate" },
      ];
    },
  },
  {
    id: "pg",
    label: "PG / Co-living",
    shortLabel: "PG",
    icon: "people-outline",
    group: "residential",
    hasBedBath: true,
    areaLabel: "Room area",
    defaultAreaUnit: "sqft",
    aboutHeading: "About this co-living space",
    dynamicFields: [
      {
        key: "occupancyStatus",
        label: "Sharing Type",
        kind: "chips",
        options: [
          { id: "Single Room", label: "Single" },
          { id: "Twin Sharing", label: "Twin" },
          { id: "Triple Sharing", label: "Triple" },
        ],
      },
    ],
    buildBigStats: (l) => [
      { value: l.propertySpecs?.occupancyStatus || "Single", label: "sharing" },
      { value: "Meals + WiFi", label: "included" },
    ],
    buildTablets: (l) => [
      { icon: "people-outline", label: l.propertySpecs?.occupancyStatus || "Co-living", sub: "Room" },
      { icon: "wifi-outline", label: "High-Speed WiFi", sub: "Internet" },
      { icon: "restaurant-outline", label: "Meals Included", sub: "Food" },
      { icon: "snow-outline", label: "AC Rooms", sub: "Comfort" },
      { icon: "shield-checkmark-outline", label: "Biometric Entry", sub: "Security" },
      { icon: "cash-outline", label: l.securityDeposit ? `₹${l.securityDeposit} Dep.` : "1 Mo Deposit", sub: "Deposit" },
    ],
  },
];

export const PROPERTY_CONFIG_BY_ID: Record<string, PropertyCategoryConfig> = Object.fromEntries(
  PROPERTY_CONFIGS.map((c) => [c.id, c])
);

export function getPropertyConfig(propertyType?: string | null): PropertyCategoryConfig {
  if (!propertyType) return PROPERTY_CONFIGS[0];
  return PROPERTY_CONFIG_BY_ID[propertyType] ?? PROPERTY_CONFIGS[0];
}

