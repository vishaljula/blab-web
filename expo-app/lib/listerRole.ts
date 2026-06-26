/**
 * listerRole.ts
 *
 * Single source of truth for translating a listing's `listerType` field into
 * human-readable UI labels.  Both the web modal (PropertyDetailModal) and the
 * native property route (app/property/[id].tsx) import from here so vocabulary
 * changes ("Realtor", "Property Owner", etc.) propagate in one edit.
 *
 * Note: "broker" is culturally sensitive in India — always show "Realtor".
 */

export type ListerType = "developer" | "broker" | "owner" | "agent" | string | undefined | null;

/**
 * Full descriptive label shown below the agent name badge.
 * Examples: "Developer", "Realtor", "Property Owner", "Listing Agent"
 */
export function getRoleLabel(listerType: ListerType): string {
  switch (listerType) {
    case "developer": return "Developer";
    case "broker":    return "Realtor";       // never show "Broker" — culturally sensitive in IN
    case "owner":     return "Property Owner";
    default:          return "Listing Agent";
  }
}

/**
 * Short badge label used in compact contexts (e.g. native bottom bar chip).
 * Examples: "Developer", "Owner", "Agent"
 */
export function getRoleBadge(listerType: ListerType): string {
  switch (listerType) {
    case "developer": return "Developer";
    case "owner":     return "Owner";
    default:          return "Agent";
  }
}
