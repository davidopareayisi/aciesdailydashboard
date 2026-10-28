import { readdir, readFile, mkdir, copyFile } from "node:fs/promises";
import path from "node:path";
const project = process.cwd(), source = path.resolve(project, ".data/users"), destination = path.resolve(project, ".data/qa-run/users");
if (!destination.startsWith(path.resolve(project, ".data/qa-run") + path.sep)) throw new Error("Invalid QA directory.");
let copied = false;
for (const file of await readdir(source)) { if (!/^[a-zA-Z0-9-]+\.json$/.test(file)) continue; const user = JSON.parse(await readFile(path.join(source, file), "utf8")); if (!user.owner || user.role !== "staff") continue; await mkdir(destination, { recursive: true }); await copyFile(path.join(source, file), path.join(destination, file)); copied = true; }
if (!copied) throw new Error("Run setup-local.mjs first.");
console.log("Isolated QA owner is ready in .data/qa-run. Preview scripts disable remote storage and SMS delivery.");
