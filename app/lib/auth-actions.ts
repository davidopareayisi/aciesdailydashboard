import type { NextRequest } from "next/server";
import { create, get, update } from "./db";
import { body, currentUser, equal, hash, HttpError, json, logout, passwordHash, passwordMatches, rateLimit, requireUser, safeUser, session, text, userId } from "./security";
import { normalizeContactPhone } from "./contact";
import { localVerification, sendCode, verifyCode } from "./verification";
import type { Invite, User } from "./types";
import type { Project } from "./models";

export async function authAction(request: NextRequest, action: string) {
  if (action === "session" && request.method === "GET") { const user = await currentUser(request); return json({ user: user ? safeUser(user) : null, testMode: process.env.ACIES_TEST_MODE === "true" && localVerification(request) }); }
  if (action === "logout" && request.method === "POST") return logout(request);
  if (request.method !== "POST") throw new HttpError("Not found.", 404);
  const data = await body(request), ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "local";
  const phone = normalizeContactPhone(text(data, "phone", 80));
  if (action === "login") {
    await rateLimit(`login:${ip}:${phone}`, 12, 900_000);
    const password = text(data, "password", 128, true), user = phone ? await get<User>("users", userId(phone)) : null;
    const matches = await passwordMatches(password, user?.passwordHash || `${"0".repeat(32)}:${"0".repeat(128)}`);
    if (!user || !matches || user.disabled) throw new HttpError("Your phone number or password wasn't recognised.", 401);
    return session(request, user);
  }
  if (action === "register") {
    await rateLimit(`register:${ip}`, 10, 3600_000);
    if (!phone) throw new HttpError("Enter a valid phone number.");
    const name = text(data, "name", 160, true), email = text(data, "email", 254), inviteToken = text(data, "inviteToken", 100);
    if (name.length < 2 || data.consent !== true) throw new HttpError("Add your name and agree to the information notice.");
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError("Check your optional email address.");
    const existing = await get<User>("users", userId(phone)); if (existing) throw new HttpError("This number already has an account. Sign in or reset your password.", 409);
    const invite = inviteToken ? await get<Invite>("invites", hash(inviteToken)) : null;
    if (inviteToken && (!invite || invite.consumed || invite.expiresAt < Date.now() || !equal(invite.phone, phone))) throw new HttpError("This invitation is invalid, expired or for a different phone number.");
    const user: User = { id: userId(phone), name, phone, email, passwordHash: await passwordHash(text(data, "password", 128, true)), role: invite?.role || "creative", verifiedAt: "", createdAt: new Date().toISOString(), authVersion: 1 };
    await create("users", user);
    if (invite) {
      await update<Invite>("invites", invite.id, (record) => ({ ...record, consumed: true }));
      if (invite.projectId && invite.role === "client") await update<Project>("enquiries", invite.projectId, (project) => ({ ...project, clientId: user.id }));
    }
    return session(request, user);
  }
  if (action === "code") {
    const purpose = data.purpose === "reset" ? "reset" : "verify";
    await rateLimit(`code-ip:${ip}`, 20, 3600_000);
    const user = purpose === "verify" ? await requireUser(request, false) : phone ? await get<User>("users", userId(phone)) : null;
    if (!phone && purpose === "reset") throw new HttpError("Enter your registered phone number.");
    return json(await sendCode(request, user, purpose, user?.phone || phone!));
  }
  if (action === "verify") {
    const user = await requireUser(request, false);
    await verifyCode(text(data, "challengeId", 100, true), text(data, "code", 6, true), "verify", user.id);
    const verified = await update<User>("users", user.id, (record) => ({ ...record, verifiedAt: new Date().toISOString() }));
    return json({ user: safeUser(verified) });
  }
  if (action === "reset") {
    const encoded = await passwordHash(text(data, "password", 128, true));
    const id = await verifyCode(text(data, "challengeId", 100, true), text(data, "code", 6, true), "reset");
    const user = await update<User>("users", id, (record) => ({ ...record, passwordHash: encoded, authVersion: record.authVersion + 1, verifiedAt: record.verifiedAt || new Date().toISOString() }));
    return session(request, user);
  }
  throw new HttpError("Not found.", 404);
}
