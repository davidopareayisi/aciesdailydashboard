import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { r2Storage } from "../app/lib/r2.mjs";
process.loadEnvFile(".env.local");
const base = "http://127.0.0.1:3107", objects = [];
assert.equal((await (await fetch(`${base}/api/auth/session`)).json()).testMode, true);
const accounts = JSON.parse(await readFile(".data/r2-qa/accounts.json", "utf8"));
async function login(name) { const r = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { Origin: base, "Content-Type": "application/json" }, body: JSON.stringify({ phone: accounts[name].phone, password: accounts[name].password }) }); assert.equal(r.status, 200); return r.headers.get("set-cookie").split(";")[0]; }
const cookie = await login("creative"), other = await login("other");
async function post(action, data, actor = cookie) { const r = await fetch(`${base}/api/upload/${action}`, { method: "POST", headers: { Origin: base, Cookie: actor, "Content-Type": "application/json" }, body: JSON.stringify(data) }); return { status: r.status, data: await r.json() }; }
async function prepare(bytes, mime, options = {}) { return post("prepare", { filename: "synthetic", mime, size: bytes.length, checksum: createHash("sha256").update(bytes).digest("base64"), ...options }); }
try {
 const image = await sharp({ create: { width: 100, height: 100, channels: 3, background: "#c9b5a0" } }).png().toBuffer();
 const result = await prepare(image, "image/png"); assert.equal(result.status, 200);
 const { id, uploadUrl, checksum } = result.data; objects.push(`pending/${id}.bin`);
 const preflight = await fetch(uploadUrl, { method: "OPTIONS", headers: { Origin: base, "Access-Control-Request-Method": "PUT", "Access-Control-Request-Headers": "content-type,x-amz-checksum-sha256" } }); assert.ok([200, 204].includes(preflight.status)); assert.equal(preflight.headers.get("access-control-allow-origin"), base);
 assert.equal((await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": "image/png", "x-amz-checksum-sha256": checksum }, body: image })).status, 200);
 assert.equal((await post("complete", { id }, other)).status, 404);
 const completed = await post("complete", { id }); assert.equal(completed.status, 201); objects.push(completed.data.media.storageKey);
 assert.equal(completed.data.media.mime, "image/webp"); assert.equal((await post("complete", { id })).status, 200);
 assert.equal((await fetch(`${base}/api/media/${id}`, { redirect: "manual" })).status, 404);
 const privateRead = await fetch(`${base}/api/media/${id}`, { headers: { Cookie: cookie }, redirect: "manual" }); assert.equal(privateRead.status, 307); assert.equal((await fetch(privateRead.headers.get("location"))).status, 200);
 console.log("PASS direct image upload, CORS, verification, retry and private signed download");
 const large = Buffer.alloc(11_000_000); large.write("ftyp", 4);
 const video = await prepare(large, "video/mp4", { purpose: "learning" }); assert.equal(video.status, 200); objects.push(`pending/${video.data.id}.bin`);
 assert.equal((await fetch(video.data.uploadUrl, { method: "PUT", headers: { "Content-Type": "video/mp4", "x-amz-checksum-sha256": video.data.checksum }, body: large })).status, 200);
 const done = await post("complete", { id: video.data.id }); assert.equal(done.status, 201); objects.push(done.data.media.storageKey); assert.equal(done.data.media.bytes, large.length);
 const read = await fetch(`${base}/api/media/${video.data.id}`, { headers: { Cookie: cookie }, redirect: "manual" }); const range = await fetch(read.headers.get("location"), { headers: { Range: "bytes=0-15" } }); assert.equal(range.status, 206); assert.equal((await range.arrayBuffer()).byteLength, 16);
 console.log("PASS upload greater than 10 MB and direct video range download");
 assert.equal((await post("prepare", { mime: "video/mp4", size: 100_000_001, checksum, purpose: "learning" })).status, 400);
 assert.equal((await post("prepare", { mime: "image/png", size: 10_000_001, checksum })).status, 400);
 assert.equal((await prepare(large, "video/mp4")).status, 400);
 const invalid = await prepare(Buffer.from("not an image"), "image/png"); objects.push(`pending/${invalid.data.id}.bin`);
 await fetch(invalid.data.uploadUrl, { method: "PUT", headers: { "Content-Type": "image/png", "x-amz-checksum-sha256": invalid.data.checksum }, body: Buffer.from("not an image") }); assert.equal((await post("complete", { id: invalid.data.id })).status, 400);
 console.log("PASS type, size and file-content validation");
} catch (error) { console.error(JSON.stringify({ failed: true, actual: error.actual, expected: error.expected, location: error.stack?.split("\n").find(line => line.includes("verify-direct-upload.mjs:")) })); process.exitCode = 1; }
finally { for (const key of objects) await r2Storage().remove(key); }

