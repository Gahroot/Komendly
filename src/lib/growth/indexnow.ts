// IndexNow pinger (system `indexnow`, flag sys_indexnow, default OFF). Pure logic: pick URLs not yet submitted, cap and
// chunk them, build the request body. The key file already lives at public/<KEY>.txt (the file name IS the key).
// Spec: https://www.indexnow.org/documentation (max 10,000 URLs per POST; same host as the key file).
export const INDEXNOW_KEY = "78c8478292a52ad65d0087edc113df99";
export const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";
/** Rate limit: URLs per run and per rolling day (a run is one cron tick). Engines punish spammy pings. */
export const MAX_URLS_PER_RUN = 200;
export const MAX_URLS_PER_DAY = 500;
/** A URL already submitted is not re-sent for this long (a changed page can be resubmitted after). */
export const RESUBMIT_AFTER_DAYS = 30;

/** Absolute, deduped, same-host https URLs; query strings and fragments dropped (canonical pages only). */
export function normalizeUrls(urls: readonly string[], siteUrl: string): string[] {
  const base = new URL(siteUrl);
  const seen = new Set<string>();
  for (const raw of urls) {
    try {
      const u = new URL(raw, base);
      if (u.host !== base.host || u.protocol !== "https:") continue;
      u.search = "";
      u.hash = "";
      seen.add(u.toString());
    } catch {
      /* skip unparsable */
    }
  }
  return [...seen];
}

/** URLs to send now: not in `recent` (submitted within RESUBMIT_AFTER_DAYS), capped by the run and the daily budget left. */
export function selectUrls(all: readonly string[], recent: ReadonlySet<string>, sentToday: number): string[] {
  const budget = Math.max(0, Math.min(MAX_URLS_PER_RUN, MAX_URLS_PER_DAY - sentToday));
  return all.filter((u) => !recent.has(u)).slice(0, budget);
}

export function buildPayload(siteUrl: string, urls: readonly string[]): { host: string; key: string; keyLocation: string; urlList: string[] } {
  const u = new URL(siteUrl);
  return { host: u.host, key: INDEXNOW_KEY, keyLocation: `${u.origin}/${INDEXNOW_KEY}.txt`, urlList: [...urls] };
}

/** IndexNow answers 200/202 on success; 429 = back off; anything else is a failure. */
export function interpretStatus(status: number): "ok" | "rate_limited" | "failed" {
  if (status === 200 || status === 202) return "ok";
  return status === 429 ? "rate_limited" : "failed";
}

export interface IndexNowResult { submitted: number; status: "ok" | "rate_limited" | "failed" | "nothing_new"; httpStatus?: number }

/** One submission (fetch injectable for tests). Never throws. */
export async function submitToIndexNow(siteUrl: string, urls: readonly string[], fetchImpl: typeof fetch = fetch): Promise<IndexNowResult> {
  if (!urls.length) return { submitted: 0, status: "nothing_new" };
  try {
    const res = await fetchImpl(INDEXNOW_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json; charset=utf-8" }, body: JSON.stringify(buildPayload(siteUrl, urls)), signal: AbortSignal.timeout(15_000) });
    const status = interpretStatus(res.status);
    return { submitted: status === "ok" ? urls.length : 0, status, httpStatus: res.status };
  } catch {
    return { submitted: 0, status: "failed" };
  }
}
