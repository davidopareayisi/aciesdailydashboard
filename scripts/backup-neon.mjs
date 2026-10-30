import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { postgresQuery } from "../app/lib/postgres.mjs";
try { process.loadEnvFile(".env.local"); } catch (error) { if (error.code !== "ENOENT") throw error; }
try {
  // One statement gives a consistent read snapshot, including private upload bytes.
  const rows = await postgresQuery(`SELECT jsonb_build_object(
    'records', COALESCE((SELECT jsonb_agg(to_jsonb(r)) FROM acies_portal.records r), '[]'::jsonb),
    'files', COALESCE((SELECT jsonb_agg(jsonb_build_object('storage_key', storage_key, 'bytes_base64', encode(bytes, 'base64'), 'created_at', created_at)) FROM acies_portal.files), '[]'::jsonb)
  ) AS snapshot`);
  const root = path.resolve(".data/backups");
  await mkdir(root, { recursive: true, mode: 0o700 });
  const snapshot = rows[0].snapshot;
  const filename = `neon-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  await writeFile(path.join(root, filename), JSON.stringify({ version: 1, createdAt: new Date().toISOString(), ...snapshot }), { mode: 0o600, flag: "wx" });
  console.log(JSON.stringify({ saved: true, file: `.data/backups/${filename}`, records: snapshot.records.length, files: snapshot.files.length }));
} catch {
  console.error("Backup failed. Check private database configuration and connectivity; no credentials were printed.");
  process.exitCode = 1;
}
