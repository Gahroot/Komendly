// Benchmark: runs the full pipeline in-process against the dev DB/bucket on N public sites.
// Usage: set -a; . ../.env.local; set +a; CODEX_AUTH_FILE=~/.ezcoder/auth.json \
//   npx tsx scripts/benchmark.ts [--workspace id] [--sites url1,url2] [--n 5] [--timeout-min 15] [--batch 3|all] [--drain-min 2]
// Runs are auto-confirmed immediately after extraction (no 30s user wait), so
// "from submit" = extract + plan + render + qc with zero review time.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { loadConfig } from "../src/config";
import { createDb } from "../src/db";
import { createProvider } from "../src/providers/index";
import { CodexAuth } from "../src/providers/codex-auth";
import type { AIProvider } from "../src/providers/types";
import { Runner } from "../src/runner";
import { reapOrphans } from "../src/queue/reaper";
import { createStorage } from "../src/storage/s3";

const DEFAULT_SITES = [
  { url: "https://plausible.io", kind: "SaaS" },
  { url: "https://www.allbirds.com", kind: "ecommerce" },
  { url: "https://www.mrrooter.com", kind: "local service" },
  { url: "https://www.kopywritingkourse.com", kind: "info product" },
  { url: "https://www.headspace.com", kind: "mobile app" },
];
const OUT_DIR = arg("out") ?? "/Users/groot/.ezcoder/goals/website2ads/benchmark";

function arg(name: string): string | undefined {
  // (hoisted function: OUT_DIR above uses it)
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const sites = arg("sites")?.split(",").map((x) => ({ url: x.split("=")[0] ?? x, kind: x.split("=")[1] ?? "custom" })) ?? DEFAULT_SITES.slice(0, Number(arg("n") ?? 5));
const timeoutMs = Number(arg("timeout-min") ?? 25) * 60_000;
/** On timeout, in-flight jobs get this long to finish before they are aborted (released for retry). */
const drainMs = Number(arg("drain-min") ?? 2) * 60_000;

const meter: Meter = { text: {}, image: {}, errors: 0 };
const db = createDb();
const config = { ...loadConfig(), workerId: `worker:benchmark:${process.pid}`, }; // concurrency etc. from the engine defaults / env (was hard-coded to 6 here)
const runner = new Runner({
  db,
  storage: createStorage(),
  provider: meteredProvider(createProvider(config.aiProvider), meter),
  config,
  launchBrowser: () => chromium.launch({ args: ["--force-color-profile=srgb", "--font-render-hinting=none"] }),
});

const usageBefore = config.aiProvider === "codex" ? await codexUsage() : null;
const batchStarted = Date.now();
const email = "engine-benchmark@komendly.test";
const user = (await db.user.findUnique({ where: { email } })) ?? (await db.user.create({ data: { email, passwordHash: "benchmark-not-a-login" } }));
// --workspace <id>: reuse an earlier benchmark workspace (tests brand memory: "month 2" for the same sites).
const wsArg = arg("workspace");
const ws = wsArg
  ? await db.adsWorkspace.findUniqueOrThrow({ where: { id: wsArg } })
  : await db.adsWorkspace.create({ data: { name: `benchmark ${new Date().toISOString()}`, ownerId: user.id } });

await runner.start();
if (!runner.providerHealthy) {
  console.error("provider not healthy:", runner.status());
  await runner.stop(1000);
  process.exit(1);
}

const batchArg = arg("batch") ?? "3";
const batch = batchArg === "all" ? sites.length : Math.max(1, Number(batchArg) || 3);
const runs: Array<{ url: string; kind: string; id: string }> = [];
const startRun = async (s: { url: string; kind: string }) => {
  const run = await db.adRun.create({
    data: { workspaceId: ws.id, userId: user.id, url: s.url, isTrial: true, status: "extracting", ratios: ["4:5"], staticCount: 10, motionCount: 1, creditsReserved: 15 },
  });
  await db.adJob.create({ data: { type: "extract", runId: run.id, workspaceId: ws.id, priority: 50 } });
  runs.push({ ...s, id: run.id });
};
const pending = [...sites];
console.log(`benchmark workspace ${ws.id}, ${sites.length} sites, ${batch === sites.length ? "all" : batch} at a time`);

const TERMINAL = ["completed", "partial", "failed", "canceled"];
const deadline = Date.now() + timeoutMs;
let timedOut = false;
for (;;) {
  let rows = await db.adRun.findMany({ where: { id: { in: runs.map((r) => r.id) } }, select: { id: true, status: true, confirmDeadline: true } });
  while (pending.length && rows.filter((r) => !TERMINAL.includes(r.status)).length + (runs.length - rows.length) < batch) {
    const next = pending.shift();
    if (next) await startRun(next);
    rows = await db.adRun.findMany({ where: { id: { in: runs.map((r) => r.id) } }, select: { id: true, status: true, confirmDeadline: true } });
  }
  // Auto-confirm right away (sweeper picks it up within ~2s).
  for (const r of rows) {
    if (r.status === "awaiting_confirm" && r.confirmDeadline && r.confirmDeadline.getTime() > Date.now()) {
      await db.adRun.update({ where: { id: r.id }, data: { confirmDeadline: new Date(Date.now() - 1) } });
    }
  }
  const done = rows.filter((r) => TERMINAL.includes(r.status)).length;
  process.stdout.write(`\r${done}/${runs.length} done ${rows.map((r) => r.status).join(",")}   `);
  if (done === runs.length && pending.length === 0) break;
  if (Date.now() > deadline) {
    timedOut = true;
    break;
  }
  await new Promise((r) => setTimeout(r, 5000));
}
console.log();
const neverStarted = pending.map((p) => p.url);
if (timedOut) {
  // Graceful drain: stop claiming, let running jobs finish (up to drainMs), then abort the rest.
  console.log(`timeout after ${timeoutMs / 60_000} min: draining in-flight jobs for up to ${drainMs / 1000}s`);
}
await runner.stop(timedOut ? drainMs : 5_000);

const sec = (ms: number | null | undefined) => (ms == null ? null : Math.round(ms / 100) / 10);
const results = [];
for (const r of runs) {
  const run = await db.adRun.findUniqueOrThrow({ where: { id: r.id }, include: { ads: { include: { assets: true } }, jobs: true } });
  const stage = (type: string) => {
    const js = run.jobs.filter((j) => j.type === type && j.status === "succeeded");
    const d = js.map((j) => j.durationMs ?? 0);
    return {
      n: js.length,
      avgSec: d.length ? sec(d.reduce((a, b) => a + b, 0) / d.length) : null,
      maxSec: d.length ? sec(Math.max(...d)) : null,
      costMicros: js.reduce((a, j) => a + Number(j.costMicros), 0),
    };
  };
  const isReplaced = (a: { qcReport: unknown }) => Boolean((a.qcReport as { replacedBy?: unknown } | null)?.replacedBy);
  const replaced = run.ads.filter(isReplaced).length;
  run.ads = run.ads.filter((a) => !isReplaced(a));
  const statics = run.ads.filter((a) => a.kind === "static");
  const ready = run.ads.filter((a) => a.status === "ready");
  const qcFirstPass = run.ads.filter((a) => a.status === "ready" && a.qcAttempts === 0 && !(a.visualBrief as { replaces?: string } | null)?.replaces).length;
  const extractJob = run.jobs.find((j) => j.type === "extract" && j.status === "succeeded");
  const totalCost = run.jobs.reduce((a, j) => a + Number(j.costMicros), 0);
  const unfinished = !TERMINAL.includes(run.status);
  results.push({
    site: r.url,
    unfinished,
    unfinishedAt: unfinished ? { status: run.status, openJobs: run.jobs.filter((j) => ["queued", "running", "failed"].includes(j.status)).map((j) => j.type) } : null,
    kind: r.kind,
    runId: r.id,
    status: run.status,
    error: run.error,
    ads: run.ads.length,
    ready: ready.length,
    readyStatic: statics.filter((a) => a.status === "ready").length,
    readyMotion: run.ads.filter((a) => a.kind === "motion" && a.status === "ready").length,
    replaced,
    qcPassRate: run.ads.length ? Math.round((ready.length / run.ads.length) * 100) / 100 : 0,
    qcFirstPassRate: run.ads.length ? Math.round((qcFirstPass / run.ads.length) * 100) / 100 : 0,
    templates: [...new Set(statics.map((a) => (a.visualBrief as { layout?: string } | null)?.layout))].length,
    adsWithAssets: statics.filter((a) => ((a.visualBrief as { assetKeys?: string[] } | null)?.assetKeys ?? []).length > 0).length,
    timeToFirstAdFromConfirmSec: run.firstAdAt && run.confirmedAt ? sec(run.firstAdAt.getTime() - run.confirmedAt.getTime()) : null,
    timeToFirstAdFromSubmitSec: run.firstAdAt ? sec(run.firstAdAt.getTime() - run.createdAt.getTime()) : null,
    totalSec: run.completedAt ? sec(run.completedAt.getTime() - run.createdAt.getTime()) : null,
    extractResult: extractJob?.result ?? null,
    stages: { extract: stage("extract"), plan: stage("plan"), render_static: stage("render_static"), render_motion: stage("render_motion"), qc: stage("qc") },
    runCostMicros: Number(run.costMicros),
    jobsCostMicros: totalCost,
    costPerReadyAdUsd: ready.length ? Math.round(totalCost / ready.length) / 1e6 : null,
    failures: [
      ...run.jobs.filter((j) => j.status === "dead" || (j.status === "failed" && j.lastError)).map((j) => `${j.type}: ${j.lastError?.slice(0, 200)}`),
      ...run.ads.filter((a) => a.status !== "ready").map((a) => {
        const rep = a.qcReport as { checks?: Array<{ name: string; pass: boolean }> } | null;
        return `ad ${a.index} ${a.kind} ${a.status}: ${(rep?.checks ?? []).filter((c) => !c.pass).map((c) => c.name).join(", ")}`;
      }),
    ],
  });
}
// Never leave work behind: unfinished runs of this benchmark are finalized and their open jobs canceled,
// so they can't hold worker slots in the next benchmark (they did: 16-19 of 20 slots at 21:26-21:30).
const reaped = await reapOrphans(db, { now: new Date(), maxRunAgeHours: 0.0001, stuckRunHours: 0.0001, onlyWorkspaceIds: [ws.id] });
if (reaped.canceledJobs || reaped.finalizedRuns) console.log("cleaned up leftovers", reaped);
await db.$disconnect();
const usageAfter = config.aiProvider === "codex" ? await codexUsage() : null;

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
await mkdir(OUT_DIR, { recursive: true });
const unfinishedRows = results.filter((r) => r.unfinished);
await writeFile(
  path.join(OUT_DIR, `benchmark-${stamp}.json`),
  JSON.stringify(results.concat(neverStarted.map((url) => ({ site: url, status: "never_started", unfinished: true }) as never)), null, 2),
);
const md = [
  `# Website2ads engine benchmark ${new Date().toISOString()}`,
  "",
  `Provider: ${config.aiProvider}; concurrency ${config.concurrency}; sites run in parallel; auto-confirm immediately; trial (10 static 1:1 + 1 motion).`,
  "",
  "| site | status | static ready | motion ready | replaced | ready/ads | QC pass (1st try) | templates | asset ads | extract s | plan s | render avg s | qc avg s | first ad from confirm s | from submit s | total s | cost/run $ | cost/ready ad $ |",
  "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|",
  ...results.map(
    (r) =>
      `| ${r.site} (${r.kind}) | ${r.status} | ${r.readyStatic}/10 | ${r.readyMotion}/1 | ${r.replaced} | ${r.ready}/${r.ads} | ${r.qcPassRate} (${r.qcFirstPassRate}) | ${r.templates} | ${r.adsWithAssets} | ${r.stages.extract.avgSec} | ${r.stages.plan.avgSec} | ${r.stages.render_static.avgSec} | ${r.stages.qc.avgSec} | ${r.timeToFirstAdFromConfirmSec} | ${r.timeToFirstAdFromSubmitSec} | ${r.totalSec} | ${r.jobsCostMicros / 1e6} | ${r.costPerReadyAdUsd} |`,
  ),
  "",
  ...(timedOut || neverStarted.length || unfinishedRows.length
    ? [
        `## Unfinished (${timedOut ? `timed out after ${timeoutMs / 60_000} min + ${drainMs / 1000}s drain` : "not terminal"})`,
        ...unfinishedRows.map((r) => `- ${r.site}: still ${r.unfinishedAt?.status}; open jobs: ${r.unfinishedAt?.openJobs.join(", ") || "none"}`),
        ...neverStarted.map((u) => `- ${u}: never started (no batch slot before the timeout)`),
        "",
      ]
    : []),
  "## Failures",
  ...results.flatMap((r) => [`### ${r.site}`, ...(r.failures.length ? r.failures.map((f) => `- ${f}`) : ["- none"])]),
  "",
  "Costs are API list-price equivalents (src/providers/cost.ts); on the Codex subscription the marginal cost is the plan's flat fee.",
].join("\n");
await writeFile(path.join(OUT_DIR, `benchmark-${stamp}.md`), md);
if (arg("out")) {
  // Per-run folder: results.json + every ready ad (PNGs, motion.mp4) + per-site contact sheet.
  const runDir = path.join(OUT_DIR, `run-${stamp}`);
  await mkdir(runDir, { recursive: true });
  const { execFileSync } = await import("node:child_process");
  if (runs.length) {
    try {
      execFileSync("npx", ["tsx", "scripts/export-examples.ts", ...runs.map((r) => r.id)], { env: { ...process.env, EXAMPLES_DIR: runDir }, stdio: "inherit" });
    } catch (e) {
      console.error("export failed", e);
    }
  }
  await writeFile(
    path.join(runDir, "results.json"),
    JSON.stringify(
      {
        startedAt: new Date(batchStarted).toISOString(),
        wallSec: sec(Date.now() - batchStarted),
        provider: config.aiProvider,
        textModel: process.env.CODEX_TEXT_MODEL ?? "gpt-6.1-sol",
        motionAgentModel: process.env.EZMOTION_AGENT_MODEL ?? "gpt-6.1-sol",
        batch,
        codexUsage: { before: usageBefore, after: usageAfter },
        calls: { ...meter, motionJobs: results.reduce((a, r) => a + r.stages.render_motion.n, 0) },
        sites: results.concat(neverStarted.map((url) => ({ site: url, status: "never_started", unfinished: true }) as never)),
      },
      null,
      2,
    ),
  );
  console.log("results in", runDir);
}
console.log(md);
process.exit(0);

// --- instrumentation (hoisted) ---
/** Provider call totals for this process (text by model, images by quality); motion-agent child calls are not seen here, only via job costMicros. */
type Meter = { text: Record<string, { calls: number; inputTokens: number; outputTokens: number; costMicros: number }>; image: Record<string, { calls: number; references: number; costMicros: number }>; errors: number };
function meteredProvider(base: AIProvider, meter: Meter): AIProvider {
  const model = process.env.CODEX_TEXT_MODEL ?? "gpt-6.1-sol";
  const p = Object.create(base) as AIProvider;
  p.text = async (req) => {
    try {
      const r = await base.text(req);
      const t = (meter.text[model] ??= { calls: 0, inputTokens: 0, outputTokens: 0, costMicros: 0 });
      t.calls++;
      t.inputTokens += r.usage.inputTokens ?? 0;
      t.outputTokens += r.usage.outputTokens ?? 0;
      t.costMicros += r.usage.costMicros;
      return r;
    } catch (e) {
      meter.errors++;
      throw e;
    }
  };
  p.image = async (req) => {
    try {
      const r = await base.image(req);
      const k = `gpt-image-2:${req.quality ?? "auto"}`;
      const t = (meter.image[k] ??= { calls: 0, references: 0, costMicros: 0 });
      t.calls++;
      t.references += req.references?.length ?? 0;
      t.costMicros += r.usage.costMicros;
      return r;
    } catch (e) {
      meter.errors++;
      throw e;
    }
  };
  return p;
}

/** ChatGPT plan usage windows (same endpoint the codex CLI's /status uses). Never logs tokens. */
async function codexUsage(): Promise<unknown> {
  try {
    const { accessToken, accountId } = await CodexAuth.fromEnv(process.env).resolve();
    const claims = JSON.parse(Buffer.from(accessToken.split(".")[1] ?? "", "base64url").toString("utf8")) as Record<string, { chatgpt_plan_type?: string } | undefined>;
    const res = await fetch("https://chatgpt.com/backend-api/wham/usage", {
      headers: { authorization: `Bearer ${accessToken}`, ...(accountId ? { "chatgpt-account-id": accountId } : {}), "user-agent": "codex_cli_rs" },
      signal: AbortSignal.timeout(15_000),
    });
    const body = res.ok ? ((await res.json()) as Record<string, unknown>) : { status: res.status };
    for (const k of ["email", "user_id", "account_id"]) delete body[k];
    return { at: new Date().toISOString(), jwtPlan: claims["https://api.openai.com/auth"]?.chatgpt_plan_type ?? null, body };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
