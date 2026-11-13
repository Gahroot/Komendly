import { Api, ApiError } from "./client.js";
import { pollUntil, type PollOptions } from "./poll.js";

/** Shapes returned by the Komendly routes (only the fields the CLI uses). */
export interface SessionSummary {
  id: string;
  title: string;
  status: string;
  freeVideo: boolean;
  lastActivityAt: string;
  archived: boolean;
}
export interface RenderView {
  id: string;
  version: number;
  ratio: string;
  seconds: number;
  watermarked: boolean;
  messageId: string | null;
  posterKey: string | null;
  createdAt: string;
}
export interface ThreadMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  status: string;
  renderIds: string[];
  error: string | null;
}
export interface StudioThread {
  session: SessionSummary;
  messages: ThreadMessage[];
  renders: RenderView[];
}
export interface StudioAccount {
  balance: number;
  paid: boolean;
  plan: string;
  freeVideosLeft: number;
}
export interface AdAssetView {
  id: string;
  ratio: string;
  mime: string;
  previewUrl: string;
  downloadUrl: string;
}
export interface AdView {
  id: string;
  index: number;
  kind: "static" | "motion";
  headline: string;
  status: string;
  assets: AdAssetView[];
  locked?: boolean;
}
export interface RunView {
  id: string;
  url: string;
  status: string;
  isTrial: boolean;
  staticCount: number;
  motionCount: number;
  error: string | null;
  ads: AdView[];
  bonusPending?: boolean;
}
export interface RunSummary {
  id: string;
  url: string;
  status: string;
  isTrial: boolean;
  createdAt: string;
  readyCount: number;
  totalCount: number;
}

export const BUSY_SESSION = new Set(["queued", "working"]);
export const RUN_DONE = new Set(["completed", "partial", "failed", "canceled"]);

export function renderUrl(baseUrl: string, renderId: string, kind: "video" | "poster"): string {
  return `${baseUrl}/api/studio/media?render=${encodeURIComponent(renderId)}&kind=${kind}`;
}

export interface VideoResult {
  session_id: string;
  title: string;
  status: string;
  reply: string | null;
  error: string | null;
  video: { render_id: string; url: string; poster_url: string | null; seconds: number; ratio: string; watermarked: boolean } | null;
  renders: Array<{ render_id: string; version: number; ratio: string; seconds: number; url: string }>;
  view_url: string;
  timed_out?: boolean;
  files?: string[];
}

export function summarizeThread(baseUrl: string, thread: StudioThread): VideoResult {
  const lastAssistant = [...thread.messages].reverse().find((m) => m.role === "assistant");
  const renders = [...thread.renders].sort((a, b) => a.version - b.version);
  const fromTurn = lastAssistant ? renders.filter((r) => r.messageId === lastAssistant.id || lastAssistant.renderIds.includes(r.id)) : [];
  const latest = fromTurn.at(-1) ?? null;
  return {
    session_id: thread.session.id,
    title: thread.session.title,
    status: thread.session.status,
    reply: lastAssistant?.content ? lastAssistant.content : null,
    error: lastAssistant?.status === "error" ? (lastAssistant.error ?? "Ozzy hit a problem on that one. Try again.") : null,
    video: latest
      ? {
          render_id: latest.id,
          url: renderUrl(baseUrl, latest.id, "video"),
          poster_url: latest.posterKey ? renderUrl(baseUrl, latest.id, "poster") : null,
          seconds: latest.seconds,
          ratio: latest.ratio,
          watermarked: latest.watermarked,
        }
      : null,
    renders: renders.map((r) => ({ render_id: r.id, version: r.version, ratio: r.ratio, seconds: r.seconds, url: renderUrl(baseUrl, r.id, "video") })),
    view_url: `${baseUrl}/studio/${thread.session.id}`,
  };
}

export async function getThread(api: Api, sessionId: string): Promise<StudioThread> {
  return api.json<StudioThread>("GET", `/api/studio/sessions/${encodeURIComponent(sessionId)}`);
}

export async function createSession(api: Api, prompt: string): Promise<SessionSummary> {
  const res = await api.json<{ session: SessionSummary }>("POST", "/api/studio/sessions", { prompt });
  return res.session;
}

/** "Remix any ad": a new session that rebuilds the ad at `url` (or an uploaded recording) for the user's brand. */
export async function startRemix(api: Api, body: { url?: string; uploadId?: string; notes?: string; aspect?: string }): Promise<SessionSummary> {
  const res = await api.json<{ session: SessionSummary }>("POST", "/api/studio/remix", body);
  return res.session;
}

export async function sendMessage(api: Api, sessionId: string, content: string, uploadIds: string[]): Promise<void> {
  await api.json("POST", `/api/studio/sessions/${encodeURIComponent(sessionId)}/messages`, { content, uploadIds });
}

export async function waitForSession(api: Api, sessionId: string, poll: Omit<PollOptions, "onTick">, log: (line: string) => void): Promise<{ thread: StudioThread; timedOut: boolean }> {
  let lastStatus = "";
  const { value, timedOut } = await pollUntil(
    () => getThread(api, sessionId),
    (t) => !BUSY_SESSION.has(t.session.status),
    {
      ...poll,
      onTick: (v, attempt) => {
        const t = v as StudioThread;
        if (t.session.status !== lastStatus || attempt % 5 === 0) log(`Ozzy is ${t.session.status === "queued" ? "getting ready" : t.session.status === "working" ? "working" : t.session.status}…`);
        lastStatus = t.session.status;
      },
    },
  );
  return { thread: value, timedOut };
}

export interface RunResult {
  run_id: string;
  website: string;
  status: string;
  is_trial: boolean;
  error: string | null;
  progress: { ready: number; total: number };
  ads: Array<{ ad_id: string; kind: "static" | "motion"; headline: string; status: string; locked: boolean; assets: Array<{ asset_id: string; ratio: string; mime: string; url: string }> }>;
  view_url: string;
  timed_out?: boolean;
  files?: string[];
}

export function summarizeRun(baseUrl: string, run: RunView): RunResult {
  const abs = (u: string) => (u.startsWith("http") ? u : `${baseUrl}${u}`);
  return {
    run_id: run.id,
    website: run.url,
    status: run.status,
    is_trial: run.isTrial,
    error: run.error,
    progress: { ready: run.ads.filter((a) => a.status === "ready").length, total: Math.max(run.staticCount + run.motionCount, run.ads.length) },
    ads: run.ads.map((a) => ({
      ad_id: a.id,
      kind: a.kind,
      headline: a.headline,
      status: a.status,
      locked: a.locked === true,
      assets: a.assets.map((s) => ({ asset_id: s.id, ratio: s.ratio, mime: s.mime, url: abs(s.downloadUrl) })),
    })),
    view_url: `${baseUrl}/ads/runs/${run.id}`,
  };
}

export async function getRun(api: Api, runId: string): Promise<RunView> {
  return api.json<RunView>("GET", `/api/ads/runs/${encodeURIComponent(runId)}`);
}

/** Wait for a pack; the brand check step (awaiting_confirm) is accepted as-is, like pressing "Looks good". */
export async function waitForRun(api: Api, runId: string, poll: Omit<PollOptions, "onTick">, log: (line: string) => void): Promise<{ run: RunView; timedOut: boolean }> {
  let confirmed = false;
  let lastLine = "";
  const { value, timedOut } = await pollUntil(
    async () => {
      const run = await getRun(api, runId);
      if (run.status === "awaiting_confirm" && !confirmed) {
        confirmed = true;
        log("Brand details found. Confirming them so Ozzy can start designing…");
        try {
          await api.json("POST", `/api/ads/runs/${encodeURIComponent(runId)}/confirm`, { corrections: {} });
        } catch (error) {
          if (error instanceof ApiError && error.status === 402) throw error;
          log(`Couldn't confirm automatically (${error instanceof Error ? error.message : "error"}); Ozzy confirms on his own shortly.`);
        }
      }
      return run;
    },
    (run) => RUN_DONE.has(run.status) && run.bonusPending !== true,
    {
      ...poll,
      onTick: (v) => {
        const r = v as RunView;
        const ready = r.ads.filter((a) => a.status === "ready").length;
        const line = `Pack ${r.status.replace(/_/g, " ")}: ${ready}/${Math.max(r.staticCount + r.motionCount, r.ads.length)} ads ready`;
        if (line !== lastLine) log(line);
        lastLine = line;
      },
    },
  );
  return { run: value, timedOut };
}
