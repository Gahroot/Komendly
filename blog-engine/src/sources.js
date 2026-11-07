// Source URL verification: any reputable host (incl. competitor sites), https, resolves 2xx/3xx; no fake URLs.
const UA = 'Mozilla/5.0 (compatible; KomendlyBlogEngine-SourceCheck/1.0; +https://komendly.com)';

// Hosts that never count as a source (link shorteners, search pages, content farms, user-generated pages, our own site).
export const BLOCKED_HOSTS = ['bit.ly', 't.co', 'tinyurl.com', 'goo.gl', 'google.com', 'bing.com', 'duckduckgo.com', 'example.com', 'example.org',
  'localhost', 'komendly.com', 'chat.openai.com', 'chatgpt.com', 'pinterest.com', 'quora.com', 'medium.com'];

export function isAcceptableUrl(u) {
  try {
    const url = new URL(u);
    if (url.protocol !== 'https:') return false;
    const h = url.hostname.toLowerCase();
    if (/^\d+\.\d+\.\d+\.\d+$/.test(h) || !h.includes('.')) return false;
    return !BLOCKED_HOSTS.some((b) => h === b || h.endsWith('.' + b));
  } catch { return false; }
}

/** Returns { ok, status, reason }. Bot walls (401/403/429) on a real host count as resolving, a 404/410/5xx doesn't. */
export async function verifyUrl(url, { fetchImpl = globalThis.fetch, timeoutMs = 15_000 } = {}) {
  if (!isAcceptableUrl(url)) return { ok: false, status: 0, reason: 'invalid_or_blocked_host' };
  for (const method of ['HEAD', 'GET']) {
    try {
      const res = await fetchImpl(url, { method, redirect: 'follow', headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,*/*' }, signal: AbortSignal.timeout(timeoutMs) });
      if (res.body && typeof res.body.cancel === 'function') res.body.cancel().catch(() => {});
      if (res.status >= 200 && res.status < 400) return { ok: true, status: res.status };
      if (method === 'GET') {
        if ([401, 403, 429].includes(res.status)) return { ok: true, status: res.status, note: 'bot wall' };
        return { ok: false, status: res.status, reason: `http_${res.status}` };
      }
    } catch (e) {
      if (method === 'GET') return { ok: false, status: 0, reason: e.name === 'TimeoutError' ? 'timeout' : 'network_error' };
    }
  }
  return { ok: false, status: 0, reason: 'unreachable' };
}

export async function verifySources(sources, opts) {
  const results = await Promise.all((sources || []).map(async (s) => ({ source: s, ...(await verifyUrl(s.url, opts)) })));
  return { verified: results.filter((r) => r.ok).map((r) => r.source), dropped: results.filter((r) => !r.ok) };
}
