// Where an engine worker runs, for the admin engine page. Prefers an explicit meta.host
// ("railway" | "local") when the engine reports one; otherwise infers it from the worker id,
// which defaults to `worker:<hostname>:<pid>` (Railway containers have 12-hex hostnames).

export type WorkerHost = "railway" | "local" | "provider" | "unknown";

export function workerHost(id: string, kind: string, meta: unknown): WorkerHost {
  if (kind === "provider") return "provider";
  const m = meta && typeof meta === "object" ? (meta as Record<string, unknown>) : {};
  if (m.host === "railway" || m.host === "local") return m.host;
  if (typeof m.railway === "boolean") return m.railway ? "railway" : "local";
  const host = id.split(":")[1] ?? "";
  if (/^[0-9a-f]{12}$/.test(host)) return "railway";
  if (/^(benchmark|local|seed)/i.test(host) || /\.local$|macbook|localhost/i.test(host)) return "local";
  return "unknown";
}

export const WORKER_HOST_LABEL: Record<WorkerHost, string> = { railway: "Railway", local: "Local", provider: "Provider", unknown: "Unknown" };
