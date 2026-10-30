import "server-only";
import { randomUUID } from "node:crypto";
import { list } from "./db";
import { postgresEnabled } from "./postgres.mjs";
import { json } from "./security";
import { requireBridge } from "./enquiry-intake";

export function safeFailureCode(error: unknown) {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  return /^[A-Z0-9_]{3,50}$/.test(code) ? code : "SERVICE_UNAVAILABLE";
}
export function requestFailure(error: unknown) {
  const requestId = randomUUID();
  // Do not log URLs, SQL text, payloads, cookies, connection strings or raw error messages.
  console.error(JSON.stringify({ event: "portal_request_failed", requestId, code: safeFailureCode(error) }));
  return json({ error: "This request could not be completed. Please try again.", requestId }, 503);
}
export async function connectionStatus(request: Request) {
  requireBridge(request);
  try {
    // Exercise the same schema and adapter that published content uses.
    await list("packages");
    return json({ ready: true, storage: postgresEnabled() ? "postgres" : "other", intakeVersion: 2 });
  } catch (error) {
    const requestId = randomUUID(), code = safeFailureCode(error);
    console.error(JSON.stringify({ event: "portal_connection_failed", requestId, code }));
    return json({ ready: false, code, requestId }, 503);
  }
}
