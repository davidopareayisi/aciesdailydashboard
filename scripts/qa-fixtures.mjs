import { readdir, unlink } from "node:fs/promises";
import path from "node:path";
export async function resetLocalTestLimits() {
  const root = path.resolve(".data/qa-run"), folder = path.resolve(root, "limits");
  if (path.dirname(folder) !== root) throw new Error("Invalid fixture path.");
  let files; try { files = await readdir(folder); } catch (error) { if (error.code === "ENOENT") return; throw error; }
  for (const file of files) if (/^limit-[a-f0-9]{64}\.json$/.test(file)) await unlink(path.join(folder, file));
}
