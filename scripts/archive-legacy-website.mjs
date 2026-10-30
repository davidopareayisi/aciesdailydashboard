import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import path from "node:path";
import { postgresQuery } from "../app/lib/postgres.mjs";
const collections = ["enquiries", "profiles", "work", "packages"], website = path.resolve("../studio/.data");
try {
  process.loadEnvFile(".env.local");
  const source = [], before = [];
  for (const collection of collections) {
    const folder = path.resolve(website, collection); if (!folder.startsWith(website + path.sep)) throw new Error("Invalid archive source.");
    const files = await readdir(folder).catch(error => { if (error.code === "ENOENT") return []; throw error; });
    for (const file of files.filter(file => /^[a-zA-Z0-9-]+\.json$/.test(file))) { const data = JSON.parse(await readFile(path.join(folder, file), "utf8")); if (file !== `${data.id}.json`) throw new Error("Invalid legacy identity."); source.push({ collection, id: data.id, data }); }
    before.push(...await postgresQuery("SELECT collection,id,data FROM acies_portal.records WHERE collection = $1", [collection]));
  }
  const archiveRoot = path.resolve(".data/migrations"), archive = path.resolve(archiveRoot, `website-${Date.now()}`);
  if (!archive.startsWith(archiveRoot + path.sep)) throw new Error("Invalid archive directory.");
  await mkdir(archive, { recursive: true });
  await writeFile(path.join(archive, "legacy-local.json"), JSON.stringify(source, null, 2), { flag: "wx", mode: 0o600 });
  await writeFile(path.join(archive, "portal-before.json"), JSON.stringify(before, null, 2), { flag: "wx", mode: 0o600 });
  const report = { source: "local website originals", remoteWebsiteVerified: false, imported: 0, alreadyPresent: 0, conflicts: [] };
  for (const record of source) {
    const existing = before.find(item => item.collection === record.collection && item.id === record.id);
    if (existing) { if (isDeepStrictEqual(existing.data, record.data)) report.alreadyPresent++; else report.conflicts.push({ collection: record.collection, id: record.id }); continue; }
    report.imported += (await postgresQuery("INSERT INTO acies_portal.records (collection,id,data) VALUES ($1,$2,$3::jsonb) ON CONFLICT (collection,id) DO NOTHING RETURNING id", [record.collection, record.id, JSON.stringify(record.data)])).length;
  }
  await writeFile(path.join(archive, "report.json"), JSON.stringify(report, null, 2), { flag: "wx", mode: 0o600 });
  console.log(`Private local website archive saved. Imported ${report.imported}; already present ${report.alreadyPresent}; conflicts preserved ${report.conflicts.length}. Remote website storage still requires Vercel inspection. No records or credentials were printed.`);
} catch { console.error("Website archive could not finish. Existing database rows were not overwritten and connection details were not printed."); process.exitCode = 1; }
