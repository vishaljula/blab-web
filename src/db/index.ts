import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

/**
 * Singleton Neon + Drizzle clients — SCRUM-161 (Connection Pooling)
 *
 * Two improvements over the original per-call construction:
 *
 * 1. Module-scope singleton: `neon()` and `drizzle()` are constructed once
 *    per Lambda container and reused on warm invocations. No reconnection
 *    overhead on every API call.
 *
 * 2. Neon pgBouncer pooler URL: DATABASE_URL_POOL routes queries through
 *    Neon's built-in pgBouncer which maintains a persistent pool of warm
 *    Postgres connections. Eliminates the per-request Postgres connection
 *    establishment on Neon's side (primary source of cold-connection latency).
 *    Falls back to DATABASE_URL for local dev where the pooler is optional.
 *
 * Lazy initialization is kept so build-time imports don't crash when
 * DATABASE_URL is not present (e.g. during `next build`).
 */
let _sql: ReturnType<typeof neon> | null = null;
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

function getSql(): ReturnType<typeof neon> {
  if (!_sql) {
    const url = process.env.DATABASE_URL_POOL ?? process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL or DATABASE_URL_POOL must be set");
    _sql = neon(url);
  }
  return _sql;
}

/**
 * Drizzle ORM client — use for typed schema queries.
 */
export function getDb() {
  if (!_db) {
    _db = drizzle(getSql(), { schema });
  }
  return _db;
}

/**
 * Raw Neon SQL template-tag client — use for queries that need raw SQL
 * (e.g. PostGIS spatial queries not expressible via Drizzle ORM).
 *
 * Usage:
 *   const sql = getRawSql();
 *   const rows = await sql`SELECT ...`;
 */
export function getRawSql(): ReturnType<typeof neon> {
  return getSql();
}

/**
 * Resets the singletons — for use in Jest/Vitest tests only.
 * Ensures each test suite starts with a fresh connection and schema.
 * Never call this in production code.
 */
export function _resetForTests() {
  _sql = null;
  _db  = null;
}
