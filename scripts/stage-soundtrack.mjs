import { createHash } from "node:crypto";
import { readFile, mkdir, copyFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { soundtrack } from "../src/soundtrack.js";

const source = process.argv[2];
if (!source)
  throw new Error("Usage: npm run music:stage -- /path/to/authorized/masters");

const publicRoot = fileURLToPath(new URL("../public/", import.meta.url));
const assets = await Promise.all(
  soundtrack.map(async (track) => {
    const filename = path.basename(track.url);
    const from = path.join(source, filename);
    const bytes = await readFile(from);
    const hash = createHash("sha256").update(bytes).digest("hex");
    if (hash !== track.sha256)
      throw new Error(`Soundtrack checksum mismatch: ${filename}`);
    return { from, to: path.join(publicRoot, track.url) };
  }),
);

await Promise.all(
  assets.map(async ({ from, to }) => {
    await mkdir(path.dirname(to), { recursive: true });
    await copyFile(from, to);
  }),
);
console.log(`Staged ${assets.length} authorized BELMONDO soundtrack masters.`);
