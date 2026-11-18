// Growth system `industry_examples`: daily cycle writes "what works" + sample ads (fictional demo businesses)
// for a few industries per run with Codex (Sol), then pings IndexNow for the new/updated /ad-examples URLs.
// Kill switch sys_industry_examples; heartbeat every cycle (outputs = pages added/updated).
import { INDUSTRIES } from "../../../src/lib/ads/industries";
import { INDUSTRY_CONTENT, indexNowBody, industryCycleConfig, industryPrompt, pickIndustriesForCycle, validateIndustryContent } from "../../../src/lib/growth/industry-examples";
import { parseBeat, recordSystemRun, systemEnabled, systemHeartbeatId } from "../../../src/lib/growth/systems";
import type { ZodType } from "zod";
import type { Db } from "../db";
import { errMsg, log } from "../log";
import { createProvider } from "../providers/index";
import { structured } from "../providers/structured";
import type { AIProvider, UsageMeter } from "../providers/types";

const SITE = "https://www.komendly.com";

export async function pingIndexNow(urls: string[], fetchFn: typeof fetch = fetch): Promise<boolean> {
  if (!urls.length) return true;
  try {
    const r = await fetchFn("https://api.indexnow.org/indexnow", { method: "POST", headers: { "content-type": "application/json; charset=utf-8" }, body: JSON.stringify(indexNowBody(SITE, urls)) });
    return r.ok || r.status === 202;
  } catch {
    return false;
  }
}

/** One cycle: returns the number of industry pages written. Throws only on DB failure. */
export async function industryExamplesCycle(db: Db, provider: AIProvider, now: Date, env: NodeJS.ProcessEnv, model: string, fetchFn: typeof fetch = fetch): Promise<{ written: number; errors: string[] }> {
  const { perCycle, refreshDays } = industryCycleConfig(env);
  const existing = await db.industryExample.findMany({ select: { industry: true, generatedAt: true } });
  const slugs = pickIndustriesForCycle(INDUSTRIES.map((i) => i.slug), existing, perCycle, now, refreshDays);
  const written: string[] = [];
  const errors: string[] = [];
  for (const slug of slugs) {
    const i = INDUSTRIES.find((x) => x.slug === slug)!;
    try {
      const usage: UsageMeter[] = [];
      const { system, prompt } = industryPrompt(i);
      const out = await structured(provider, INDUSTRY_CONTENT as unknown as ZodType, { system, prompt, reasoning: "medium" }, usage);
      const v = validateIndustryContent(out);
      if (!v.ok) throw new Error(`content rejected: ${v.error}`);
      await db.industryExample.upsert({
        where: { industry: slug },
        create: { industry: slug, content: v.content as object, model, generatedAt: now },
        update: { content: v.content as object, model, generatedAt: now },
      });
      written.push(slug);
    } catch (e) {
      errors.push(`${slug}: ${errMsg(e)}`);
    }
  }
  if (written.length) {
    const urls = [...written.map((s) => `${SITE}/ad-examples/${s}`), `${SITE}/ad-examples`];
    if (await pingIndexNow(urls, fetchFn)) await db.industryExample.updateMany({ where: { industry: { in: written } }, data: { indexNowAt: now } });
  }
  return { written: written.length, errors };
}

/** Hourly check; runs a cycle when the last one is older than INDUSTRY_EXAMPLES_INTERVAL_HOURS (default 24). */
export function startIndustryExamplesLoop(opts: { db: Db; env?: NodeJS.ProcessEnv }): () => void {
  const env = opts.env ?? process.env;
  const model = env.INDUSTRY_EXAMPLES_MODEL || "gpt-6.2-sol";
  const intervalH = Number(env.INDUSTRY_EXAMPLES_INTERVAL_HOURS) > 0 ? Number(env.INDUSTRY_EXAMPLES_INTERVAL_HOURS) : 24;
  let provider: AIProvider | null = null;
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      if (!(await systemEnabled(opts.db, "industry_examples"))) return;
      const beat = parseBeat((await opts.db.engineHeartbeat.findUnique({ where: { id: systemHeartbeatId("industry_examples") } }))?.meta);
      const now = new Date();
      if (beat.lastRunAt && now.getTime() - new Date(beat.lastRunAt).getTime() < intervalH * 3_600_000) return;
      provider ??= createProvider("codex", { ...env, CODEX_TEXT_MODEL: model, TEXT_BRAIN: "codex" }, { db: opts.db, by: "engine" });
      try {
        const r = await industryExamplesCycle(opts.db, provider, now, env, model);
        const ok = r.errors.length === 0 || r.written > 0;
        if (r.errors.length) log("warn", "industry examples errors", { errors: r.errors });
        await recordSystemRun(opts.db, "industry_examples", { ok, outputs: r.written, error: ok ? null : r.errors.join("; ") });
        log("info", "industry examples cycle", { written: r.written });
      } catch (e) {
        await recordSystemRun(opts.db, "industry_examples", { ok: false, error: errMsg(e) });
      }
    } catch (e) {
      log("warn", "industry examples tick failed", { error: errMsg(e) });
    } finally {
      busy = false;
    }
  };
  const t = setInterval(() => void tick(), 60 * 60_000);
  const first = setTimeout(() => void tick(), 90_000);
  return () => { clearInterval(t); clearTimeout(first); };
}
