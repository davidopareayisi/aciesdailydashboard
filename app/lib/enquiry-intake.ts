import "server-only";
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { create, get } from "./db";
import { normalizeContactPhone } from "./contact";
import { body, equal, hash, HttpError, json, rateLimit, token } from "./security";
import type { Project } from "./models";

export function requireBridge(request: Request) {
  const secret = process.env.ACIES_BRIDGE_SECRET, provided = request.headers.get("authorization")?.replace(/^Bearer /, "") || "";
  if (!secret || secret.length < 32 || !equal(secret, provided)) throw new HttpError("Access denied.", 401);
}
const limits = { name: 160, phone: 80, email: 254, company: 160, location: 160, projectType: 160, budget: 160, description: 4000, role: 160, portfolio: 500, date: 10 };
function validate(data: Record<string, unknown>) {
  if (data.kind !== "project" && data.kind !== "network") throw new HttpError("Choose a project enquiry or network application.");
  if (data.consent !== true) throw new HttpError("Please agree to the information notice before sending.");
  const fields = {} as Record<keyof typeof limits, string>;
  for (const [key, limit] of Object.entries(limits)) {
    const value = data[key];
    if (value !== undefined && typeof value !== "string") throw new HttpError("Please check your form details.");
    const clean = typeof value === "string" ? value.trim() : "";
    if (clean.length > limit) throw new HttpError(`Please shorten the ${key} field.`);
    fields[key as keyof typeof limits] = clean;
  }
  if (fields.name.length < 2 || !fields.location || fields.description.length < 20) throw new HttpError("Please include your name, location and at least 20 characters about your project or work.");
  const phone = normalizeContactPhone(fields.phone);
  if (!phone) throw new HttpError("Please include a valid phone/WhatsApp number, such as 024 123 4567 or +233 24 123 4567.");
  fields.phone = phone;
  if (fields.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email)) throw new HttpError("Please enter a valid email address or leave the optional email field blank.");
  const services = Array.isArray(data.services) ? [...new Set(data.services.filter((value): value is string => typeof value === "string" && ["talent", "studios", "production"].includes(value)))].sort() : [];
  if (data.kind === "project" && (!services.length || !fields.projectType || !fields.budget)) throw new HttpError("Please choose a service, project type and budget preference.");
  if (fields.date && (!/^\d{4}-\d{2}-\d{2}$/.test(fields.date) || Number.isNaN(Date.parse(fields.date)) || new Date(fields.date).toISOString().slice(0, 10) !== fields.date)) throw new HttpError("Please check the shoot date.");
  if (data.kind === "network") {
    try { const url = new URL(fields.portfolio); if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || !fields.role) throw new Error(); }
    catch { throw new HttpError("Please include your craft and a valid portfolio or professional profile URL."); }
  }
  return { kind: data.kind as "project" | "network", ...fields, services };
}
type IntakeProject = Project & { intakeFingerprint?: string };
const pendingIntakes = new Map<string, Promise<Response>>();
function receipt(request: NextRequest, record: IntakeProject, status: number) {
  const origin = new URL(process.env.ACIES_PORTAL_URL || request.nextUrl.origin).origin;
  return json({ id: record.id, createdAt: record.createdAt, ...(record.accessToken ? { projectUrl: `${origin}/projects/${record.id}#access=${record.accessToken}` } : {}) }, status);
}
export async function createEnquiry(request: NextRequest) {
  requireBridge(request);
  // Authenticated server-to-server intake. Its origin is independent of browser staff sessions.
  const data = await body(new Request(request, { headers: { ...Object.fromEntries(request.headers), origin: process.env.ACIES_PORTAL_URL || request.nextUrl.origin } }));
  const input = validate(data), suppliedKey = request.headers.get("idempotency-key");
  if (suppliedKey && !/^[a-zA-Z0-9_-]{16,100}$/.test(suppliedKey)) throw new HttpError("Please retry this submission.");
  const key = suppliedKey || randomUUID(), id = `AD-${hash(`enquiry:${key}`).slice(0, 32).toUpperCase()}`, fingerprint = hash(JSON.stringify(input));
  const repeat = (record: IntakeProject) => { if (record.intakeFingerprint !== fingerprint) throw new HttpError("This submission changed. Please send it as a new enquiry.", 409); return receipt(request, record, 200); };
  const previous = pendingIntakes.get(id) || Promise.resolve();
  const work = previous.catch(() => {}).then(async () => {
    const existing = await get<IntakeProject>("enquiries", id); if (existing) return repeat(existing);
    await rateLimit(`enquiry-phone:${input.phone}`, 10, 3600_000);
    const record: IntakeProject = { ...input, id, createdAt: new Date().toISOString(), status: "New", primaryContact: "phone", consent: { granted: true, noticeVersion: "2026-10-27" }, intakeFingerprint: fingerprint, ...(input.kind === "project" ? { accessToken: token() } : {}), internalNotes: "", coordinator: "", proposal: "", quote: "", deliverables: [] };
    try { await create("enquiries", record); }
    catch (error) { const concurrent = await get<IntakeProject>("enquiries", id); if (concurrent) return repeat(concurrent); throw error; }
    return receipt(request, record, 201);
  });
  pendingIntakes.set(id, work);
  try { return await work; } finally { if (pendingIntakes.get(id) === work) pendingIntakes.delete(id); }
}
