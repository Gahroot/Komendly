// HTTP API: /api/health (public) + admin endpoints (Bearer ADMIN_TOKEN).
import crypto from 'node:crypto';
import { codexStatus as defaultCodexStatus } from './codex.js';
import { githubStatus as defaultGithubStatus } from './github.js';
import { gscConfigured } from './gsc.js';
import { dbConnected } from './db.js';

function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export async function adminStatus({ db, scheduler, env = process.env, codexStatus = defaultCodexStatus, githubStatus = defaultGithubStatus }) {
  const connected = await dbConnected(db);
  const out = { db: { connected } };
  if (scheduler) { try { Object.assign(out, await scheduler.status()); } catch (e) { out.scheduler = { error: e.message }; } }
  try { out.codex = await codexStatus(db, env); } catch (e) { out.codex = { error: e.message }; }
  const g = await githubStatus(env).catch((e) => ({ configured: Boolean(env.GITHUB_TOKEN), ok: false, error: e.message }));
  out.github = { tokenSet: Boolean(env.GITHUB_TOKEN), repoAccess: Boolean(g.ok), repo: g.repo || env.GITHUB_REPO || 'Gahroot/Komendly', push: g.push ?? null, ...(g.error ? { error: g.error } : {}) };
  out.gsc = { configured: gscConfigured(env), site: env.GSC_SITE_URL || 'sc-domain:komendly.com' };
  out.bing = { configured: Boolean(env.BING_API_KEY) };
  out.autoPublish = String(env.AUTO_PUBLISH ?? 'true').toLowerCase() !== 'false';
  if (connected) {
    try { out.topics = Object.fromEntries((await db.query('SELECT status, COUNT(*)::int AS n FROM topics GROUP BY status')).rows.map((r) => [r.status, r.n])); } catch (e) { out.topics = { error: e.message }; }
    try { out.recentRuns = (await db.query('SELECT job, status, attempts, started_at, finished_at, error FROM job_runs ORDER BY id DESC LIMIT 20')).rows; } catch (e) { out.recentRuns = { error: e.message }; }
  }
  return out;
}

export function createHandler({ db, scheduler = null, adminToken = process.env.ADMIN_TOKEN, env = process.env, log = console, codexStatus, githubStatus }) {
  return async function handle(req, res) {
    const url = new URL(req.url, 'http://x');
    const send = (status, body) => { res.writeHead(status, { 'Cache-Control': 'no-store', 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
    try {
      const p = url.pathname.replace(/\/+$/, '') || '/';
      if (p === '/api/health' && req.method === 'GET') return send(200, { ok: true });
      if (p.startsWith('/api/admin/')) {
        const auth = String(req.headers.authorization || '');
        if (!adminToken || !auth.startsWith('Bearer ') || !safeEqual(auth.slice(7), adminToken)) return send(401, { error: 'unauthorized' });
        if (!['GET', 'POST'].includes(req.method)) return send(405, { error: 'method_not_allowed' });
        if (p === '/api/admin/status') return send(200, await adminStatus({ db, scheduler, env, ...(codexStatus ? { codexStatus } : {}), ...(githubStatus ? { githubStatus } : {}) }));
        const m = p.match(/^\/api\/admin\/run\/([a-z_]+)$/);
        if (m) {
          if (!scheduler || !scheduler.has(m[1])) return send(404, { error: 'unknown_job' });
          return send(202, { job: m[1], started: scheduler.trigger(m[1]) });
        }
        return send(404, { error: 'not_found' });
      }
      return send(404, { error: 'not_found' });
    } catch (e) {
      log.error('request failed', req.method, url.pathname, e.message);
      return send(500, { error: 'server_error' });
    }
  };
}
