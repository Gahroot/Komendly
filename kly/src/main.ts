// Kly service entry: tick loop + /healthz + EngineHeartbeat "kly" (~30s) + graceful SIGTERM.
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import nodemailer from "nodemailer";
import type { Prisma } from "@prisma/client";
import { createKlyAI } from "./ai";
import { createDb, type Db } from "./db";
import { errMsg, log } from "./log";
import { newLoopState, startLoop, type LoopState } from "./loop";
import type { AlertFn } from "./imap";
import { outboundEnv } from "./sender";

export const HEARTBEAT_ID = "kly";
export const HEARTBEAT_MS = 30_000;

/** Reply alerts: SMTP_* -> ADS_ALERT_EMAIL; otherwise only logged. */
export function createAlert(env: NodeJS.ProcessEnv = process.env): AlertFn {
  const to = env.ADS_ALERT_EMAIL;
  if (!to || !env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) {
    return async (subject, text) => log("info", "kly alert (no SMTP configured)", { subject, text: text.slice(0, 2000) });
  }
  const port = Number(env.SMTP_PORT || 587);
  const t = nodemailer.createTransport({ host: env.SMTP_HOST, port, secure: port === 465, auth: { user: env.SMTP_USER, pass: env.SMTP_PASS } });
  return async (subject, text) => {
    await t.sendMail({ from: env.SMTP_FROM || env.SMTP_USER, to, subject, text });
  };
}

export function statusOf(state: LoopState, env: NodeJS.ProcessEnv, aiConfigured: boolean) {
  const cfg = outboundEnv(env);
  const outboundEnabled = cfg.enabled && !cfg.dryRun && cfg.mailboxes.length > 0 && !state.killSwitch;
  const phase = state.killSwitch
    ? `paused: ${state.killSwitch}`
    : cfg.mailboxes.length === 0
      ? "waiting for mailboxes"
      : cfg.dryRun
        ? "dry run"
        : !cfg.enabled
          ? "sending off (OUTBOUND_ENABLED != 1)"
          : state.lastStop
            ? `sending; new gifts paused: ${state.lastStop}`
            : "running";
  return {
    state: phase,
    outboundEnabled,
    mailboxes: cfg.mailboxes.length,
    mailboxError: cfg.mailboxError,
    dryRun: cfg.dryRun,
    aiConfigured,
    ticks: state.ticks,
    lastTickAt: state.lastTickAt?.toISOString() ?? null,
    lastTickMs: state.lastTickMs,
    dailyVolume: state.dailyVolume,
    codexWeeklyPct: state.codexPct,
    errors: state.errors,
  };
}

async function heartbeat(db: Db, status: ReturnType<typeof statusOf>, stopping: boolean): Promise<void> {
  const ok = !stopping && status.errors.length === 0;
  const message = stopping ? "stopping" : status.errors.length ? `${status.errors.length} step error(s): ${status.errors.map((e) => e.step).join(", ")}` : status.state;
  const meta = { ...status, stopping } as Prisma.InputJsonValue;
  await db.engineHeartbeat.upsert({ where: { id: HEARTBEAT_ID }, create: { id: HEARTBEAT_ID, kind: "worker", ok, message, meta }, update: { ok, message, meta } });
}

async function main(): Promise<void> {
  const env = process.env;
  const db = createDb();
  const ai = createKlyAI(db, env);
  if (!ai) log("warn", "kly: Codex login not configured; AI steps (qualify, judge, strategist) are skipped");
  const state = newLoopState();
  const loop = startLoop({ db, ai, alert: createAlert(env), env }, state);
  let stopping = false;
  const beat = () => heartbeat(db, statusOf(state, env, Boolean(ai)), stopping).catch((e: unknown) => log("warn", "kly heartbeat failed", { error: errMsg(e) }));
  const hb = setInterval(() => void beat(), HEARTBEAT_MS);
  void beat();
  const port = Number(env.PORT || 4200);
  const server = createServer((req, res) => {
    if (req.url === "/healthz" || req.url === "/") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, stopping, ...statusOf(state, env, Boolean(ai)) }));
      return;
    }
    res.writeHead(404).end();
  });
  server.listen(port, () => log("info", "kly listening", { port }));
  const shutdown = async (sig: string) => {
    if (stopping) return;
    stopping = true;
    log("info", "kly shutting down", { sig });
    clearInterval(hb);
    const force = setTimeout(() => process.exit(1), 60_000);
    force.unref();
    await loop.stop();
    await beat();
    server.close();
    await db.$disconnect();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e: unknown) => {
    log("error", "kly crashed", { error: errMsg(e) });
    process.exit(1);
  });
}
