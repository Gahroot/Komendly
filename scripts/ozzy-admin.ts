// Ozzy admin CLI: talk to the LIVE app as the admin account (sold@nolangrout.com) for edge-case tests and benchmarks.
//
//   npx tsx scripts/ozzy-admin.ts login               # creates a 30-day session in the prod DB (needs `vercel` CLI linked)
//   npx tsx scripts/ozzy-admin.ts logout              # deletes that session
//   npx tsx scripts/ozzy-admin.ts get /api/admin/stats [--raw]   # --raw: full body, no status line
//   npx tsx scripts/ozzy-admin.ts post /api/x '{"a":1}'
//   npx tsx scripts/ozzy-admin.ts studio "Make a 10s promo for acme.co" [--session <id>] [--json]
//   npx tsx scripts/ozzy-admin.ts bench prompts.txt  # one prompt per line, run one after another, timing table
//
// The token lives in ~/.config/komendly/admin.json (mode 600). Base URL: OZZY_BASE_URL or https://www.komendly.com.
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { parseEnv } from "node:util";

const CONF_DIR = join(homedir(), ".config", "komendly");
const CONF = join(CONF_DIR, "admin.json");
const ADMIN_EMAIL = process.env.OZZY_ADMIN_EMAIL || "sold@nolangrout.com";
type Conf = { base: string; token: string; email: string; expiresAt: string };

function loadConf(): Conf {
  if (!existsSync(CONF)) throw new Error("Not logged in. Run: npx tsx scripts/ozzy-admin.ts login");
  return JSON.parse(readFileSync(CONF, "utf8")) as Conf;
}

/** Prod DB URL straight from Vercel (never written anywhere but a temp file that is deleted at once). */
function prodDbUrl(): string {
  const tmp = join(tmpdir(), `ozzy-admin-${process.pid}.env`);
  try {
    execFileSync("vercel", ["env", "pull", tmp, "--environment=production", "--yes"], { stdio: "ignore" });
    const env = parseEnv(readFileSync(tmp, "utf8"));
    const url = env.POSTGRES_URL_NON_POOLING || env.DATABASE_URL;
    if (!url) throw new Error("No DATABASE_URL in the production env");
    return url;
  } finally {
    rmSync(tmp, { force: true });
  }
}

async function withProdDb<T>(fn: (db: import("@prisma/client").PrismaClient) => Promise<T>): Promise<T> {
  const { PrismaClient } = await import("@prisma/client");
  const db = new PrismaClient({ datasourceUrl: prodDbUrl() });
  try {
    return await fn(db);
  } finally {
    await db.$disconnect();
  }
}

async function login() {
  const base = process.env.OZZY_BASE_URL || "https://www.komendly.com";
  const conf = await withProdDb(async (db) => {
    const user = await db.user.findUnique({ where: { email: ADMIN_EMAIL }, select: { id: true, isAdmin: true } });
    if (!user?.isAdmin) throw new Error(`${ADMIN_EMAIL} is not an admin in prod`);
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 30 * 24 * 3600 * 1000);
    await db.session.create({ data: { userId: user.id, token, expiresAt } });
    return { base, token, email: ADMIN_EMAIL, expiresAt: expiresAt.toISOString() } satisfies Conf;
  });
  mkdirSync(CONF_DIR, { recursive: true, mode: 0o700 });
  writeFileSync(CONF, JSON.stringify(conf, null, 2), { mode: 0o600 });
  const me = await api("GET", "/api/auth/me");
  console.log(`Logged in as ${conf.email} on ${base} (until ${conf.expiresAt.slice(0, 10)}). /api/auth/me -> ${me.status}`);
}

async function logout() {
  const conf = loadConf();
  await withProdDb((db) => db.session.deleteMany({ where: { token: conf.token } }));
  rmSync(CONF, { force: true });
  console.log("Logged out (session deleted).");
}

async function api(method: string, path: string, body?: unknown): Promise<{ status: number; data: unknown; ms: number }> {
  const conf = loadConf();
  const t0 = Date.now();
  const res = await fetch(new URL(path, conf.base), {
    method,
    headers: { cookie: `session_token=${conf.token}`, ...(body !== undefined ? { "content-type": "application/json" } : {}), "user-agent": "ozzy-admin-cli" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  const text = await res.text();
  let data: unknown = text;
  try { data = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, data, ms: Date.now() - t0 };
}

type Thread = {
  messages: Array<{ id: string; role: string; status: string; content: string; error: string | null; renderIds: string[] }>;
  renders: Array<{ id: string; version: number; seconds: number; ratio: string; watermarked?: boolean }>;
  events: Array<{ messageId: string; type: string; data: Record<string, unknown> }>;
};

export type TurnResult = { sessionId: string; status: string; seconds: number; firstStepSec: number | null; renderSec: number | null; reply: string; renders: number; phases: string[]; error: string | null };

async function studioTurn(prompt: string, sessionId?: string, quiet = false): Promise<TurnResult> {
  const t0 = Date.now();
  let sid = sessionId;
  if (!sid) {
    const s = await api("POST", "/api/studio/sessions", { prompt });
    if (s.status !== 201) throw new Error(`create session ${s.status}: ${JSON.stringify(s.data)}`);
    sid = (s.data as { session: { id: string } }).session.id;
  }
  const m = await api("POST", `/api/studio/sessions/${sid}/messages`, { content: prompt });
  if (m.status >= 300) throw new Error(`send message ${m.status}: ${JSON.stringify(m.data)}`);
  const asstId = (m.data as { assistantMessage: { id: string } }).assistantMessage.id;
  if (!quiet) console.log(`session ${sid}  ${new URL(`/studio/${sid}`, loadConf().base)}`);
  let firstStep: number | null = null;
  let renderAt: number | null = null;
  const seen = new Set<string>();
  const phases: string[] = [];
  for (;;) {
    await new Promise((r) => setTimeout(r, 3_000));
    const t = await api("GET", `/api/studio/sessions/${sid}`);
    if (t.status !== 200) continue;
    const th = t.data as Thread;
    for (const e of th.events.filter((x) => x.messageId === asstId)) {
      const label = typeof e.data.label === "string" ? e.data.label : "";
      const key = `${e.type}:${label}`;
      if (e.type === "tool" && firstStep === null) firstStep = (Date.now() - t0) / 1000;
      if (e.type === "status" && e.data.phase === "rendering" && renderAt === null) renderAt = Date.now();
      if ((e.type === "status" || e.type === "tool" || e.type === "error") && !seen.has(key)) {
        seen.add(key);
        if (e.type === "status") phases.push(String(e.data.phase));
        if (!quiet) console.log(`  +${Math.round((Date.now() - t0) / 1000)}s ${e.type}: ${label || e.data.message || ""}`);
      }
    }
    const a = th.messages.find((x) => x.id === asstId);
    if (a && !["queued", "streaming"].includes(a.status)) {
      return {
        sessionId: sid, status: a.status, seconds: Math.round((Date.now() - t0) / 1000), firstStepSec: firstStep && Math.round(firstStep),
        renderSec: renderAt ? Math.round((Date.now() - renderAt) / 1000) : null, reply: a.content, renders: a.renderIds.length, phases, error: a.error,
      };
    }
  }
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const flag = (n: string) => { const i = rest.indexOf(n); if (i < 0) return undefined; const v = rest[i + 1]; rest.splice(i, 2); return v; };
  const json = rest.includes("--json") ? (rest.splice(rest.indexOf("--json"), 1), true) : false;
  switch (cmd) {
    case "login": return login();
    case "logout": return logout();
    case "get": case "post": case "patch": case "delete": {
      const raw = rest.includes("--raw") ? (rest.splice(rest.indexOf("--raw"), 1), true) : false;
      const r = await api(cmd.toUpperCase(), rest[0] ?? "/", rest[1] ? JSON.parse(rest[1]) : undefined);
      if (!raw) console.log(`${r.status} (${r.ms}ms)`);
      const body = typeof r.data === "string" ? r.data : JSON.stringify(r.data, null, 2);
      console.log(raw ? body : body.slice(0, 4000));
      return;
    }
    case "studio": {
      const session = flag("--session");
      const r = await studioTurn(rest.join(" "), session, json);
      console.log(json ? JSON.stringify(r) : `\n${r.status} in ${r.seconds}s (first step ${r.firstStepSec ?? "-"}s, render ${r.renderSec ?? "-"}s, videos ${r.renders})\nOzzy: ${r.reply}${r.error ? `\nerror: ${r.error}` : ""}`);
      return;
    }
    case "bench": {
      const prompts = readFileSync(rest[0], "utf8").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
      const rows: TurnResult[] = [];
      for (const p of prompts) {
        process.stdout.write(`- ${p.slice(0, 60)} ... `);
        const r = await studioTurn(p, undefined, true).catch((e: Error) => ({ sessionId: "-", status: "cli_error", seconds: 0, firstStepSec: null, renderSec: null, reply: e.message, renders: 0, phases: [], error: e.message }));
        rows.push(r);
        console.log(`${r.status} ${r.seconds}s videos=${r.renders}`);
      }
      const ok = rows.filter((r) => r.renders > 0);
      const secs = ok.map((r) => r.seconds).sort((a, b) => a - b);
      console.log(`\n${ok.length}/${rows.length} delivered a video; median ${secs[Math.floor(secs.length / 2)] ?? "-"}s, max ${secs.at(-1) ?? "-"}s`);
      const out = join(process.cwd(), `studio-bench-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
      writeFileSync(out, JSON.stringify(rows, null, 2));
      console.log(`details: ${out}`);
      return;
    }
    default:
      console.log(readFileSync(new URL(import.meta.url), "utf8").split("\n").filter((l) => l.startsWith("//")).join("\n"));
  }
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
