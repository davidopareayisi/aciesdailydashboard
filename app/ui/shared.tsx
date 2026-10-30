"use client";
import { uploadFile } from "../lib/upload-client";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
export type IconName = "home" | "compass" | "calendar" | "chat" | "user" | "bell" | "arrow" | "back" | "plus" | "check" | "camera" | "file" | "close" | "logout" | "search" | "pin" | "edit" | "book" | "play";
const paths: Record<IconName, string> = {
  book: "M12 5c-3-2-7-2-10-1v15c3-1 7-1 10 1m0-15c3-2 7-2 10-1v15c-3-1-7-1-10 1V5Z", play: "m9 5 11 7-11 7V5Z",
  home: "m3 10 9-7 9 7v10H3V10Zm6 10v-7h6v7", compass: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-6-3-2 4-4 2 2-4 4-2Z", calendar: "M5 5h14v16H5V5Zm3-3v6m8-6v6M5 10h14m-10 4h2m3 0h2m-8 3h2", chat: "M21 11a8 8 0 0 1-8 8H8l-5 3V11a9 9 0 0 1 18 0ZM7 10h10M7 14h6", user: "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Zm-13 14a9 9 0 0 1 18 0", bell: "M18 8a6 6 0 0 0-12 0v6l-3 3h18l-3-3V8Zm-8 12h4", arrow: "M5 19 19 5M5 5h14v14", back: "m11 5-7 7 7 7M4 12h16", plus: "M12 4v16M4 12h16", check: "m4 12 5 5L20 6", camera: "M3 7h4l2-3h6l2 3h4v14H3V7Zm13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z", file: "M5 2h9l5 5v15H5V2Zm9 0v6h5M8 12h8M8 16h6", close: "m5 5 14 14M5 19 19 5", logout: "M9 3H3v18h6m6-15 6 6-6 6m-6-6h12", search: "M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0Zm-2 5 6 6", pin: "M19 9c0 5-7 12-7 12S5 14 5 9a7 7 0 0 1 14 0Zm-5 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z", edit: "m15 3 6 6-12 12H3v-6L15 3Zm-3 3 6 6",
};
export function Icon({ name, size = 22 }: { name: IconName; size?: number }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>; }
export function Wordmark() { return <Link className="wordmark" href="/" aria-label="AciesDaily home"><Image src="/brand/acies-mark-192.png" alt="" width={30} height={30} unoptimized /><span>acies<span>daily</span></span></Link>; }
export const money = (value: string) => new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS", maximumFractionDigits: 2 }).format(Number(value));
export const dateLabel = (value: string) => value ? new Date(value.length === 10 ? `${value}T12:00:00` : value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "To be agreed";
export async function api<T>(path: string, method = "GET", data?: unknown): Promise<T> { const response = await fetch(`/api/${path}`, { method, cache: "no-store", headers: { "Content-Type": "application/json" }, ...(data !== undefined ? { body: JSON.stringify(data) } : {}) }); const result = await response.json(); if (!response.ok) throw new Error(result.error || "We couldn't complete that. Please try again."); return result as T; }
export function useResource<T>(path: string) {
  const [data, setData] = useState<T | null>(null), [error, setError] = useState(""), [loading, setLoading] = useState(true);
  useEffect(() => { let active = true; api<T>(path).then((data) => { if (active) setData(data); }).catch((error) => { if (active) setError(error.message); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [path]);
  const refresh = useCallback(async () => { setError(""); try { setData(await api<T>(path)); } catch (error) { setError((error as Error).message); } }, [path]);
  return { data, error, loading, refresh, setData };
}
const subscribeHash = (callback: () => void) => { window.addEventListener("hashchange", callback); return () => window.removeEventListener("hashchange", callback); };
export function useFragment(key: string) { return useSyncExternalStore(subscribeHash, () => new URLSearchParams(window.location.hash.slice(1)).get(key) || "", () => ""); }
export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) { return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>; }
export function ErrorNotice({ message }: { message: string }) { return message ? <p className="error-notice" role="alert">{message}</p> : null; }
export function Status({ children }: { children: ReactNode }) { return <span className="status" data-state={String(children).toLowerCase().replaceAll(" ", "-")}>{children}</span>; }
export function Empty({ icon = "compass", title, text, href, action }: { icon?: IconName; title: string; text: string; href?: string; action?: string }) { return <div className="empty-state"><span className="empty-icon"><Icon name={icon} size={30} /></span><h2>{title}</h2><p>{text}</p>{href && <Link className="button outline" href={href}>{action || "Get started"}<Icon name="arrow" size={17} /></Link>}</div>; }
export function Avatar({ name, media, large = false }: { name: string; media?: string; large?: boolean }) { return <span className={`avatar ${large ? "avatar-large" : ""}`}>{media ? <Image src={`/api/media/${media}`} alt="" width={large ? 100 : 40} height={large ? 100 : 40} unoptimized /> : name.trim().slice(0, 1).toUpperCase()}</span>; }
export function Upload({ onUpload, projectId, label = "Add photographs" }: { onUpload: (file: { id: string; filename: string; mime: string }, url: string) => void; projectId?: string; label?: string }) {
  const [busy, setBusy] = useState(false), [progress, setProgress] = useState(""), [error, setError] = useState("");
  return <div className="upload-control"><label className="upload-button"><Icon name={projectId ? "file" : "camera"} /><span>{busy ? progress : label}<small>{projectId ? "Images or PDF" : "JPG, PNG or WebP"} · up to 10 MB</small></span><input type="file" disabled={busy} accept={projectId ? "image/jpeg,image/png,image/webp,application/pdf" : "image/jpeg,image/png,image/webp"} onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; setBusy(true); setError(""); try { const result = await uploadFile(file, { projectId }, setProgress); onUpload(result.media, result.url); } catch (error) { setError((error as Error).message); } finally { setBusy(false); event.target.value = ""; } }} /></label><ErrorNotice message={error} /></div>;
}
