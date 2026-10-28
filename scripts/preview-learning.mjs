import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash, randomBytes, scryptSync } from "node:crypto";
import path from "node:path";
const require = createRequire(import.meta.url), root = path.resolve(".data/learning-qa");
await mkdir(path.join(root, "users"), { recursive: true });
let accounts;
try { accounts = JSON.parse(await readFile(path.join(root, "test-accounts.json"), "utf8")); } catch (error) { if (error.code !== "ENOENT") throw error; }
if (!accounts) {
  accounts = Object.fromEntries([["owner", "staff", "+12025550150"], ["learner", "creative", "+12025550151"], ["other", "creative", "+12025550152"], ["client", "client", "+12025550153"]].map(([name, role, phone]) => [name, { name: `Learning QA ${name}`, phone, role, password: randomBytes(18).toString("base64url") }]));
  await writeFile(path.join(root, "test-accounts.json"), JSON.stringify(accounts), { mode: 0o600, flag: "wx" });
}
for (const [name, account] of Object.entries(accounts)) {
  const id = `u-${createHash("sha256").update(account.phone).digest("hex").slice(0, 32)}`, salt = randomBytes(16).toString("hex");
  const user = { id, name: account.name, role: account.role, phone: account.phone, email: "", owner: name === "owner", verifiedAt: new Date().toISOString(), createdAt: new Date().toISOString(), authVersion: 1, passwordHash: `${salt}:${scryptSync(account.password, salt, 64).toString("hex")}` };
  await writeFile(path.join(root, "users", `${id}.json`), JSON.stringify(user), { mode: 0o600 });
}
const child = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", "3104"], { cwd: process.cwd(), windowsHide: true, stdio: "inherit", env: { ...process.env, DATABASE_URL: "", ACIES_SUPABASE_URL: "", ACIES_SUPABASE_SERVICE_ROLE_KEY: "", ACIES_PORTAL_URL: "http://127.0.0.1:3104", ACIES_STORAGE_DIRECTORY: root, ACIES_TEST_MODE: "true", ACIES_ALLOW_LOCAL_VERIFICATION: "true", ACIES_OTP_MODE: "local", TWILIO_ACCOUNT_SID: "", TWILIO_AUTH_TOKEN: "", TWILIO_FROM_NUMBER: "", TWILIO_MESSAGING_SERVICE_SID: "" } });
process.on("SIGINT", () => child.kill()); process.on("SIGTERM", () => child.kill()); child.on("exit", code => { process.exitCode = code || 0; });
