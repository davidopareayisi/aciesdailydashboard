try { process.loadEnvFile(".env.local"); } catch (error) { if (error.code !== "ENOENT") throw error; }
const portal = "https://apply.acies.store", site = "https://daily.acies.store";
let ready = true;
const checks = [
  [`${portal}/api/content/packages`, {}, 200],
  [`${portal}/website`, {}, 307],
  [`${portal}/robots.txt`, {}, 200],
  [`${site}/robots.txt`, {}, 200],
  [`${site}/sitemap.xml`, {}, 200],
  [`${site}/packages/product-shoot`, {}, 200],
  [`${site}/portal?path=register`, {}, 307],
  [`${site}/admin`, {}, 307],
];
for (const [url, options, expected] of checks.filter(([url]) => !process.argv.includes("--portal-only") || url.startsWith(portal))) {
  try { const response = await fetch(url, { ...options, redirect: "manual", signal: AbortSignal.timeout(20000) }); const passed = response.status === expected; if (!passed) ready = false; console.log(JSON.stringify({ url, status: response.status, location: response.headers.get("location"), passed })); await response.body?.cancel(); }
  catch { ready = false; console.log(JSON.stringify({ url, reachable: false })); }
}
if (process.env.ACIES_BRIDGE_SECRET) {
  try { const response = await fetch(`${portal}/api/bridge/status`, { headers: { Authorization: `Bearer ${process.env.ACIES_BRIDGE_SECRET}` }, signal: AbortSignal.timeout(20000) }); const data = await response.json(); const passed = response.ok && data.ready === true && data.intakeVersion === 2; if (!passed) ready = false; console.log(JSON.stringify({ check: "authenticated portal storage", status: response.status, ready: data.ready === true, mediaStorage: data.mediaStorage, ...(typeof data.code === "string" && /^[A-Z0-9_]{3,50}$/.test(data.code) ? { code: data.code } : {}), passed })); }
  catch { ready = false; console.log(JSON.stringify({ check: "authenticated portal storage", passed: false })); }
}
if (!ready) process.exitCode = 1;
