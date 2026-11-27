// Packages imported by shared src/ files (copied into the image) must be dependencies of the engine itself, because
// /app/node_modules is the engine's node_modules (CLAUDE.md gotcha).
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { builtinModules } from "node:module";
import { describe, expect, it } from "vitest";

const engineRoot = path.resolve(import.meta.dirname, "..");
const repo = path.resolve(engineRoot, "..");
const pkg = JSON.parse(readFileSync(path.join(engineRoot, "package.json"), "utf8")) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
const deps = new Set([...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})]);
const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => { const p = path.join(dir, f); if (f === "node_modules") return []; return statSync(p).isDirectory() ? files(p) : p.endsWith(".ts") ? [p] : []; });
const specs = (f: string) => [...readFileSync(f, "utf8").matchAll(/^\s*(?:import|export)\b[^;"]*?\bfrom "([^"]+)"/gm)].map((m) => m[1] ?? "");
const bare = (f: string) => specs(f).filter((s) => /^(@[a-z0-9-]+\/)?[a-z0-9][\w.-]*(\/|$)/.test(s) && !s.startsWith("node:") && !builtinModules.includes(s.split("/")[0] ?? ""));
const resolveTs = (from: string, spec: string): string | null => { const b = path.resolve(path.dirname(from), spec); for (const c of [b + ".ts", path.join(b, "index.ts")]) if (existsSync(c)) return c; return null; };
const pkgName = (s: string) => (s.startsWith("@") ? s.split("/").slice(0, 2).join("/") : s.split("/")[0] ?? "");
describe("engine image packages", () => {
  it("every bare package imported by engine/src or a COPY'd shared file is in engine/package.json", () => {
    // closure: engine/src plus every shared src/ file reachable through relative imports
    const targets = new Set(files(path.join(engineRoot, "src")));
    const stack = [...targets];
    while (stack.length) {
      const f = stack.pop()!;
      for (const sp of specs(f)) if (sp.startsWith(".")) { const r = resolveTs(f, sp); if (r && !targets.has(r)) { targets.add(r); stack.push(r); } }
    }
    const missing = new Set<string>();
    for (const f of targets) for (const s of bare(f)) if (!deps.has(pkgName(s))) missing.add(`${pkgName(s)} (${path.relative(repo, f)})`);
    expect([...missing]).toEqual([]);
  });
});
