// Transitive guard for the Railway image: shared src/lib modules the engine imports may themselves import other
// src/lib files (product-intel, customer-intel, growth/*). Walk the whole closure and require every file to be COPY'd,
// and forbid "@/" aliases, Next and Prisma imports inside the shared closure (they do not resolve in the image).
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const engineRoot = path.resolve(import.meta.dirname, "..");
const repo = path.resolve(engineRoot, "..");
const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
  const p = path.join(dir, f);
  if (f === "node_modules") return [];
  return statSync(p).isDirectory() ? files(p) : p.endsWith(".ts") ? [p] : [];
});
const resolveTs = (from: string, spec: string): string | null => {
  const base = path.resolve(path.dirname(from), spec);
  for (const c of [base + ".ts", path.join(base, "index.ts"), base]) if (existsSync(c) && statSync(c).isFile()) return c;
  return null;
};
const docker = readFileSync(path.join(engineRoot, "Dockerfile"), "utf8");
const copied = [...docker.matchAll(/^COPY (src\/lib\/\S+)/gm)].map((m) => m[1] ?? "");
const isCopied = (rel: string) => copied.some((c) => (c.endsWith("/") ? rel.startsWith(c) : rel === c));
const importsOf = (f: string) => [...readFileSync(f, "utf8").matchAll(/(?:from|import)\s*\(?\s*"([^"]+)"/g)].map((m) => m[1] ?? "");

describe("engine Dockerfile (transitive closure of shared src/lib)", () => {
  const seeds = new Set<string>();
  for (const f of files(path.join(engineRoot, "src"))) {
    for (const s of importsOf(f)) if (/^(\.\.\/)+src\/lib\//.test(s)) { const r = resolveTs(f, s); if (r) seeds.add(r); }
  }
  const seen = new Set<string>(), bad: string[] = [], missing: string[] = [];
  const stack = [...seeds];
  while (stack.length) {
    const f = stack.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    const rel = path.relative(repo, f);
    if (!isCopied(rel)) missing.push(rel);
    for (const s of importsOf(f)) {
      if (s.startsWith("@/") || s === "next" || s.startsWith("next/")) bad.push(`${rel} -> ${s}`);
      if (s.startsWith(".")) { const r = resolveTs(f, s); if (r && r.startsWith(path.join(repo, "src"))) stack.push(r); }
    }
  }
  it("has a non-trivial closure", () => expect(seen.size).toBeGreaterThan(20));
  it("every transitively imported src/ file is COPY'd", () => expect(missing).toEqual([]));
  it("shared closure has no @/ alias or next imports", () => expect(bad).toEqual([]));
  it("product-intel + customer-intel are in the closure", () => {
    const rels = [...seen].map((f) => path.relative(repo, f));
    expect(rels.some((r) => r.startsWith("src/lib/product-intel/"))).toBe(true);
    expect(rels.some((r) => r.startsWith("src/lib/customer-intel/"))).toBe(true);
  });
});
