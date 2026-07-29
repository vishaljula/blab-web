/**
 * Upstash Redis client — shared singleton for all server-side use.
 *
 * Used for:
 *  - OTP brute-force rate limiting   (key: otp:rate:{phoneHash}, TTL 1h)
 *  - Realtor soft reservation        (key: realtor:reserved:{id}, TTL 5min)
 *  - (future) Viewport response cache, trending areas, dedup guards
 *
 * The client uses Upstash's HTTP REST transport — compatible with Vercel
 * serverless functions (no persistent TCP connection required).
 */
import { Redis } from "@upstash/redis";

if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
  console.warn("[redis] UPSTASH_REDIS_REST_URL / TOKEN not set — Redis features disabled");
}

export const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

// ── TTL constants ────────────────────────────────────────────────────────────

/** Realtor soft reservation window (seconds). Matches expected Step 4 completion time. */
export const REALTOR_RESERVATION_TTL = 300; // 5 minutes

/** OTP rate-limit window (seconds). */
export const OTP_RATE_LIMIT_TTL = 3600; // 1 hour

/** Max OTP verify attempts per phone per hour before rate-limiting. */
export const OTP_MAX_ATTEMPTS = 5;
