// Server entrypoints and maintenance scripts only. Never import into client components.
import { neon } from "@neondatabase/serverless";
let client;
export function postgresEnabled() { return Boolean(process.env.DATABASE_URL); }
export function postgresClient() { if (!process.env.DATABASE_URL) throw new Error("Database connection is not configured."); return client ??= neon(process.env.DATABASE_URL); }
/** @param {string} statement @param {unknown[]} values */
export async function postgresQuery(statement, values = []) { return postgresClient().query(statement, values, { fetchOptions: { cache: "no-store" } }); }
/** @param {string} key @param {Uint8Array} bytes */
export async function saveDatabaseFile(key, bytes) { await postgresQuery("INSERT INTO acies_portal.files (storage_key, bytes) VALUES ($1, decode($2, 'base64'))", [key, Buffer.from(bytes).toString("base64")]); }
/** @param {string} key */
export async function readDatabaseFile(key) { const rows = await postgresQuery("SELECT encode(bytes, 'base64') AS bytes FROM acies_portal.files WHERE storage_key = $1", [key]); if (!rows[0]) throw new Error("File unavailable."); return new Uint8Array(Buffer.from(rows[0].bytes, "base64")); }
