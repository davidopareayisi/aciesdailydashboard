import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { create, get, list, save, update } from "./db";
import { body, HttpError, json, requireUser, safeUser, strings, text, url } from "./security";
import { crafts, type Invitation, type Media, type Message, type Notice, type Profile, type User } from "./types";
import { projectView, type Project, type PublishedEntry } from "./models";
import { packageDefaults, type Collection } from "./business";

export const now = () => new Date().toISOString();
export function emptyProfile(user: User): Profile { return { id: user.id, name: user.name, city: "", bio: "", crafts: [], portfolio: "", media: [], avatar: "", availability: "Available", unavailableDates: [], equipment: "", measurements: "", studioDetails: "", publishConsent: false, status: "Draft", reviewNote: "", submittedAt: "", updatedAt: now() }; }
export async function notify(userId: string, title: string, message: string, href: string) { return create<Notice>("notices", { id: randomUUID(), userId, title, body: message, href, read: false, createdAt: now() }); }
export async function contentEntries(collection: Collection, publicOnly = false) {
  const stored = await list<PublishedEntry>(collection), merged = new Map((collection === "packages" ? packageDefaults : []).map((entry) => [entry.id, entry as PublishedEntry])); stored.forEach((entry) => merged.set(entry.id, entry));
  const entries: PublishedEntry[] = [];
  for (const entry of merged.values()) {
    if (publicOnly && !entry.published) continue;
    if (publicOnly && entry.userId) { const profile = await get<Profile>("creativeProfiles", entry.userId); if (!profile?.publishConsent || profile.status !== "Approved" || (await get<User>("users", entry.userId))?.demo) continue; }
    entries.push(entry);
  } return entries;
}
export async function unpublishProfile(id: string) {
  const entry = await get<PublishedEntry>("profiles", id);
  if (entry?.userId === id && entry.published) await save("profiles", { ...entry, published: false, updatedAt: now() });
}
export async function userAction(request: NextRequest, path: string[]) {
  const user = await requireUser(request), action = path[0];
  if (action === "feed" && request.method === "GET") {
    const invitations = user.role === "creative" ? (await list<Invitation>("invitations")).filter((item) => item.userId === user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) : [];
    const notices = (await list<Notice>("notices")).filter((item) => item.userId === user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 50);
    const projects = user.role === "client" ? (await list<Project>("enquiries")).filter((project) => project.kind === "project" && project.clientId === user.id).map(projectView) : [];
    return json({ user: safeUser(user), profile: user.role === "creative" ? await get<Profile>("creativeProfiles", user.id) || emptyProfile(user) : null, invitations, notices, projects });
  }
  if (action === "profile" && request.method === "PATCH") {
    if (user.role !== "creative") throw new HttpError("Creative profiles are for creative accounts.", 403);
    const data = await body(request), selectedCrafts = strings(data, "crafts").filter((craft) => crafts.includes(craft));
    const mediaIds = strings(data, "media", 12), avatar = text(data, "avatar", 120);
    for (const id of [...mediaIds, ...(avatar ? [avatar] : [])]) { const media = await get<Media>("media", id); if (!media || media.userId !== user.id || !media.mime.startsWith("image/")) throw new HttpError("Choose an image from your own portfolio.", 403); }
    const dates = strings(data, "unavailableDates", 90); if (dates.some((date) => !/^\d{4}-\d{2}-\d{2}$/.test(date))) throw new HttpError("Check your unavailable dates.");
    const availability = text(data, "availability"); if (!["Available", "Limited availability", "Unavailable"].includes(availability)) throw new HttpError("Choose your availability.");
    const old = await get<Profile>("creativeProfiles", user.id) || emptyProfile(user);
    const next: Profile = { ...old, name: text(data, "name", 160, true), city: text(data, "city", 160), bio: text(data, "bio", 3000), crafts: selectedCrafts, portfolio: url(text(data, "portfolio", 1000)), media: mediaIds, avatar, availability: availability as Profile["availability"], unavailableDates: dates, equipment: text(data, "equipment", 1500), measurements: text(data, "measurements", 500), studioDetails: text(data, "studioDetails", 1500), publishConsent: data.publishConsent === true, updatedAt: now() };
    const changed = ["name", "city", "bio", "crafts", "media", "avatar", "portfolio", "studioDetails"].some((key) => JSON.stringify(old[key as keyof Profile]) !== JSON.stringify(next[key as keyof Profile]));
    if (old.status === "Approved" && changed) next.status = "Pending review";
    await save("creativeProfiles", next);
    if (changed || !next.publishConsent || old.publishConsent !== next.publishConsent) await unpublishProfile(user.id);
    return json({ profile: next });
  }
  if (action === "application" && request.method === "POST") {
    await body(request); if (user.role !== "creative") throw new HttpError("This application is for creatives.", 403);
    const profile = await get<Profile>("creativeProfiles", user.id);
    if (!profile || !profile.city || profile.bio.length < 40 || !profile.crafts.length || (!profile.portfolio && !profile.media.length)) throw new HttpError("Add your location, craft, at least 40 characters about your work, and a portfolio link or photo.");
    if (profile.status === "Approved") return json({ profile });
    const updated = await update<Profile>("creativeProfiles", user.id, (current) => ({ ...current, status: "Pending review", submittedAt: now(), updatedAt: now() }));
    await notify(user.id, "Your application is with us", "The AciesDaily team will review your profile and portfolio. You can follow updates here.", "/profile"); return json({ profile: updated });
  }
  if (action === "invitations" && request.method === "PATCH") {
    const data = await body(request), id = path[1];
    if (!["Accepted", "Declined"].includes(String(data.response))) throw new HttpError("Choose accept or decline.");
    if (data.response === "Accepted" && data.acknowledged !== true) throw new HttpError("Review the brief and confirm your availability before accepting.");
    const result = await update<Invitation>("invitations", id, (invitation) => { if (invitation.userId !== user.id) throw new HttpError("Invitation not found.", 404); if (invitation.response !== "Pending" || invitation.booking !== "Unconfirmed") throw new HttpError("This invitation has already been answered.", 409); return { ...invitation, response: data.response as Invitation["response"], updatedAt: now() }; });
    await notify(user.id, result.response === "Accepted" ? "Availability received" : "Invitation declined", result.response === "Accepted" ? "Your coordinator will confirm the booking separately. Your response is not a confirmed booking." : "Thanks for letting the team know.", "/bookings"); return json({ invitation: result });
  }
  if (action === "messages") {
    const messages = (await list<Message>("messages")).filter((message) => message.recipientId === user.id);
    if (request.method === "GET") return json({ messages: messages.sort((a, b) => a.createdAt.localeCompare(b.createdAt)) });
    if (request.method === "POST") { const data = await body(request); const message = await create<Message>("messages", { id: randomUUID(), threadId: `dm-${user.id}`, userId: user.id, senderName: user.name, senderRole: user.role, recipientId: user.id, body: text(data, "message", 3000, true), createdAt: now() }); return json({ message }, 201); }
  }
  if (action === "notices" && request.method === "PATCH") { const data = await body(request); for (const id of strings(data, "ids", 50)) await update<Notice>("notices", id, (notice) => { if (notice.userId !== user.id) throw new HttpError("Not found.", 404); return { ...notice, read: true }; }); return json({ saved: true }); }
  if (action === "projects" && user.role === "client") {
    const id = path[1], project = await get<Project>("enquiries", id); if (!project || project.clientId !== user.id) throw new HttpError("Project not found.", 404);
    if (request.method === "GET") return json({ project: projectView(project) });
    if (request.method === "POST") { const data = await body(request); const approved = await approveProject(id, data, (record) => record.clientId === user.id); return json({ project: projectView(approved) }); }
  }
  throw new HttpError("Not found.", 404);
}
export async function approveProject(id: string, data: Record<string, unknown>, allowed: (record: Project) => boolean) {
  return update<Project>("enquiries", id, (current) => { if (!allowed(current)) throw new HttpError("Project not found.", 404); if (current.status === "Closed" || data.approve !== true || !current.proposal || !current.quote) throw new HttpError("A current proposal is needed before approval."); if (data.proposal !== current.proposal || data.quote !== current.quote) throw new HttpError("Your proposal has changed. Refresh and review the latest version.", 409); return { ...current, approvedAt: current.approvedAt || now(), updatedAt: now() }; });
}
