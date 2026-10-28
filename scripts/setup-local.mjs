import { randomBytes, createHash, scryptSync } from "node:crypto";
import { readFile, writeFile, mkdir, readdir, copyFile } from "node:fs/promises";
import path from "node:path";
const root = process.cwd(), website = path.resolve(root, "../studio");
async function env(file) { try { return await readFile(file, "utf8"); } catch (error) { if (error.code === "ENOENT") return ""; throw error; } }
let source = await env(path.join(root, ".env.local"));
function value(key) { return source.match(new RegExp(`^${key}=(.*)$`, "m"))?.[1]?.trim().replace(/^['"]|['"]$/g, ""); }
function set(key, setting) { if (new RegExp(`^${key}=`, "m").test(source)) source = source.replace(new RegExp(`^${key}=.*$`, "m"), `${key}=${setting}`); else source += `\n${key}=${setting}\n`; }
for (const key of ["ACIES_BRIDGE_SECRET", "ACIES_VERIFICATION_SECRET"]) if (!value(key)) set(key, randomBytes(32).toString("base64url"));
if (!value("ACIES_PORTAL_URL")) set("ACIES_PORTAL_URL", "http://127.0.0.1:3001");
if (!value("ACIES_SITE_URL")) set("ACIES_SITE_URL", "http://127.0.0.1:3000");
if (!value("ACIES_OTP_MODE")) set("ACIES_OTP_MODE", "local");
if (!value("ACIES_ALLOW_LOCAL_VERIFICATION")) set("ACIES_ALLOW_LOCAL_VERIFICATION", "true");
await writeFile(path.join(root, ".env.local"), source, { mode: 0o600 });
let publicEnv = await env(path.join(website, ".env.local"));
for (const [key, setting] of [["ACIES_PORTAL_URL", value("ACIES_PORTAL_URL")], ["ACIES_BRIDGE_SECRET", value("ACIES_BRIDGE_SECRET")], ["ACIES_SITE_URL", value("ACIES_SITE_URL")]]) { if (new RegExp(`^${key}=`, "m").test(publicEnv)) publicEnv = publicEnv.replace(new RegExp(`^${key}=.*$`, "m"), `${key}=${setting}`); else publicEnv += `\n${key}=${setting}\n`; }
await writeFile(path.join(website, ".env.local"), publicEnv, { mode: 0o600 });
const phone = "+233547637997", id = `u-${createHash("sha256").update(phone).digest("hex").slice(0, 32)}`, directory = path.join(root, ".data", "users");
await mkdir(directory, { recursive: true });
try {
  const existing = JSON.parse(await readFile(path.join(directory, `${id}.json`), "utf8"));
  if (existing.role !== "staff" || !existing.owner) throw new Error("The owner number already belongs to a different account. Choose a separate owner number before setup.");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
  const password = randomBytes(24).toString("base64url"), salt = randomBytes(16).toString("hex");
  await writeFile(path.join(directory, `${id}.json`), JSON.stringify({ id, name: "AciesDaily team", phone, email: "", role: "staff", owner: true, verifiedAt: new Date().toISOString(), createdAt: new Date().toISOString(), authVersion: 1, passwordHash: `${salt}:${scryptSync(password, salt, 64).toString("hex")}` }), { flag: "wx", mode: 0o600 });
  await writeFile(path.join(root, ".data", "owner-access.txt"), `ACIESDAILY LOCAL PORTAL\n\nURL: ${value("ACIES_PORTAL_URL")}\nPhone: ${phone}\nPassword: ${password}\n\nKeep these local owner credentials private.\nProduction requires a separately provisioned staff owner, live phone verification and durable storage.\n`, { flag: "wx", mode: 0o600 });
}
for (const bucket of ["enquiries", "profiles", "work", "packages"]) {
  let files; try { files = await readdir(path.join(website, ".data", bucket)); } catch (error) { if (error.code === "ENOENT") continue; throw error; }
  for (const file of files.filter((name) => /^[a-zA-Z0-9-]+\.json$/.test(name))) { const target = path.join(root, ".data", bucket, file); await mkdir(path.dirname(target), { recursive: true }); try { await copyFile(path.join(website, ".data", bucket, file), target, 1); } catch (error) { if (error.code !== "EEXIST") throw error; } }
}
console.log("Local portal configured. Private owner details: .data/owner-access.txt. Local verification codes: .data/local-codes/. Existing website records were copied without overwriting or deleting originals.");
