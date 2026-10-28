import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import type { NextRequest } from "next/server";
import { create, dataRoot, get, list, supabase } from "./db";
import { contentEntries, now } from "./domain";
import { equal, HttpError, json, rateLimit, requireUser, sameOrigin, currentUser } from "./security";
import type { Invitation, Media } from "./types";
import type { Project } from "./models";

export async function upload(request: NextRequest) {
  if (!sameOrigin(request)) throw new HttpError("Please upload from this portal.", 403);
  const user = await requireUser(request); await rateLimit(`upload:${user.id}`, 30, 600_000);
  const reader = request.body?.getReader(); if (!reader) throw new HttpError("Choose a file."); const chunks: Uint8Array[] = []; let size = 0;
  for (;;) { const item = await reader.read(); if (item.done) break; size += item.value.length; if (size > 9 * 1024 * 1024) { await reader.cancel(); throw new HttpError("Choose a file smaller than 8 MB.", 413); } chunks.push(item.value); }
  const form = await new Response(Buffer.concat(chunks), { headers: { "Content-Type": request.headers.get("content-type") || "" } }).formData();
  const file = form.get("file"), projectId = String(form.get("projectId") || "");
  if (!(file instanceof File) || !file.size || file.size > 8 * 1024 * 1024) throw new HttpError("Choose a JPG, PNG, WebP or PDF smaller than 8 MB.");
  if (projectId) { const project = await get<Project>("enquiries", projectId); const assigned = user.role === "creative" && (await list<Invitation>("invitations")).some((item) => item.userId === user.id && item.projectId === projectId && ["Confirmed", "Completed"].includes(item.booking)); if (!project || (user.role !== "staff" && project.clientId !== user.id && !assigned)) throw new HttpError("You cannot upload to this project.", 403); }
  const input = Buffer.from(await file.arrayBuffer()), id = randomUUID(); let bytes: Buffer, mime: string, extension: string;
  if (input.subarray(0, 5).toString() === "%PDF-" && projectId) { bytes = input; mime = "application/pdf"; extension = "pdf"; }
  else {
    try { const processor = sharp(input, { limitInputPixels: 20_000_000, animated: false }); if (!["jpeg", "png", "webp"].includes((await processor.metadata()).format || "")) throw new Error("Unsupported image."); bytes = await processor.rotate().resize({ width: 1800, height: 1800, fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer(); } catch { throw new HttpError("This image could not be opened. Use a JPG, PNG or WebP."); }
    mime = "image/webp"; extension = "webp";
  }
  const storageKey = `${id}.${extension}`, db = supabase();
  if (db) { const bucket = process.env.ACIES_MEDIA_BUCKET || "acies-private"; const response = await fetch(`${db.url}/storage/v1/object/${encodeURIComponent(bucket)}/${storageKey}`, { method: "POST", headers: { apikey: db.key, Authorization: `Bearer ${db.key}`, "Content-Type": mime, "x-upsert": "false" }, body: new Uint8Array(bytes) }); if (!response.ok) throw new HttpError("Your file could not be saved.", 503); }
  else { const directory = path.join(/* turbopackIgnore: true */ dataRoot(), "uploads"); await mkdir(directory, { recursive: true }); await writeFile(path.join(/* turbopackIgnore: true */ directory, storageKey), bytes, { flag: "wx", mode: 0o600 }); }
  const media: Media = { id, userId: user.id, projectId, filename: mime === "image/webp" ? `${file.name.replace(/\.[^/.]+$/, "").slice(0, 150)}.webp` : file.name.slice(0, 160), mime, bytes: bytes.length, storageKey, createdAt: now() }; await create("media", media); return json({ media, url: `${process.env.ACIES_PORTAL_URL || request.nextUrl.origin}/api/media/${id}` }, 201);
}
export async function download(request: NextRequest, id: string) {
  const media = await get<Media>("media", id); if (!media) throw new HttpError("File not found.", 404);
  const user = await currentUser(request); let allowed = user?.role === "staff" || user?.id === media.userId;
  const projectId = request.headers.get("x-acies-project"), bearer = request.headers.get("authorization")?.replace(/^Bearer /, "") || "";
  if (!allowed && projectId && media.projectId === projectId && bearer.length >= 40 && bearer.length <= 100) { const project = await get<Project>("enquiries", projectId); allowed = Boolean(project?.accessToken && equal(bearer, project.accessToken) && project.deliverables?.some((item) => item.url.endsWith(`/api/media/${id}`))); }
  if (!allowed && media.projectId && user?.role === "client") { const project = await get<Project>("enquiries", media.projectId); allowed = project?.clientId === user.id && Boolean(project.deliverables?.some((item) => item.url.endsWith(`/api/media/${id}`))); }
  if (!allowed && media.mime.startsWith("image/")) { const entries = [...await contentEntries("profiles", true), ...await contentEntries("work", true), ...await contentEntries("packages", true)]; allowed = entries.some((entry) => entry.image.endsWith(`/api/media/${id}`)); }
  if (!allowed) throw new HttpError("File not found.", 404);
  let bytes: Uint8Array; const db = supabase();
  if (db) { const response = await fetch(`${db.url}/storage/v1/object/authenticated/${encodeURIComponent(process.env.ACIES_MEDIA_BUCKET || "acies-private")}/${media.storageKey}`, { headers: { Authorization: `Bearer ${db.key}`, apikey: db.key }, cache: "no-store" }); if (!response.ok) throw new HttpError("File unavailable.", 503); bytes = new Uint8Array(await response.arrayBuffer()); }
  else bytes = new Uint8Array(await readFile(path.join(/* turbopackIgnore: true */ dataRoot(), "uploads", media.storageKey)));
  return new Response(Uint8Array.from(bytes).buffer, { headers: { "Content-Type": media.mime, "Content-Length": String(bytes.length), "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox", "Content-Disposition": `${media.mime === "application/pdf" ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(media.filename)}` } });
}
