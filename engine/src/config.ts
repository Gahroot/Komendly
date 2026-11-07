// Engine configuration from env. Read once at boot and passed down explicitly.
import os from "node:os";

function int(name: string, def: number): number {
  const v = process.env[name];
  if (!v) return def;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`${name} must be a number`);
  return n;
}

export interface EngineConfig {
  port: number;
  workerId: string;
  concurrency: number;
  pollMs: number;
  staleLockMs: number;
  /** How often a worker refreshes lockedAt on its running jobs (must be well below staleLockMs). */
  leaseRenewMs: number;
  /** Worker slots reserved for run-start work (extract/plan). */
  startLaneSlots: number;
  heartbeatMs: number;
  aiProvider: "codex" | "openai";
  sharedSecret: string | undefined;
  scratchDir: string;
  assetTtlDays: number;
  cleanupEveryMs: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): EngineConfig {
  const provider = env.AI_PROVIDER ?? "codex";
  if (provider !== "codex" && provider !== "openai") throw new Error("AI_PROVIDER must be codex|openai");
  return {
    port: int("PORT", 4100),
    workerId: env.ENGINE_WORKER_ID ?? `worker:${os.hostname()}:${process.pid}`,
    concurrency: int("ENGINE_CONCURRENCY", 20),
    pollMs: int("ENGINE_POLL_MS", 1000),
    staleLockMs: int("ENGINE_STALE_LOCK_MS", 15 * 60_000),
    leaseRenewMs: int("ENGINE_LEASE_RENEW_MS", 30_000),
    startLaneSlots: int("ENGINE_START_LANE_SLOTS", 1),
    heartbeatMs: int("ENGINE_HEARTBEAT_MS", 30_000),
    aiProvider: provider,
    sharedSecret: env.ENGINE_SHARED_SECRET || undefined,
    scratchDir: env.ENGINE_SCRATCH_DIR ?? os.tmpdir(),
    assetTtlDays: int("ASSET_TTL_DAYS", 7),
    cleanupEveryMs: int("CLEANUP_EVERY_MS", 10 * 60_000),
  };
}
