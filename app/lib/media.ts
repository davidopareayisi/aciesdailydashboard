import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { postgresEnabled, saveDatabaseFile, readDatabaseFile } from "./postgres.mjs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import type { NextRequest } from "next/server";
import { create, dataRoot, find, get, remove, supabase } from "./db";
import { contentEntries, now } from "./domain";
import { body, equal, HttpError, json, rateLimit, requireUser, sameOrigin, currentUser } from "./security";
import type { Invitation, Media } from "./types";
import type { Project } from "./models";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_REQUEST_BYTES } from "./upload-limits.mjs";
import { mediaStorageMode, r2Storage } from "./r2.mjs";

export async function upload(request: NextRequest) {
  if (!sameOrigin(request)) throw new HttpError("Please upload from this portal.", 403);
  const user = await requireUser(request); await rateLimit(`upload:${user.id}`, 30, 600_000);
  const reader = request.body?.getReader(); if (!reader) throw new HttpError("Choose a file."); const chunks: Uint8Array[] = []; let size = 0;
  for (;;) { const item = await reader.read(); if (item.done) break; size += item.value.length; if (size > MAX_UPLOAD_REQUEST_BYTES) { await reader.cancel(); throw new HttpError("Choose a file smaller than 4 MB.", 413); } chunks.push(item.value); }
  const form = await new Response(Buffer.concat(chunks), { headers: { "Content-Type": request.headers.get("content-type") || "" } }).formData();
  const file = form.get("file"), projectId = String(form.get("projectId") || "");
  const learning = form.get("purpose") === "learning";
  if (learning && (user.role !== "creative" || projectId)) throw new HttpError("Practice uploads are for your own learning account.", 403);
  if (!(file instanceof File) || !file.size || file.size > MAX_UPLOAD_BYTES) throw new HttpError("Choose a supported file smaller than 4 MB.");
  if (projectId) { const project = await get<Project>("enquiries", projectId); const assigned = user.role === "creative" && (await find<Invitation>("invitations", "userId", user.id)).some((item) => item.projectId === projectId && ["Confirmed", "Completed"].includes(item.booking)); if (!project || (user.role !== "staff" && project.clientId !== user.id && !assigned)) throw new HttpError("You cannot upload to this project.", 403); }
  const input = Buffer.from(await file.arrayBuffer()), id = randomUUID();
  const { bytes, mime, extension } = await prepareFile(input, file.type, learning, projectId);
  const useR2 = mediaStorageMode() === "r2";
  const storageKey = `${useR2 ? "portal/" : ""}${id}.${extension}`, db = postgresEnabled() ? null : supabase();
  if (useR2) await r2Storage().put(storageKey, bytes, mime);
  else if (postgresEnabled()) await saveDatabaseFile(storageKey, bytes);
  else if (db) { const bucket = process.env.ACIES_MEDIA_BUCKET || "acies-private"; const response = await fetch(`${db.url}/storage/v1/object/${encodeURIComponent(bucket)}/${storageKey}`, { method: "POST", headers: { apikey: db.key, Authorization: `Bearer ${db.key}`, "Content-Type": mime, "x-upsert": "false" }, body: new Uint8Array(bytes) }); if (!response.ok) throw new HttpError("Your file could not be saved.", 503); }
  else { const directory = path.join(/* turbopackIgnore: true */ dataRoot(), "uploads"); await mkdir(directory, { recursive: true }); await writeFile(path.join(/* turbopackIgnore: true */ directory, storageKey), bytes, { flag: "wx", mode: 0o600 }); }
  const media: Media = { id, userId: user.id, projectId, filename: mime === "image/webp" ? `${file.name.replace(/\.[^/.]+$/, "").slice(0, 150)}.webp` : file.name.slice(0, 160), mime, bytes: bytes.length, storageKey, createdAt: now(), ...(learning ? { purpose: "learning" as const } : {}), ...(useR2 ? { storageProvider: "r2" as const, storageBucket: r2Storage().bucket } : {}) };
  try { await create("media", media); }
  catch (error) { if (useR2) await r2Storage().remove(storageKey).catch(() => {}); throw error; }
  return json({ media, url: `${process.env.ACIES_PORTAL_URL || request.nextUrl.origin}/api/media/${id}` }, 201);
}
export async function download(request: NextRequest, id: string) {
  const media = await get<Media>("media", id); if (!media) throw new HttpError("File not found.", 404);
  const user = await currentUser(request); let allowed = user?.role === "staff" || user?.id === media.userId;
  const projectId = request.headers.get("x-acies-project"), bearer = request.headers.get("authorization")?.replace(/^Bearer /, "") || "";
  if (!allowed && projectId && media.projectId === projectId && bearer.length >= 40 && bearer.length <= 100) { const project = await get<Project>("enquiries", projectId); allowed = Boolean(project?.accessToken && equal(bearer, project.accessToken) && project.deliverables?.some((item) => item.url.endsWith(`/api/media/${id}`))); }
  if (!allowed && media.projectId && user?.role === "client") { const project = await get<Project>("enquiries", media.projectId); allowed = project?.clientId === user.id && Boolean(project.deliverables?.some((item) => item.url.endsWith(`/api/media/${id}`))); }
  if (!allowed && media.purpose !== "learning" && media.mime.startsWith("image/")) { const entries = [...await contentEntries("profiles", true), ...await contentEntries("work", true), ...await contentEntries("packages", true)]; allowed = entries.some((entry) => entry.image.endsWith(`/api/media/${id}`)); }
  if (!allowed) throw new HttpError("File not found.", 404);
  if (media.storageProvider === "r2") return new Response(null, { status: 307, headers: { Location: await r2Storage().signDownload(media.storageKey, media.storageBucket, media.mime, media.filename), "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
  let bytes: Uint8Array; const db = postgresEnabled() ? null : supabase();
  if (postgresEnabled()) bytes = await readDatabaseFile(media.storageKey);
  else if (db) { const response = await fetch(`${db.url}/storage/v1/object/authenticated/${encodeURIComponent(process.env.ACIES_MEDIA_BUCKET || "acies-private")}/${media.storageKey}`, { headers: { Authorization: `Bearer ${db.key}`, apikey: db.key }, cache: "no-store" }); if (!response.ok) throw new HttpError("File unavailable.", 503); bytes = new Uint8Array(await response.arrayBuffer()); }
  else bytes = new Uint8Array(await readFile(path.join(/* turbopackIgnore: true */ dataRoot(), "uploads", media.storageKey)));
  return new Response(Uint8Array.from(bytes).buffer, { headers: { "Content-Type": media.mime, "Content-Length": String(bytes.length), "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox", "Content-Disposition": `${media.mime === "application/pdf" ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(media.filename)}` } });
}

async function prepareFile(input: Buffer, fileType: string, learning: boolean, projectId: string) {
  let bytes: Buffer, mime: string, extension: string;
  if (learning && fileType === "video/mp4" && input.length > 16 && input.subarray(4, 8).toString() === "ftyp") { bytes = input; mime = "video/mp4"; extension = "mp4"; }
  else if (learning && fileType === "video/webm" && input.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])) && input.subarray(0, 512).includes(Buffer.from("webm"))) { bytes = input; mime = "video/webm"; extension = "webm"; }
  else if (input.subarray(0, 5).toString() === "%PDF-" && projectId) { bytes = input; mime = "application/pdf"; extension = "pdf"; }
  else {
    try { const processor = sharp(input, { limitInputPixels: 20_000_000, animated: false }); if (!["jpeg", "png", "webp"].includes((await processor.metadata()).format || "")) throw new Error("Unsupported image."); bytes = await processor.rotate().resize({ width: 1800, height: 1800, fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer(); } catch { throw new HttpError("This image could not be opened. Use a JPG, PNG or WebP."); }
    mime = "image/webp"; extension = "webp";
  }
  return { bytes, mime, extension };
}
type PendingUpload = { id: string; userId: string; projectId: string; learning: boolean; filename: string; mime: string; size: number; checksum: string; expiresAt: number };
async function uploadPermission(request: NextRequest, projectId: string, learning: boolean) {
  const user = await requireUser(request);
  if (learning && (user.role !== "creative" || projectId)) throw new HttpError("Practice uploads are for your own learning account.", 403);
  if (projectId) { const project = await get<Project>("enquiries", projectId); const assigned = user.role === "creative" && (await find<Invitation>("invitations", "userId", user.id)).some(item => item.projectId === projectId && ["Confirmed", "Completed"].includes(item.booking)); if (!project || (user.role !== "staff" && project.clientId !== user.id && !assigned)) throw new HttpError("You cannot upload to this project.", 403); }
  return user;
}
export async function directUpload(request: NextRequest, action: string) {
  const data = await body(request);
  if (mediaStorageMode() !== "r2") { await requireUser(request); return json({ direct: false }); }
  if (action === "prepare") {
    const projectId = typeof data.projectId === "string" ? data.projectId : "", learning = data.purpose === "learning";
    const user = await uploadPermission(request, projectId, learning); await rateLimit(`upload:${user.id}`, 30, 600_000);
    for (const stale of (await find<PendingUpload>("pendingUploads", "userId", user.id)).filter(item => item.expiresAt < Date.now()).slice(0, 30)) { await r2Storage().remove(`pending/${stale.id}.bin`); await remove("pendingUploads", stale.id); }
    const mime = String(data.mime || ""), size = Number(data.size), filename = String(data.filename || "").slice(0, 160), checksum = String(data.checksum || "");
    const video = learning && ["video/mp4", "video/webm"].includes(mime);
    if ((!video && !["image/jpeg", "image/png", "image/webp"].includes(mime) && !(projectId && mime === "application/pdf")) || !Number.isInteger(size) || size < 1 || size > (video ? 100_000_000 : 10_000_000) || !/^[A-Za-z0-9+/]{43}=$/.test(checksum)) throw new HttpError("Choose an image or PDF up to 10 MB, or a practice video up to 100 MB.");
    const id = randomUUID(), pending: PendingUpload = { id, userId: user.id, projectId, learning, filename, mime, size, checksum, expiresAt: Date.now() + 15 * 60_000 };
    await create("pendingUploads", pending);
    const uploadUrl = await r2Storage().signUpload(`pending/${id}.bin`, mime, size, checksum);
    return json({ direct: true, id, uploadUrl, checksum });
  }
  if (action !== "complete" || typeof data.id !== "string" || !/^[a-f0-9-]{36}$/.test(data.id)) throw new HttpError("Upload not found.", 404);
  const pending = await get<PendingUpload>("pendingUploads", data.id), user = await requireUser(request);
  if (!pending || pending.userId !== user.id || pending.expiresAt < Date.now()) throw new HttpError("Upload expired. Please choose the file again.", 404);
  await uploadPermission(request, pending.projectId, pending.learning);
  const existing = await get<Media>("media", pending.id);
  if (existing) return json({ media: existing, url: `${request.nextUrl.origin}/api/media/${existing.id}` });
  await rateLimit(`upload-complete:${user.id}`, 60, 600_000);
  const storage = r2Storage(), key = `pending/${pending.id}.bin`;
  const head = await storage.head(key);
  if (head.ContentLength !== pending.size) { await storage.remove(key); throw new HttpError("The uploaded file size did not match."); }
  const input = Buffer.from(await storage.get(key, storage.bucket, pending.size));
  if (input.length !== pending.size || createHash("sha256").update(input).digest("base64") !== pending.checksum) { await storage.remove(key); throw new HttpError("The upload could not be verified."); }
  let prepared;
  try { prepared = await prepareFile(input, pending.mime, pending.learning, pending.projectId); }
  catch (error) { await storage.remove(key); throw error; }
  const { bytes, mime, extension } = prepared, storageKey = `portal/${pending.id}.${extension}`;
  if (mime === "image/webp") await storage.put(storageKey, bytes, mime);
  else await storage.copy(key, storageKey, mime);
  const media: Media = { id: pending.id, userId: user.id, projectId: pending.projectId, filename: mime === "image/webp" ? `${pending.filename.replace(/\.[^/.]+$/, "").slice(0, 150)}.webp` : pending.filename, mime, bytes: bytes.length, storageKey, createdAt: now(), storageProvider: "r2", storageBucket: storage.bucket, ...(pending.learning ? { purpose: "learning" as const } : {}) };
  try { await create("media", media); } catch (error) { if (!(await get<Media>("media", media.id))) throw error; }
  await storage.remove(key);
  return json({ media, url: `${process.env.ACIES_PORTAL_URL || request.nextUrl.origin}/api/media/${media.id}` }, 201);
}
