// Daily (night, NY): pick the next topic from the backlog (priority order), skip duplicates of existing posts, write the
// post with Codex (live web search to verify sources/competitor prices), verify sources, open PR blog/<slug>, gate it.
// DRAFTS_PER_DAY (default 2), one at a time. `date` is provisional here: the gate sets the real publish day at merge.
import { completeJson, llmConfigured } from '../llm.js';
import { serializePost, parsePost, dropSources, slugify } from '../frontmatter.js';
import { verifySources } from '../sources.js';
import { githubConfigured } from '../github.js';
import { openPostPr } from './publish.js';
import { autoPublish, gateOne } from './gate.js';
import { existingArticles, duplicateOf, relatedArticles } from '../existing.js';
import { validatePost, AUTHOR, TYPES } from '../validator.js';
import { claimsLint } from '../claims.js';
import { loadKnowledge, runtimeKnowledge } from '../knowledge.js';
import { loadCompetitors, loadTopics, seedTopics, competitorFacts } from '../seed.js';
import { BRAND, EDITORIAL, productFacts } from '../prompts.js';

export const draftsPerDay = (env = process.env) => Math.max(0, Number(env.DRAFTS_PER_DAY ?? 2));
export const todayNY = (d = new Date()) => d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const ctaFor = (t) => (t === 'motion' ? 'motion' : 'ads');

export function draftSystem(knowledge) { return `${BRAND}\n\n${productFacts(knowledge)}\n\n${EDITORIAL}`; }

/** Normalises LLM output into a CONTRACT.md post object (draft, unpublished). */
export function buildPost(raw, { today, topic = {} }) {
  const slug = slugify(topic.slug || raw.slug || raw.title);
  if (!slug) throw new Error('post has no title/slug');
  let desc = String(raw.description || '').replace(/\s+/g, ' ').trim();
  if (desc.length > 160) desc = desc.slice(0, 159).replace(/\s+\S*$/, '').replace(/[,;:]$/, '') + '.';
  const type = TYPES.includes(raw.type) ? raw.type : TYPES.includes(topic.type) ? topic.type : 'guide';
  return {
    title: String(raw.title || topic.title || '').trim(),
    slug,
    description: desc,
    date: today,
    updated: today,
    author: AUTHOR,
    type,
    tags: (raw.tags || []).map(String).slice(0, 6),
    published: false,
    status: 'draft',
    approved_by: '',
    primary_keyword: String(topic.primary_keyword || raw.primary_keyword || '').trim().toLowerCase(),
    secondary_keywords: (raw.secondary_keywords || topic.secondary_keywords || []).map(String).slice(0, 8),
    answer: String(raw.answer || '').replace(/\s+/g, ' ').trim(),
    key_takeaways: (raw.key_takeaways || []).map(String).filter(Boolean).slice(0, 6),
    competitors: ['comparison', 'alternatives'].includes(type) ? (raw.competitors && raw.competitors.length ? raw.competitors : topic.competitors || []).map(String) : (raw.competitors || []).map(String),
    cta: ctaFor(raw.cta || topic.cta),
    faq: (raw.faq || []).filter((f) => f && f.q && f.a).slice(0, 8).map((f) => ({ q: String(f.q), a: String(f.a) })),
    sources: (raw.sources || []).map((s, i) => ({ id: Number(s.id) || i + 1, title: String(s.title || ''), publisher: s.publisher ? String(s.publisher) : '', url: String(s.url || ''), accessed: today })),
    claims: (raw.claims || []).filter((c) => c && c.text).map((c) => ({ text: String(c.text), source: c.source ?? '' })),
    body: String(raw.body || '').trim()
  };
}

/** All problems with a draft (validator + claims lint). */
export function lintPost(post, { knowledge = loadKnowledge(), competitors = [], knownSlugs } = {}) {
  return [...validatePost(post, { filename: `${post.slug}.md`, knownSlugs }), ...claimsLint(post, { knowledge, competitors })];
}

export function topicPrompt(topic, { related, competitors, extra = '' }) {
  return `Write a blog post for komendly.com following the editorial rules.
Type: ${topic.type}   Funnel: ${topic.funnel || '?'}   Intent: ${topic.intent || '?'}   CTA: ${ctaFor(topic.cta)}
Slug (use exactly): ${topic.slug}
Working title: ${topic.title || ''}
Primary keyword: ${topic.primary_keyword}
Secondary keywords: ${JSON.stringify(topic.secondary_keywords || [])}
Angle: ${topic.angle || ''}
Questions to answer (use as H2s/FAQ where they fit): ${JSON.stringify(topic.questions || [])}
Competitors in scope: ${JSON.stringify(topic.competitors || [])}
Competitor research notes (seed data; re-verify every price/feature on the official page; pricing_verified_official=false means UNCONFIRMED): ${JSON.stringify(competitors)}
Existing posts you may link to (ONLY these /blog/ slugs; don't duplicate their angle): ${JSON.stringify(related.map((a) => ({ url: `/blog/${a.slug}`, title: a.title })))}
Today's month for "as of": ${new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'America/New_York' })}
${extra}`;
}

export async function finalizePost(post, { fetchImpl, knowledge, competitors, knownSlugs } = {}) {
  const { verified, dropped } = await verifySources(post.sources, { fetchImpl });
  const cleaned = dropSources({ ...post, sources: verified }, dropped.map((d) => d.source.id));
  return { post: cleaned, dropped, issues: lintPost(cleaned, { knowledge, competitors, knownSlugs }) };
}

/** One repair pass: the writer fixes validator/lint problems and orphaned claims. */
export async function repairDraft({ env, db, post, dropped, issues, today, knowledge, completeImpl = completeJson }) {
  const failed = (dropped || []).map((d) => `${d.source.url} (${d.reason || 'did not resolve'})`);
  const raw = await completeImpl(draftSystem(knowledge),
    `This draft failed automated checks. Fix EVERY problem and return the COMPLETE post JSON again (same fields).
Sources removed because their URL did not resolve (never use them again): ${JSON.stringify(failed)}
Problems: ${JSON.stringify(issues)}
For an unsourced claim: cite a DIFFERENT real page you open with web search, or remove the statement from the body and claims.
Current post JSON:
${JSON.stringify(post)}`, { env, db, job: 'draft', search: true });
  return { ...buildPost(raw, { today, topic: { slug: post.slug, primary_keyword: post.primary_keyword, type: post.type, cta: post.cta, competitors: post.competitors } }) };
}

/** Rewrite from the gate's feedback (verdicts, unlisted statements, lint, dead sources). */
export async function reviseFromFeedback({ env, db, post, verdicts = [], unlisted = [], lint = [], dropped = [], knowledge = loadKnowledge(), completeImpl = completeJson }) {
  const bad = verdicts.filter((v) => v.verdict !== 'supported').map((v) => ({ claim: v.claim || v.text, source: v.source, verdict: v.verdict, reason: v.reason }));
  const raw = await completeImpl(draftSystem(knowledge),
    `An independent fact-checker and automated lint held this post. Fix EVERY problem below, then return the COMPLETE post JSON (same fields).
- Overstated/unsupported claims: rewrite the claim AND matching sentence(s) to say only what the source supports, OR cite a different real page that states it (open it with web search), OR remove it everywhere.
- Unlisted factual statements: add to claims with a source that states it, or remove/rephrase as labelled opinion.
- Lint problems: fix them (Komendly facts must match the product facts exactly; competitor prices cited and "as of <Month YYYY>"; no invented stats; no "<" or "{" outside code).
- Unverifiable sources must not be used again.
Keep title, slug, structure and voice unless a fix requires a change.
Claim verdicts: ${JSON.stringify(bad)}
Unlisted statements: ${JSON.stringify(unlisted)}
Lint problems: ${JSON.stringify(lint)}
Unverifiable sources: ${JSON.stringify(dropped)}
Current post JSON:
${JSON.stringify(post)}`, { env, db, job: 'draft', search: true });
  const next = buildPost(raw, { today: post.date, topic: { slug: post.slug, primary_keyword: post.primary_keyword, type: post.type, cta: post.cta, competitors: post.competitors } });
  return { ...next, date: post.date, updated: post.updated || post.date };
}

/** Next topic: resumable pending draft first, then open topics by priority (seed order), skipping duplicates. */
export async function pickTopic(db, articles, log = console) {
  const resumable = (await db.query("SELECT t.* FROM topics t JOIN posts p ON p.topic_id = t.id WHERE p.status = 'pending' AND p.draft_md IS NOT NULL ORDER BY p.created_at LIMIT 1")).rows[0];
  if (resumable) return { topic: resumable, duplicates: [] };
  const open = (await db.query("SELECT * FROM topics WHERE status = 'open' ORDER BY priority, id LIMIT 50")).rows;
  const duplicates = [];
  for (const t of open) {
    const dup = duplicateOf({ slug: t.slug, keyword: t.primary_keyword, title: t.title }, articles);
    if (!dup) return { topic: t, duplicates };
    duplicates.push(`${t.slug} ~ ${dup.slug}`);
    await db.query("UPDATE topics SET status = 'duplicate', post_slug = $2, updated_at = now() WHERE id = $1", [t.id, dup.slug]);
  }
  if (duplicates.length) log.log(`[draft] skipped duplicates: ${duplicates.join('; ')}`);
  return { topic: null, duplicates };
}

const parseJson = (v, d) => { if (Array.isArray(v)) return v; try { return JSON.parse(v); } catch { return d; } };
const asTopic = (t) => ({ ...t, secondary_keywords: parseJson(t.secondary_keywords, []), competitors: parseJson(t.competitors, []), questions: parseJson(t.questions, []) });

export async function draftOne({ db, env, log, d, knowledge, competitors }) {
  const articles = await d.existing({ db, env });
  const { topic: row, duplicates } = await pickTopic(db, articles, log);
  if (!row) return { skipped: 'no open topics (backlog empty or all duplicates; research adds more weekly)', duplicates };
  const topic = asTopic(row);
  const today = todayNY(d.now());
  const knownSlugs = new Set(articles.map((a) => a.slug));
  const stored = (await db.query("SELECT slug, draft_md FROM posts WHERE topic_id = $1 AND status = 'pending' AND draft_md IS NOT NULL ORDER BY created_at DESC LIMIT 1", [topic.id])).rows[0];
  let post;
  if (stored) { post = parsePost(stored.draft_md); log.log(`[draft] reusing stored draft ${stored.slug}`); }
  else {
    const related = relatedArticles(topic, articles.filter((a) => a.published), 8);
    const raw = await d.complete(draftSystem(knowledge), topicPrompt(topic, { related, competitors: competitorFacts(topic, competitors) }), { env, db, job: 'draft', search: true });
    post = buildPost(raw, { today, topic });
    await db.query("DELETE FROM posts WHERE slug = $1 AND status = 'rejected'", [post.slug]);
    if ((await db.query('SELECT 1 FROM posts WHERE slug = $1', [post.slug])).rows.length) {
      await db.query("UPDATE topics SET status = 'duplicate', post_slug = $2, updated_at = now() WHERE id = $1", [topic.id, post.slug]);
      return { skipped: `slug ${post.slug} already tracked` };
    }
    await db.query("INSERT INTO posts (slug, title, primary_keyword, status, kind, draft_md, topic_id) VALUES ($1,$2,$3,'pending','new',$4,$5)",
      [post.slug, post.title, post.primary_keyword, serializePost(post), topic.id]);
  }
  let fin = await d.finalize(post, { knowledge, competitors, knownSlugs });
  if (fin.issues.length) {
    log.log(`[draft] ${fin.issues.length} issue(s); one repair pass`);
    try {
      const repaired = await repairDraft({ env, db, post: fin.post, dropped: fin.dropped, issues: fin.issues, today, knowledge, completeImpl: d.complete });
      const fin2 = await d.finalize(repaired, { knowledge, competitors, knownSlugs });
      fin = { ...fin2, dropped: [...fin.dropped, ...fin2.dropped] };
      await db.query('UPDATE posts SET draft_md = $2, updated_at = now() WHERE slug = $1', [post.slug, serializePost(fin.post)]);
    } catch (e) {
      if (e && e.defer) throw e;
      log.error(`[draft] repair failed: ${e.message}`);
    }
  }
  if (fin.post.sources.length < 2) {
    await db.query("UPDATE posts SET status = 'rejected', updated_at = now() WHERE slug = $1 AND status = 'pending'", [post.slug]);
    await db.query("UPDATE topics SET status = 'failed', updated_at = now() WHERE id = $1", [topic.id]);
    throw Object.assign(new Error(`only ${fin.post.sources.length} sources verified for ${post.slug}; refusing to open PR`), { retryable: false });
  }
  const notes = fin.issues.length ? `\n\n## Automated checks (pre-gate)\n${fin.issues.map((i) => `- ${i}`).join('\n')}` : '';
  const r = await d.openPr({ db, env, post: fin.post, fileText: serializePost(fin.post), dropped: fin.dropped, log, notes });
  await db.query("UPDATE topics SET status = 'drafted', post_slug = $2, updated_at = now() WHERE id = $1", [topic.id, fin.post.slug]);
  if (r.number && autoPublish(env)) {
    try { r.gate = await d.gate({ db, env, log, number: r.number }); }
    catch (e) {
      if (e && e.defer) r.gate = { deferred: e.message.slice(0, 200) };
      else { r.gate = { error: e.message.slice(0, 500), retry: 'next hourly gate run' }; log.error(`[gate] PR #${r.number}: ${e.message}`); }
    }
  }
  return { slug: fin.post.slug, ...r, issues: fin.issues, ...(duplicates.length ? { duplicates } : {}) };
}

export async function run({ db, env = process.env, log = console, deps = {} }) {
  if (!llmConfigured(env)) return { skipped: 'not configured: LLM_PROVIDER_ORDER must be codex' };
  if (!githubConfigured(env)) return { skipped: 'not configured: GITHUB_TOKEN' };
  const d = { complete: completeJson, finalize: finalizePost, openPr: openPostPr, gate: gateOne, existing: existingArticles,
    competitors: loadCompetitors, topics: loadTopics, knowledge: runtimeKnowledge, now: () => new Date(), ...deps };
  await seedTopics(db, await d.topics());
  const today = todayNY(d.now());
  const recentRows = (await db.query("SELECT created_at FROM posts WHERE kind = 'new' AND pr_number IS NOT NULL AND created_at > $1", [new Date(d.now().getTime() - 2 * 86_400_000)])).rows;
  const done = recentRows.filter((r) => todayNY(new Date(r.created_at)) === today).length;
  const quota = draftsPerDay(env) - done;
  if (quota <= 0) return { skipped: `daily quota reached (${done}/${draftsPerDay(env)} drafts today)` };
  // One draft per run; the job is scheduled at two night hours, so DRAFTS_PER_DAY=2 means two runs a day.
  return draftOne({ db, env, log, d, knowledge: await d.knowledge(env), competitors: await d.competitors() });
}
