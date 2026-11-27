// Robots-aware, rate-limited GET for the intent/signal fetchers. User-Agent identifies Komendly. A path disallowed for
// `*` or KomendlyBot in the host's robots.txt is NOT fetched (returns status 403 "robots"); robots.txt is cached per host.
import { robotsAllows, UA, type SiteFetch } from "./site-signals";

export function politeFetch(o: { gapMs?: number; timeoutMs?: number; fetchImpl?: typeof fetch; sleep?: (ms: number) => Promise<void> } = {}): SiteFetch {
  const f = o.fetchImpl ?? fetch;
  const gap = o.gapMs ?? 1500;
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((ok) => setTimeout(ok, ms)));
  const robots = new Map<string, string | null>();
  const get = async (url: string) => {
    const r = await f(url, { headers: { "user-agent": UA, accept: "application/json, application/rss+xml, text/html, */*" }, signal: AbortSignal.timeout(o.timeoutMs ?? 12_000), redirect: "follow" });
    return { status: r.status, text: (await r.text()).slice(0, 2_000_000) };
  };
  return async (url) => {
    const u = new URL(url);
    if (u.pathname !== "/robots.txt" && !robots.has(u.origin)) {
      const r = await get(`${u.origin}/robots.txt`).catch(() => null);
      robots.set(u.origin, r && r.status === 200 ? r.text : null);
      await sleep(gap);
    }
    if (u.pathname !== "/robots.txt" && !robotsAllows(robots.get(u.origin) ?? null, u.pathname + u.search)) return { status: 403, text: "robots" };
    const res = await get(url);
    await sleep(gap);
    return res;
  };
}
