// Guards the Railway image: every shared web/engine module kly imports (../../src/..., ../../engine/src/...) - directly or through a
// shared file's own relative imports - must be COPY'd in kly/Dockerfile, or kly crash-loops with ERR_MODULE_NOT_FOUND.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const kly = path.resolve(import.meta.dirname, "..");
const repo = path.resolve(kly, "..");
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    if (f === "node_modules") return [];
    return statSync(p).isDirectory() ? files(p) : p.endsWith(".ts") ? [p] : [];
  });
const resolveTs = (abs: string): string | null => (existsSync(abs + ".ts") ? abs + ".ts" : existsSync(path.join(abs, "index.ts")) ? path.join(abs, "index.ts") : null);

describe("kly Dockerfile", () => {
  it("copies every shared module kly imports (direct and transitive)", () => {
    const docker = readFileSync(path.join(kly, "Dockerfile"), "utf8");
    const copies = docker.split("\n").filter((l) => l.startsWith("COPY ")).flatMap((l) => l.slice(5).trim().split(/\s+/).slice(0, -1));
    const isCopied = (rel: string) => copies.some((c) => (c.endsWith("/") ? rel.startsWith(c) : rel === c));
    const shared = (abs: string) => /^(src|engine\/src)\//.test(path.relative(repo, abs));
    const seen = new Set<string>();
    const queue: string[] = [];
    for (const f of files(path.join(kly, "src"))) {
      for (const m of readFileSync(f, "utf8").matchAll(/from "(\.[^"]+)"/g)) {
        const r = resolveTs(path.resolve(path.dirname(f), m[1] ?? ""));
        if (r && shared(r)) queue.push(r);
      }
    }
    while (queue.length) {
      const f = queue.pop()!;
      if (seen.has(f)) continue;
      seen.add(f);
      if (!isCopied(path.relative(repo, f))) continue; // reported below; its own imports can't be judged
      for (const m of readFileSync(f, "utf8").matchAll(/from "(\.[^"]+)"/g)) {
        const r = resolveTs(path.resolve(path.dirname(f), m[1] ?? ""));
        if (r && shared(r)) queue.push(r);
      }
    }
    const missing = [...seen].map((f) => path.relative(repo, f)).filter((r) => !isCopied(r));
    expect(missing).toEqual([]);
  });
});
