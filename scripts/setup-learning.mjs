import { readFile } from "node:fs/promises";
import { starterLessons } from "../app/lib/learning-catalog.mjs";
import { postgresClient } from "../app/lib/postgres.mjs";
try {
  process.loadEnvFile(".env.local");
  if (!process.env.DATABASE_URL) throw new Error("Neon is not configured.");
  const sql = postgresClient();
  const statements = (await readFile(new URL("../database/learning-migration.sql", import.meta.url), "utf8")).split(";").map(value => value.trim()).filter(Boolean);
  await sql.transaction([
    ...statements.map(statement => sql.query(statement)),
    ...starterLessons.map(lesson => sql.query("INSERT INTO acies_portal.records (collection,id,data) VALUES ('lessons',$1,$2::jsonb) ON CONFLICT (collection,id) DO NOTHING", [lesson.id, JSON.stringify(lesson)])),
  ]);
  console.log("Learning collections are ready in Neon. Starter lessons were added without replacing existing lessons, accounts or records.");
} catch { console.error("Learning setup could not finish. Connection details were not printed; the migration is transactional."); process.exitCode = 1; }
