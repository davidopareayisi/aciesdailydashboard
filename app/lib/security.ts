import "server-only";
import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { NextRequest, NextResponse } from "next/server";
import { create, get, remove, update } from "./db";
import type { Session, User, SafeUser } from "./types";
const scrypt = promisify(scryptCallback), cookieName = "acies_portal";
export class HttpError extends Error { constructor(message: string, public status = 400) { super(message); } }
export const hash = (value: string) => createHash("sha256").update(value).digest("hex");
export const equal = (a: string, b: string) => timingSafeEqual(Buffer.from(hash(a)), Buffer.from(hash(b)));
export const userId = (phone: string) => `u-${hash(phone).slice(0, 32)}`;
export const token = () => randomBytes(32).toString("base64url");
export function safeUser(user: User): SafeUser { const { passwordHash: ignoredPassword, authVersion: ignoredVersion, ...safe } = user; void ignoredPassword; void ignoredVersion; return safe; }
export async function passwordHash(password: string) { if (password.length < 12 || password.length > 128) throw new HttpError("Use a password with 12 to 128 characters."); const salt = randomBytes(16).toString("hex"); return `${salt}:${(await scrypt(password, salt, 64) as Buffer).toString("hex")}`; }
export async function passwordMatches(password: string, encoded: string) { const [salt, expected] = encoded.split(":"); if (!salt || !expected || password.length > 128) return false; return equal((await scrypt(password, salt, 64) as Buffer).toString("hex"), expected); }
export function json(data: unknown, status = 200) { return NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer" } }); }
export function sameOrigin(request: Request) { const origin = request.headers.get("origin"); if (!origin) return true; const requestUrl = new URL(request.url), host = request.headers.get("x-forwarded-host")?.split(",")[0].trim() || request.headers.get("host") || requestUrl.host; const protocol = request.headers.get("x-forwarded-proto")?.split(",")[0].trim() || requestUrl.protocol.slice(0, -1); return origin === (process.env.ACIES_PORTAL_URL ? new URL(process.env.ACIES_PORTAL_URL).origin : `${protocol}://${host}`); }
export async function body(request: Request) {
  if (!sameOrigin(request)) throw new HttpError("Please use the AciesDaily portal.", 403);
  if (!request.headers.get("content-type")?.includes("application/json")) throw new HttpError("Send JSON data.", 415);
  const reader = request.body?.getReader(); if (!reader) throw new HttpError("Missing form data."); const parts: Uint8Array[] = []; let size = 0;
  for (;;) { const item = await reader.read(); if (item.done) break; size += item.value.length; if (size > 32000) { await reader.cancel(); throw new HttpError("Please shorten your entry.", 413); } parts.push(item.value); }
  let parsed; try { parsed = JSON.parse(Buffer.concat(parts).toString()); } catch { throw new HttpError("Please check the form data."); } if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new HttpError("Please check the form data."); return parsed as Record<string, unknown>;
}
export function text(data: Record<string, unknown>, key: string, max = 160, required = false) { const value = data[key]; if (value !== undefined && typeof value !== "string") throw new HttpError(`Check ${key}.`); const result = (value as string || "").trim(); if (result.length > max || (required && !result)) throw new HttpError(`Check ${key}.`); return result; }
export function strings(data: Record<string, unknown>, key: string, max = 20) { const value = data[key]; if (!Array.isArray(value) || value.length > max || value.some((item) => typeof item !== "string" || item.length > 250)) throw new HttpError(`Check ${key}.`); return [...new Set(value as string[])]; }
export function url(value: string) { if (!value) return ""; try { if (!["https:", "http:"].includes(new URL(value).protocol)) throw new Error(); return value; } catch { throw new HttpError("Use a full http:// or https:// link."); } }
export async function currentUser(request: NextRequest) { const raw = request.cookies.get(cookieName)?.value; if (!raw || raw.length > 100) return null; const record = await get<Session>("sessions", hash(raw)); if (!record || record.expiresAt < Date.now()) return null; const user = await get<User>("users", record.userId); return user && !user.disabled && record.version === user.authVersion ? user : null; }
export async function requireUser(request: NextRequest, verified = true) { const user = await currentUser(request); if (!user) throw new HttpError("Sign in to continue.", 401); if (verified && !user.verifiedAt) throw new HttpError("Verify your phone number to continue.", 403); return user; }
export async function requireStaff(request: NextRequest) { const user = await requireUser(request); if (user.role !== "staff") throw new HttpError("This area is for the AciesDaily team.", 403); return user; }
export async function session(request: NextRequest, user: User) { const raw = token(); await create<Session>("sessions", { id: hash(raw), userId: user.id, expiresAt: Date.now() + 7 * 86400_000, version: user.authVersion }); const response = json({ user: safeUser(user) }); response.cookies.set(cookieName, raw, cookieOptions(request, 7 * 86400)); return response; }
function cookieOptions(request: Request, maxAge: number) { return { httpOnly: true, secure: Boolean(process.env.ACIES_PORTAL_URL?.startsWith("https:") || request.headers.get("x-forwarded-proto") === "https" || new URL(request.url).protocol === "https:"), sameSite: "strict" as const, path: "/", maxAge }; }
export async function logout(request: NextRequest) { if (!sameOrigin(request)) throw new HttpError("Please use this portal.", 403); const raw = request.cookies.get(cookieName)?.value; if (raw) await remove("sessions", hash(raw)); const response = json({ signedOut: true }); response.cookies.set(cookieName, "", cookieOptions(request, 0)); return response; }
export async function rateLimit(key: string, limit: number, windowMs: number) { const id = `limit-${hash(key)}`; try { await create("limits", { id, count: 0, until: 0 }); } catch { /* Existing limit record. */ } await update<{ id: string; count: number; until: number }>("limits", id, (record) => { const active = record.until > Date.now(); if (active && record.count >= limit) throw new HttpError("Too many attempts. Please try again later.", 429); return { id, count: active ? record.count + 1 : 1, until: active ? record.until : Date.now() + windowMs }; }); }
