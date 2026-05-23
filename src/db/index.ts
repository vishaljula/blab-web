import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

/**
 * Neon HTTP driver — serverless-friendly, no persistent connections.
 * Each API route invocation creates a lightweight HTTP connection to Neon.
 *
 * Uses lazy initialization to prevent build-time crashes when
 * DATABASE_URL is not available (e.g. during next build).
 */
export function getDb() {
  const sql = neon(process.env.DATABASE_URL!);
  return drizzle(sql, { schema });
}
