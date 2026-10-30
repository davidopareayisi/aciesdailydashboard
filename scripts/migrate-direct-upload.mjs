import { readFile } from "node:fs/promises";
import { postgresClient } from "../app/lib/postgres.mjs";
process.loadEnvFile(".env.local");
const sql = postgresClient();
try { const statements = (await readFile("database/direct-upload-migration.sql", "utf8")).split(";").map(s=>s.trim()).filter(Boolean); await sql.transaction(statements.map(s=>sql.query(s))); console.log("Direct-upload collection enabled; existing records preserved."); } catch { console.error("Upload migration failed; details omitted."); process.exitCode = 1; }
