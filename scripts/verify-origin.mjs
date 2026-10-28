import assert from "node:assert/strict";
import { test } from "node:test";
import { isPortalOrigin } from "../app/lib/portal-origin.mjs";

const configured = "http://127.0.0.1:3001";
function request(origin, target = configured, headers = {}) {
  return new Request(`${target}/api/auth/login`, { headers: { ...(origin === undefined ? {} : { Origin: origin }), ...headers } });
}

test("login accepts local aliases on the portal port", () => {
  for (const host of ["localhost", "127.0.0.1", "[::1]"]) {
    const origin = `http://${host}:3001`;
    assert.equal(isPortalOrigin(request(origin, origin), configured), true);
  }
  assert.equal(isPortalOrigin(request("http://localhost:3001"), configured), true);
});

test("other local applications and protocols cannot submit portal forms", () => {
  for (const origin of ["http://localhost:3000", "http://127.0.0.1:3000", "https://localhost:3001", "https://attacker.invalid", "null", "http://localhost:3001.attacker.invalid"]) {
    assert.equal(isPortalOrigin(request(origin), configured), false);
  }
  assert.equal(isPortalOrigin(request("http://localhost:3001", "http://localhost:3002"), configured), false);
  assert.equal(isPortalOrigin(request("http://localhost:3001", "https://portal.example"), configured), false);
});

test("production requires the configured origin including scheme and subdomain", () => {
  const live = "https://portal.acies.store";
  assert.equal(isPortalOrigin(request(live, "http://internal:3001"), live), true);
  for (const origin of ["https://acies.store", "http://portal.acies.store", "https://evil.invalid", "http://localhost:3001"]) {
    assert.equal(isPortalOrigin(request(origin, live), live), false);
  }
});

test("unconfigured and proxied requests retain their destination check", () => {
  const live = "https://portal.acies.store";
  assert.equal(isPortalOrigin(request(live, "http://internal:3001", { "x-forwarded-host": "portal.acies.store", "x-forwarded-proto": "https" }), undefined), true);
  assert.equal(isPortalOrigin(request("https://evil.invalid", live), undefined), false);
  assert.equal(isPortalOrigin(request(undefined), configured), true);
});
