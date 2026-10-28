import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
const require = createRequire(import.meta.url), site = process.argv.includes("--site");
const project = site ? path.resolve("../studio") : process.cwd();
const child = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", site ? "3002" : "3001"], { cwd: project, windowsHide: true, stdio: "inherit", env: { ...process.env, ACIES_SITE_URL: "http://127.0.0.1:3002", ACIES_PORTAL_URL: "http://127.0.0.1:3001", ACIES_STORAGE_DIRECTORY: path.resolve(".data/qa-run"), ACIES_TEST_MODE: "true", ACIES_SUPABASE_URL: "", ACIES_SUPABASE_SERVICE_ROLE_KEY: "", ACIES_OTP_MODE: "local", ACIES_ALLOW_LOCAL_VERIFICATION: "true", TWILIO_ACCOUNT_SID: "", TWILIO_AUTH_TOKEN: "", TWILIO_FROM_NUMBER: "", TWILIO_MESSAGING_SERVICE_SID: "" } });
process.on("SIGINT", () => { child.kill(); });
process.on("SIGTERM", () => { child.kill(); });
child.on("exit", (code) => { process.exitCode = code || 0; });
