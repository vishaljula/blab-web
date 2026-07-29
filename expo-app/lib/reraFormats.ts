/**
 * Indian state → RERA agent number format reference.
 *
 * Used to show a contextual placeholder in the realtor search field so
 * customers recognise the format from a realtor's business card or certificate.
 *
 * Source: each state's RERA authority registration format.
 * Add new states as Blab expands to them.
 */

export interface ReraFormatInfo {
  /** A realistic full example of the state's RERA agent number. */
  example: string;
  /** The shortest unique part customers can type to search (last digits / code). */
  short: string;
}

const STATE_RERA_FORMAT: Record<string, ReraFormatInfo> = {
  "telangana":       { example: "TSRERA/AGT/00041",                  short: "00041" },
  "andhra pradesh":  { example: "AP/RERA/AGENT/2024/00041",           short: "00041" },
  "maharashtra":     { example: "A51700012345",                       short: "A51700012345" },
  "karnataka":       { example: "PRM/KA/RERA/1251/308/AG/000123",     short: "000123" },
  "tamil nadu":      { example: "TN/Agent/0000041/2018",              short: "0000041" },
  "kerala":          { example: "K-RERA/Agent/2018/001",              short: "001" },
  "gujarat":         { example: "AG/GJ/AHMEDABAD/ARERA/EXE-001",      short: "EXE-001" },
  "rajasthan":       { example: "RAJ/RERA/AGN/2021/001",              short: "001" },
  "uttar pradesh":   { example: "UPRERAAGT10000001",                  short: "10000001" },
  "haryana":         { example: "HRERA/PKL/2019/001",                 short: "001" },
  "punjab":          { example: "PBRERA/REG/2021/001",                short: "001" },
  "west bengal":     { example: "HIRA/A/KOL/2018/000001",             short: "000001" },
  "delhi":           { example: "DLRERA2017A0001",                    short: "A0001" },
  "madhya pradesh":  { example: "MPRERA/Agent/2019/001",              short: "001" },
  "goa":             { example: "RERA/GOA/AGT/2020/001",              short: "001" },
};

/** Fallback when state cannot be determined. */
const DEFAULT_FORMAT: ReraFormatInfo = STATE_RERA_FORMAT["telangana"];

/**
 * Derive the RERA format for a given address string.
 * Looks for a known state name anywhere in the address (case-insensitive).
 * Returns the format info, or the default (Telangana) if no match.
 */
export function reraFormatFromAddress(address: string | null | undefined): ReraFormatInfo {
  if (!address) return DEFAULT_FORMAT;
  const lower = address.toLowerCase();
  for (const [state, info] of Object.entries(STATE_RERA_FORMAT)) {
    if (lower.includes(state)) return info;
  }
  return DEFAULT_FORMAT;
}

/**
 * Build the search field placeholder string for a given address.
 * e.g. "Company name or RERA no. (e.g. TSRERA/AGT/00041 or just 00041)"
 */
export function reraSearchPlaceholder(address: string | null | undefined): string {
  const { example, short } = reraFormatFromAddress(address);
  const suffix = example !== short ? ` or just ${short}` : "";
  return `Company name or RERA no. (e.g. ${example}${suffix})`;
}
