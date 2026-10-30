import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { r2Storage } from "../app/lib/r2.mjs";
try { process.loadEnvFile(".env.local"); } catch (error) { if (error.code !== "ENOENT") throw error; }
const base = "http://127.0.0.1:3107", checks = [], objects = [];
assert.equal((await (await fetch(`${base}/api/auth/session`)).json()).testMode, true, "Use the dedicated local R2 preview with production database disabled.");
const accounts = JSON.parse(await readFile(".data/r2-qa/accounts.json", "utf8"));
function actor() { let cookie = ""; return { async request(path, method = "GET", data) {
  const response = await fetch(`${base}/api/${path}`, { method, headers: { Origin: base, ...(cookie ? { Cookie: cookie } : {}), ...(data instanceof FormData ? {} : { "Content-Type": "application/json" }) }, ...(data === undefined ? {} : { body: data instanceof FormData ? data : JSON.stringify(data) }), signal: AbortSignal.timeout(30000) });
  const saved = response.headers.get("set-cookie"); if (saved) cookie = saved.split(";")[0];
  return { response, data: response.headers.get("content-type")?.includes("application/json") ? await response.json() : null };
} }; }
const owner = actor(), creative = actor(), other = actor(), anonymous = actor();
const pass = name => { checks.push(name); console.log(`PASS ${name}`); };
try {
  for (const [client, name] of [[owner, "owner"], [creative, "creative"], [other, "other"]]) {
    assert.equal((await client.request("auth/login", "POST", { phone: accounts[name].phone, password: accounts[name].password })).response.status, 200);
  }
  const image = await sharp({ create: { width: 100, height: 100, channels: 3, background: "#c9b5a0" } }).png().toBuffer();
  const form = new FormData(); form.set("file", new File([image], "r2-synthetic.png", { type: "image/png" }));
  const result = await creative.request("upload", "POST", form);
  assert.equal(result.response.status, 201);
  const media = result.data.media; objects.push(media.storageKey);
  assert.equal(media.storageProvider, "r2"); assert.equal(media.storageBucket, "dailyacies");
  assert.equal(media.mime, "image/webp"); assert.match(media.storageKey, /^portal\/[a-zA-Z0-9-]+\.webp$/);
  assert.ok((await r2Storage().get(media.storageKey)).length > 0);
  assert.equal((await anonymous.request(`media/${media.id}`)).response.status, 404);
  assert.equal((await other.request(`media/${media.id}`)).response.status, 404);
  assert.equal((await owner.request(`media/${media.id}`)).response.status, 200);
  assert.equal((await creative.request(`media/${media.id}`)).response.status, 200);
  pass("Actual portal uploads store processed images in R2; ownership and staff access remain enforced");

  const profile = { name: "R2 synthetic creative", city: "Accra", bio: "Synthetic R2 integration test profile used only in isolated local records.", crafts: ["Photographer"], portfolio: "", media: [media.id], avatar: media.id, availability: "Available", unavailableDates: [], equipment: "", measurements: "", studioDetails: "", publishConsent: true };
  const saved = await creative.request("portal/profile", "PATCH", profile); assert.equal(saved.response.status, 200);
  assert.equal((await creative.request("portal/application", "POST", {})).response.status, 200);
  const userId = saved.data.profile.id;
  assert.equal((await owner.request(`staff/people/${userId}`, "PATCH", { status: "Approved", reviewNote: "Synthetic R2 verification." })).response.status, 200);
  assert.equal((await owner.request("staff/publish-profile", "POST", { userId })).response.status, 200);
  assert.equal((await anonymous.request(`media/${media.id}`)).response.status, 200);
  assert.equal((await creative.request("portal/profile", "PATCH", { ...profile, publishConsent: false })).response.status, 200);
  assert.equal((await anonymous.request(`media/${media.id}`)).response.status, 404);
  pass("R2 image publication requires approval and consent; withdrawing consent immediately blocks public reads");

  const practice = new FormData(); practice.set("file", new File([image], "r2-practice.png", { type: "image/png" })); practice.set("purpose", "learning");
  const learning = await creative.request("upload", "POST", practice); assert.equal(learning.response.status, 201); objects.push(learning.data.media.storageKey);
  assert.equal(learning.data.media.storageProvider, "r2");
  assert.equal((await anonymous.request(`media/${learning.data.media.id}`)).response.status, 404);
  assert.equal((await other.request(`media/${learning.data.media.id}`)).response.status, 404);
  assert.equal((await owner.request(`media/${learning.data.media.id}`)).response.status, 200);
  pass("Learning files stored in R2 remain private to their learner and staff");

  await mkdir("artifacts", { recursive: true });
  await writeFile("artifacts/r2-api-verification.json", JSON.stringify({ passed: true, checks }, null, 2));
} finally {
  for (const key of objects) await r2Storage().remove(key);
  console.log(`Removed ${objects.length} synthetic R2 objects; no production database records were used.`);
}
