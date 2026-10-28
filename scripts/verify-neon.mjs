import assert from "node:assert/strict";
import { randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import sharp from "sharp";
import { postgresQuery } from "../app/lib/postgres.mjs";
try { process.loadEnvFile(".env.local"); } catch (error) { if (error.code !== "ENOENT") throw error; }
const base = "http://127.0.0.1:3101", locked = "http://127.0.0.1:3103", results = [], sessions = [];
const credentials = JSON.parse(await readFile(".data/account-credentials.json", "utf8"));
let uploaded;
function pass(name) { results.push(name); console.log(`PASS ${name}`); }
async function login(account, origin = base) { const response = await fetch(`${origin}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify({ phone: account.phone, password: account.password }), signal: AbortSignal.timeout(20000) }); const data = await response.json(); return { status: response.status, data, cookie: response.headers.get("set-cookie")?.split(";")[0] || "", origin }; }
async function request(actor, route, method = "GET", data) { const response = await fetch(`${actor.origin || base}/api/${route}`, { method, headers: { ...(actor.cookie ? { Cookie: actor.cookie } : {}), Origin: actor.origin || base, ...(data instanceof FormData ? {} : { "Content-Type": "application/json" }) }, ...(data !== undefined ? { body: data instanceof FormData ? data : JSON.stringify(data) } : {}), signal: AbortSignal.timeout(20000) }); const result = response.headers.get("content-type")?.includes("application/json") ? await response.json() : null; return { status: response.status, data: result, response }; }
try {
  const db = await postgresQuery("SELECT count(*)::int AS count FROM acies_portal.records WHERE collection = 'users'"); assert.ok(db[0].count >= 7);
  for (const account of credentials.accounts) {
    const actor = await login(account); assert.equal(actor.status, 200, `Login failed for ${account.label}`); sessions.push(actor);
    assert.equal(actor.data.user.role, account.role); assert.equal(Boolean(actor.data.user.demo), account.demo);
    assert.equal("passwordHash" in actor.data.user, false);
    const route = account.role === "staff" ? "staff/overview" : "portal/feed"; const dashboard = await request(actor, route); assert.equal(dashboard.status, 200, `Area unavailable for ${account.label}`);
    if (account.role !== "staff") assert.equal((await request(actor, "staff/overview")).status, 403);
    if (account.demo) assert.equal((await request(actor, "auth/code", "POST", { purpose: "verify" })).status, 400);
  }
  pass("All seven saved logins work against Neon and receive the correct account permissions");
  const owner = sessions[0], camera = sessions[3], client = sessions[2];
  const feed = await request(camera, "portal/feed"); assert.ok(feed.data.profile.crafts.includes("Camera operator"));
  await request(camera, "portal/profile", "PATCH", { ...feed.data.profile, publishConsent: true });
  assert.equal((await request(owner, "staff/publish-profile", "POST", { userId: feed.data.user.id })).status, 400);
  assert.equal((await request({}, "content/profiles")).data.entries.some((entry) => entry.id === feed.data.user.id), false);
  await request(camera, "portal/profile", "PATCH", feed.data.profile);
  pass("Demo profiles remain private and cannot be published by staff");
  const png = await sharp({ create: { width: 80, height: 100, channels: 3, background: "#d3c7b8" } }).png().toBuffer();
  const form = new FormData(); form.set("file", new File([png], "neon-storage-check.png", { type: "image/png" }));
  const file = await request(camera, "upload", "POST", form); assert.equal(file.status, 201); uploaded = file.data.media;
  assert.equal((await request({}, `media/${uploaded.id}`)).status, 404); assert.equal((await request(client, `media/${uploaded.id}`)).status, 404);
  const download = await request(camera, `media/${uploaded.id}`); assert.equal(download.status, 200); assert.equal((await sharp(Buffer.from(await download.response.arrayBuffer())).metadata()).format, "webp");
  assert.equal((await postgresQuery("SELECT count(*)::int AS count FROM acies_portal.files WHERE storage_key = $1", [uploaded.storageKey]))[0].count, 1);
  let onDisk = false; try { await access(`.data/uploads/${uploaded.storageKey}`); onDisk = true; } catch {} assert.equal(onDisk, false);
  pass("Private uploads round-trip through Neon without depending on local disk, and reject other accounts");
  const accountRows = await postgresQuery("SELECT data FROM acies_portal.records WHERE collection = 'users'");
  for (const account of credentials.accounts) { const user = accountRows.find((row) => row.data.phone === account.phone)?.data; const [salt, digest] = user.passwordHash.split(":"); assert.ok(timingSafeEqual(scryptSync(account.password, salt, 64), Buffer.from(digest, "hex"))); assert.equal(user.passwordHash.includes(account.password), false); }
  pass("Account passwords are salted hashes in PostgreSQL and match the private saved credentials");
  const demoDenied = await login(credentials.accounts[3], locked); assert.equal(demoDenied.status, 401);
  assert.equal((await request({ ...camera, origin: locked }, "portal/feed")).status, 401);
  const ownerAllowed = await login(credentials.accounts[0], locked); assert.equal(ownerAllowed.status, 200); sessions.push(ownerAllowed);
  pass("Disabling demo access blocks demo logins while preserving the real owner login");
  const marker = `neon-check-${randomUUID()}`;
  try { await postgresQuery("INSERT INTO acies_portal.records (collection, id, data) VALUES ('audit', $1, $2::jsonb)", [marker, JSON.stringify({ id: marker, action: "Temporary database verification" })]); const changes = await Promise.all([1, 2].map((value) => postgresQuery("UPDATE acies_portal.records SET revision = revision + 1, data = data || jsonb_build_object('check', $2::int) WHERE collection = 'audit' AND id = $1 AND revision = 1 RETURNING revision", [marker, value]))); assert.equal(changes.reduce((total, rows) => total + rows.length, 0), 1); } finally { await postgresQuery("DELETE FROM acies_portal.records WHERE collection = 'audit' AND id = $1", [marker]); }
  pass("Concurrent database updates enforce the record revision check");
  await mkdir("artifacts", { recursive: true }); await writeFile("artifacts/neon-verification.json", JSON.stringify({ passed: true, checks: results }, null, 2)); console.log(`${results.length} live Neon checks passed. No credentials or connection details were printed.`);
} catch { console.error("A Neon verification check failed. No connection details or passwords were printed."); process.exitCode = 1; }
finally {
  if (uploaded) { await postgresQuery("DELETE FROM acies_portal.records WHERE collection = 'media' AND id = $1", [uploaded.id]); await postgresQuery("DELETE FROM acies_portal.files WHERE storage_key = $1", [uploaded.storageKey]); }
  for (const actor of sessions) await request(actor, "auth/logout", "POST", {}).catch(() => {});
}
