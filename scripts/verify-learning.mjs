import assert from "node:assert/strict";
import { readFile, mkdir, writeFile, readdir, unlink } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { youtubeId, hostedVideo } from "../app/lib/learning-video.mjs";
const base = "http://127.0.0.1:3104", root = path.resolve(".data/learning-qa"), checks = [];
assert.equal((await (await fetch(`${base}/api/auth/session`)).json()).testMode, true, "Use the isolated learning preview.");
// Reset only records created by this suite in its dedicated private QA folder.
for (const collection of ["lessons", "learningProgress", "learningSubmissions", "notices"]) {
  const folder = path.resolve(root, collection);
  if (!folder.startsWith(root + path.sep)) throw new Error("Invalid isolated fixture folder.");
  for (const file of await readdir(folder).catch(error => { if (error.code === "ENOENT") return []; throw error; })) {
    if (/^[a-zA-Z0-9-]+\.json$/.test(file)) await unlink(path.join(folder, file));
  }
}
for (const file of await readdir(path.join(root, "limits")).catch(() => [])) if (/^limit-[a-f0-9]{64}\.json$/.test(file)) await unlink(path.join(root, "limits", file));
const credentials = JSON.parse(await readFile(path.join(root, "test-accounts.json"), "utf8"));
function actor() { let cookie = ""; return { async request(route, method = "GET", data, headers = {}) { const response = await fetch(`${base}/api/${route}`, { method, headers: { Origin: base, ...(cookie ? { Cookie: cookie } : {}), ...(data instanceof FormData ? {} : { "Content-Type": "application/json" }), ...headers }, ...(data === undefined ? {} : { body: data instanceof FormData ? data : JSON.stringify(data) }) }); const setCookie = response.headers.get("set-cookie"); if (setCookie) cookie = setCookie.split(";")[0]; return { status: response.status, data: response.headers.get("content-type")?.includes("json") ? await response.json() : null, response }; } }; }
const owner = actor(), learner = actor(), other = actor(), client = actor(), anonymous = actor();
function pass(name) { checks.push(name); console.log(`PASS ${name}`); }
async function upload(account, bytes, type, purpose = "learning") { const form = new FormData(); form.set("file", new File([bytes], "private-practice.png", { type })); if (purpose) form.set("purpose", purpose); return account.request("upload", "POST", form); }
try {
  for (const [key, account] of [["owner", owner], ["learner", learner], ["other", other], ["client", client]]) assert.equal((await account.request("auth/login", "POST", credentials[key])).status, 200);
  assert.equal((await anonymous.request("learn")).status, 401); assert.equal((await client.request("learn")).status, 403); assert.equal((await learner.request("staff/learn")).status, 403);
  const library = await learner.request("learn"); assert.equal(library.status, 200); assert.equal(library.data.lessons.length, 36); assert.equal(library.data.courses.length, 6); assert.equal(library.data.lessons.filter(item => item.videoUrl).length, 20); assert.equal(library.data.lessons.filter(item => item.practice).length, 12);
  for (const course of library.data.courses) { const lessons = library.data.lessons.filter(lesson => lesson.courseId === course.id); assert.equal(lessons.length, 6); assert.deepEqual(lessons.map(lesson => lesson.order), [1,2,3,4,5,6]); }
  assert.equal(new Set(library.data.lessons.filter(item => item.videoUrl).map(item => item.videoUrl)).size, 20);
  pass("Six ordered courses contain 36 lessons, 20 distinct videos and 12 assignments; account roles remain enforced");
  for (const value of ["https://youtube.com.evil.invalid/watch?v=vxULs-R7Jl4", "javascript:alert(1)", "https://youtu.be/notvalid", "https://evil.invalid/embed/vxULs-R7Jl4"]) assert.equal(youtubeId(value), null);
  assert.equal(youtubeId("https://youtu.be/vxULs-R7Jl4"), "vxULs-R7Jl4"); assert.equal(hostedVideo("http://example.com/video.mp4"), null);
  pass("Video inputs accept supported sources and reject lookalike hosts or unsafe schemes");
  const lesson = { ...library.data.lessons[0], id: "qa-learning-draft", title: "Private QA draft", order: 99, videoUrl: "", practice: "", published: false };
  assert.equal((await owner.request("staff/learn/lessons", "POST", lesson)).status, 200);
  assert.equal((await learner.request("learn")).data.lessons.some(item => item.id === lesson.id), false);
  assert.equal((await owner.request("staff/learn/lessons", "POST", { ...lesson, published: true })).status, 200);
  assert.equal((await learner.request("learn")).data.lessons.some(item => item.id === lesson.id), true);
  assert.equal((await owner.request("staff/learn/lessons", "POST", { ...lesson, videoUrl: "https://evil.invalid/watch?v=vxULs-R7Jl4" })).status, 400);
  await owner.request("staff/learn/lessons", "POST", lesson);
  assert.equal((await owner.request("staff/learn/lessons", "POST", { ...lesson, courseId: "unknown-course" })).status, 400);
  const original = library.data.lessons.find(item => item.id === "phone-digitals");
  assert.equal((await owner.request("staff/learn/lessons", "POST", { ...original, published: false, notes: "Staff-edited draft that must not be replaced by the seeded catalogue." })).status, 200);
  assert.equal((await learner.request("learn")).data.lessons.some(item => item.id === original.id), false);
  assert.equal((await owner.request("staff/learn")).data.lessons.find(item => item.id === original.id).notes, "Staff-edited draft that must not be replaced by the seeded catalogue.");
  await owner.request("staff/learn/lessons", "POST", original);
  pass("Course assignment and drafts work, staff edits survive default merging and invalid sources are rejected");
  assert.equal((await learner.request("learn/start-here/progress", "PATCH", { completed: true }, { Origin: "https://evil.invalid" })).status, 403);
  assert.equal((await learner.request("learn/start-here/progress", "PATCH", { completed: "yes" })).status, 400);
  assert.equal((await learner.request("learn/start-here/progress", "PATCH", { completed: true })).status, 200);
  assert.equal((await learner.request("learn")).data.progress.find(item => item.lessonId === "start-here").completed, true);
  assert.equal((await other.request("learn")).data.progress.length, 0);
  pass("Progress persists only for the signed-in learner and cross-site writes remain blocked");
  const png = await sharp({ create: { width: 180, height: 240, channels: 3, background: "#d8c6af" } }).png().toBuffer();
  const uploaded = await upload(learner, png, "image/png"); assert.equal(uploaded.status, 201); const mediaId = uploaded.data.media.id; assert.equal(uploaded.data.media.purpose, "learning");
  for (const account of [other, client, anonymous]) { assert.equal((await account.request(`media/${mediaId}`)).status, 404); assert.equal((await account.request(`learn/files/${mediaId}`)).status, account === anonymous ? 401 : 404); }
  assert.equal((await learner.request(`media/${mediaId}`)).status, 200); assert.equal((await owner.request(`media/${mediaId}`)).status, 200); assert.equal((await owner.request(`learn/files/${mediaId}`)).data.mime, "image/webp");
  assert.equal((await upload(learner, Buffer.from("fake-video"), "video/mp4")).status, 400);
  assert.equal((await upload(client, png, "image/png")).status, 403);
  pass("Practice uploads stay private, readable by their learner and staff, and reject malformed video");
  const attempt = { note: "I used window light and would like feedback on framing.", media: [mediaId], consent: true };
  assert.equal((await other.request("learn/phone-digitals/practice", "POST", attempt)).status, 403);
  assert.equal((await learner.request("learn/phone-digitals/practice", "POST", { ...attempt, consent: false })).status, 400);
  const submitted = await learner.request("learn/phone-digitals/practice", "POST", attempt); assert.equal(submitted.status, 201); const id = submitted.data.submission.id;
  assert.equal((await learner.request("learn/phone-digitals/practice", "POST", attempt)).status, 409);
  assert.equal((await other.request("learn")).data.submissions.length, 0);
  assert.equal((await learner.request("portal/profile", "PATCH", { media: [mediaId], avatar: "", crafts: [] })).status, 403);
  pass("Practice requires consent and owned learning files, prevents pending duplicates and cannot become a public portfolio image");
  const review = { attempt: 1, status: "Keep practising", feedback: "Leave a little more space above your head in the portrait." };
  assert.equal((await learner.request(`staff/learn/reviews/${id}`, "PATCH", review)).status, 403);
  assert.equal((await owner.request(`staff/learn/reviews/${id}`, "PATCH", review)).status, 200);
  assert.equal((await owner.request(`staff/learn/reviews/${id}`, "PATCH", review)).status, 409);
  let result = (await learner.request("learn")).data.submissions.find(item => item.id === id); assert.equal(result.attempts[0].feedback, review.feedback); assert.equal(result.attempts[0].reviewer, credentials.owner.name);
  assert.ok((await learner.request("portal/feed")).data.notices.some(item => item.href === "/learn/phone-digitals"));
  assert.equal((await learner.request("learn/phone-digitals/practice", "POST", attempt)).status, 201);
  assert.equal((await owner.request(`staff/learn/reviews/${id}`, "PATCH", { ...review, attempt: 1 })).status, 409);
  assert.equal((await owner.request(`staff/learn/reviews/${id}`, "PATCH", { ...review, attempt: 2, status: "Reviewed" })).status, 200);
  result = (await learner.request("learn")).data.submissions.find(item => item.id === id); assert.equal(result.attempts.length, 2); assert.equal(result.attempts[0].feedback, review.feedback); assert.equal(result.attempts[1].status, "Reviewed");
  pass("Named staff feedback, in-app notices, resubmission history and stale-review protection work end to end");
  await mkdir("artifacts", { recursive: true }); await writeFile("artifacts/learning-api-verification.json", JSON.stringify({ passed: true, checks }, null, 2));
} finally { await Promise.all([owner, learner, other, client].map(account => account.request("auth/logout", "POST", {}))); }
