import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { postgresClient, postgresQuery } from "../app/lib/postgres.mjs";

try { process.loadEnvFile(".env.local"); } catch (error) { if (error.code !== "ENOENT") throw error; }
const localRoot = process.env.ACIES_STORAGE_DIRECTORY || path.join(process.cwd(), ".data");
const hash = (value) => createHash("sha256").update(value).digest("hex");
const accountId = (phone) => `u-${hash(phone).slice(0, 32)}`;
const credentialsPath = path.join(process.cwd(), ".data", "account-credentials.json");
const now = new Date().toISOString();
function encoded(password) { const salt = randomBytes(16).toString("hex"); return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`; }
function matches(password, encodedPassword) { const [salt, digest] = encodedPassword.split(":"); const actual = scryptSync(password, salt, 64); const expected = Buffer.from(digest, "hex"); return actual.length === expected.length && timingSafeEqual(actual, expected); }
async function optionalJson(file) { try { return JSON.parse(await readFile(file, "utf8")); } catch (error) { if (error.code === "ENOENT") return null; throw error; } }
async function insert(collection, record) { return postgresQuery("INSERT INTO acies_portal.records (collection, id, data) VALUES ($1, $2, $3::jsonb) ON CONFLICT (collection, id) DO NOTHING RETURNING id", [collection, record.id, JSON.stringify(record)]); }
const sourceCollections = ["users", "creativeProfiles", "invitations", "notices", "messages", "media", "invites", "audit", "enquiries", "profiles", "work", "packages"];
try {
  if (!process.env.DATABASE_URL) throw new Error("Database is not configured.");
  await postgresQuery("SELECT 1 AS connected");
  const ddl = (await readFile(new URL("../database/neon-schema.sql", import.meta.url), "utf8")).split(";").map((statement) => statement.trim()).filter(Boolean);
  const sql = postgresClient(); await sql.transaction(ddl.map((statement) => sql.query(statement)));
  const report = { migrated: {}, files: 0, createdAccounts: 0, preservedAccounts: 0 };
  for (const collection of sourceCollections) {
    let files; try { files = await readdir(path.join(localRoot, collection)); } catch (error) { if (error.code === "ENOENT") continue; throw error; }
    let inserted = 0;
    for (const file of files.filter((name) => /^[a-zA-Z0-9-]+\.json$/.test(name))) {
      const record = await optionalJson(path.join(localRoot, collection, file)); if (!record || file !== `${record.id}.json`) throw new Error("A migration record has an invalid identity.");
      inserted += (await insert(collection, record)).length;
    }
    report.migrated[collection] = inserted;
  }
  const media = await postgresQuery("SELECT data FROM acies_portal.records WHERE collection = 'media'");
  for (const { data } of media) {
    if (!/^[a-f0-9-]{36}\.(webp|pdf)$/.test(data.storageKey)) throw new Error("Invalid upload storage key.");
    if ((await postgresQuery("SELECT 1 FROM acies_portal.files WHERE storage_key = $1", [data.storageKey])).length) continue;
    const bytes = await readFile(path.join(localRoot, "uploads", data.storageKey));
    await postgresQuery("INSERT INTO acies_portal.files (storage_key, bytes) VALUES ($1, decode($2, 'base64')) ON CONFLICT (storage_key) DO NOTHING", [data.storageKey, bytes.toString("base64")]); report.files++;
  }
  const connection = new URL(process.env.DATABASE_URL), fingerprint = hash(`${connection.hostname}${connection.pathname}`);
  let credentials = await optionalJson(credentialsPath);
  if (credentials && credentials.databaseFingerprint !== fingerprint) throw new Error("Saved credentials belong to another database. Nothing will be overwritten.");
  if (!credentials) {
    const ownerPhone = "+233547637997", ownerId = accountId(ownerPhone), owner = (await postgresQuery("SELECT data FROM acies_portal.records WHERE collection = 'users' AND id = $1", [ownerId]))[0]?.data;
    let ownerPassword;
    if (owner) {
      if (owner.role !== "staff" || !owner.owner) throw new Error("The business number belongs to an existing non-owner account.");
      const access = await readFile(path.join(localRoot, "owner-access.txt"), "utf8"); ownerPassword = access.match(/^Password: (.+)$/m)?.[1]?.trim();
      if (!ownerPassword || !matches(ownerPassword, owner.passwordHash)) throw new Error("The existing owner was preserved, but its current password is not available locally.");
    } else ownerPassword = randomBytes(18).toString("base64url");
    const demos = [
      { label: "Staff", name: "Demo staff", phone: "+12025550100", role: "staff", crafts: [] },
      { label: "Client", name: "Demo client", phone: "+12025550101", role: "client", crafts: [] },
      { label: "Camera / photographer", name: "Demo camera creative", phone: "+12025550102", role: "creative", crafts: ["Camera operator", "Photographer"] },
      { label: "Model", name: "Demo model", phone: "+12025550103", role: "creative", crafts: ["Model / actor"] },
      { label: "Crew", name: "Demo crew member", phone: "+12025550104", role: "creative", crafts: ["Production crew", "Lighting / sound crew"] },
      { label: "Studio owner", name: "Demo studio owner", phone: "+12025550105", role: "creative", crafts: ["Studio / location owner"] },
    ];
    credentials = { databaseFingerprint: fingerprint, createdAt: now, accounts: [{ label: "Owner / admin", name: "AciesDaily owner", phone: ownerPhone, role: "staff", owner: true, demo: false, password: ownerPassword, crafts: [] }, ...demos.map((account) => ({ ...account, owner: false, demo: true, password: randomBytes(18).toString("base64url") }))] };
    await mkdir(path.dirname(credentialsPath), { recursive: true });
    await writeFile(credentialsPath, JSON.stringify(credentials, null, 2), { flag: "wx", mode: 0o600 });
  }
  for (const account of credentials.accounts) {
    const id = accountId(account.phone), found = (await postgresQuery("SELECT data FROM acies_portal.records WHERE collection = 'users' AND id = $1", [id]))[0]?.data;
    if (found) { if (found.role !== account.role || Boolean(found.demo) !== account.demo || !matches(account.password, found.passwordHash)) throw new Error("An existing account differs from the saved credentials. It was not changed."); report.preservedAccounts++; }
    else { await insert("users", { id, name: account.name, phone: account.phone, email: "", role: account.role, owner: account.owner, demo: account.demo, verifiedAt: now, createdAt: now, authVersion: 1, passwordHash: encoded(account.password) }); report.createdAccounts++; }
    if (account.role === "creative") await insert("creativeProfiles", { id, name: account.name, city: "Accra · demo", bio: "Private demonstration profile for testing AciesDaily portal access. This is not a real creative-network listing.", crafts: account.crafts, portfolio: "", media: [], avatar: "", availability: "Available", unavailableDates: [], equipment: "", measurements: "", studioDetails: "", publishConsent: false, status: "Approved", reviewNote: "Owner-provisioned demo account. Public publishing and SMS delivery are disabled for this account.", submittedAt: now, updatedAt: now });
  }
  const lines = ["ACIESDAILY PORTAL — PRIVATE ACCOUNT CREDENTIALS", "", "Sign-in: http://127.0.0.1:3001/login", "", "The owner account uses the existing business number. All other entries are demo accounts with fictional, non-working phone numbers. No SMS is sent to demo accounts. Do not share staff or owner passwords publicly.", ""];
  for (const account of credentials.accounts) lines.push(account.label.toUpperCase(), `Phone / login: ${account.phone}`, `Password: ${account.password}`, `Access: ${account.role}${account.owner ? " (owner)" : account.demo ? " (demo)" : ""}`, "");
  lines.push("Demo logins require ACIES_ALLOW_DEMO_ACCOUNTS=true. Leave that setting false or unset on a public production deployment.", "The database connection is stored separately in the ignored server-only .env.local file.");
  await writeFile(".data/account-credentials.txt", lines.join("\n"), { mode: 0o600 });
  let source = await readFile(".env.local", "utf8"); source = /^ACIES_ALLOW_DEMO_ACCOUNTS=.*$/m.test(source) ? source.replace(/^ACIES_ALLOW_DEMO_ACCOUNTS=.*$/m, "ACIES_ALLOW_DEMO_ACCOUNTS=true") : `${source}\nACIES_ALLOW_DEMO_ACCOUNTS=true\n`; await writeFile(".env.local", source, { mode: 0o600 });
  await writeFile(".data/neon-migration-report.json", JSON.stringify({ completedAt: new Date().toISOString(), ...report }, null, 2), { mode: 0o600 });
  console.log(`Neon setup complete. ${credentials.accounts.length} logins are available in the private .data/account-credentials.txt file. Existing records were preserved. No passwords or connection strings were printed.`);
} catch (error) { console.error(`Neon setup could not finish${typeof error.code === "string" && /^[A-Z0-9]{5}$/.test(error.code) ? ` (database code ${error.code})` : ""}. Existing data was not overwritten. Connection details were not printed.`); process.exitCode = 1; }
