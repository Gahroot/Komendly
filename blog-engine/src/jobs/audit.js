// Weekly quality audit of published posts on main (engine posts AND the older hand-written posts, which contain
// unsourced stats). A post that fails the current fact-check / validator / claims lint gets a refresh PR rewritten into
// CONTRACT.md format: every stat cited to a real source or removed. The original `date` is kept; the gate merges only on pass.
import { githubConfigured, listMainPosts, gh } from '../github.js';
import { parsePost, serializePost } from '../frontmatter.js';
import { llmConfigured } from '../llm.js';
import { openPostPr } from './publish.js';
import { autoPublish, gateOne, factCheck } from './gate.js';
import { claimsLint } from '../claims.js';
import { validatePost } from '../validator.js';
import { runtimeKnowledge } from '../knowledge.js';
import { loadCompetitors } from '../seed.js';
import { reviseFromFeedback, finalizePost } from './draft.js';

export const auditEveryDays = (env = process.env) => Number(env.AUDIT_EVERY_DAYS ?? 30);
export const auditMaxPerRun = (env = process.env) => Math.max(1, Number(env.AUDIT_MAX_PER_RUN ?? 2));

export async function run({ db, env = process.env, log = console, deps = {} }) {
  if (!llmConfigured(env)) return { skipped: 'not configured: LLM_PROVIDER_ORDER must be codex' };
  if (!githubConfigured(env)) return { skipped: 'not configured: GITHUB_TOKEN' };
  const d = { gh, list: listMainPosts, openPr: openPostPr, gate: gateOne, factCheck, revise: reviseFromFeedback, finalize: finalizePost,
    knowledge: runtimeKnowledge, competitors: loadCompetitors, today: () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }), ...deps };
  const open = await d.gh('GET', `/repos/${env.GITHUB_REPO || 'Gahroot/Komendly'}/pulls?state=open&per_page=100`, null, env);
  const busy = new Set((open || []).map((p) => (p.head && p.head.ref) || '').filter((r) => r.startsWith('blog/')).map((r) => r.slice(5).replace(/-refresh-\d{4}-\d{2}-\d{2}$/, '')));
  const posts = [];
  for (const f of await d.list(env, d.gh)) {
    try { const post = parsePost(f.text); if (post.published !== false) posts.push({ slug: f.name.replace(/\.mdx?$/, ''), file: f.path, post }); } catch {}
  }
  posts.sort((a, b) => a.slug.localeCompare(b.slug));
  const cutoff = new Date(Date.now() - auditEveryDays(env) * 86_400_000);
  const recent = new Set((await db.query('SELECT DISTINCT slug FROM post_audits WHERE checked_at > $1', [cutoff])).rows.map((r) => r.slug));
  const due = posts.filter((p) => !recent.has(p.slug) && !busy.has(p.slug));
  if (!due.length) return { skipped: 'every published post was audited recently or has an open PR', posts: posts.length };
  const knowledge = await d.knowledge(env);
  const competitors = await d.competitors();
  const results = [];
  for (const { slug, file, post } of due.slice(0, auditMaxPerRun(env))) {
    const p = { ...post, slug: post.slug || slug };
    const legacy = !Array.isArray(p.claims) || !p.claims.length;
    const fc = legacy ? { ok: false, verdicts: [], unlisted: [] } : await d.factCheck(p, { env, db }); // DeferError propagates
    const lint = [...claimsLint(p, { knowledge, competitors }), ...validatePost(p, { filename: file })];
    if (fc.ok && !lint.length) {
      await db.query('INSERT INTO post_audits (slug, ok, detail) VALUES ($1, true, $2)', [slug, `${fc.verdicts.length} claims supported`]);
      results.push({ slug, ok: true });
      continue;
    }
    const bad = fc.verdicts.filter((v) => v.verdict !== 'supported');
    const reason = [legacy ? 'older post without sources/claims (CONTRACT.md format)' : '', bad.length ? `${bad.length} of ${fc.verdicts.length} claims not supported` : '',
      fc.unlisted.length ? `${fc.unlisted.length} unlisted statement(s)` : '', lint.length ? `${lint.length} lint/validator issue(s)` : ''].filter(Boolean).join('; ');
    const instructions = legacy ? ['Rewrite this older post into the CONTRACT.md format: every statistic or study (e.g. "79% of consumers ...") must be cited to a real source you open with web search, or removed. Add answer, faq, sources, claims, type, cta. Keep the topic, slug and the original publish date.'] : [];
    const next = await d.revise({ env, db, post: { ...p, date: p.date }, verdicts: fc.verdicts, unlisted: fc.unlisted, lint: [...instructions, ...lint], knowledge });
    const fin = await d.finalize({ ...next, slug, date: p.date }, { knowledge, competitors });
    const draft = { ...fin.post, slug, date: p.date, updated: p.updated || p.date, published: false, status: 'draft', approved_by: '' };
    const r = await d.openPr({ db, env, post: draft, fileText: serializePost(draft), kind: 'refresh', reason: `quality audit: ${reason}`, file, log,
      notes: `\n\n**Quality audit:** the live version fails the current checks (${reason}). It stays up; the gate merges this rewrite only if every check passes. Original date ${p.date} is kept.` });
    await db.query('INSERT INTO post_audits (slug, ok, detail, pr_number) VALUES ($1, false, $2, $3)', [slug, reason, r.number || null]);
    if (r.number && autoPublish(env)) {
      try { r.gate = await d.gate({ db, env, log, number: r.number }); }
      catch (e) { if (e && e.defer) r.gate = { deferred: e.message.slice(0, 200) }; else { r.gate = { error: e.message.slice(0, 500) }; log.error(`[gate] PR #${r.number}: ${e.message}`); } }
    }
    results.push({ slug, ok: false, reason, pr: r.number, gate: r.gate && (r.gate.outcome || r.gate.error || 'deferred') });
  }
  return { audited: results.length, results };
}
