import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const base = "http://127.0.0.1:3104", port = 9344;
assert.equal((await (await fetch(`${base}/api/auth/session`)).json()).testMode, true, "Use the isolated QA preview.");
const accounts = JSON.parse(await readFile(".data/learning-qa/test-accounts.json", "utf8"));
const executable = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find((file) => file && existsSync(file));
assert.ok(executable, "Chrome or Edge is required for browser verification.");
await mkdir("artifacts", { recursive: true });
const fixture = path.resolve(".data/learning-qa/browser-portfolio.png"); await writeFile(fixture, await sharp({ create: { width: 400, height: 500, channels: 3, background: "#c9b5a0" } }).png().toBuffer());
const browser = spawn(executable, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", `--remote-debugging-port=${port}`, `--user-data-dir=${path.resolve(".next/learning-browser")}`, "about:blank"], { windowsHide: true, stdio: "ignore" });
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), pending = new Map(), errors = [], checks = [], urls = [], failedResources = [];
let socket, serial = 0;
async function cdp(method, params = {}) { const id = ++serial; const result = new Promise((resolve, reject) => { const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Browser command timed out: ${method}`)); }, 30000); pending.set(id, { resolve, reject, timer }); }); socket.send(JSON.stringify({ id, method, params })); return result; }
async function evaluate(expression) { const result = await cdp("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true }); if (result.exceptionDetails) throw new Error(`Browser evaluation failed: ${result.exceptionDetails.text}`); return result.result.value; }
async function waitFor(expression) { for (let tries = 0; tries < 180; tries++) { if (await evaluate(`Boolean(${expression})`)) return; await delay(100); } throw new Error(`UI condition timed out: ${expression}`); }
async function click(selector) { await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`); await delay(150); }
async function clickText(selector, text) { await evaluate(`(() => { const item = [...document.querySelectorAll(${JSON.stringify(selector)})].find(el => el.textContent.trim().includes(${JSON.stringify(text)})); if (!item) throw new Error('Control not found'); item.click(); })()`); await delay(150); }
async function fill(selector, value) { await evaluate(`(() => { const element = document.querySelector(${JSON.stringify(selector)}); const prototype = element.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : element.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, ${JSON.stringify(value)}); element.dispatchEvent(new Event('input', { bubbles: true })); element.dispatchEvent(new Event('change', { bubbles: true })); })()`); }
async function navigate(route, selector) { const url = route.startsWith("http") ? route : `${base}${route}`; await cdp("Page.navigate", { url }); await delay(180); await waitFor(`document.readyState === 'complete' && document.querySelector(${JSON.stringify(selector)})`); }
async function resize(width, height = 900) { await cdp("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 800 }); await delay(130); assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth"), true, `Horizontal overflow at ${width}px`); }
async function screenshot(name, full = true) { await evaluate("document.fonts.ready.then(() => true)"); await evaluate("window.scrollTo(0,0)"); const metrics = await evaluate("({width:innerWidth,height:document.documentElement.scrollHeight})"); const response = await cdp("Page.captureScreenshot", full ? { format: "png", captureBeyondViewport: true, clip: { x: 0, y: 0, width: metrics.width, height: metrics.height, scale: 1 } } : { format: "png", captureBeyondViewport: false }); await writeFile(`artifacts/${name}.png`, Buffer.from(response.data, "base64")); }
async function uploadFile(selector) { const document = await cdp("DOM.getDocument"); const node = await cdp("DOM.querySelector", { nodeId: document.root.nodeId, selector }); await cdp("DOM.setFileInputFiles", { nodeId: node.nodeId, files: [fixture] }); }
async function login(account, selector = ".home-greeting") { await navigate("/login", ".auth-form-wrap"); await fill(".auth-form-wrap [name=phone]", account.phone); await fill(".auth-form-wrap [name=password]", account.password); await click(".auth-form-wrap form > button"); await waitFor(`document.querySelector(${JSON.stringify(selector)})`); }
async function logoutMember() { await navigate("/profile", ".account-links"); await click(".account-links button"); await waitFor("document.querySelector('.auth-form-wrap')"); }
async function logoutStaff() { await click(".app-header button[aria-label='Sign out']"); await waitFor("document.querySelector('.auth-form-wrap')"); }
function pass(name) { checks.push(name); console.log(`PASS ${name}`); }
try {
  let tabs; for (let count = 0; count < 100; count++) { try { tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); if (tabs.length) break; } catch {} await delay(100); }
  assert.ok(tabs?.length, "Browser could not start."); socket = new WebSocket(tabs.find(tab => tab.type === "page").webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
  socket.addEventListener("message", ({ data }) => { const message = JSON.parse(data); if (message.id) { const task = pending.get(message.id); if (task) { clearTimeout(task.timer); pending.delete(message.id); if (message.error) task.reject(new Error(message.error.message)); else task.resolve(message.result); } } if (message.method === "Runtime.exceptionThrown") errors.push(message.params.exceptionDetails.text); if (message.method === "Log.entryAdded" && message.params.entry.level === "error" && message.params.entry.url?.startsWith(base)) errors.push(message.params.entry.text); if (message.method === "Network.responseReceived" && message.params.response.status >= 400) failedResources.push({ url: message.params.response.url, status: message.params.response.status }); if (message.method === "Network.requestWillBeSent") urls.push(message.params.request.url); });
  await cdp("Page.enable"); await cdp("Runtime.enable"); await cdp("Log.enable"); await cdp("Network.enable");
  await resize(390, 844); await login(accounts.learner); await navigate("/learn", ".learn-intro");
  assert.equal(await evaluate("document.querySelectorAll('.learning-course-card').length"), 6);
  assert.match(await evaluate("document.querySelector('.learning-totals').textContent"), /20 video tutorials/);
  assert.equal(await evaluate("document.querySelectorAll('.bottom-nav>a').length"), 5);
  assert.equal(await evaluate("Boolean(document.querySelector('.header-actions a[aria-label=\"Your inbox\"]'))"), true);
  await screenshot("learning-library-mobile"); await resize(360); await resize(768); await resize(1440); await screenshot("learning-library-desktop"); await resize(390, 844);
  pass("The six-course library, five-item navigation and inbox access fit mobile and desktop widths");
  await click(".learning-course-card"); await waitFor("document.querySelector('.course-study')");
  assert.equal(await evaluate("document.querySelectorAll('.lesson-row').length"), 6);
  assert.equal(await evaluate("document.querySelector('.learn-progress progress').max"), 6);
  await screenshot("learning-course-mobile");
  await click(".course-outcomes a"); await waitFor("document.querySelector('.lesson-detail')");
  assert.match(await evaluate("document.querySelector('.lesson-detail>.back-link').getAttribute('href')"), /\/learn\/course\/foundations/);
  await navigate("/learn", ".learn-intro"); await clickText(".learn-tabs button", "All lessons");
  await waitFor("document.querySelectorAll('.lesson-row').length === 36");
  await clickText(".filter-pills button", "With video"); await waitFor("document.querySelectorAll('.lesson-row').length === 20");
  await fill("input[name=lesson-search]", "runway"); await waitFor("document.querySelectorAll('.lesson-row').length === 4");
  await fill("input[name=lesson-search]", "");
  pass("Course pages show their own ordered lessons, continue within the course, and the full video library is searchable");
  await clickText(".learn-tabs button", "My feedback"); await waitFor("document.querySelector('.practice-summary')");
  await screenshot("learning-feedback-mobile");
  await navigate("/learn/phone-digitals", ".lesson-detail");
  assert.equal(await evaluate("document.querySelectorAll('.lesson-player iframe').length"), 0);
  assert.equal(urls.some(url => /youtube(-nocookie)?\.com\/embed\//.test(url)), false);
  await screenshot("learning-lesson-mobile");
  await click(".video-start button"); await waitFor("document.querySelector('.lesson-player iframe')");
  assert.equal(await evaluate("document.querySelector('.lesson-player iframe').referrerPolicy"), "strict-origin-when-cross-origin");
  assert.match(await evaluate("document.querySelector('.lesson-player iframe').src"), /^https:\/\/www\.youtube-nocookie\.com\/embed\/4fAUaZS2TcE/);
  assert.equal(await evaluate("document.querySelector('.video-attribution a').textContent.includes('YouTube')"), true);
  pass("YouTube loads only after a click, uses the required referrer, retains attribution and has a watch fallback");
  await click(".lesson-completion button"); await waitFor("document.querySelector('.lesson-completion strong').textContent.includes('marked complete')");
  await navigate("/learn/phone-digitals", ".lesson-detail"); assert.equal(await evaluate("document.querySelector('.lesson-completion strong').textContent"), "Lesson marked complete");
  pass("Lesson completion survives navigation and remains separate from practice reviews");
  await navigate("/learn/posing-practice", ".practice-panel");
  await uploadFile("input[name=practice-file]"); await waitFor("document.querySelector('.practice-upload-list li')");
  await fill("textarea[name=practice-note]", "Browser practice: I would like a next step for relaxed hands."); await click("input[name=practice-consent]");
  await click(".practice-panel form .button.primary"); await waitFor("document.querySelector('.practice-attempt')");
  assert.equal(await evaluate("document.querySelector('.practice-panel .success-notice').textContent.includes('with the team')"), true);
  await screenshot("learning-practice-submitted-mobile");
  pass("A learner can upload a private practice photo, consent and submit it from the mobile form");
  const videoResult = await evaluate(`(async () => {
    const canvas = document.createElement('canvas'); canvas.width=160; canvas.height=120; const context=canvas.getContext('2d'); context.fillStyle='#e3d7c4'; context.fillRect(0,0,160,120);
    const stream=canvas.captureStream(10), recorder=new MediaRecorder(stream,{mimeType:'video/webm'}), chunks=[];
    const done=new Promise(resolve=>recorder.onstop=resolve); recorder.ondataavailable=event=>chunks.push(event.data); recorder.start(); for(let frame=0;frame<12;frame++){context.fillStyle=frame%2?'#e3d7c4':'#bdb098';context.fillRect(0,0,160,120);await new Promise(resolve=>setTimeout(resolve,100));} recorder.stop(); await done; stream.getTracks().forEach(track=>track.stop());
    const form=new FormData(); form.set('purpose','learning'); form.set('file',new File(chunks,'synthetic-practice.webm',{type:'video/webm'}));
    const response=await fetch('/api/upload',{method:'POST',body:form}); const result=await response.json(); if(!response.ok)return {status:response.status};
    const submission=await fetch('/api/learn/runway-foundations/practice',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({note:'Synthetic browser video used only to verify private upload.',media:[result.media.id],consent:true})});
    return {status:response.status,mime:result.media.mime,submissionStatus:submission.status};
  })()`);
  assert.deepEqual(videoResult, {status:201,mime:"video/webm",submissionStatus:201});
  await navigate("/learn/runway-foundations", ".practice-attempt"); await click(".practice-attempt summary"); await waitFor("document.querySelector('.practice-file video')");
  await waitFor("document.querySelector('.practice-file video')?.readyState >= 2");
  await evaluate("document.querySelector('.practice-file video').play().then(()=>true)");
  await waitFor("document.querySelector('.practice-file video').currentTime > 0");
  await evaluate("document.querySelector('.practice-file video').pause()");
  pass("A real browser-recorded WebM uploads privately, decodes and plays in its practice attempt");
  await logoutMember(); await login(accounts.owner, ".overview-counts"); await navigate("/team/learn", ".practice-review");
  const reviewIndex=await evaluate("[...document.querySelectorAll('.practice-review')].findIndex(el=>el.querySelector('h2').textContent.includes('poses'))"); assert.ok(reviewIndex>=0);
  await fill(`.practice-review:nth-child(${reviewIndex+1}) textarea[name=feedback]`, "Keep your fingers soft and repeat the relaxed pose once more.");
  await click(`.practice-review:nth-child(${reviewIndex+1}) form .button.primary`);
  await waitFor("![...document.querySelectorAll('.practice-review h2')].some(el=>el.textContent.includes('poses'))");
  await resize(1440); await screenshot("learning-staff-reviews-desktop"); await resize(390); await screenshot("learning-staff-reviews-mobile");
  await clickText(".learn-tabs button", "Lesson library"); await waitFor("document.querySelector('.lesson-row')");
  await click(".lesson-row"); await waitFor("document.querySelector('input[name=videoUrl]')"); assert.equal(await evaluate("Boolean(document.querySelector('textarea[name=notes]'))"),true);
  pass("Staff can review a submitted assignment and open the lesson editor at mobile widths");
  await logoutStaff(); await login(accounts.learner); await navigate("/learn/posing-practice", ".coach-feedback");
  assert.match(await evaluate("document.querySelector('.coach-feedback').textContent"), /Keep your fingers soft/);
  assert.equal(await evaluate("Boolean(document.querySelector('.practice-panel form'))"),true);
  await screenshot("learning-coach-feedback-mobile");
  await cdp("Emulation.setEmulatedMedia",{features:[{name:"prefers-reduced-motion",value:"reduce"}]}); assert.equal(await evaluate("getComputedStyle(document.documentElement).scrollBehavior"),"auto");
  pass("The learner receives named feedback and can try again; reduced-motion preferences are respected");
  assert.deepEqual(errors,[],"Portal browser runtime or console errors");
  await writeFile("artifacts/learning-browser-verification.json",JSON.stringify({passed:true,checks,errors},null,2)); console.log(`${checks.length} learning browser checks passed.`);
} catch(error) { try { await screenshot("learning-last-failure"); } catch {} console.error(error.message); await writeFile("artifacts/learning-browser-verification.json",JSON.stringify({passed:false,checks,errors,failedResources,error:error.message},null,2)); process.exitCode=1; }
finally { if(socket?.readyState===WebSocket.OPEN) { try {await cdp("Browser.close");}catch{}socket.close();}browser.kill(); }
