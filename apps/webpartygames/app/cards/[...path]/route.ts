import { readFile } from "node:fs/promises";
import path from "node:path";

function safeJoin(baseDir: string, parts: readonly string[]) {
  const joined = path.join(baseDir, ...parts);
  const normalizedBase = path.resolve(baseDir);
  const normalizedJoined = path.resolve(joined);
  if (!normalizedJoined.startsWith(normalizedBase + path.sep) && normalizedJoined !== normalizedBase) {
    return null;
  }
  return normalizedJoined;
}

export async function GET(
  _request: Request,
  { params }: { params: { path: string[] } }
) {
  const parts = params.path ?? [];
  if (parts.length === 0) return new Response("Not found", { status: 404 });

  const filename = parts[parts.length - 1] ?? "";
  if (!filename.endsWith(".svg")) return new Response("Not found", { status: 404 });
  if (parts.some((p) => p.includes("..") || p.includes("\\"))) return new Response("Bad request", { status: 400 });

  const baseDir = path.join(process.cwd(), "assets", "SVG-cards-1.3");
  const target = safeJoin(baseDir, parts);
  if (!target) return new Response("Not found", { status: 404 });

  const file = await readFile(target);
  return new Response(file, {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "public, max-age=31536000, immutable"
    }
  });
}


