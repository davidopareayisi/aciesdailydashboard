import { spawn } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url), port = process.argv.includes("--demos-off") ? "3103" : "3101";
const child = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", port], { cwd: process.cwd(), windowsHide: true, stdio: "inherit", env: { ...process.env, ACIES_PORTAL_URL: `http://127.0.0.1:${port}`, ACIES_ALLOW_DEMO_ACCOUNTS: process.argv.includes("--demos-off") ? "false" : "true" } });
process.on("SIGINT", () => child.kill()); process.on("SIGTERM", () => child.kill()); child.on("exit", (code) => { process.exitCode = code || 0; });
