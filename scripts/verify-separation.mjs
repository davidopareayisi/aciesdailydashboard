import assert from "node:assert/strict";
import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
try { process.loadEnvFile(".env.local"); } catch (error) { if (error.code !== "ENOENT") throw error; }
const portal = "http://127.0.0.1:3105", site = "http://127.0.0.1:3106", directory = path.resolve(".data/qa-run/enquiries"), checks = [];
assert.equal((await (await fetch(`${portal}/api/auth/session`)).json()).testMode, true, "Use isolated previews with remote storage disabled.");
const pass = name => { checks.push(name); console.log(`PASS ${name}`); };
async function submit(origin, input, key, authenticated = false) { const response = await fetch(`${origin}/api/${authenticated ? "bridge/enquiries" : "enquiries"}`, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json", "Idempotency-Key": key, ...(authenticated ? { Authorization: `Bearer ${process.env.ACIES_BRIDGE_SECRET}` } : {}) }, body: JSON.stringify(input) }); return { status: response.status, data: await response.json() }; }
const input = { kind: "project", name: "Admin separation QA", phone: "024 000 0007", email: "", location: "Accra", description: "Synthetic integration check for the website and portal separation.", services: ["production"], projectType: "Brand campaign", budget: "Let's discuss", consent: true };
const key = randomUUID(), first = await submit(site, { ...input, id: "AD-00000000", status: "Booked", accessToken: "attacker-controlled-token", internalNotes: "injected", clientId: "injected", approvedAt: "2026-01-01", quote: "1" }, key);
assert.equal(first.status, 201); assert.notEqual(first.data.id, "AD-00000000"); assert.match(first.data.projectUrl, /^http:\/\/127\.0\.0\.1:3105\/projects\/AD-[A-F0-9]{32}#access=/);
const file = path.join(directory, `${first.data.id}.json`), record = JSON.parse(await readFile(file, "utf8"));
assert.equal(record.phone, "+233240000007"); assert.equal(record.status, "New"); assert.equal(record.primaryContact, "phone"); assert.equal(record.internalNotes, ""); assert.equal(record.quote, ""); assert.equal(record.clientId, undefined); assert.equal(record.approvedAt, undefined); assert.notEqual(record.accessToken, "attacker-controlled-token");
pass("The website sends only public fields; the dashboard creates the reference, private link and initial state");
const repeat = await submit(site, input, key); assert.equal(repeat.status, 200); assert.deepEqual(repeat.data, first.data);
const changed = await submit(site, { ...input, description: "A different brief using the same submission key must be rejected." }, key); assert.equal(changed.status, 409);
const parallelKey = randomUUID(), parallel = await Promise.all([submit(site, input, parallelKey), submit(site, input, parallelKey)]); assert.equal(new Set(parallel.map(item => item.data.id)).size, 1); assert.deepEqual(parallel.map(item => item.status).sort(), [200, 201]);
pass("Retries and simultaneous submissions reuse one receipt; a changed brief cannot reuse an old submission key");
const invalid = await submit(site, { ...input, phone: "invalid" }, randomUUID()); assert.equal(invalid.status, 400);
assert.equal((await submit(portal, input, randomUUID())).status, 404);
const unauthorised = await fetch(`${portal}/api/bridge/enquiries`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }); assert.equal(unauthorised.status, 401);
const health = await fetch(`${portal}/api/bridge/status`, { headers: { Authorization: `Bearer ${process.env.ACIES_BRIDGE_SECRET}` } }); assert.equal(health.status, 200); assert.equal((await health.json()).intakeVersion, 2); assert.equal((await fetch(`${portal}/api/bridge/status`)).status, 401);
pass("Dashboard validation and bridge authentication protect enquiry creation and connection diagnostics");
for (const method of ["GET", "POST", "PATCH", "DELETE"]) { const response = await fetch(`${site}/api/admin/enquiries`, { method }); assert.equal(response.status, 410); }
for (const method of ["GET", "POST"]) { const response = await fetch(`${site}/api/projects/${record.id}`, { method, headers: { Authorization: `Bearer ${record.accessToken}`, ...(method === "POST" ? { "Content-Type": "application/json" } : {}) }, ...(method === "POST" ? { body: JSON.stringify({ approve: true }) } : {}) }); assert.equal(response.status, 410); }
assert.deepEqual(JSON.parse(await readFile(file, "utf8")), record);
const admin = await fetch(`${site}/admin`, { redirect: "manual" }); assert.equal(admin.headers.get("location"), `${portal}/team`);
const booking = await fetch(`${site}/admin/bookings`, { redirect: "manual" }); assert.equal(booking.headers.get("location"), `${portal}/team/productions`);
pass("Old admin pages redirect; retired admin and private-project APIs cannot read or approve records");
const network = await submit(site, { kind: "network", name: "Network separation QA", phone: "+233240000008", location: "Kumasi", description: "A synthetic creative enquiry for the intake migration checks.", role: "Photographer", portfolio: "https://example.invalid/portfolio", consent: true }, randomUUID());
assert.equal(network.status, 201); assert.equal(network.data.projectUrl, undefined);
const networkRecord = JSON.parse(await readFile(path.join(directory, `${network.data.id}.json`), "utf8")); assert.equal(networkRecord.accessToken, undefined); assert.equal(networkRecord.kind, "network");
pass("Network enquiries remain private enquiries and do not create staff access or private client project links");
assert.ok((await readdir(directory)).length >= 3);
await mkdir("artifacts", { recursive: true }); await writeFile("artifacts/admin-separation-verification.json", JSON.stringify({ passed: true, checks }, null, 2));
