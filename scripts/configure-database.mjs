import { createInterface } from "node:readline";
import { readFile, writeFile } from "node:fs/promises";
if (process.stdin.isTTY) process.stdin.setRawMode(true);
const input = createInterface({ input: process.stdin, terminal: false });
input.once("line", async (line) => {
  input.close();
  if (process.stdin.isTTY) process.stdin.setRawMode(false);
  process.stdin.pause();
  try {
    const value = line.trim(), url = new URL(value);
    if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname.endsWith(".neon.tech") || !url.username || !url.password) throw new Error("Invalid connection.");
    let source = ""; try { source = await readFile(".env.local", "utf8"); } catch (error) { if (error.code !== "ENOENT") throw error; }
    const setting = `DATABASE_URL=${JSON.stringify(value)}`;
    source = /^DATABASE_URL=.*$/m.test(source) ? source.replace(/^DATABASE_URL=.*$/m, () => setting) : `${source}\n${setting}\n`;
    await writeFile(".env.local", source, { mode: 0o600 });
    console.log("Neon connection saved to the ignored server-only environment file. No connection details were printed.");
  } catch { console.error("The connection could not be configured. No connection details were printed."); process.exitCode = 1; }
});
console.log("Ready for the database connection on stdin. Input is not echoed.");
