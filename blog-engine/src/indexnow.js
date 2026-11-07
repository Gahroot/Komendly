// IndexNow ping after a merge goes live (key file served at https://komendly.com/<key>.txt).
export const DEFAULT_KEY = '78c8478292a52ad65d0087edc113df99';
export const indexNowKey = (env = process.env) => env.INDEXNOW_KEY || DEFAULT_KEY;

export async function pingIndexNow(urls, { env = process.env, fetchImpl = globalThis.fetch, db } = {}) {
  const site = (env.SITE_URL || 'https://komendly.com').replace(/\/$/, '');
  const host = new URL(site).host;
  const key = indexNowKey(env);
  const res = await fetchImpl('https://api.indexnow.org/indexnow', {
    method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host, key, keyLocation: `${site}/${key}.txt`, urlList: urls }), signal: AbortSignal.timeout(30_000)
  });
  if (db) for (const u of urls) await db.query('INSERT INTO indexnow_pings (url, status) VALUES ($1,$2)', [u, res.status]);
  return { status: res.status, ok: res.status >= 200 && res.status < 300 };
}

/** Waits until the URL serves 200 (Vercel production deploy finished), up to timeoutMs. */
export async function waitLive(url, { fetchImpl = globalThis.fetch, timeoutMs = 10 * 60_000, everyMs = 30_000, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), now = () => Date.now() } = {}) {
  const start = now();
  for (;;) {
    try { const r = await fetchImpl(url, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(20_000) }); if (r.status === 200) return true; } catch {}
    if (now() - start >= timeoutMs) return false;
    await sleep(everyMs);
  }
}
