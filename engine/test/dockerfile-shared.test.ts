// Guards the Railway image: every shared web module the engine imports (../src/lib/...) must be COPY'd in
// engine/Dockerfile, or the engine crash-loops in production with ERR_MODULE_NOT_FOUND.
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    if (f === "node_modules") return [];
    return statSync(p).isDirectory() ? files(p) : p.endsWith(".ts") ? [p] : [];
  });
}

describe("engine Dockerfile", () => {
  it("copies every shared src/lib module the engine imports", () => {
    const docker = readFileSync(path.join(root, "Dockerfile"), "utf8");
    const copied = [...docker.matchAll(/^COPY (src\/lib\/\S+)/gm)].map((m) => m[1] ?? "");
    const imported = new Set<string>();
    for (const f of files(path.join(root, "src"))) {
      for (const m of readFileSync(f, "utf8").matchAll(/from "((?:\.\.\/)+src\/lib\/[^"]+)"/g)) {
        const abs = path.resolve(path.dirname(f), m[1] ?? "");
        imported.add(path.relative(path.resolve(root, ".."), abs) + ".ts");
      }
    }
    const missing = [...imported].filter((i) => !copied.some((c) => (c.endsWith("/") ? i.startsWith(c) : i === c)));
    expect(missing).toEqual([]);
  });
});
