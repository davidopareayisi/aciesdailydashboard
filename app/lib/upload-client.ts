import type { Media } from "./types";
export async function uploadFile(file: File, options: { projectId?: string; purpose?: string }, progress: (value: string) => void): Promise<{ media: Media; url: string }> {
  const max = file.type.startsWith("video/") ? 100_000_000 : 10_000_000;
  if (!file.size || file.size > max) throw new Error(`Choose a file up to ${max / 1_000_000} MB.`);
  progress("Preparing...");
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer()));
  const checksum = btoa(String.fromCharCode(...digest));
  async function post(action: string, data: object) {
    const response = await fetch(`/api/upload/${action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    const result = await response.json(); if (!response.ok) throw new Error(result.error || "Your upload could not be saved. Please try again."); return result;
  }
  const prepared = await post("prepare", { ...options, filename: file.name, mime: file.type, size: file.size, checksum });
  if (!prepared.direct) {
    if (file.size > 4_000_000) throw new Error("This environment supports files up to 4 MB.");
    const form = new FormData(); form.set("file", file); if (options.projectId) form.set("projectId", options.projectId); if (options.purpose) form.set("purpose", options.purpose);
    const response = await fetch("/api/upload", { method: "POST", body: form }), result = await response.json(); if (!response.ok) throw new Error(result.error); return result;
  }
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest(); xhr.open("PUT", prepared.uploadUrl); xhr.timeout = 600_000;
    xhr.setRequestHeader("Content-Type", file.type); xhr.setRequestHeader("x-amz-checksum-sha256", checksum);
    xhr.upload.onprogress = event => { if (event.lengthComputable) progress(`Uploading ${Math.round(event.loaded / event.total * 100)}%`); };
    xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error("Upload failed. Please choose the file again."));
    xhr.onerror = xhr.ontimeout = () => reject(new Error("Upload interrupted. Check your connection and try again.")); xhr.send(file);
  });
  progress("Checking file...");
  return post("complete", { id: prepared.id });
}
