// Weekly report -> GitHub issue `weekly-report` (+ DB). Also the engine-alert sink for failed jobs.
import { gh, repoName, githubConfigured, upsertIssue } from '../github.js';
import { getState, weeklyCap } from '../codex.js';

export async function buildReport(db, { since = 7, env = process.env } = {}) {
  const q = (sql, p = []) => db.query(sql, p).then((r) => r.rows);
  const table = (head, rows) => rows.length ? [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n') : '_No data yet._';
  const n1 = (x) => (x == null ? '–' : Number(x).toFixed(1));
  const traffic = await q(`SELECT provider, COALESCE(SUM(clicks),0)::int AS clicks, COALESCE(SUM(impressions),0)::int AS impressions FROM metrics_daily WHERE day > CURRENT_DATE - ${since} GROUP BY provider ORDER BY provider`);
  const topQueries = await q(`SELECT query, SUM(clicks)::int AS clicks, SUM(impressions)::int AS impressions, AVG(position) AS position FROM metrics_daily WHERE provider='gsc' AND query <> '' AND day > CURRENT_DATE - ${since} GROUP BY query ORDER BY 3 DESC LIMIT 10`);
  const indexing = await q("SELECT slug, COALESCE(index_status,'unknown') AS index_status FROM posts WHERE status='published' ORDER BY slug");
  const ai = await q(`SELECT COUNT(*)::int AS asked, COUNT(*) FILTER (WHERE cited)::int AS cited, COUNT(*) FILTER (WHERE mentioned)::int AS mentioned, COUNT(*) FILTER (WHERE recommended)::int AS recommended FROM ai_visibility WHERE day > CURRENT_DATE - 14`);
  const jobs = await q(`SELECT job, COUNT(*)::int AS runs, COUNT(*) FILTER (WHERE status='failed')::int AS failed, COUNT(*) FILTER (WHERE status='deferred')::int AS deferred FROM job_runs WHERE started_at > now() - interval '${since} days' GROUP BY job ORDER BY job`);
  const gateRows = await q(`SELECT pr_number, slugs, outcome, mode, detail FROM gate_results WHERE created_at > now() - interval '${since} days' ORDER BY id DESC`);
  const gate = [];
  for (const r of gateRows) if (!gate.some((g) => g.pr_number === r.pr_number)) gate.push(r);
  const backlog = await q("SELECT status, COUNT(*)::int AS n FROM topics GROUP BY status ORDER BY status");
  const next = await q("SELECT slug, priority FROM topics WHERE status='open' ORDER BY priority, id LIMIT 5");
  const calls = (await q("SELECT COUNT(*)::int AS n FROM ai_usage WHERE provider = 'codex' AND created_at > now() - interval '7 days'"))[0].n;
  const usageAt = await getState(db, 'usage_limit_at').catch(() => null);
  const sitemap = await q("SELECT ok, detail FROM checks WHERE name='sitemap' ORDER BY id DESC LIMIT 1");
  return [
    '## Traffic', table(['Provider', 'Clicks', 'Impressions'], traffic.map((r) => [r.provider, r.clicks, r.impressions])),
    '', '## Top queries (GSC)', table(['Query', 'Clicks', 'Impr.', 'Pos.'], topQueries.map((r) => [r.query, r.clicks, r.impressions, n1(r.position)])),
    '', '## Indexing', table(['Post', 'Status'], indexing.map((r) => [r.slug, r.index_status])),
    `Sitemap: ${sitemap[0] ? `${sitemap[0].ok ? 'ok' : 'PROBLEM'} (${sitemap[0].detail})` : 'not checked yet'}`,
    '', '## AI visibility (ChatGPT search, last 14 days)', ai[0] && ai[0].asked ? `${ai[0].asked} questions: komendly.com cited ${ai[0].cited}, mentioned ${ai[0].mentioned}, recommended ${ai[0].recommended}.` : '_No checks yet._',
    '', '## Approval gate', gate.length ? table(['PR', 'Post', 'Result', 'Why'], gate.map((r) => [`#${r.pr_number}`, r.slugs || '–', r.outcome, String(r.detail || '').replace(/\|/g, '/').slice(0, 200)])) : '_No PRs gated this week._',
    '', '## Topic backlog', backlog.map((b) => `${b.status}: ${b.n}`).join(', ') || '_empty_', ...next.map((t) => `- next: ${t.slug} (p${t.priority})`),
    '', '## Codex', `${calls} calls in 7 days (cap ${weeklyCap(env)}, night window 23:00-08:00 NY).${usageAt && Date.now() - new Date(usageAt).getTime() < 7 * 86_400_000 ? ` Usage limit hit ${usageAt.slice(0, 16)}: paused 24h.` : ''}`,
    '', '## Job health', table(['Job', 'Runs', 'Failed', 'Deferred'], jobs.map((r) => [r.job, r.runs, r.failed, r.deferred])),
    '', '## Signups from the blog', '_Hook not connected (utm_source=blog is tracked by the site; no app DB access by design)._'
  ].join('\n');
}

export async function run({ db, env = process.env }) {
  const weekOf = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const body = await buildReport(db, { env });
  let url = null;
  if (githubConfigured(env)) url = (await gh('POST', `/repos/${repoName(env)}/issues`, { title: `Blog engine weekly report: ${weekOf}`, body, labels: ['weekly-report'] }, env)).html_url;
  await db.query('INSERT INTO reports (week_of, body, issue_url) VALUES ($1,$2,$3)', [weekOf, body, url]);
  return { issue: url || 'GITHUB_TOKEN not set; saved in DB only' };
}

export async function alert(job, message, env = process.env) {
  if (!githubConfigured(env)) return;
  await upsertIssue({ title: `Blog engine job failing: ${job}`, label: 'engine-alert', body: `Job \`${job}\` failed after 3 attempts at ${new Date().toISOString()}.\n\n\`\`\`\n${message}\n\`\`\`\n\nRe-run: \`/api/admin/run/${job}\` with the admin token. Close this issue once fixed.` }, env);
}
