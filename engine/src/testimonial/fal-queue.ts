// Generic FAL queue client (submit -> poll status -> fetch result) + FAL CDN upload. REST only,
// no SDK, injectable fetch for tests. The key is read per call (FAL_API_KEY, or FAL_KEY).
import { sleep } from "../util/sleep";

export interface HttpDeps {
  fetchImpl?: typeof fetch;
  sleepImpl?: (ms: number, signal?: AbortSignal) => Promise<void>;
  now?: () => number;
  env?: NodeJS.ProcessEnv;
}

export function falKey(env: NodeJS.ProcessEnv = process.env): string {
  const k = env.FAL_API_KEY || env.FAL_KEY;
  if (!k) throw new Error("FAL_API_KEY is not set");
  return k;
}

/** Replace string leaves "{name}" with vars[name] (keeps the var's type); drops keys whose var is undefined. */
export function applyTemplate(t: unknown, vars: Record<string, unknown>): unknown {
  if (typeof t === "string") {
    const m = /^\{(\w+)\}$/.exec(t);
    return m?.[1] ? vars[m[1]] : t;
  }
  if (Array.isArray(t)) return t.map((x) => applyTemplate(x, vars));
  if (t && typeof t === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(t)) {
      const r = applyTemplate(v, vars);
      if (r !== undefined) out[k] = r;
    }
    return out;
  }
  return t;
}

export function getPath(o: unknown, path: string): unknown {
  let cur = o;
  for (const p of path.split(".")) {
    if (cur && typeof cur === "object") cur = (cur as Record<string, unknown>)[p];
    else return undefined;
  }
  return cur;
}

export interface FalSubmitted {
  requestId: string;
  statusUrl?: string;
  responseUrl?: string;
}

export interface FalRunResult {
  requestId: string;
  output: unknown;
}

const QUEUE = "https://queue.fal.run";

export async function falQueueRun(
  endpointId: string,
  input: unknown,
  o: {
    pollMs: number;
    timeoutMs: number;
    signal?: AbortSignal;
    /** Resume polling an already-submitted request instead of submitting (and paying) again. */
    resume?: FalSubmitted;
    /** Called right after a successful submit, before polling (persist it to survive restarts). */
    onSubmit?: (s: FalSubmitted) => Promise<void>;
  } & HttpDeps,
): Promise<FalRunResult> {
  const f = o.fetchImpl ?? fetch;
  const wait = o.sleepImpl ?? sleep;
  const now = o.now ?? Date.now;
  const headers = { Authorization: `Key ${falKey(o.env)}`, "Content-Type": "application/json" };
  // status/response URLs use the app id (first two path segments), not the full endpoint path.
  const app = endpointId.split("/").slice(0, 2).join("/");
  let sub: FalSubmitted;
  if (o.resume) {
    sub = o.resume;
  } else {
    const r = await f(`${QUEUE}/${endpointId}`, { method: "POST", headers, body: JSON.stringify(input), signal: o.signal });
    if (!r.ok) throw new Error(`FAL submit ${endpointId} failed: ${r.status} ${(await r.text()).slice(0, 300)}`);
    const j = (await r.json()) as { request_id?: string; status_url?: string; response_url?: string };
    if (!j.request_id) throw new Error("FAL submit returned no request_id");
    sub = { requestId: j.request_id, ...(j.status_url ? { statusUrl: j.status_url } : {}), ...(j.response_url ? { responseUrl: j.response_url } : {}) };
    await o.onSubmit?.(sub);
  }
  const s = { request_id: sub.requestId };
  const statusUrl = sub.statusUrl ?? `${QUEUE}/${app}/requests/${sub.requestId}/status`;
  const responseUrl = sub.responseUrl ?? `${QUEUE}/${app}/requests/${sub.requestId}`;
  const deadline = now() + o.timeoutMs;
  for (;;) {
    const st = await f(statusUrl, { headers, signal: o.signal });
    if (!st.ok) throw new Error(`FAL status failed: ${st.status}`);
    const body = (await st.json()) as { status?: string; error?: string };
    if (body.status === "COMPLETED") break;
    if (body.status === "FAILED" || body.status === "ERROR") throw new Error(`FAL request failed: ${body.error ?? body.status}`);
    if (now() > deadline) throw new Error(`FAL request ${s.request_id} timed out`);
    await wait(o.pollMs, o.signal);
  }
  const res = await f(responseUrl, { headers, signal: o.signal });
  if (!res.ok) throw new Error(`FAL result failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
  return { requestId: s.request_id, output: await res.json() };
}

/** Upload bytes to FAL CDN (same flow as @fal-ai/client storage.upload); returns the public URL. */
export async function falUpload(body: Buffer, contentType: string, fileName: string, o: HttpDeps & { signal?: AbortSignal } = {}): Promise<string> {
  const f = o.fetchImpl ?? fetch;
  const init = await f("https://rest.alpha.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3", {
    method: "POST",
    headers: { Authorization: `Key ${falKey(o.env)}`, "Content-Type": "application/json" },
    body: JSON.stringify({ content_type: contentType, file_name: fileName }),
    signal: o.signal,
  });
  if (!init.ok) throw new Error(`FAL upload initiate failed: ${init.status}`);
  const { upload_url, file_url } = (await init.json()) as { upload_url?: string; file_url?: string };
  if (!upload_url || !file_url) throw new Error("FAL upload initiate returned no URLs");
  const put = await f(upload_url, { method: "PUT", headers: { "Content-Type": contentType }, body: new Uint8Array(body), signal: o.signal });
  if (!put.ok) throw new Error(`FAL upload failed: ${put.status}`);
  return file_url;
}
