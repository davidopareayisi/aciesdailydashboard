import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { r2Storage } from "../app/lib/r2.mjs";
process.loadEnvFile(".env.local");
const base = "http://127.0.0.1:3107";
assert.equal((await (await fetch(`${base}/api/auth/session`)).json()).testMode, true);
const accounts = JSON.parse(await readFile(".data/r2-qa/accounts.json", "utf8"));
const fixture = path.resolve(".data/r2-qa/browser-direct.png");
await writeFile(fixture, Buffer.concat([await sharp({ create: { width: 64, height: 64, channels: 3, background: "#cccccc" } }).png().toBuffer(), Buffer.alloc(5_000_000)]));
const browser = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe", ["--headless=new", "--disable-gpu", "--no-first-run", "--remote-debugging-port=9347", `--user-data-dir=${path.resolve(".next/r2-browser")}`, "about:blank"], { windowsHide: true, stdio: "ignore" });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let socket, serial = 0, mediaId; const pending = new Map();
function cdp(method, params = {}) { const id = ++serial; const promise = new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error("Browser command timed out")), 30000); pending.set(id, { resolve, reject, timer }); }); socket.send(JSON.stringify({ id, method, params })); return promise; }
async function evaluate(expression) { const result = await cdp("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw new Error("Browser evaluation failed"); return result.result.value; }
try {
 let tabs; for(let attempt=0;attempt<40;attempt++) { try { tabs = await (await fetch("http://127.0.0.1:9347/json")).json(); if(tabs.length) break; } catch {} await delay(250); }
 socket = new WebSocket(tabs.find(t=>t.type==="page").webSocketDebuggerUrl);
 await new Promise(resolve=>socket.addEventListener("open",resolve,{once:true}));
 socket.addEventListener("message", ({data})=>{const message=JSON.parse(data);if(message.id){const task=pending.get(message.id);if(task){clearTimeout(task.timer);pending.delete(message.id);if(message.error)task.reject(new Error("Browser command failed"));else task.resolve(message.result);}}});
 await cdp("Page.enable"); await cdp("Runtime.enable"); await cdp("DOM.enable");
 await cdp("Page.navigate",{url:`${base}/login`}); await delay(1500);
 assert.equal(await evaluate(`(async()=>{const r=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(${JSON.stringify({phone:accounts.creative.phone,password:accounts.creative.password})})});return r.status})()`),200);
 await cdp("Page.navigate",{url:`${base}/profile/edit`});
 for(let i=0;i<40;i++){if(await evaluate("Boolean(document.querySelector('.profile-editor'))"))break;await delay(250);}
 await evaluate("document.querySelector('[name=city]').value='Accra'; [...document.querySelectorAll('button')].find(x=>x.textContent.includes('Next section'))?.click()");
 await delay(500);
 const before=await evaluate("document.querySelectorAll('.portfolio-grid figure').length");
 const root=await cdp("DOM.getDocument");const input=await cdp("DOM.querySelector",{nodeId:root.root.nodeId,selector:'.upload-control input[type=file]'});assert.ok(input.nodeId);
 await cdp("DOM.setFileInputFiles",{nodeId:input.nodeId,files:[fixture]});
 let count=before;
 for(let i=0;i<480;i++){count=await evaluate("document.querySelectorAll('.portfolio-grid figure').length");if(count>before)break;await delay(500);}
 assert.equal(count,before+1);
 const src=await evaluate("[...document.querySelectorAll('.portfolio-grid img')].at(-1).getAttribute('src')");mediaId=src.match(/media\/([a-f0-9-]+)/)?.[1];assert.ok(mediaId);
 console.log("PASS actual browser upload button accepts a 5 MB image via signed R2 PUT and renders verified image");
} catch(error) { console.error(JSON.stringify({ browserPassed:false, notice:socket ? await evaluate("document.querySelector('.error-notice')?.textContent || document.querySelector('[role=alert]')?.textContent || ''").catch(()=>"unavailable") : "", actual:error.actual, expected:error.expected, message: /^(Browser|Expected)/.test(error.message)?error.message.split('\n')[0]:"Browser verification failed" })); process.exitCode=1; }
finally { socket?.close(); browser.kill(); if(mediaId){const record=JSON.parse(await readFile(`.data/r2-qa/media/${mediaId}.json`,'utf8'));await r2Storage().remove(record.storageKey);} }
