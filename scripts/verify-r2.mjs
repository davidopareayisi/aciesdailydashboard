import { randomUUID } from "node:crypto";
import { timingSafeEqual } from "node:crypto";
import { r2Storage } from "../app/lib/r2.mjs";
try { process.loadEnvFile(".env.local"); } catch (error) { if (error.code !== "ENOENT") throw error; }
let storage, key, created = false;
try {
  storage = r2Storage();
  await storage.check();
  if (process.argv.includes("--roundtrip")) {
    key = `_acies-checks/${randomUUID()}.txt`;
    const bytes = Buffer.from("AciesDaily private storage verification. No personal data.");
    await storage.put(key, bytes, "text/plain"); created = true;
    const received = await storage.get(key);
    if (received.length !== bytes.length || !timingSafeEqual(bytes, received)) throw new Error("Mismatch");
    await storage.remove(key); created = false;
  }
  console.log(JSON.stringify({ connected: true, bucket: storage.bucket, roundtrip: process.argv.includes("--roundtrip") }));
} catch (error) {
  console.error(JSON.stringify({ connected: false, code: /^[A-Z0-9_]+$/.test(error.code || "") ? error.code : "R2_CHECK_FAILED" }));
  process.exitCode = 1;
} finally {
  if (created) await storage.remove(key).catch(() => { console.error("The synthetic check object could not be removed; no existing objects were touched."); process.exitCode = 1; });
}
