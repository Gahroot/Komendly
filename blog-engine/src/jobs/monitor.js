// Daily: GSC page+query stats, URL inspection of published posts, Bing query stats, sitemap check. No Codex.
import { gscConfigured, searchAnalytics, inspectUrl, bingQueryStats } from '../gsc.js';

const isoDay = (d) => d.toISOString().slice(0, 10);

/** Hook: signups by UTM (utm_source=blog, utm_campaign=<slug>) from the Komendly app is NOT connected (owner's choice). */
export async function signupsByCampaign() { return null; }

export async function run({ db, env = process.env, log = console, fetchImpl = globalThis.fetch, deps = {} }) {
  const d = { searchAnalytics, inspectUrl, bingQueryStats, signups: signupsByCampaign, ...deps };
  const notes = {};
  const site = (env.SITE_URL || 'https://komendly.com').replace(/\/$/, '');
  if (gscConfigured(env)) {
    try {
      const end = new Date(Date.now() - 2 * 86400e3), start = new Date(Date.now() - 9 * 86400e3);
      const rows = await d.searchAnalytics({ startDate: isoDay(start), endDate: isoDay(end) }, env);
      for (const r of rows) {
        const [day, page, query] = r.keys;
        await db.query(`INSERT INTO metrics_daily (day, provider, page, query, clicks, impressions, ctr, position) VALUES ($1,'gsc',$2,$3,$4,$5,$6,$7)
          ON CONFLICT (day, provider, page, query) DO UPDATE SET clicks = EXCLUDED.clicks, impressions = EXCLUDED.impressions, ctr = EXCLUDED.ctr, position = EXCLUDED.position`,
        [day, page, query, r.clicks, r.impressions, r.ctr, r.position]);
      }
      notes.gsc = `${rows.length} rows`;
      const posts = (await db.query("SELECT slug FROM posts WHERE status = 'published' ORDER BY slug")).rows;
      for (const p of posts) {
        try { await db.query('UPDATE posts SET index_status = $2 WHERE slug = $1', [p.slug, await d.inspectUrl(`${site}/blog/${p.slug}`, env)]); }
        catch (e) { log.error('[monitor] inspect', p.slug, e.message); }
      }
      notes.inspected = posts.length;
    } catch (e) { log.error('[monitor] gsc', e.message.slice(0, 200)); notes.gsc = `error: ${e.message.slice(0, 200)}`; }
  } else notes.gsc = 'skipped: GSC_SERVICE_ACCOUNT_JSON not set';
  if (env.BING_API_KEY) {
    try {
      const rows = await d.bingQueryStats(env);
      for (const r of rows) {
        await db.query(`INSERT INTO metrics_daily (day, provider, page, query, clicks, impressions, position) VALUES ($1,'bing','',$2,$3,$4,$5)
          ON CONFLICT (day, provider, page, query) DO UPDATE SET clicks = EXCLUDED.clicks, impressions = EXCLUDED.impressions, position = EXCLUDED.position`,
        [r.day, r.query, r.clicks, r.impressions, r.position]);
      }
      notes.bing = `${rows.length} rows`;
    } catch (e) { log.error('[monitor] bing', e.message); notes.bing = `error: ${e.message}`; }
  } else notes.bing = 'skipped: BING_API_KEY not set';
  try {
    const res = await fetchImpl(`${site}/sitemap.xml`, { signal: AbortSignal.timeout(20_000) });
    const text = res.ok ? await res.text() : '';
    const urls = (text.match(/<loc>/g) || []).length;
    const blog = (text.match(/<loc>[^<]*\/blog\/[^<]+<\/loc>/g) || []).length;
    await db.query('INSERT INTO checks (day, name, ok, detail) VALUES (CURRENT_DATE, $1, $2, $3)', ['sitemap', res.ok && urls > 0, `${res.status}, ${urls} urls, ${blog} blog`]);
    notes.sitemap = `${res.status}, ${urls} urls, ${blog} blog`;
  } catch (e) {
    await db.query('INSERT INTO checks (day, name, ok, detail) VALUES (CURRENT_DATE, $1, false, $2)', ['sitemap', e.message]);
    notes.sitemap = `error: ${e.message}`;
  }
  const s = await d.signups(env);
  notes.signups = s ?? 'hook not connected';
  return notes;
}
