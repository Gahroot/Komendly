// Automated approval gate (AUTO_PUBLISH != 'false'). Hourly + right after draft/optimize/audit push a PR.
// For each open engine blog/* PR not yet gated: 1. sources resolve  2. CONTRACT.md validator (+ date rule)
// 3. Komendly claims lint  4. independent Codex fact-check (fresh session, skeptical prompt, all `supported`).
// Pass -> published/approved/approved_by + real publish date, push, wait for the head commit's `Vercel` status = success,
// squash-merge, delete branch, wait for the URL to go live, ping IndexNow.
// Fail -> self-revise (max GATE_MAX_REVISIONS) or hold: label needs-review, comment, needs-review issue for the owner.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import * as GH from '../github.js';
import { parsePost, serializePost, setApproval, dateIssues } from '../frontmatter.js';
import { verifySources, isAcceptableUrl } from '../sources.js';
import { complete, extractJson, llmConfigured } from '../llm.js';
import { validatePost } from '../validator.js';
import { claimsLint } from '../claims.js';
import { runtimeKnowledge } from '../knowledge.js';
import { codexBlock } from '../codex.js';
import { DeferError } from '../mode.js';
import { loadCompetitors } from '../seed.js';
import { FACT_SYSTEM } from '../prompts.js';
import { pingIndexNow, waitLive } from '../indexnow.js';

export const AUTO_APPROVER = 'auto-review (Komendly blog engine)';
export const autoPublish = (env = process.env) => String(env.AUTO_PUBLISH ?? 'true').toLowerCase() !== 'false';
const nyDay = (d = new Date()) => new Date(d).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const UA = 'Mozilla/5.0 (compatible; KomendlyBlogEngine-FactCheck/1.0; +https://komendly.com)';
const POST_RE = new RegExp(`^${GH.CONTENT_DIR}/[a-z0-9-]+\\.mdx?$`);

export function findApproval(comments, owner) {
  return comments.find((c) => c.user && c.user.login.toLowerCase() === owner.toLowerCase() && /^\s*\/approve\b/m.test(c.body || '')) || null;
}

// ---------- fact-check ----------
export function pageText(html) {
  const h = String(html);
  const pick = (re) => { const m = h.match(re); return m ? m[1] : ''; };
  const title = pick(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const metas = [...h.matchAll(/<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]*content=["']([^"']*)["']/gi)].map((m) => m[1]);
  const strip = (s) => s.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi, ' ').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
  return [strip(title), ...metas.map(strip), strip(h.replace(/<head[\s\S]*?<\/head>/i, ''))].filter(Boolean).join('\n').slice(0, 8000);
}

export async function fetchSourceText(url, fetchImpl = globalThis.fetch) {
  if (!isAcceptableUrl(url)) return null;
  try {
    const res = await fetchImpl(url, { method: 'GET', redirect: 'follow', headers: { 'User-Agent': UA, Accept: 'text/html,*/*' }, signal: AbortSignal.timeout(20_000) });
    if (res.status < 200 || res.status >= 400 || typeof res.text !== 'function') return null;
    const t = pageText(await res.text());
    return t.length >= 40 ? t : null;
  } catch { return null; }
}

export async function cachedSourceText(db, url, fetchImpl = globalThis.fetch) {
  if (!db) return fetchSourceText(url, fetchImpl);
  const hit = (await db.query("SELECT text FROM source_cache WHERE url = $1 AND fetched_at > now() - interval '7 days'", [url])).rows[0];
  if (hit) return hit.text;
  const text = await fetchSourceText(url, fetchImpl);
  if (text) { await db.query('DELETE FROM source_cache WHERE url = $1', [url]); await db.query('INSERT INTO source_cache (url, text) VALUES ($1,$2)', [url, text]); }
  return text;
}

export const claimKey = (claim, url) => createHash('sha256').update(`${claim}\n${url}`).digest('hex');
const bodyKey = (post) => createHash('sha256').update(`body\n${post.answer || ''}\n${post.body || ''}`).digest('hex');
const cachedSupported = async (db, key) => Boolean(db) && (await db.query("SELECT 1 FROM claim_checks WHERE key = $1 AND verdict = 'supported' AND checked_at > now() - interval '30 days'", [key])).rows.length > 0;
async function saveCheck(db, key, verdict, reason) {
  if (!db) return;
  await db.query('DELETE FROM claim_checks WHERE key = $1', [key]);
  await db.query('INSERT INTO claim_checks (key, verdict, reason) VALUES ($1,$2,$3)', [key, verdict, String(reason || '').slice(0, 500)]);
}

/** Independent fact-check: a separate, fresh Codex session (with live web search to open source pages). */
export async function factCheck(post, { env = process.env, fetchImpl = globalThis.fetch, completeImpl, db } = {}) {
  const verdicts = [];
  const items = [];
  const claims = post.claims || [];
  for (let i = 0; i < claims.length; i++) {
    const c = claims[i];
    const src = (post.sources || []).find((s) => String(s.id) === String(c.source));
    const row = { claim: c.text, source: c.source ?? '', url: src ? src.url : '', verdict: 'unsupported', reason: '' };
    verdicts.push(row);
    if (!src) { row.reason = 'cited source does not exist'; continue; }
    row.key = claimKey(c.text, src.url);
    if (await cachedSupported(db, row.key)) { row.verdict = 'supported'; row.reason = 'cached verdict (< 30 days)'; row.cached = true; continue; }
    const text = await cachedSourceText(db, src.url, fetchImpl);
    items.push({ index: i, claim: c.text, source: `${src.title || ''} (${src.publisher || ''})`, url: src.url, excerpt: text || '(page text could not be fetched by a plain HTTP client; open the URL yourself)' });
  }
  const llm = completeImpl || (llmConfigured(env) ? complete : null);
  let unlisted = [];
  const bKey = bodyKey(post);
  if (items.length === 0 && verdicts.length && verdicts.every((v) => v.cached) && await cachedSupported(db, bKey)) {
    // unchanged and recently checked clean: no Codex call
  } else if (!llm) {
    for (const it of items) verdicts[it.index].reason = 'fact-checker not configured';
    unlisted = ['fact-check could not run: no LLM configured'];
  } else {
    const prompt = `Claims to check (with source URL and excerpt):\n${JSON.stringify(items, null, 1)}\n\nListed claims (all):\n${JSON.stringify(claims.map((c) => c.text))}\n\nPost:\n"""\n${post.title}\n\n${String(post.answer || '')}\n\n${String(post.body || '').slice(0, 30000)}\n\nFAQ: ${JSON.stringify(post.faq || [])}\n"""`;
    const out = extractJson(await llm(FACT_SYSTEM, prompt, { env, db, job: 'gate', search: true }));
    const by = new Map((out.verdicts || []).map((v) => [Number(v.index), v]));
    for (const it of items) {
      const v = by.get(it.index);
      const verdict = v && ['supported', 'overstated', 'unsupported'].includes(String(v.verdict).toLowerCase()) ? String(v.verdict).toLowerCase() : 'unsupported';
      verdicts[it.index].verdict = verdict;
      verdicts[it.index].reason = v ? String(v.reason || '') : 'no verdict returned';
    }
    unlisted = (out.unlisted_statements || out.unlisted_medical_statements || []).map(String).filter((s) => s.trim());
    for (const it of items) if (verdicts[it.index].verdict === 'supported') await saveCheck(db, verdicts[it.index].key, 'supported', verdicts[it.index].reason);
    if (!unlisted.length) await saveCheck(db, bKey, 'supported', 'no unlisted statements');
  }
  for (const v of verdicts) { delete v.key; delete v.cached; }
  const ok = claims.length > 0 && verdicts.every((v) => v.verdict === 'supported') && unlisted.length === 0;
  return { ok, verdicts, unlisted };
}

const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').slice(0, 220);
export function verdictTable(verdicts) {
  if (!verdicts.length) return '_No claims._';
  return ['| # | Claim | Source | Verdict | Reason |', '|---|---|---|---|---|',
    ...verdicts.map((v, i) => `| ${i + 1} | ${cell(v.claim)} | [^${cell(v.source)}] | ${v.verdict === 'supported' ? '✅' : '❌'} ${v.verdict} | ${cell(v.reason)} |`)].join('\n');
}
export function gateReport(g) {
  return [...g.checks.map((c) => `- ${c.ok ? '✅' : '❌'} **${c.name}**: ${c.detail}`), '', '### Fact-check verdicts', verdictTable(g.verdicts),
    ...(g.unlisted.length ? ['', '**Factual statements not listed in `claims`:**', ...g.unlisted.map((s) => `- ${s}`)] : [])].join('\n');
}

/** Original `date` of a post already on main (refresh), or null for a new post. */
async function mainDate(rel, env, deps) {
  try {
    const f = await deps.gh('GET', `/repos/${GH.repoName(env)}/contents/${rel.split('/').map(encodeURIComponent).join('/')}?ref=main`, null, env);
    if (!f || !f.content) return null;
    return parsePost(Buffer.from(f.content, 'base64').toString('utf8')).date || null;
  } catch (e) { if (e.status === 404 || /-> 404/.test(e.message)) return null; throw e; }
}

/** Runs all checks on the checkout. On return, the files are approved (date fixed) in the working tree; caller pushes only on pass. */
export async function runChecks(dir, posts, { env, deps, db, pr }) {
  const checks = [], verdicts = [], unlisted = [];
  const add = (name, ok, detail) => checks.push({ name, ok, detail });
  const today = nyDay(deps.now());
  const prDay = pr && pr.created_at ? nyDay(pr.created_at) : today;
  const knowledge = await deps.knowledge(env);
  const competitors = await deps.competitors();
  const knownSlugs = new Set(await deps.knownSlugs(env));
  const approved = {};
  for (const rel of posts) {
    const text = await readFile(path.join(dir, rel), 'utf8');
    const slug = path.basename(rel).replace(/\.mdx?$/, '');
    let post;
    try { post = parsePost(text); } catch (e) { add(`validator (${slug})`, false, `unparseable frontmatter: ${e.message}`); continue; }
    knownSlugs.add(slug);
    const originalDate = await mainDate(rel, env, deps);
    approved[rel] = setApproval(text, AUTO_APPROVER, today, { originalDate });
    const final = parsePost(approved[rel]);
    const { dropped } = await verifySources(post.sources || [], { fetchImpl: deps.fetch });
    add(`sources resolve (${slug})`, dropped.length === 0 && (post.sources || []).length > 0,
      dropped.length ? dropped.map((d) => `${d.source.url} (${d.reason})`).join(', ') : `${(post.sources || []).length} sources resolved`);
    const v = [...validatePost(final, { filename: rel, knownSlugs, requireApproved: true }),
      ...dateIssues(final, { today, prCreatedDay: prDay, originalDate }),
      ...dateIssues(post, { today, originalDate }).filter((x) => /future|original date/.test(x))];
    add(`validator (${slug})`, v.length === 0, v.length ? v.join('; ') : 'CONTRACT.md frontmatter + MDX-safe');
    const lint = claimsLint(post, { knowledge, competitors });
    add(`claims lint (${slug})`, lint.length === 0, lint.length ? lint.join('; ') : 'clean');
    let fc;
    try { fc = await factCheck(post, { env, fetchImpl: deps.fetch, completeImpl: deps.complete, db }); }
    catch (e) {
      if (e && e.defer) throw e; // Codex unavailable: re-gate later, never hold for that
      fc = { ok: false, verdicts: [], unlisted: [`fact-check error: ${e.message}`] };
    }
    verdicts.push(...fc.verdicts.map((x) => ({ ...x, slug })));
    unlisted.push(...fc.unlisted);
    const bad = fc.verdicts.filter((x) => x.verdict !== 'supported').length;
    add(`independent fact-check (${slug})`, fc.ok, fc.ok ? `${fc.verdicts.length}/${fc.verdicts.length} claims supported`
      : `${bad} of ${fc.verdicts.length} claims not supported${fc.unlisted.length ? `; ${fc.unlisted.length} unlisted statement(s)` : ''}${fc.verdicts.length ? '' : '; no claims listed'}`);
  }
  for (const [rel, t] of Object.entries(approved)) await writeFile(path.join(dir, rel), t);
  return { pass: posts.length > 0 && checks.length > 0 && checks.every((c) => c.ok), checks, verdicts, unlisted };
}

/** Waits for the head commit's `Vercel` commit status (Vercel builds a preview for every branch). */
export async function waitForVercel(sha, { env, deps }) {
  const repo = GH.repoName(env);
  const context = env.GATE_STATUS_CONTEXT || 'Vercel';
  const timeout = Number(env.GATE_CI_TIMEOUT_MS || 20 * 60_000);
  const every = Number(env.GATE_CI_POLL_MS || 30_000);
  const start = deps.now();
  for (;;) {
    const r = await deps.gh('GET', `/repos/${repo}/commits/${sha}/status`, null, env);
    const st = ((r && r.statuses) || []).find((s) => s.context === context);
    if (st && st.state === 'success') return { state: 'success', detail: `${context}: success` };
    if (st && ['failure', 'error'].includes(st.state)) return { state: 'failure', detail: `${context}: ${st.state}${st.description ? ` (${st.description})` : ''}` };
    if (deps.now() - start >= timeout) return { state: 'timeout', detail: st ? `${context} still ${st.state}` : `no ${context} status yet` };
    await deps.sleep(every);
  }
}

const defaultDeps = () => ({
  gh: GH.gh, withCheckout: GH.withCheckout, commitAndPush: GH.commitAndPush, headSha: GH.headSha, upsertIssue: GH.upsertIssue,
  fetch: globalThis.fetch, complete: undefined, knowledge: runtimeKnowledge, competitors: loadCompetitors,
  knownSlugs: async (env) => (await GH.listMainPosts(env).catch(() => [])).map((f) => f.name.replace(/\.mdx?$/, '')),
  indexNow: (urls, o) => pingIndexNow(urls, o), waitLive: (url, o) => waitLive(url, o),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)), now: () => Date.now()
});

async function record(db, pr, { slugs = [], sha, outcome, mode = 'auto', checks = null, verdicts = null, detail = '' }) {
  await db.query('INSERT INTO gate_results (pr_number, slugs, head_sha, outcome, mode, checks, verdicts, detail) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
    [pr.number, slugs.join(','), sha || null, outcome, mode, checks ? JSON.stringify(checks) : null, verdicts ? JSON.stringify(verdicts) : null, String(detail).slice(0, 4000)]);
}

async function postFiles(pr, env, deps) {
  const files = await deps.gh('GET', `/repos/${GH.repoName(env)}/pulls/${pr.number}/files?per_page=100`, null, env);
  return files.filter((f) => f.status !== 'removed').map((f) => f.filename).filter((f) => POST_RE.test(f));
}
const slugOf = (rel) => path.basename(rel).replace(/\.mdx?$/, '');

async function hold(db, pr, { env, deps, slugs, sha, why, report, checks, verdicts, mode = 'auto' }) {
  const repo = GH.repoName(env);
  const owner = repo.split('/')[0];
  try { await deps.gh('POST', `/repos/${repo}/labels`, { name: 'needs-review', color: 'd73a4a' }, env); } catch {}
  await deps.gh('POST', `/repos/${repo}/issues/${pr.number}/labels`, { labels: ['needs-review'] }, env);
  await deps.gh('POST', `/repos/${repo}/issues/${pr.number}/comments`, { body: `**Held by the automated approval gate, not merged.** ${why}\n\n${report || ''}\n\nFix the branch (the gate re-runs after a new commit) or, as repo owner, comment \`/approve\` to override.` }, env);
  await deps.upsertIssue({ title: `Blog PR #${pr.number} held for review`, label: 'needs-review', assignees: [owner],
    body: `@${owner} PR ${pr.html_url || '#' + pr.number} (${slugs.join(', ')}) was held by the automated approval gate.\n\n${why}\n\n${report || ''}` }, env);
  await record(db, pr, { slugs, sha, outcome: 'held', mode, checks, verdicts, detail: why });
  return { pr: pr.number, outcome: 'held', why };
}

/** Waits for Vercel success on sha, squash-merges, deletes the branch, then pings IndexNow once the URL is live. */
async function finish(db, pr, { env, deps, sha, slugs, mode }) {
  const repo = GH.repoName(env);
  const ci = await waitForVercel(sha, { env, deps });
  if (ci.state === 'timeout') return { pr: pr.number, outcome: 'approved', pending: `${ci.detail}; retry next hourly run` };
  if (ci.state === 'failure') return hold(db, pr, { env, deps, slugs, sha, mode, why: `Vercel preview build failed: ${ci.detail}.` });
  try {
    await deps.gh('PUT', `/repos/${repo}/pulls/${pr.number}/merge`, { merge_method: 'squash', sha, commit_title: `${pr.title} (#${pr.number})` }, env);
  } catch (e) {
    return hold(db, pr, { env, deps, slugs, sha, mode, why: `Merge failed: ${e.message.slice(0, 300)}` });
  }
  try { await deps.gh('DELETE', `/repos/${repo}/git/refs/heads/${pr.head.ref}`, null, env); } catch {}
  for (const s of slugs) await db.query("UPDATE posts SET status = 'published', updated_at = now() WHERE slug = $1", [s]);
  await record(db, pr, { slugs, sha, outcome: 'merged', mode, detail: `${ci.detail}; squash-merged` });
  try {
    const open = await deps.gh('GET', `/repos/${repo}/issues?state=open&labels=needs-review&per_page=100`, null, env);
    const iss = (open || []).find((i) => i.title === `Blog PR #${pr.number} held for review` && !i.pull_request);
    if (iss) await deps.gh('PATCH', `/repos/${repo}/issues/${iss.number}`, { state: 'closed' }, env);
  } catch {}
  const site = (env.SITE_URL || 'https://komendly.com').replace(/\/$/, '');
  const urls = slugs.map((s) => `${site}/blog/${s}`);
  let indexnow = null;
  try {
    await deps.waitLive(urls[0], { fetchImpl: deps.fetch, sleep: deps.sleep, now: deps.now, timeoutMs: Number(env.GATE_LIVE_TIMEOUT_MS || 10 * 60_000) });
    indexnow = await deps.indexNow(urls, { env, fetchImpl: deps.fetch, db });
  } catch (e) { indexnow = { error: e.message.slice(0, 200) }; }
  return { pr: pr.number, outcome: 'merged', mode, indexnow };
}

// ---------- self-revision ----------
const CONTENT_CHECK = /^(claims lint|independent fact-check|sources resolve|validator) \(/;
export const maxRevisions = (env) => Math.max(0, Number(env.GATE_MAX_REVISIONS ?? 3));
export function revisable(g) {
  const failing = g.checks.filter((c) => !c.ok);
  if (!failing.length || failing.some((c) => !CONTENT_CHECK.test(c.name))) return false;
  if (g.unlisted.some((u) => /^fact-check error:/.test(u))) return false;
  if (failing.some((c) => /unparseable/.test(c.detail))) return false;
  return true;
}

async function reviseInCheckout(dir, posts, g, texts, { env, deps, db, round, branch }) {
  const { reviseFromFeedback, finalizePost } = await import('./draft.js');
  const revise = deps.revise || reviseFromFeedback;
  const finalize = deps.finalize || finalizePost;
  const changed = [];
  for (const rel of posts) {
    const slug = slugOf(rel);
    const file = path.join(dir, rel);
    const post = parsePost(texts[rel]);
    const detail = (name) => (g.checks.find((c) => c.name === `${name} (${slug})` && !c.ok) || {}).detail || '';
    const next = await revise({ env, db, post, verdicts: g.verdicts.filter((v) => v.slug === slug), unlisted: g.unlisted,
      lint: [...detail('claims lint').split('; '), ...detail('validator').split('; ')].filter(Boolean),
      dropped: detail('sources resolve').split(', ').filter(Boolean), completeImpl: deps.complete });
    const fin = await finalize({ ...next, slug, date: post.date }, { fetchImpl: deps.fetch });
    const out = { ...fin.post, slug, date: post.date, published: false, status: 'draft', approved_by: '' };
    await writeFile(file, serializePost(out));
    await db.query('UPDATE posts SET draft_md = $2, updated_at = now() WHERE slug = $1', [slug, serializePost(out)]);
    changed.push(slug);
  }
  await deps.commitAndPush(dir, branch, `Auto-revise post from gate feedback (round ${round}/${maxRevisions(env)})`, env);
  return { changed, sha: await deps.headSha(dir) };
}

/** Owner /approve with AUTO_PUBLISH=false: approve + push, never merge. */
async function approveOnly(db, pr, c, { env, deps, merge }) {
  const repo = GH.repoName(env);
  const today = nyDay(deps.now());
  const approver = env.APPROVER_NAME || c.user.login;
  const res = await deps.withCheckout(async (dir) => {
    const posts = await postFiles(pr, env, deps);
    for (const rel of posts) {
      const p = path.join(dir, rel);
      await writeFile(p, setApproval(await readFile(p, 'utf8'), approver, today, { originalDate: await mainDate(rel, env, deps) }));
    }
    await deps.commitAndPush(dir, pr.head.ref, `Approve post (${approver}${merge ? ', manual override' : ''})`, env);
    return { posts, sha: await deps.headSha(dir) };
  }, { branch: pr.head.ref, env });
  const slugs = res.posts.map(slugOf);
  await deps.gh('POST', `/repos/${repo}/issues/${pr.number}/comments`, { body: `Approved by engine on behalf of @${c.user.login}${merge ? ' (manual override)' : ''}: \`published: true\`, \`status: approved\`, \`approved_by: ${approver}\`, \`updated: ${today}\`.${merge ? ' Merging once the Vercel preview is green.' : ' Ready to merge (merging deploys production).'}` }, env);
  for (const s of slugs) await db.query("UPDATE posts SET status = 'approved', updated_at = now() WHERE slug = $1", [s]);
  if (!merge) return { pr: pr.number, outcome: 'approved', mode: 'manual' };
  await record(db, pr, { slugs, sha: res.sha, outcome: 'approved', mode: 'override', detail: `owner /approve by ${c.user.login}` });
  return finish(db, pr, { env, deps, sha: res.sha, slugs, mode: 'override' });
}

export async function processPr(db, pr, { env = process.env, deps: d = {}, log = console } = {}) {
  const deps = { ...defaultDeps(), ...d };
  const repo = GH.repoName(env);
  const owner = repo.split('/')[0];
  const comments = await deps.gh('GET', `/repos/${repo}/issues/${pr.number}/comments?per_page=100`, null, env);
  const c = findApproval(comments, owner);
  const override = c && !comments.some((x) => /^Approved by engine/.test(x.body || '') && new Date(x.created_at) > new Date(c.created_at)) ? c : null;
  if (!autoPublish(env)) return override ? approveOnly(db, pr, override, { env, deps, merge: false }) : null;

  const last = (await db.query('SELECT * FROM gate_results WHERE pr_number = $1 ORDER BY id DESC LIMIT 1', [pr.number])).rows[0];
  if (last && last.outcome === 'merged') return null;
  if (last && last.outcome === 'approved' && !override) return finish(db, pr, { env, deps, sha: last.head_sha, slugs: String(last.slugs || '').split(',').filter(Boolean), mode: last.mode });
  if (override) { log.log(`[gate] PR #${pr.number} manual override`); return approveOnly(db, pr, override, { env, deps, merge: true }); }
  if (last && last.outcome === 'held' && last.head_sha === pr.head.sha) return null;

  // Only the fact-check (LLM) step is bound to the Codex night window / back-off / cap: defer just this PR's checks.
  // CI waits, merges, /approve overrides and IndexNow above run at any hour.
  if (!deps.complete) { const block = await (deps.codexBlock || codexBlock)(db, 'gate', { env }); if (block) throw new DeferError(`fact-check waits: ${block}`); }
  const rounds = Number((await db.query("SELECT COUNT(*)::int AS n FROM gate_results WHERE pr_number = $1 AND outcome = 'revised'", [pr.number])).rows[0].n);
  const res = await deps.withCheckout(async (dir) => {
    const posts = await postFiles(pr, env, deps);
    const texts = {};
    for (const rel of posts) texts[rel] = await readFile(path.join(dir, rel), 'utf8');
    const g = await runChecks(dir, posts, { env, deps, db, pr });
    let sha = pr.head.sha;
    if (g.pass) { await deps.commitAndPush(dir, pr.head.ref, 'Auto-approve post (approval gate passed)', env); sha = await deps.headSha(dir); }
    else if (posts.length && rounds < maxRevisions(env) && revisable(g)) {
      try {
        const rv = await reviseInCheckout(dir, posts, g, texts, { env, deps, db, round: rounds + 1, branch: pr.head.ref });
        return { ...g, posts, sha: rv.sha, revised: rv.changed };
      } catch (e) {
        if (e && e.defer) throw e;
        return { ...g, posts, sha, reviseError: e.message.slice(0, 300) };
      }
    }
    return { ...g, posts, sha };
  }, { branch: pr.head.ref, env });
  const slugs = res.posts.map(slugOf);
  const report = gateReport(res);
  if (res.revised) {
    const failing = res.checks.filter((x) => !x.ok).map((x) => x.name).join(', ');
    await record(db, pr, { slugs, sha: res.sha, outcome: 'revised', checks: res.checks, verdicts: res.verdicts, detail: `round ${rounds + 1}: ${failing}` });
    await deps.gh('POST', `/repos/${repo}/issues/${pr.number}/comments`, { body: `**Auto-revising (round ${rounds + 1}/${maxRevisions(env)}).** The writer rewrote the post from the gate's feedback (failing: ${failing}). Re-checking now.\n\n${report}` }, env);
    const fresh = await deps.gh('GET', `/repos/${repo}/pulls/${pr.number}`, null, env);
    return processPr(db, fresh && fresh.head ? fresh : { ...pr, head: { ...pr.head, sha: res.sha } }, { env, deps: d, log });
  }
  if (!res.pass) {
    log.log(`[gate] PR #${pr.number} held`);
    return hold(db, pr, { env, deps, slugs, sha: pr.head.sha, report, checks: res.checks, verdicts: res.verdicts,
      why: `Failing: ${res.checks.filter((x) => !x.ok).map((x) => x.name).join(', ') || 'no post files in PR'}.${rounds ? ` Still failing after ${rounds} automatic revision round(s).` : ''}${res.reviseError ? ` Auto-revision failed: ${res.reviseError}` : ''}` });
  }
  await deps.gh('POST', `/repos/${repo}/issues/${pr.number}/comments`, { body: `Approved by engine (automated approval gate passed): \`published: true\`, \`status: approved\`, \`approved_by: ${AUTO_APPROVER}\`. Merging once the Vercel preview is green.\n\n${report}` }, env);
  for (const s of slugs) await db.query("UPDATE posts SET status = 'approved', updated_at = now() WHERE slug = $1", [s]);
  await record(db, pr, { slugs, sha: res.sha, outcome: 'approved', checks: res.checks, verdicts: res.verdicts, detail: 'all gate checks passed' });
  log.log(`[gate] PR #${pr.number} passed`);
  return finish(db, pr, { env, deps, sha: res.sha, slugs, mode: 'auto' });
}

export async function gateOne({ db, env = process.env, log = console, number, deps = {} }) {
  const gh = deps.gh || GH.gh;
  const pr = await gh('GET', `/repos/${GH.repoName(env)}/pulls/${number}`, null, env);
  return processPr(db, pr, { env, deps, log });
}

export async function run({ db, env = process.env, log = console, deps: d = {} }) {
  if (!GH.githubConfigured(env)) return { skipped: 'not configured: GITHUB_TOKEN' };
  const deps = { ...defaultDeps(), ...d };
  const repo = GH.repoName(env);
  const prs = (await deps.gh('GET', `/repos/${repo}/pulls?state=open&per_page=100`, null, env)).filter((p) => p.head.ref.startsWith('blog/') && p.head.repo && p.head.repo.full_name === repo);
  const results = [], errors = [];
  let deferred = null;
  for (const pr of prs) {
    try { const r = await processPr(db, pr, { env, deps, log }); if (r) results.push(r); }
    catch (e) {
      if (e && e.defer) { deferred = e; results.push({ pr: pr.number, outcome: 'deferred', reason: e.message.slice(0, 200) }); continue; }
      errors.push(`PR #${pr.number}: ${e.message}`);
    }
  }
  const tracked = (await db.query("SELECT slug, pr_number FROM posts WHERE status <> 'published' AND pr_number IS NOT NULL")).rows;
  for (const t of tracked) {
    const pr = await deps.gh('GET', `/repos/${repo}/pulls/${t.pr_number}`, null, env);
    if (pr && pr.merged_at) await db.query("UPDATE posts SET status = 'published', updated_at = now() WHERE slug = $1", [t.slug]);
  }
  if (errors.length) throw new Error(errors.join(' | '));
  if (deferred && !results.some((r) => r.outcome !== 'deferred')) throw deferred;
  return { checked: prs.length, autoPublish: autoPublish(env), results };
}
