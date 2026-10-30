import { readdir, readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
export async function resetLocalTestLimits() {
  const root = path.resolve(".data/qa-run"), folder = path.resolve(root, "limits");
  if (path.dirname(folder) !== root) throw new Error("Invalid fixture path.");
  let files; try { files = await readdir(folder); } catch (error) { if (error.code === "ENOENT") return; throw error; }
  for (const file of files) if (/^limit-[a-f0-9]{64}\.json$/.test(file)) await unlink(path.join(folder, file));
}
// Reused local fixtures can contain image URLs from a previous preview port.
export async function normalizeQaMediaOrigins(base) {
  const origin = new URL(base);
  if (!["127.0.0.1", "localhost"].includes(origin.hostname)) throw new Error("Use a loopback QA origin.");
  const root = path.resolve(".data/qa-run");
  for (const collection of ["profiles", "work", "packages"]) {
    const folder = path.resolve(root, collection);
    if (path.dirname(folder) !== root) throw new Error("Invalid fixture path.");
    for (const file of await readdir(folder).catch(error => { if (error.code === "ENOENT") return []; throw error; })) {
      if (!/^[a-zA-Z0-9-]+\.json$/.test(file)) continue;
      const target = path.join(folder, file), entry = JSON.parse(await readFile(target, "utf8"));
      let image; try { image = new URL(entry.image); } catch { continue; }
      if (["127.0.0.1", "localhost"].includes(image.hostname) && /^\/api\/media\/[a-zA-Z0-9-]+$/.test(image.pathname) && image.origin !== origin.origin) {
        await writeFile(target, JSON.stringify({ ...entry, image: origin.origin + image.pathname }), { mode: 0o600 });
      }
    }
  }
}
