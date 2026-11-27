// Every AdsEvent name the executive layer READS must be WRITTEN by some producer outside src/lib/exec (a reader of a name nobody writes
// silently sees "no data" forever: the original bug with `learning` and `reply_classified`). Source scan, no DB.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../../../..");
const walk = (dir: string, out: string[] = []): string[] => {
  for (const f of readdirSync(dir)) {
    if (f === "node_modules" || f === ".next" || f === "__tests__" || f.startsWith(".")) continue;
    const p = join(dir, f), st = statSync(p);
    if (st.isDirectory()) walk(p, out); else if (/\.(ts|tsx|mjs)$/.test(f) && !/\.test\./.test(f)) out.push(p);
  }
  return out;
};
const readers = ["src/lib/exec/gather.ts", "src/lib/exec/load.ts", "engine/src/exec/coordinate.ts", "engine/src/exec/strategy.ts"].map((f) => readFileSync(join(ROOT, f), "utf8")).join("\n");
const readNames = new Set<string>();
for (const m of readers.matchAll(/(?:\bev\(|count\(|name: )"([a-z][a-z0-9_]+)"/g)) readNames.add(m[1]!);
// names the executive layer itself owns (written by exec code), or that are written through a constant and are covered elsewhere
const OWN = new Set(["exec_objective", "exec_objective_status", "exec_override", "exec_dispatch", "exec_owner_item", "exec_approval", "exec_template_approved", "exec_coordinator_run", "build_request", "exec_evidence_task", "exec_performance", "exec_opportunity", "exec_risk", "brief_email"]);

describe("event names the exec layer reads have real writers", () => {
  const files = [...walk(join(ROOT, "src")), ...walk(join(ROOT, "engine/src")), ...walk(join(ROOT, "kly/src"))].filter((f) => !f.includes("/src/lib/exec/") && !f.includes("/engine/src/exec/"));
  const corpus = files.map((f) => readFileSync(f, "utf8")).join("\n");
  it("found the readers", () => expect(readNames.size).toBeGreaterThan(10));
  for (const name of [...readNames].filter((n) => !OWN.has(n)).sort()) {
    it(`"${name}" is written by a producer`, () => expect(corpus.includes(`"${name}"`) || corpus.includes(`'${name}'`) || corpus.includes(`\`${name}\``)).toBe(true));
  }
  it("the two names that had no writer are gone", () => { expect(readNames.has("learning")).toBe(false); expect(readNames.has("reply_classified")).toBe(false); });
});
