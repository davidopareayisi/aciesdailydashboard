import { createHash, randomBytes, scryptSync } from "node:crypto";
import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { postgresEnabled, postgresQuery } from "../app/lib/postgres.mjs";
try { process.loadEnvFile(".env.local"); } catch (error) { if (error.code !== "ENOENT") throw error; }
const raw = (process.env.ACIES_OWNER_PHONE || "").replace(/[\s().-]/g, "");
const phone = /^0\d{9}$/.test(raw) ? `+233${raw.slice(1)}` : raw;
if (!/^\+[1-9]\d{6,14}$/.test(phone)) throw new Error("Set ACIES_OWNER_PHONE to the verified owner number in international format.");
const password = process.env.ACIES_OWNER_PASSWORD || randomBytes(24).toString("base64url"), name = process.env.ACIES_OWNER_NAME || "AciesDaily owner";
if (password.length < 12 || password.length > 128) throw new Error("Use a password with 12 to 128 characters.");
const id = `u-${createHash("sha256").update(phone).digest("hex").slice(0, 32)}`, salt = randomBytes(16).toString("hex");
const user = { id, name, phone, email: "", role: "staff", owner: true, verifiedAt: new Date().toISOString(), createdAt: new Date().toISOString(), authVersion: 1, passwordHash: `${salt}:${scryptSync(password, salt, 64).toString("hex")}` };
try { await access(".data/production-owner-access.txt"); throw new Error("A production owner credential file already exists; no account was created."); } catch (error) { if (error.code !== "ENOENT") throw error; }
const url = process.env.ACIES_SUPABASE_URL, key = process.env.ACIES_SUPABASE_SERVICE_ROLE_KEY;
if (Boolean(url) !== Boolean(key)) throw new Error("Configure both database variables.");
if (postgresEnabled()) {
  await postgresQuery("INSERT INTO acies_portal.records (collection, id, data) VALUES ($1, $2, $3::jsonb)", ["users", id, JSON.stringify(user)]);
} else if (url && key) {
  const response = await fetch(`${url.replace(/\/$/, "")}/rest/v1/acies_records`, { method: "POST", headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ collection: "users", id, data: user, revision: 1 }) });
  if (!response.ok) throw new Error(response.status === 409 ? "This account already exists; no account was overwritten." : "Owner account could not be provisioned.");
} else { const directory = path.join(process.env.ACIES_STORAGE_DIRECTORY || path.join(process.cwd(), ".data"), "users"); await mkdir(directory, { recursive: true }); await writeFile(path.join(directory, `${id}.json`), JSON.stringify(user), { flag: "wx", mode: 0o600 }); }
await mkdir(".data", { recursive: true });
await writeFile(".data/production-owner-access.txt", `ACIESDAILY OWNER ACCESS\nPhone: ${phone}\nPassword: ${password}\n\nKeep this file private and transfer credentials securely.\n`, { flag: "wx", mode: 0o600 });
console.log("Owner provisioned. Credentials are in the private .data/production-owner-access.txt file; no credentials were printed.");
