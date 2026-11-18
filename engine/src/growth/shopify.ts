// System #7 shopify (Shopify App Store), engine side: hourly health + output loop. The app itself runs in the web app
// (/shopify, /api/shopify/*). Each tick (kill switch sys_shopify): outputs = new installs + newly activated paid charges
// in the last cycle; a synthetic check that the public endpoints answer (health 200, webhooks reject a bad HMAC with 401).
import { recordSystemRun, systemEnabled } from "../../../src/lib/growth/systems";
import type { Db } from "../db";
import { errMsg, log } from "../log";

const KEY = "shopify" as const;
const HOUR = 60 * 60_000;
const appUrl = (env: NodeJS.ProcessEnv) => (env.SHOPIFY_APP_URL || env.NEXT_PUBLIC_APP_URL || "https://www.komendly.com").replace(/\/$/, "");

type ShopifyTickDb = Pick<Db, "adsFeatureFlag" | "engineHeartbeat" | "shopifyShop" | "shopifyCharge">;

/** Synthetic check of the app's public endpoints. Returns an error message, or null when healthy. */
export async function checkShopifyEndpoints(base: string, fetchFn: typeof fetch = fetch): Promise<string | null> {
  try {
    const h = await fetchFn(`${base}/api/shopify/health`, { signal: AbortSignal.timeout(15_000) });
    const hj = (await h.json().catch(() => null)) as { ok?: boolean; configured?: unknown } | null;
    if (h.status !== 200 || !hj?.ok) return `health ${h.status}: ${JSON.stringify(hj?.configured ?? null)}`;
    const w = await fetchFn(`${base}/api/shopify/webhooks`, { method: "POST", headers: { "content-type": "application/json", "x-shopify-hmac-sha256": "synthetic-check", "x-shopify-topic": "app/uninstalled" }, body: "{}", signal: AbortSignal.timeout(15_000) });
    if (w.status !== 401) return `webhooks answered ${w.status} to a bad HMAC (expected 401)`;
    return null;
  } catch (e) {
    return `endpoint check failed: ${errMsg(e)}`;
  }
}

export async function shopifyTick(db: ShopifyTickDb, opts: { env?: NodeJS.ProcessEnv; fetchFn?: typeof fetch; now?: Date } = {}): Promise<{ ok: boolean; outputs: number } | null> {
  if (!(await systemEnabled(db, KEY))) return null;
  const now = opts.now ?? new Date();
  const since = new Date(now.getTime() - HOUR);
  try {
    const [installs, charges] = await Promise.all([
      db.shopifyShop.count({ where: { installedAt: { gte: since, lt: now } } }),
      db.shopifyCharge.count({ where: { activatedAt: { gte: since, lt: now }, test: false } }),
    ]);
    const error = await checkShopifyEndpoints(appUrl(opts.env ?? process.env), opts.fetchFn);
    const outputs = installs + charges;
    await recordSystemRun(db, KEY, { ok: !error, outputs, error }, now);
    if (error) log("warn", "shopify endpoint check failed", { error });
    return { ok: !error, outputs };
  } catch (e) {
    await recordSystemRun(db, KEY, { ok: false, error: errMsg(e) }, now);
    return { ok: false, outputs: 0 };
  }
}

export function startShopifyLoop(db: Db, everyMs = HOUR): () => void {
  let running = false;
  const tick = () => {
    if (running) return;
    running = true;
    shopifyTick(db).catch((e: unknown) => log("warn", "shopify tick failed", { error: errMsg(e) })).finally(() => (running = false));
  };
  const first = setTimeout(tick, 120_000);
  const t = setInterval(tick, everyMs);
  return () => { clearTimeout(first); clearInterval(t); };
}
