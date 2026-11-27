// Web side of the AI gateway: writes `ai_request`, polls for `ai_result`. FAILS CLOSED: any problem throws GatewayError,
// so callers (auto-reply, review gate) send nothing. Never calls an AI vendor. See docs/ops/ai-policy.md.
import { CLAIM_EVENT, DEFAULT_TIMEOUT_MS, GATEWAY_SYSTEM, GatewayError, REQUEST_EVENT, RESULT_EVENT, buildRequestProps, newRequestId, parseResultProps, pollDelay, type GatewayRequest, type GatewayResponse, type GatewayTextFn } from "./core";

export interface GatewayDb {
  adsFeatureFlag: { findUnique(a: { where: { key: string } }): Promise<{ enabled: boolean } | null> };
  adsEvent: {
    create(a: { data: { name: string; props: object } }): Promise<{ id: string }>;
    findFirst(a: { where: Record<string, unknown>; orderBy?: Record<string, string>; select?: Record<string, boolean> }): Promise<{ props: unknown } | null>;
  };
}
export interface GatewayOpts { timeoutMs?: number; purpose?: string; requester?: string; db?: GatewayDb; sleep?: (ms: number) => Promise<void>; now?: () => number }

async function defaultDb(): Promise<GatewayDb> {
  return (await import("@/lib/prisma")).prisma as unknown as GatewayDb;
}

export async function gatewayText(req: GatewayRequest, opts: GatewayOpts = {}): Promise<GatewayResponse> {
  const db = opts.db ?? (await defaultDb());
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = opts.now ?? Date.now;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let on = false;
  try { on = Boolean((await db.adsFeatureFlag.findUnique({ where: { key: `sys_${GATEWAY_SYSTEM}` } }))?.enabled); } catch { on = false; }
  if (!on) throw new GatewayError("off", "AI gateway is off (flag sys_ai_gateway); failing closed");
  const id = newRequestId();
  try {
    await db.adsEvent.create({ data: { name: REQUEST_EVENT, props: buildRequestProps(req, { id, purpose: opts.purpose ?? "unspecified", requester: opts.requester ?? "web" }) } });
  } catch (e) {
    throw new GatewayError("failed", `AI gateway: could not queue request (${e instanceof Error ? e.message : "db error"})`);
  }
  const start = now();
  for (let attempt = 0; now() - start < timeoutMs; attempt++) {
    await sleep(pollDelay(attempt));
    let row: { props: unknown } | null = null;
    try { row = await db.adsEvent.findFirst({ where: { name: RESULT_EVENT, props: { path: ["id"], equals: id } }, orderBy: { createdAt: "desc" }, select: { props: true } }); } catch { row = null; }
    const r = row ? parseResultProps(row.props) : null;
    if (!r) continue;
    if (!r.ok) throw new GatewayError("failed", `AI gateway request failed: ${r.error ?? "unknown error"}`);
    return { text: r.text, json: r.json ?? undefined };
  }
  throw new GatewayError("timeout", `AI gateway timed out after ${timeoutMs}ms (engine not answering); failing closed`);
}

/** A TextFn bound to a purpose, for review gates etc. */
export const gatewayTextFor = (purpose: string, requester = "web", timeoutMs?: number): GatewayTextFn => (req) => gatewayText(req, { purpose, requester, timeoutMs });
export { CLAIM_EVENT };
