// Side-by-side extraction quality check: one crawl, old (v1) vs current llmExtract.
// Usage: cd engine && set -a; . ../.env.local; set +a; CODEX_AUTH_FILE=... npx tsx scripts/extract-compare.ts url1 url2
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { crawlSite } from "../src/jobs/extract/crawl";
import { llmExtract } from "../src/jobs/extract/llm";
import { createProvider } from "../src/providers";
import { loadConfig } from "../src/config";
import type { UsageMeter } from "../src/providers/types";
import { llmExtractV1 } from "./legacy/extract-llm-v1";

const OUT = process.env.EXTRACT_COMPARE_OUT ?? path.join(os.homedir(), ".ezcoder/goals/website2ads/quality/extract");
async function main(): Promise<void> {
const provider = createProvider(loadConfig().aiProvider);
await mkdir(OUT, { recursive: true });
for (const url of process.argv.slice(2)) {
  const crawl = await crawlSite(url);
  const time = async <T>(f: () => Promise<T>) => {
    const t = Date.now();
    const r = await f();
    return { ms: Date.now() - t, r };
  };
  const u1: UsageMeter[] = [];
  const u2: UsageMeter[] = [];
  // Sequential so the shared limiter doesn't skew either timing.
  const v1 = await time(() => llmExtractV1(provider, crawl, { goal: "auto" }, u1));
  const v2 = await time(() => llmExtract(provider, crawl, { goal: "auto" }, u2));
  const host = new URL(url).hostname;
  await writeFile(path.join(OUT, `${host}.json`), JSON.stringify({ url, before: { llmMs: v1.ms, ...v1.r }, after: { llmMs: v2.ms, ...v2.r } }, null, 2));
  console.log(host, "before", v1.ms, u1.map((u) => u.latencyMs), "after", v2.ms, u2.map((u) => [u.latencyMs, u.outputTokens]));
}
}
void main();
