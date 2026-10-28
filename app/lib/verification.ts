import "server-only";
import { randomInt } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { create, dataRoot, get, remove, update } from "./db";
import { equal, hash, HttpError, rateLimit, token } from "./security";
import type { Challenge, User } from "./types";

function pepper() { const value = process.env.ACIES_VERIFICATION_SECRET; if (!value || value.length < 32) throw new HttpError("Phone verification needs to be configured.", 503); return value; }
export function localVerification(request: Request) {
  const host = new URL(request.url).hostname;
  const configured = new URL(process.env.ACIES_PORTAL_URL || "https://not-local.invalid").hostname;
  return process.env.ACIES_OTP_MODE === "local" && process.env.ACIES_ALLOW_LOCAL_VERIFICATION === "true" && ["localhost", "127.0.0.1", "::1"].includes(host) && ["localhost", "127.0.0.1", "::1"].includes(configured);
}
export async function sendCode(request: Request, user: User | null, purpose: "verify" | "reset", phone: string) {
  if (user?.demo) throw new HttpError("Demo accounts do not receive verification messages. Ask the workspace owner for their saved login.");
  await rateLimit(`sms:${phone}`, 5, 3600_000); await rateLimit(`sms-cooldown:${phone}`, 1, 30_000);
  const id = `code-${token().replaceAll("_", "-")}`;
  if (!user) return { challengeId: id, localPreview: localVerification(request) };
  const code = randomInt(100000, 1000000).toString();
  const challenge: Challenge = { id, userId: user.id, purpose, hash: hash(`${id}:${code}:${pepper()}`), expiresAt: Date.now() + 300_000, attempts: 0, consumed: false, createdAt: Date.now() };
  await create("challenges", challenge);
  try {
    if (localVerification(request)) {
      const directory = path.join(/* turbopackIgnore: true */ dataRoot(), "local-codes"); await mkdir(directory, { recursive: true });
      await writeFile(path.join(directory, `${id}.txt`), `Local preview only\nPhone: ${phone}\nPurpose: ${purpose}\nCode: ${code}\nExpires in five minutes. No SMS was sent.\n`, { mode: 0o600 });
      return { challengeId: id, localPreview: true };
    }
    const sid = process.env.TWILIO_ACCOUNT_SID, auth = process.env.TWILIO_AUTH_TOKEN, from = process.env.TWILIO_FROM_NUMBER, service = process.env.TWILIO_MESSAGING_SERVICE_SID;
    if (!sid || !auth || (!from && !service)) throw new Error("SMS is not configured.");
    const form = new URLSearchParams({ To: phone, Body: `Your AciesDaily verification code is ${code}. It expires in 5 minutes. Do not share this code.` });
    if (service) form.set("MessagingServiceSid", service); else form.set("From", from!);
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, { method: "POST", headers: { Authorization: `Basic ${Buffer.from(`${sid}:${auth}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" }, body: form.toString(), signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error("SMS failed.");
    return { challengeId: id, localPreview: false };
  } catch { await remove("challenges", id); throw new HttpError("We couldn't send a verification code. Please contact AciesDaily or try again later.", 503); }
}
export async function verifyCode(id: string, code: string, purpose: "verify" | "reset", expectedUserId?: string) {
  if (!/^[a-zA-Z0-9-]{30,100}$/.test(id) || !/^\d{6}$/.test(code)) throw new HttpError("Enter the six-digit code.");
  let matched = false;
  const challenge = await get<Challenge>("challenges", id); if (!challenge) throw new HttpError("The code is invalid or expired.");
  const result = await update<Challenge>("challenges", id, (current) => {
    if (current.consumed || current.expiresAt < Date.now() || current.attempts >= 5 || current.purpose !== purpose || (expectedUserId && current.userId !== expectedUserId)) throw new HttpError("The code is invalid or expired.");
    matched = equal(current.hash, hash(`${id}:${code}:${pepper()}`));
    return { ...current, attempts: current.attempts + 1, consumed: matched };
  });
  if (!matched) throw new HttpError("That code wasn't recognised."); return result.userId;
}
