import { Platform } from "react-native";
import { API_BASE_URL } from "@/lib/theme";

const SESSION_ID = `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

export type TelemetryEventType =
  | "wizard_step_view"
  | "wizard_abandon"
  | "listing_view"
  | "society_unit_switch"
  | "photo_lightbox_open"
  | "contact_click_call"
  | "contact_click_whatsapp"
  | "tour_request_click"
  | "realtor_overflow_fallback_hit"
  | "realtor_handoff_cap_skipped";

interface TrackPayload {
  eventType: TelemetryEventType;
  listingId?: string | null;
  realtorId?: string | null;
  userId?: string | null;
  stepName?: string;
  metadata?: Record<string, any>;
}

/**
 * Fire-and-forget telemetry tracker for capturing the "Silent 70%" user behavior
 * (drop-offs, unit switches, window shopping vs contact clicks, and FOMO triggers).
 * Never throws or blocks UI interactions.
 */
export function trackEvent(payload: TrackPayload) {
  try {
    fetch(`${API_BASE_URL}/api/telemetry`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...payload,
        sessionId: SESSION_ID,
        platform: Platform.OS,
      }),
    }).catch(() => {});
  } catch {
    // non-fatal
  }
}

