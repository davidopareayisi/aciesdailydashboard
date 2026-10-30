import assert from "node:assert/strict";
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import sharp from "sharp";
import { resetLocalTestLimits } from "./qa-fixtures.mjs";
const base = process.env.ACIES_TEST_PORTAL_URL || "http://127.0.0.1:3001", website = process.env.ACIES_TEST_SITE_URL || "http://127.0.0.1:3002";
for (const url of [base, website]) assert.ok(["127.0.0.1", "localhost"].includes(new URL(url).hostname), "Run synthetic tests on loopback hosts only.");
const directory = path.resolve(".data/qa-run"), results = [];
const ownerSource = await readFile(".data/owner-access.txt", "utf8"), ownerPassword = ownerSource.match(/^Password: (.+)$/m)[1].trim(), ownerPhone = ownerSource.match(/^Phone: (.+)$/m)[1].trim();
const suffix = Date.now().toString().slice(-6), password = `local-qa-${randomBytes(14).toString("hex")}`;
function actor() {
  let cookie = "";
  return {
    cookie: () => cookie,
    async request(route, method = "GET", data, extra = {}) {
      const response = await fetch(`${base}/api/${route}`, { method, headers: { ...(cookie ? { Cookie: cookie } : {}), ...(data instanceof FormData ? {} : { "Content-Type": "application/json" }), ...extra }, ...(data !== undefined ? { body: data instanceof FormData ? data : JSON.stringify(data) } : {}), signal: AbortSignal.timeout(15000) });
      const setCookie = response.headers.get("set-cookie"); if (setCookie) cookie = setCookie.split(";")[0];
      const result = response.headers.get("content-type")?.includes("application/json") ? await response.json() : null;
      return { status: response.status, data: result, response };
    },
  };
}
const anonymous = actor(), owner = actor(), creative = actor(), other = actor(), client = actor(), staff = actor();
function pass(name) { results.push(name); console.log(`PASS ${name}`); }
async function code(account, purpose = "verify", phone) {
  const sent = await account.request("auth/code", "POST", { purpose, phone }); assert.equal(sent.status, 200, sent.data?.error); assert.equal(sent.data.localPreview, true);
  const file = await readFile(path.join(directory, "local-codes", `${sent.data.challengeId}.txt`), "utf8"); return { challengeId: sent.data.challengeId, code: file.match(/^Code: (\d{6})$/m)[1] };
}
async function register(account, name, phone, inviteToken) {
  const response = await account.request("auth/register", "POST", { name, phone, email: "", password, consent: true, role: "staff", inviteToken }); assert.equal(response.status, 200, response.data?.error); return response.data.user;
}
async function verify(account) { const challenge = await code(account); const response = await account.request("auth/verify", "POST", challenge); assert.equal(response.status, 200, response.data?.error); return response.data.user; }
async function upload(account, bytes, name, projectId) { const form = new FormData(); form.set("file", new File([bytes], name, { type: name.endsWith(".svg") ? "image/svg+xml" : "image/png" })); if (projectId) form.set("projectId", projectId); return account.request("upload", "POST", form); }
try {
  assert.equal((await anonymous.request("auth/session")).data.testMode, true, "Start the portal with ACIES_TEST_MODE=true and isolated .data/qa-run storage.");
  await resetLocalTestLimits();
  assert.equal((await anonymous.request("portal/feed")).status, 401); assert.equal((await anonymous.request("staff/overview")).status, 401);
  const login = await owner.request("auth/login", "POST", { phone: ownerPhone, password: ownerPassword }); assert.equal(login.status, 200, login.data?.error); assert.match(login.response.headers.get("set-cookie"), /HttpOnly/i); assert.match(login.response.headers.get("set-cookie"), /SameSite=strict/i);
  assert.equal((await owner.request("staff/overview")).status, 200);
  assert.equal((await anonymous.request("auth/login", "POST", { phone: ownerPhone, password: "incorrect-test-password" })).status, 401);
  assert.equal((await owner.request("auth/login", "POST", {}, { Origin: "https://example.invalid" })).status, 403);
  pass("Owner login, protected APIs, secure cookie attributes and same-origin checks");

  const aPhone = `+23324${suffix}1`, bPhone = `+23320${suffix}2`, cPhone = `+23354${suffix}3`, sPhone = `+23355${suffix}4`;
  let a = await register(creative, "Creative A · Local QA", aPhone); assert.equal(a.role, "creative"); assert.equal(a.email, "");
  await readFile(path.join(directory, "users", `${a.id}.json`));
  assert.equal((await creative.request("portal/feed")).status, 403);
  const aCode = await code(creative);
  assert.equal((await creative.request("auth/verify", "POST", { ...aCode, code: "000000" })).status, 400);
  a = (await creative.request("auth/verify", "POST", aCode)).data.user; assert.ok(a.verifiedAt);
  assert.equal((await creative.request("auth/verify", "POST", aCode)).status, 400);
  let b = await register(other, "Creative B · Local QA", bPhone); b = await verify(other);
  assert.equal((await creative.request("staff/people")).status, 403);
  pass("Phone-first signup cannot select staff access; unverified accounts are restricted and codes are single use");

  const image = await sharp({ create: { width: 320, height: 400, channels: 3, background: "#ded6cb" } }).png().toBuffer();
  const uploaded = await upload(creative, image, "synthetic-portfolio.png"); assert.equal(uploaded.status, 201, uploaded.data?.error); const media = uploaded.data.media;
  assert.equal((await anonymous.request(`media/${media.id}`)).status, 404); assert.equal((await other.request(`media/${media.id}`)).status, 404); assert.equal((await creative.request(`media/${media.id}`)).status, 200);
  assert.equal((await upload(creative, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>'), "unsafe.svg")).status, 400);
  const imageResponse = await creative.request(`media/${media.id}`); const metadata = await sharp(Buffer.from(await imageResponse.response.arrayBuffer())).metadata(); assert.equal(metadata.format, "webp"); assert.equal(metadata.exif, undefined);
  pass("Portfolio uploads are converted to metadata-free images; private files reject anonymous and other-user access");

  let profile = { name: a.name, city: "Accra", bio: "Synthetic local test profile for a photographer working on commercial production briefs.", crafts: ["Photographer"], portfolio: "https://example.invalid/portfolio", media: [media.id], avatar: media.id, availability: "Available", unavailableDates: [], equipment: "Synthetic equipment details", measurements: "", studioDetails: "", publishConsent: false, status: "Approved" };
  const savedProfile = await creative.request("portal/profile", "PATCH", profile); assert.equal(savedProfile.status, 200, savedProfile.data?.error); assert.equal(savedProfile.data.profile.status, "Draft");
  assert.equal((await creative.request("portal/profile", "PATCH", { ...profile, media: ["not-owned"] })).status, 403);
  assert.equal((await creative.request("portal/application", "POST", {})).data.profile.status, "Pending review");
  assert.equal((await owner.request(`staff/people/${a.id}`, "PATCH", { status: "Approved", reviewNote: "Synthetic review decision." })).status, 200);
  assert.equal((await owner.request("staff/publish-profile", "POST", { userId: a.id })).status, 400);
  profile = { ...profile, publishConsent: true }; assert.equal((await creative.request("portal/profile", "PATCH", profile)).status, 200);
  assert.equal((await owner.request("staff/publish-profile", "POST", { userId: a.id })).status, 200);
  assert.ok((await anonymous.request("content/profiles")).data.entries.some((entry) => entry.id === a.id)); assert.equal((await anonymous.request(`media/${media.id}`)).status, 200);
  await creative.request("portal/profile", "PATCH", { ...profile, publishConsent: false });
  assert.equal((await anonymous.request("content/profiles")).data.entries.some((entry) => entry.id === a.id), false); assert.equal((await anonymous.request(`media/${media.id}`)).status, 404);
  await creative.request("portal/profile", "PATCH", profile);
  assert.equal((await anonymous.request("content/profiles")).data.entries.some((entry) => entry.id === a.id), false, "Restoring permission must not silently republish an old entry.");
  await owner.request("staff/publish-profile", "POST", { userId: a.id });
  profile = { ...profile, bio: `${profile.bio} Updated introduction for review.` };
  assert.equal((await creative.request("portal/profile", "PATCH", profile)).data.profile.status, "Pending review");
  await owner.request(`staff/people/${a.id}`, "PATCH", { status: "Approved", reviewNote: "Synthetic updated-profile review." });
  assert.equal((await anonymous.request("content/profiles")).data.entries.some((entry) => entry.id === a.id), false, "Reapproval needs an explicit publish action for changed public details.");
  await owner.request("staff/publish-profile", "POST", { userId: a.id });
  pass("Applications require staff approval; publishing needs permission and withdrawal hides both the profile and photograph");

  const briefResponse = await fetch(`${website}/api/enquiries`, { method: "POST", headers: { "Content-Type": "application/json", Origin: website }, body: JSON.stringify({ kind: "project", name: "Client · Local QA", phone: cPhone, location: "Accra", projectType: "Product photography", budget: "Let's discuss", services: ["production"], description: "Synthetic local test project for portal integration, creative invitations and client approvals.", consent: true }), signal: AbortSignal.timeout(15000) });
  const receipt = await briefResponse.json(); assert.equal(briefResponse.status, 201, receipt.error); assert.ok(receipt.projectUrl.startsWith(base)); const projectId = receipt.id, access = new URL(receipt.projectUrl).hash.slice(8);
  assert.equal((await anonymous.request(`projects/${projectId}`)).status, 404);
  const privateProject = await anonymous.request(`projects/${projectId}`, "GET", undefined, { Authorization: `Bearer ${access}` }); assert.equal(privateProject.status, 200, privateProject.data?.error);
  assert.ok((await owner.request("staff/enquiries")).data.entries.some((item) => item.id === projectId));
  assert.equal((await anonymous.request("bridge/enquiries", "POST", {}, { Authorization: "Bearer invalid" })).status, 401); assert.equal((await anonymous.request("content/enquiries")).status, 404);
  await readFile(path.join(directory, "enquiries", `${projectId}.json`));
  pass("Website briefs arrive in portal storage and receive private portal links; public write and read boundaries stay restricted");

  let chunk = 0;
  const oversized = await fetch(`${website}/api/enquiries`, { method: "POST", headers: { "Content-Type": "application/json", Origin: website }, body: new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(8000)); chunk++; if (chunk === 5) controller.close(); } }), duplex: "half" });
  assert.equal(oversized.status, 413, "Chunked bodies must be bounded without trusting Content-Length.");

  const invitation = await owner.request("staff/invitations", "POST", { userId: a.id, projectId, title: "Synthetic product shoot", brief: "A private brief for this creative. No client contact or full production budget is included.", craft: "Photographer", location: "Accra", date: "2026-12-10", fee: "2000.00", terms: "Synthetic scope, usage and payment terms for local verification only." });
  assert.equal(invitation.status, 201, invitation.data?.error); const invitationId = invitation.data.invitation.id;
  const booking = { booking: "Confirmed", payment: "Pending", paymentReference: "", callTime: "08:30 at the studio", coordinator: "Local QA coordinator", preparation: "Bring the agreed equipment and arrive at the confirmed call time." };
  assert.equal((await owner.request(`staff/invitations/${invitationId}`, "PATCH", booking)).status, 400);
  assert.equal((await other.request(`portal/invitations/${invitationId}`, "PATCH", { response: "Accepted", acknowledged: true })).status, 404);
  assert.equal((await creative.request(`portal/invitations/${invitationId}`, "PATCH", { response: "Accepted" })).status, 400);
  assert.equal((await creative.request(`portal/invitations/${invitationId}`, "PATCH", { response: "Accepted", acknowledged: true })).status, 200);
  assert.equal((await owner.request(`staff/invitations/${invitationId}`, "PATCH", booking)).status, 200);
  assert.equal((await creative.request("portal/feed")).data.invitations[0].booking, "Confirmed"); assert.equal((await other.request("portal/feed")).data.invitations.length, 0);
  assert.equal((await upload(other, image, "not-assigned.png", projectId)).status, 403);
  const workFile = await upload(creative, image, "synthetic-delivery.png", projectId); assert.equal(workFile.status, 201, workFile.data?.error);
  pass("Only the assigned creative can respond; accepted availability precedes staff confirmation and project upload access");

  const invited = await owner.request("staff/invite-account", "POST", { name: "Client · Local QA", phone: cPhone, role: "client", projectId }); assert.equal(invited.status, 201, invited.data?.error);
  const clientToken = new URL(invited.data.url).hash.slice(8); let c = await register(client, "Client · Local QA", cPhone, clientToken); c = await verify(client); assert.equal(c.role, "client");
  assert.equal((await client.request("portal/feed")).data.projects.length, 1); assert.equal((await other.request(`portal/projects/${projectId}`)).status, 404);
  const proposal = { status: "Quoted", coordinator: "Local QA coordinator", shootDate: "2026-12-10", quote: "5000.00", proposal: "Synthetic current proposal. Scope, usage and payment terms for local verification.", clientMessage: "Your proposal is ready for review.", internalNotes: "PRIVATE-QA-NOTE-NEVER-SHARE", clientId: c.id, deliverables: [{ label: "Synthetic finished work", url: workFile.data.url }] };
  assert.equal((await owner.request(`staff/enquiries/${projectId}`, "PATCH", proposal)).status, 200);
  const visible = await client.request(`portal/projects/${projectId}`); for (const field of ["phone", "email", "internalNotes", "accessToken", "budget", "name"]) assert.equal(field in visible.data.project, false);
  assert.equal((await client.request(`portal/projects/${projectId}`, "POST", { approve: true, proposal: "Old terms", quote: proposal.quote })).status, 409);
  const approved = await client.request(`portal/projects/${projectId}`, "POST", { approve: true, proposal: proposal.proposal, quote: proposal.quote }); assert.ok(approved.data.project.approvedAt); assert.equal(approved.data.project.status, "Quoted");
  assert.equal((await client.request(`media/${workFile.data.media.id}`)).status, 200); assert.equal((await anonymous.request(`media/${workFile.data.media.id}`)).status, 404);
  assert.equal((await anonymous.request(`media/${workFile.data.media.id}`, "GET", undefined, { Authorization: `Bearer ${access}`, "X-Acies-Project": projectId })).status, 200);
  await owner.request(`staff/enquiries/${projectId}`, "PATCH", { ...proposal, proposal: `${proposal.proposal} Updated terms.` });
  assert.equal((await client.request(`portal/projects/${projectId}`)).data.project.approvedAt, "");
  pass("Invited clients see their own project only; approvals reject stale terms, clear on changes and preserve file privacy");

  await creative.request("portal/messages", "POST", { message: "Synthetic private question from creative A." });
  assert.equal((await other.request("portal/messages")).data.messages.length, 0);
  await owner.request("staff/messages", "POST", { recipientId: a.id, message: "Synthetic coordinator reply." });
  assert.equal((await creative.request("portal/messages")).data.messages.length, 2);
  const notice = (await creative.request("portal/feed")).data.notices[0]; assert.equal((await other.request("portal/notices", "PATCH", { ids: [notice.id] })).status, 404);
  assert.equal((await owner.request(`staff/invitations/${invitationId}`, "PATCH", { ...booking, payment: "Paid" })).status, 400);
  assert.equal((await owner.request(`staff/invitations/${invitationId}`, "PATCH", { ...booking, payment: "Paid", paymentReference: "SYNTHETIC-TRANSACTION" })).status, 200);
  assert.equal((await creative.request("portal/feed")).data.invitations[0].payment, "Paid");
  pass("Conversations and updates are private; paid status requires an actual reference field and records staff activity");

  const content = { id: `qa-work-${suffix}`, title: "Synthetic case study", category: "Product photography", location: "Accra", summary: "Temporary isolated verification content.", details: "Synthetic test only.", image: "", imageAlt: "", credits: "Local verification, not portfolio work.", items: ["Synthetic deliverable"], published: false };
  assert.equal((await owner.request("staff/content/work", "POST", content)).status, 200); assert.equal((await anonymous.request("content/work")).data.entries.length, 0);
  await owner.request("staff/content/work", "POST", { ...content, published: true }); assert.ok((await anonymous.request("content/work")).data.entries.some((item) => item.id === content.id));
  await owner.request("staff/content/work", "POST", content); assert.equal((await anonymous.request("content/work")).data.entries.some((item) => item.id === content.id), false);
  const publicContent = await fetch(`${website}/api/content/profiles`); assert.ok((await publicContent.json()).entries.some((item) => item.id === a.id));
  assert.equal((await fetch(`${website}/api/admin/enquiries`)).status, 410);
  const portalRedirect = await fetch(`${website}/portal?path=register`, { redirect: "manual" }); assert.equal(portalRedirect.headers.get("location"), `${base}/register`);
  pass("Portal publishing reaches the public website; drafts and old website management endpoints stay private");

  const staffInvite = await owner.request("staff/invite-account", "POST", { name: "Staff · Local QA", phone: sPhone, role: "staff", projectId: "" }); const staffToken = new URL(staffInvite.data.url).hash.slice(8); let s = await register(staff, "Staff · Local QA", sPhone, staffToken); s = await verify(staff); assert.equal(s.role, "staff");
  assert.equal((await staff.request("staff/invite-account", "POST", { name: "Not permitted", phone: `+23327${suffix}5`, role: "staff" })).status, 403);
  const priorCookie = other.cookie(); await other.request("auth/logout", "POST", {});
  const revoked = await fetch(`${base}/api/portal/feed`, { headers: { Cookie: priorCookie } }); assert.equal(revoked.status, 401);
  pass("Staff registration requires an owner invitation; sign-out revokes the server session");

  await other.request("auth/login", "POST", { phone: bPhone, password }); const beforeReset = other.cookie();
  const challenges = await Promise.all((await readdir(path.join(directory, "challenges"))).filter((name) => name.endsWith(".json")).map(async (name) => JSON.parse(await readFile(path.join(directory, "challenges", name), "utf8"))));
  const lastCode = Math.max(...challenges.filter((entry) => entry.userId === b.id).map((entry) => entry.createdAt));
  if (lastCode + 31000 > Date.now()) await new Promise((resolve) => setTimeout(resolve, lastCode + 31000 - Date.now()));
  const resetCode = await code(anonymous, "reset", bPhone), resetPassword = `${password}-reset`;
  assert.equal((await anonymous.request("auth/reset", "POST", { ...resetCode, password: resetPassword })).status, 200);
  assert.equal((await fetch(`${base}/api/portal/feed`, { headers: { Cookie: beforeReset } })).status, 401);
  assert.equal((await other.request("auth/login", "POST", { phone: bPhone, password })).status, 401);
  assert.equal((await other.request("auth/login", "POST", { phone: bPhone, password: resetPassword })).status, 200);
  pass("Phone-verified password recovery invalidates old sessions and the previous password");

  assert.equal((await fetch(`${base}/api/staff/operations`)).status, 401);
  assert.equal((await creative.request("staff/operations")).status, 403);
  assert.equal((await owner.request("staff/operations")).status, 200);
  assert.equal((await staff.request("staff/accounts")).status, 403);
  assert.equal((await owner.request("staff/accounts")).status, 200);
  assert.equal((await owner.request(`staff/accounts/${login.data.user.id}`, "PATCH", { disabled: true })).status, 403);
  const staleSession = other.cookie();
  assert.equal((await owner.request(`staff/accounts/${b.id}`, "PATCH", { disabled: true })).status, 200);
  assert.equal((await fetch(`${base}/api/portal/feed`, { headers: { Cookie: staleSession } })).status, 401);
  assert.equal((await owner.request(`staff/accounts/${b.id}`, "PATCH", { disabled: false })).status, 200);
  assert.equal((await other.request("auth/login", "POST", { phone: bPhone, password: resetPassword })).status, 200);
  pass("Staff operations are role protected; owner account controls revoke access and preserve records");

  const oldProjectToken = new URL(receipt.projectUrl).hash.slice(8);
  assert.equal((await creative.request(`staff/rotate-project-link/${projectId}`, "POST", {})).status, 403);
  const rotated = await owner.request(`staff/rotate-project-link/${projectId}`, "POST", {});
  assert.equal(rotated.status, 200);
  assert.notEqual(rotated.data.entry.accessToken, oldProjectToken);
  assert.equal((await fetch(`${base}/api/projects/${projectId}`, { headers: { Authorization: `Bearer ${oldProjectToken}` } })).status, 404);
  receipt.projectUrl = `${base}/projects/${projectId}#access=${rotated.data.entry.accessToken}`;
  assert.equal((await fetch(`${base}/api/projects/${projectId}`, { headers: { Authorization: `Bearer ${rotated.data.entry.accessToken}` } })).status, 200);
  pass("Private project link replacement is staff-only and immediately revokes the previous token");

  const tooLarge = await upload(creative, new Uint8Array(4_000_001), "oversized.png");
  assert.equal(tooLarge.status, 400);
  assert.match(tooLarge.data.error, /4 MB/);
  assert.equal((await fetch(`${website}/robots.txt`)).status, 200);
  const sitemap = await fetch(`${website}/sitemap.xml`); assert.equal(sitemap.status, 200);
  const sitemapText = await sitemap.text(); assert.ok(sitemapText.includes("/packages/product-shoot")); assert.equal(sitemapText.includes("#access="), false);
  const packagePage = await fetch(`${website}/packages/product-shoot`); assert.equal(packagePage.status, 200); assert.match(await packagePage.text(), /Product shoot/);
  const missingPage = await fetch(`${website}/work/missing-entry-qa`);
  assert.ok(missingPage.status === 404 || (missingPage.status === 200 && (await missingPage.text()).includes("noindex")));
  pass("Upload limits, public sitemap, server-rendered details and missing-entry privacy behave correctly");

  for (const file of await readdir(".next/static", { recursive: true })) { if (!file.endsWith(".js")) continue; const source = await readFile(path.join(".next/static", file), "utf8"); assert.equal(source.includes(ownerPassword), false); }
  await mkdir("artifacts", { recursive: true });
  await writeFile(path.join(directory, "test-accounts.json"), JSON.stringify({ owner: { phone: ownerPhone, password: ownerPassword }, creative: { phone: aPhone, password, id: a.id }, other: { phone: bPhone, password: resetPassword, id: b.id }, client: { phone: cPhone, password, id: c.id }, projectId, invitationId, projectUrl: receipt.projectUrl, mediaId: media.id }, null, 2), { mode: 0o600 });
  await writeFile("artifacts/portal-api-verification.json", JSON.stringify({ passed: true, checks: results }, null, 2));
  console.log(`${results.length} portal integration and access-control checks passed. Synthetic records remain only in the isolated, ignored .data/qa-run directory for browser verification.`);
} catch (error) { console.error(error.message); await mkdir("artifacts", { recursive: true }); await writeFile("artifacts/portal-api-verification.json", JSON.stringify({ passed: false, checks: results, error: error.message }, null, 2)); process.exitCode = 1; }
