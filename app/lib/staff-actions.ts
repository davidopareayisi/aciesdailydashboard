import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { create, get, list, save, update } from "./db";
import { body, hash, HttpError, json, requireStaff, safeUser, strings, text, token, url, userId } from "./security";
import { contentEntries, notify, now, unpublishProfile } from "./domain";
import { collections, enquiryStatuses, type Collection } from "./business";
import { normalizeContactPhone } from "./contact";
import type { Audit, Invitation, Invite, Media, Message, Profile, User } from "./types";
import type { Project, PublishedEntry } from "./models";

async function audit(actorId: string, action: string, targetId: string) { await create<Audit>("audit", { id: randomUUID(), actorId, action, targetId, createdAt: now() }); }
export async function staffAction(request: NextRequest, path: string[]) {
  const actor = await requireStaff(request), action = path[0];
  if (request.method === "GET") {
    if (action === "overview") {
      const projects = await list<Project>("enquiries"), people = await list<Profile>("creativeProfiles"), invitations = await list<Invitation>("invitations");
      return json({ projects: projects.sort((a, b) => b.createdAt.localeCompare(a.createdAt)), people, invitations, clients: (await list<User>("users")).filter((user) => user.role === "client").map(safeUser), audit: (await list<Audit>("audit")).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 30) });
    }
    if (action === "enquiries") return json({ entries: (await list<Project>("enquiries")).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) });
    if (action === "people") { const profiles = await list<Profile>("creativeProfiles"); return json({ people: (await list<User>("users")).filter((user) => user.role === "creative").map((user) => ({ user: safeUser(user), profile: profiles.find((profile) => profile.id === user.id) || null })) }); }
    if (action === "invitations") return json({ invitations: (await list<Invitation>("invitations")).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) });
    if (action === "content" && collections.includes(path[1] as Collection)) return json({ entries: await contentEntries(path[1] as Collection) });
    if (action === "messages") return json({ messages: (await list<Message>("messages")).sort((a, b) => a.createdAt.localeCompare(b.createdAt)), users: (await list<User>("users")).filter((user) => user.role !== "staff").map(safeUser) });
    if (action === "media") { const id = request.nextUrl.searchParams.get("project"); return json({ media: (await list<Media>("media")).filter((item) => id ? item.projectId === id : true) }); }
  }
  const data = await body(request);
  if (action === "people" && request.method === "PATCH") {
    const id = path[1], status = text(data, "status"), note = text(data, "reviewNote", 1500);
    if (!["Approved", "Changes requested", "Declined"].includes(status)) throw new HttpError("Choose a review decision.");
    const user = await get<User>("users", id); if (!user?.verifiedAt || user.role !== "creative") throw new HttpError("The creative must verify their phone before approval.");
    const profile = await update<Profile>("creativeProfiles", id, (current) => { if (!current.submittedAt) throw new HttpError("This profile has not been submitted for review."); return { ...current, status: status as Profile["status"], reviewNote: note, updatedAt: now() }; });
    if (status !== "Approved") await unpublishProfile(id);
    await audit(actor.id, `Application ${status}`, id); await notify(id, `Application ${status.toLowerCase()}`, note || (status === "Approved" ? "Welcome to the AciesDaily creative network. Invitations will appear when a brief fits your work." : "Open your profile for the latest review decision."), "/profile");
    return json({ profile });
  }
  if (action === "publish-profile" && request.method === "POST") {
    const profile = await get<Profile>("creativeProfiles", text(data, "userId", 120, true)); if (!profile || profile.status !== "Approved" || !profile.publishConsent) throw new HttpError("Publishing requires an approved profile and the creative's permission.");
    const imageId = profile.avatar || profile.media[0], origin = process.env.ACIES_PORTAL_URL || request.nextUrl.origin;
    const entry: PublishedEntry = { id: profile.id, userId: profile.id, title: profile.name, category: profile.crafts[0], location: profile.city, summary: profile.bio.slice(0, 500), details: profile.bio, image: imageId ? `${origin}/api/media/${imageId}` : "", imageAlt: imageId ? `Portfolio photograph shared by ${profile.name}` : "", items: profile.crafts, credits: "", published: true, updatedAt: now() };
    await save("profiles", entry); await audit(actor.id, "Published creative profile", profile.id); return json({ entry });
  }
  if (action === "enquiries" && request.method === "PATCH") {
    const id = path[1]; if (!enquiryStatuses.includes(data.status as typeof enquiryStatuses[number])) throw new HttpError("Choose a valid progress status.");
    const fields: Record<string, string> = {};
    for (const [key, max] of Object.entries({ coordinator: 160, shootDate: 10, proposal: 5000, quote: 80, clientMessage: 2000, internalNotes: 4000 })) fields[key] = text(data, key, max);
    if (fields.quote && !/^\d{1,9}(\.\d{1,2})?$/.test(fields.quote)) throw new HttpError("Enter a valid total in Ghana cedis.");
    if (fields.shootDate && !/^\d{4}-\d{2}-\d{2}$/.test(fields.shootDate)) throw new HttpError("Check the shoot date.");
    if (!Array.isArray(data.deliverables) || data.deliverables.length > 20) throw new HttpError("Add at most 20 delivery links.");
    const deliverables = data.deliverables.map((item: Record<string, unknown>) => ({ label: text(item, "label", 160, true), url: url(text(item, "url", 2000, true)) }));
    const clientId = text(data, "clientId", 120);
    if (clientId) { const client = await get<User>("users", clientId); if (!client || client.role !== "client") throw new HttpError("Choose a client account."); }
    const result = await update<Project>("enquiries", id, (current) => ({ ...current, ...fields, status: data.status as Project["status"], clientId: clientId || current.clientId, deliverables, accessToken: current.kind === "project" ? current.accessToken || token() : undefined, approvedAt: fields.proposal !== (current.proposal || "") || fields.quote !== (current.quote || "") ? undefined : current.approvedAt, updatedAt: now() }));
    await audit(actor.id, "Updated project", id); if (result.clientId) await notify(result.clientId, "An update on your production", result.clientMessage || "Your project has been updated. Open it to review the latest details.", `/projects/account/${id}`);
    return json({ entry: result });
  }
  if (action === "invitations" && request.method === "POST") {
    const id = text(data, "userId", 120, true), projectId = text(data, "projectId", 120, true);
    const profile = await get<Profile>("creativeProfiles", id), user = await get<User>("users", id), project = await get<Project>("enquiries", projectId);
    if (!user?.verifiedAt || user.disabled || profile?.status !== "Approved" || user.role !== "creative") throw new HttpError("Choose an approved creative with a verified phone.");
    if (!project || project.kind !== "project") throw new HttpError("Choose a project brief.");
    if ((await list<Invitation>("invitations")).some((item) => item.userId === id && item.projectId === projectId && item.booking !== "Cancelled")) throw new HttpError("This creative already has an invitation for this project.", 409);
    const fee = text(data, "fee", 80, true), date = text(data, "date", 10, true); if (!/^\d{1,9}(\.\d{1,2})?$/.test(fee) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new HttpError("Check the date and agreed fee.");
    const invitation: Invitation = { id: randomUUID(), userId: id, projectId, title: text(data, "title", 160, true), brief: text(data, "brief", 4000, true), craft: text(data, "craft", 160, true), location: text(data, "location", 160, true), date, fee, terms: text(data, "terms", 3000, true), response: "Pending", booking: "Unconfirmed", callTime: "", coordinator: actor.name, preparation: "", payment: "Not due", paymentReference: "", createdAt: now(), updatedAt: now() };
    await create("invitations", invitation); await audit(actor.id, "Invited creative", invitation.id); await notify(id, "A brief with your name on it", invitation.title, `/opportunities/${invitation.id}`); return json({ invitation }, 201);
  }
  if (action === "invitations" && request.method === "PATCH") {
    const booking = text(data, "booking"), payment = text(data, "payment"), paymentReference = text(data, "paymentReference", 160);
    if (!["Unconfirmed", "Confirmed", "Completed", "Cancelled"].includes(booking) || !["Not due", "Pending", "Paid"].includes(payment)) throw new HttpError("Choose a valid booking and payment status.");
    if (payment === "Paid" && !paymentReference) throw new HttpError("Record a payment reference before marking it paid.");
    const result = await update<Invitation>("invitations", path[1], (current) => { if (["Confirmed", "Completed"].includes(booking) && current.response !== "Accepted") throw new HttpError("The creative must accept the invitation before booking confirmation."); return { ...current, booking: booking as Invitation["booking"], payment: payment as Invitation["payment"], paymentReference, callTime: text(data, "callTime", 160), coordinator: text(data, "coordinator", 160), preparation: text(data, "preparation", 3000), updatedAt: now() }; });
    await audit(actor.id, `Booking ${booking}; payment ${payment}`, result.id); await notify(result.userId, `Booking ${booking.toLowerCase()}`, `${result.title}. Open your booking for the latest shoot and payment details.`, `/bookings/${result.id}`); return json({ invitation: result });
  }
  if (action === "invite-account" && request.method === "POST") {
    const phone = normalizeContactPhone(text(data, "phone", 80, true)); if (!phone) throw new HttpError("Enter a valid phone number.");
    const role = data.role === "staff" ? "staff" : "client"; if (role === "staff" && !actor.owner) throw new HttpError("Only the workspace owner can invite staff.", 403);
    const projectId = text(data, "projectId", 120); if (projectId && !(await get<Project>("enquiries", projectId))) throw new HttpError("Project not found.");
    const existing = await get<User>("users", userId(phone));
    if (existing) { if (existing.role !== role) throw new HttpError("This phone belongs to another account type. Use a different registered number."); if (role === "client" && projectId) await update<Project>("enquiries", projectId, (current) => ({ ...current, clientId: existing.id })); return json({ existing: true, url: `${process.env.ACIES_PORTAL_URL || request.nextUrl.origin}/login` }); }
    const raw = token(), invite: Invite = { id: hash(raw), tokenHash: hash(raw), phone, role, name: text(data, "name", 160, true), projectId, consumed: false, expiresAt: Date.now() + 7 * 86400_000, createdAt: now() };
    await create("invites", invite); await audit(actor.id, `Invited ${role} account`, invite.id); return json({ url: `${process.env.ACIES_PORTAL_URL || request.nextUrl.origin}/register#invite=${raw}`, phone }, 201);
  }
  if (action === "messages" && request.method === "POST") {
    const recipientId = text(data, "recipientId", 120, true); if (!(await get<User>("users", recipientId))) throw new HttpError("Recipient not found.");
    const message = await create<Message>("messages", { id: randomUUID(), threadId: `dm-${recipientId}`, userId: actor.id, senderName: actor.name, senderRole: "staff", recipientId, body: text(data, "message", 3000, true), createdAt: now() }); await notify(recipientId, "A message from AciesDaily", "Open your inbox to read the team's message.", "/inbox"); return json({ message }, 201);
  }
  if (action === "content" && request.method === "POST" && collections.includes(path[1] as Collection)) {
    const collection = path[1] as Collection, fields: Record<string, string> = {};
    for (const [key, limit] of Object.entries({ title: 160, category: 160, location: 160, summary: 500, details: 5000, image: 2000, imageAlt: 250, credits: 2000 })) fields[key] = text(data, key, limit);
    if (!fields.title || !fields.summary) throw new HttpError("Add a title and short introduction.");
    if (fields.image && !fields.image.startsWith("/images/")) url(fields.image);
    if (fields.image && !fields.imageAlt) throw new HttpError("Describe the image for accessibility.");
    const id = text(data, "id", 100) || randomUUID(), old = await get<PublishedEntry>(collection, id);
    const entry = { ...fields, id, userId: old?.userId, items: strings(data, "items"), published: data.published === true, updatedAt: now() } as PublishedEntry;
    if (entry.published && entry.userId) { const profile = await get<Profile>("creativeProfiles", entry.userId); if (!profile?.publishConsent || profile.status !== "Approved") throw new HttpError("This creative's public profile needs approval and permission."); }
    await save(collection, entry); await audit(actor.id, entry.published ? "Published content" : "Saved draft content", id); return json({ entry });
  }
  throw new HttpError("Not found.", 404);
}
