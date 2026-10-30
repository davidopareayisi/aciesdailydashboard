import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash, randomBytes, scryptSync } from "node:crypto";
import path from "node:path";
import { r2Configuration } from "../app/lib/r2.mjs";
try { process.loadEnvFile(".env.local"); } catch (error) { if (error.code !== "ENOENT") throw error; }
r2Configuration();
const require = createRequire(import.meta.url), root = path.resolve(".data/r2-qa");
await mkdir(path.join(root, "users"), { recursive: true });
let accounts;
try { accounts = JSON.parse(await readFile(path.join(root, "accounts.json"), "utf8")); } catch (error) { if (error.code !== "ENOENT") throw error; }
if (!accounts) {
  accounts = Object.fromEntries([["owner", "staff", "+12025550180"], ["creative", "creative", "+12025550181"], ["other", "creative", "+12025550182"]].map(([name, role, phone]) => [name, { name: `R2 QA ${name}`, phone, role, password: randomBytes(24).toString("base64url") }]));
  await writeFile(path.join(root, "accounts.json"), JSON.stringify(accounts), { mode: 0o600, flag: "wx" });
}
for (const [name, account] of Object.entries(accounts)) {
  const id = `u-${createHash("sha256").update(account.phone).digest("hex").slice(0, 32)}`, salt = randomBytes(16).toString("hex");
  await writeFile(path.join(root, "users", `${id}.json`), JSON.stringify({ id, ...account, password: undefined, passwordHash: `${salt}:${scryptSync(account.password, salt, 64).toString("hex")}`, owner: name === "owner", verifiedAt: new Date().toISOString(), createdAt: new Date().toISOString(), email: "", authVersion: 1 }), { mode: 0o600 });
}
const child = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", "3107"], {
  cwd: process.cwd(), windowsHide: true, stdio: "inherit",
  env: { ...process.env, DATABASE_URL: "", ACIES_SUPABASE_URL: "", ACIES_SUPABASE_SERVICE_ROLE_KEY: "", ACIES_STORAGE_DIRECTORY: root, ACIES_PORTAL_URL: "http://127.0.0.1:3107", ACIES_MEDIA_STORAGE: "r2", ACIES_TEST_MODE: "true", ACIES_OTP_MODE: "local", ACIES_ALLOW_LOCAL_VERIFICATION: "true", MNOTIFY_API_KEY: "", TWILIO_ACCOUNT_SID: "", TWILIO_AUTH_TOKEN: "", VERCEL: "" },
});
process.on("SIGINT", () => child.kill()); process.on("SIGTERM", () => child.kill()); child.on("exit", code => { process.exitCode = code || 0; });
