import type { Db } from "../db";
import type { EngineConfig } from "../config";
import type { AIProvider, UsageMeter } from "../providers/types";
import type { Storage } from "../storage/s3";
import type { ClaimedJob } from "../queue/queue";

export interface JobContext {
  db: Db;
  storage: Storage;
  provider: AIProvider;
  config: EngineConfig;
  job: ClaimedJob;
  signal: AbortSignal;
  /** Every provider call's usage is pushed here; summed into AdJob.costMicros. */
  usage: UsageMeter[];
  now: () => Date;
  /** Per-worker shared resources (e.g. one render browser), owned by the runner. */
  shared: SharedResources;
}

export interface SharedResources {
  /** Lazily launched Chromium for static renders; closed on shutdown. */
  renderBrowser(): Promise<import("playwright").Browser>;
  /** Runs fn with a capped page slot; relaunches the browser and retries once if it crashed. */
  withRenderBrowser?<T>(fn: (b: import("playwright").Browser) => Promise<T>, signal?: AbortSignal): Promise<T>;
}

export type JobHandler = (ctx: JobContext) => Promise<unknown>;

/** A job that can't proceed and must not be retried (marks it dead immediately). */
export class PermanentJobError extends Error {}
