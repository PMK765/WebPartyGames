import { cp, mkdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const srcDir = path.join(root, "assets", "SVG-cards-1.3");
const destDir = path.join(root, "public", "cards");

await mkdir(destDir, { recursive: true });
await cp(srcDir, destDir, { recursive: true, force: true });

const soundsSrc = path.join(root, "assets", "sounds");
const soundsDest = path.join(root, "public", "sounds");
await mkdir(soundsDest, { recursive: true });
await cp(soundsSrc, soundsDest, { recursive: true, force: true });


