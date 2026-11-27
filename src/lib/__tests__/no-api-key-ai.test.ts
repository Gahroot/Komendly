// Guard: growth/ops/revenue AI must run on the owner's Codex subscription (AI gateway), never a pay-per-token API key.
// See docs/ops/ai-policy.md. To add an exception, add the file to ALLOW with a reason.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const DIRS = ["ads", "growth", "revenue", "offer-intel", "ops", "exec", "product-intel", "customer-intel", "optimizer", "revenue-lifecycle"].map((d) => `src/lib/${d}`)
  .concat(["inbound", "cron", "admin"].map((d) => `src/app/api/${d}`));
/** Explicit exceptions (path -> reason). Testimonials product: out of the growth/ops scope. */
const ALLOW: Record<string, string> = {
  "src/lib/fal-lipsync/tts-generator.ts": "OpenAI TTS (testimonials product): no Codex equivalent; outside the guarded dirs, listed for documentation",
  "src/lib/openai-script.ts": "testimonials product script writer; outside the guarded dirs, listed for documentation",
  "src/app/api/mirage/generate/route.ts": "testimonials product; outside the guarded dirs, listed for documentation",
};

function walk(dir: string, out: string[] = []): string[] {
  let names: string[] = [];
  try { names = readdirSync(join(ROOT, dir)); } catch { return out; }
  for (const n of names) {
    const rel = `${dir}/${n}`;
    if (statSync(join(ROOT, rel)).isDirectory()) { if (n !== "node_modules") walk(rel, out); }
    else if (/\.(ts|tsx|mjs|js)$/.test(n)) out.push(rel);
  }
  return out;
}

describe("no pay-per-token AI in growth/ops code", () => {
  it("no api.openai.com or OPENAI_API_KEY in guarded dirs (tests excluded)", () => {
    const bad = DIRS.flatMap((d) => walk(d))
      .filter((f) => !f.includes("/__tests__/") && !/\.test\.tsx?$/.test(f) && !(f in ALLOW))
      .filter((f) => { const t = readFileSync(join(ROOT, f), "utf8"); return t.includes("api.openai.com") || t.includes("OPENAI_API_KEY"); });
    expect(bad).toEqual([]);
  });
  it("allow-list entries still exist and have reasons", () => {
    for (const [f, why] of Object.entries(ALLOW)) { expect(why.length).toBeGreaterThan(10); expect(() => statSync(join(ROOT, f))).not.toThrow(); }
  });
});
