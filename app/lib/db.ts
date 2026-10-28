import "server-only";
import { mkdir, readFile, readdir, rename, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
export const buckets = ["users", "sessions", "creativeProfiles", "invitations", "notices", "messages", "media", "challenges", "invites", "audit", "enquiries", "profiles", "work", "packages", "limits"] as const;
export type Bucket = typeof buckets[number];
type Row<T> = { data: T; revision: number };
const queues = new Map<string, Promise<unknown>>();
export function dataRoot() { return process.env.ACIES_STORAGE_DIRECTORY || path.join(process.cwd(), ".data"); }
function filename(bucket: Bucket, id: string) { if (!/^[a-zA-Z0-9][a-zA-Z0-9-]{0,120}$/.test(id)) throw new Error("Invalid record."); return path.join(/* turbopackIgnore: true */ dataRoot(), bucket, `${id}.json`); }
export function supabase() { const url = process.env.ACIES_SUPABASE_URL, key = process.env.ACIES_SUPABASE_SERVICE_ROLE_KEY; if (Boolean(url) !== Boolean(key)) throw new Error("Both database settings are required."); return url && key ? { url: url.replace(/\/$/, ""), key } : null; }
export async function databaseFetch(query: string, init?: RequestInit) {
  const db = supabase()!;
  const response = await fetch(`${db.url}/rest/v1/acies_records${query}`, { ...init, cache: "no-store", headers: { apikey: db.key, Authorization: `Bearer ${db.key}`, "Content-Type": "application/json", ...init?.headers } });
  if (!response.ok) throw new Error(response.status === 409 ? "Record already exists." : "Database unavailable."); return response;
}
async function row<T>(bucket: Bucket, id: string): Promise<Row<T> | null> {
  filename(bucket, id);
  if (supabase()) { const response = await databaseFetch(`?collection=eq.${bucket}&id=eq.${encodeURIComponent(id)}&select=data,revision`); return (await response.json())[0] || null; }
  try { return { data: JSON.parse(await readFile(filename(bucket, id), "utf8")), revision: 0 }; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
}
export async function get<T>(bucket: Bucket, id: string): Promise<T | null> { return (await row<T>(bucket, id))?.data || null; }
export async function list<T>(bucket: Bucket): Promise<T[]> {
  if (supabase()) {
    const result: T[] = []; let offset = 0;
    for (;;) {
      const response = await databaseFetch(`?collection=eq.${bucket}&select=data&order=id.asc`, { headers: { Range: `${offset}-${offset + 499}`, Prefer: "count=exact" } });
      const rows = await response.json() as { data: T }[]; result.push(...rows.map((entry) => entry.data));
      const total = Number(response.headers.get("content-range")?.split("/")[1]); offset += rows.length;
      if (!rows.length || (Number.isFinite(total) && offset >= total) || (!Number.isFinite(total) && rows.length < 500)) break;
    } return result;
  }
  const dir = path.join(/* turbopackIgnore: true */ dataRoot(), bucket);
  let files: string[]; try { files = await readdir(dir); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
  return Promise.all(files.filter((file) => /^[a-zA-Z0-9-]+\.json$/.test(file)).map(async (file) => JSON.parse(await readFile(path.join(dir, file), "utf8")) as T));
}
async function write<T extends { id: string }>(bucket: Bucket, data: T, create = false) {
  if (supabase()) { await databaseFetch(create ? "" : "?on_conflict=collection,id", { method: "POST", headers: { Prefer: create ? "return=minimal" : "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ collection: bucket, id: data.id, data, revision: 1 }) }); return; }
  const target = filename(bucket, data.id); await mkdir(path.dirname(target), { recursive: true });
  if (create) { await writeFile(target, JSON.stringify(data), { flag: "wx", mode: 0o600 }); return; }
  const temporary = `${target}.${randomUUID()}.tmp`; await writeFile(temporary, JSON.stringify(data), { mode: 0o600 }); await rename(temporary, target);
}
export async function create<T extends { id: string }>(bucket: Bucket, data: T) { await write(bucket, data, true); return data; }
export async function save<T extends { id: string }>(bucket: Bucket, data: T) { await write(bucket, data); return data; }
export async function remove(bucket: Bucket, id: string) { if (supabase()) { await databaseFetch(`?collection=eq.${bucket}&id=eq.${encodeURIComponent(id)}`, { method: "DELETE" }); return; } await unlink(filename(bucket, id)).catch((error) => { if (error.code !== "ENOENT") throw error; }); }
export async function update<T extends { id: string }>(bucket: Bucket, id: string, change: (record: T) => T | Promise<T>): Promise<T> {
  const key = `${bucket}:${id}`, previous = queues.get(key) || Promise.resolve();
  const work = previous.catch(() => {}).then(async () => {
    for (let attempt = 0; attempt < 4; attempt++) {
      const current = await row<T>(bucket, id); if (!current) throw new Error("Record not found.");
      const next = await change(current.data); if (next.id !== id) throw new Error("Record identity cannot change.");
      if (!supabase()) { await write(bucket, next); return next; }
      const response = await databaseFetch(`?collection=eq.${bucket}&id=eq.${encodeURIComponent(id)}&revision=eq.${current.revision}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ data: next, revision: current.revision + 1, updated_at: new Date().toISOString() }) });
      if ((await response.json()).length) return next;
    } throw new Error("This record changed. Please try again.");
  }); queues.set(key, work); try { return await work; } finally { if (queues.get(key) === work) queues.delete(key); }
}
