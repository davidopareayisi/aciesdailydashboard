import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, writeFile, readdir, mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { resetLocalTestLimits } from "./qa-fixtures.mjs";

const base = "http://127.0.0.1:3001", site = "http://127.0.0.1:3002", port = 9341;
assert.equal((await (await fetch(`${base}/api/auth/session`)).json()).testMode, true, "Use the isolated QA preview.");
await resetLocalTestLimits();
const accounts = JSON.parse(await readFile(".data/qa-run/test-accounts.json", "utf8"));
const executable = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find((file) => file && existsSync(file));
assert.ok(executable, "Chrome or Edge is required for browser verification.");
await mkdir("artifacts", { recursive: true });
const fixture = path.resolve(".data/qa-run/browser-portfolio.png"); await writeFile(fixture, await sharp({ create: { width: 400, height: 500, channels: 3, background: "#c9b5a0" } }).png().toBuffer());
const browser = spawn(executable, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", `--remote-debugging-port=${port}`, `--user-data-dir=${path.resolve(".next/portal-browser")}`, "about:blank"], { windowsHide: true, stdio: "ignore" });
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
  assert.ok(tabs?.length, "Browser could not start."); socket = new WebSocket(tabs.find((tab) => tab.type === "page").webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
  socket.addEventListener("message", ({ data }) => { const message = JSON.parse(data); if (message.id) { const task = pending.get(message.id); if (task) { clearTimeout(task.timer); pending.delete(message.id); if (message.error) task.reject(new Error(message.error.message)); else task.resolve(message.result); } } if (message.method === "Runtime.exceptionThrown") errors.push(message.params.exceptionDetails.text); if (message.method === "Log.entryAdded" && message.params.entry.level === "error") errors.push({ message: message.params.entry.text, url: message.params.entry.url || "" }); if (message.method === "Network.responseReceived" && message.params.response.status >= 400) failedResources.push({ url: message.params.response.url, status: message.params.response.status, type: message.params.type }); if (message.method === "Network.requestWillBeSent") urls.push(message.params.request.url); });
  await cdp("Page.enable"); await cdp("Runtime.enable"); await cdp("Log.enable"); await cdp("DOM.enable"); await cdp("Network.enable"); await cdp("Network.clearBrowserCookies");
  await navigate("/login", ".auth-form-wrap"); await resize(1440, 1000); await screenshot("portal-signin-desktop"); await resize(390); await screenshot("portal-signin-mobile"); await resize(320);
  await cdp("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "dark" }] }); assert.equal(await evaluate("getComputedStyle(document.body).backgroundColor"), "rgb(248, 247, 243)");
  pass("Sign-in is responsive at 1440, 390 and 320px and stays in the light Acies theme");

  const productionTitle = `Browser checked production ${Date.now()}`;
  const phone = `+23326${Date.now().toString().slice(-7)}`, password = `browser-local-${Date.now()}-only`, name = `Creative Browser ${Date.now().toString().slice(-5)} · Local QA`;
  await navigate("/register", ".auth-form-wrap"); await fill("[name=name]", name); await fill("[name=phone]", phone); await fill("[name=password]", password); await click("input[name=consent]"); await click(".auth-form-wrap form > button"); await waitFor("document.querySelector('.verification-page')");
  await click(".verification-page .button"); await waitFor("document.querySelector('.verification-page [name=code]')");
  let code; for (const file of await readdir(".data/qa-run/local-codes")) { const text = await readFile(path.join(".data/qa-run/local-codes", file), "utf8"); if (text.includes(`Phone: ${phone}`) && text.includes("Purpose: verify")) code = text.match(/^Code: (\d{6})$/m)[1]; }
  assert.ok(code); await fill(".verification-page [name=code]", code); await click(".verification-page form > button.primary"); await waitFor("document.querySelector('.home-greeting')"); await resize(390); await screenshot("creative-home-new");
  pass("Mobile signup, phone verification and the first creative home screen work end to end");

  await navigate("/profile/edit", ".profile-editor"); await fill("[name=city]", "Accra"); await clickText(".craft-picker label", "Photographer"); await fill("[name=bio]", "Synthetic browser verification profile. Commercial photography and coordinated production work in Ghana.");
  await clickText(".form-actions button", "Next section"); await fill("[name=portfolio]", "https://example.invalid/browser-portfolio"); await uploadFile(".upload-control input[type=file]"); await waitFor("document.querySelectorAll('.portfolio-grid figure').length === 1"); await click("input[name=publishConsent]"); await screenshot("creative-portfolio-edit-mobile");
  await clickText(".form-actions button", "Next section"); await fill(".date-picker input", "2026-12-15"); await click(".date-picker button"); await click(".profile-editor .form-actions button.primary"); await waitFor("document.querySelector('.profile-editor .success-notice')");
  await navigate("/profile", ".application-submit"); await click(".application-submit"); await waitFor("document.querySelector('.application-card .status').textContent === 'Pending review'"); await screenshot("creative-profile-mobile"); await resize(320); await logoutMember();
  pass("Short profile sections save portfolio uploads, publishing permission, unavailable dates and a review application");

  await resize(1440, 1000); await login(accounts.owner, ".overview-counts"); await screenshot("staff-overview-desktop");
  await navigate("/team/people", ".staff-filters"); await waitFor("document.querySelectorAll('.person-card').length >= 3"); await fill(".staff-filters input[type=search]", name); await waitFor("document.querySelectorAll('.person-card').length === 1"); await click(".person-card"); await waitFor("document.querySelector('.review-panel')");
  await fill(".review-panel textarea", "Synthetic browser approval of the completed local test profile."); await clickText(".review-actions button", "Approve application"); await waitFor("document.querySelector('.staff-editor-grid .status').textContent === 'Approved'"); await clickText(".publishing-note button", "Publish on the website"); await waitFor("document.querySelector('.publishing-note .success-notice')"); await screenshot("staff-creative-review");
  pass("Staff can review, approve and publish a consenting creative through the interface");

  await navigate("/team/productions", ".staff-detail-heading"); await clickText(".staff-detail-heading button", "Invite a creative"); await waitFor("document.querySelector('select[name=projectId]')"); await fill("[name=projectId]", accounts.projectId);
  const creativeId = await evaluate(`Array.from(document.querySelector('[name=userId]').options).find(option => option.textContent.includes(${JSON.stringify(name)})).value`);
  await fill("[name=userId]", creativeId); await fill("[name=title]", productionTitle); await fill("[name=date]", "2026-12-12"); await fill("[name=brief]", "Synthetic browser invitation. A product shoot coordinated by the local test team."); await fill("[name=fee]", "1000"); await fill("[name=terms]", "Synthetic scope, usage and payment terms for browser verification only."); await click(".staff-editor.narrow > button.primary"); await waitFor("document.querySelector('.staff-list')"); await waitFor(`document.body.innerText.includes(${JSON.stringify(productionTitle)})`); await screenshot("staff-production-board"); await resize(390); await resize(320); await logoutStaff();
  pass("Staff can invite an approved creative to a project and the production board fits mobile screens");

  await login({ phone, password }); await navigate("/opportunities", ".invitation-grid"); await clickText(".invitation-card", productionTitle); await waitFor("document.querySelector('.response-panel')"); await resize(390); await screenshot("creative-invitation-mobile"); await click(".response-panel input[type=checkbox]"); await click(".response-panel button.primary"); await waitFor("document.querySelector('.success-notice')");
  await navigate("/bookings", ".filter-pills"); await clickText(".filter-pills button", "Awaiting confirmation"); await waitFor("document.querySelector('.invitation-card')"); await logoutMember();
  await login(accounts.owner, ".overview-counts"); await navigate("/team/productions", ".staff-list"); await clickText(".enquiry-row", productionTitle); await waitFor("document.querySelector('[name=booking]')"); await fill("[name=booking]", "Confirmed"); await fill("[name=payment]", "Pending"); await fill("[name=callTime]", "09:00 at the studio"); await fill("[name=coordinator]", "Browser QA coordinator"); await fill("[name=preparation]", "Synthetic preparation instructions for local verification."); await click(".staff-editor.narrow > button.primary"); await waitFor("document.querySelector('.success-notice')"); await logoutStaff();
  await login({ phone, password }); await navigate("/bookings", ".invitation-grid"); await clickText(".invitation-card", productionTitle); await waitFor("document.body.innerText.includes('09:00 at the studio')"); await uploadFile(".upload-control input[type=file]"); await waitFor("document.querySelector('.surface .success-notice')"); await screenshot("creative-booking-mobile"); await resize(320);
  pass("A creative responds, staff confirms, and the booking reveals call details and allows private work uploads");

  await navigate("/inbox", ".message-composer"); await fill(".message-composer textarea", "Synthetic browser question about the call time."); await click(".message-composer button"); await waitFor("document.querySelector('.message-bubble')"); await resize(390); await screenshot("creative-inbox-mobile"); await resize(320);
  await navigate("/updates", ".updates-list"); await clickText("main > button", "Mark all as read"); await waitFor("document.querySelectorAll('.updates-list .unread').length === 0");
  await navigate("/home", ".home-greeting"); await resize(390); await screenshot("creative-home-approved-mobile"); await resize(1440, 1000); await screenshot("creative-home-desktop"); await logoutMember();
  pass("Private messages, read notifications and the app-style home work at mobile and desktop sizes");

  await resize(390); await login(accounts.client, ".page-heading"); await waitFor("document.querySelector('.invitation-card')"); await click(".invitation-card"); await waitFor("document.querySelector('.proposal form')"); await click(".proposal input[type=checkbox]"); await click(".proposal form button"); await waitFor("document.querySelector('.proposal .success-notice')"); await screenshot("client-project-mobile"); await resize(320); await logoutMember();
  pass("The client account opens only its project and records proposal approval on a phone");

  const legacy = accounts.projectUrl.replace(base, site);
  await navigate(legacy, ".project-content"); await waitFor(`location.origin === ${JSON.stringify(base)} && location.hash.startsWith('#access=')`); await resize(390); await screenshot("client-private-link-mobile");
  const access = new URL(accounts.projectUrl).hash.slice(8); assert.equal(urls.some((url) => url.includes(access)), false, "Private access tokens must not enter request URLs.");
  pass("Existing website project links preserve their private fragment when moving to the portal");

  await navigate(site, ".network-copy"); const link = await evaluate("document.querySelector('.network-copy > a.button').getAttribute('href')"); assert.equal(link, "/portal?path=register"); await resize(390); await resize(320);
  await navigate(`${site}/network`, ".collection-grid"); await waitFor("document.querySelectorAll('.collection-card').length >= 2"); await resize(390);
  await cdp("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }); await navigate("/login", ".auth-form-wrap"); assert.equal(await evaluate("getComputedStyle(document.documentElement).scrollBehavior"), "auto");
  pass("The public website links to registration and shows approved profiles; reduced-motion preferences are respected");
  assert.deepEqual(errors, [], "Browser runtime or console errors"); pass("No browser runtime or console errors across the portal flows");
  await writeFile("artifacts/portal-browser-verification.json", JSON.stringify({ passed: true, checks, errors }, null, 2)); console.log(`${checks.length} portal browser checks passed. Screenshots are in ignored artifacts/.`);
} catch (error) { try { await screenshot("portal-last-failure"); } catch {} console.error(error.message); await writeFile("artifacts/portal-browser-verification.json", JSON.stringify({ passed: false, checks, errors, failedResources, error: error.message }, null, 2)); process.exitCode = 1; }
finally { if (socket?.readyState === WebSocket.OPEN) { try { await cdp("Browser.close"); } catch {} socket.close(); } browser.kill(); }
