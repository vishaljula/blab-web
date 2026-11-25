/**
 * Format INR price in Lakhs/Crores style
 * e.g., 4500000 → "₹45L", 12000000 → "₹1.2Cr"
 */
export function formatPrice(price: number): string {
  if (price >= 10000000) {
    const crores = price / 10000000;
    return `₹${crores % 1 === 0 ? crores.toFixed(0) : crores.toFixed(1)}Cr`;
  } else if (price >= 100000) {
    const lakhs = price / 100000;
    return `₹${lakhs % 1 === 0 ? lakhs.toFixed(0) : lakhs.toFixed(1)}L`;
  } else if (price >= 1000) {
    return `₹${(price / 1000).toFixed(0)}K`;
  }
  return `₹${price}`;
}

/**
 * Format INR price with full text
 * e.g., 4500000 → "₹45 Lakhs", 12000000 → "₹1.2 Crore"
 */
export function formatPriceFull(price: number): string {
  if (price >= 10000000) {
    const crores = price / 10000000;
    const label = crores === 1 ? "Crore" : "Crores";
    return `₹${crores % 1 === 0 ? crores.toFixed(0) : crores.toFixed(1)} ${label}`;
  } else if (price >= 100000) {
    const lakhs = price / 100000;
    return `₹${lakhs % 1 === 0 ? lakhs.toFixed(0) : lakhs.toFixed(1)} Lakhs`;
  }
  return `₹${price.toLocaleString("en-IN")}`;
}

/**
 * Format area in sq ft
 */
export function formatArea(sqft: number): string {
  return `${sqft.toLocaleString("en-IN")} sqft`;
}

/**
 * Format property specs summary
 * e.g., "2 BHK · 1,200 sqft · Apartment"
 */
export function formatSpecs(listing: {
  bedrooms?: number;
  builtUpArea?: number;
  carpetArea?: number;
  plotArea?: number;
  propertyType: string;
  societyName?: string | null;
  propertySpecs?: Record<string, any> | null;
}): string {
  const parts: string[] = [];
  const specs = listing.propertySpecs || {};

  if (listing.bedrooms) {
    parts.push(`${listing.bedrooms} BHK`);
  } else if (specs.capRatePct) {
    parts.push(`${specs.capRatePct} Cap`);
  } else if (specs.ceilingHeightFt) {
    parts.push(`${specs.ceilingHeightFt} Ht`);
  } else if (specs.acres) {
    parts.push(String(specs.acres));
  }

  const area = listing.builtUpArea || listing.carpetArea || listing.plotArea;
  if (area && !specs.acres) {
    parts.push(formatArea(area));
  }

  if (listing.societyName) {
    parts.push(listing.societyName);
  } else {
    parts.push(capitalizeFirst(listing.propertyType));
  }

  return parts.join(" · ");
}

function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
