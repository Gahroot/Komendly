// Weekly: refresh the published post with the best opportunity (low CTR / position 5-20) via a refresh PR (gated).
import { completeJson, llmConfigured } from '../llm.js';
import { gh, repoName, githubConfigured, CONTENT_DIR } from '../github.js';
import { parsePost, serializePost } from '../frontmatter.js';
import { openPostPr } from './publish.js';
import { autoPublish, gateOne } from './gate.js';
import { runtimeKnowledge } from '../knowledge.js';
import { BRAND, productFacts } from '../prompts.js';

/** rows: [{ slug, impressions, clicks, position }] -> [{ slug, reason, priority }] */
export function findCandidates(rows) {
  const out = [];
  for (const r of rows) {
    const ctr = r.impressions ? r.clicks / r.impressions : 0;
    const reasons = [];
    let p = 0;
    if (r.impressions >= 100 && ctr < 0.02) { reasons.push(`high impressions (${r.impressions}) / low CTR (${(ctr * 100).toFixed(1)}%)`); p += 3; }
    if (r.position >= 5 && r.position <= 20 && r.impressions >= 20) { reasons.push(`avg position ${r.position.toFixed(1)}`); p += 2; }
    if (reasons.length) out.push({ slug: r.slug, reason: reasons.join('; '), priority: p + Math.log10(1 + r.impressions) });
  }
  return out.sort((a, b) => b.priority - a.priority || a.slug.localeCompare(b.slug));
}
export const minImpressions = (env = process.env) => Number(env.OPTIMIZE_MIN_IMPRESSIONS ?? 100);

export async function run({ db, env = process.env, log = console, deps = {} }) {
  if (!llmConfigured(env)) return { skipped: 'not configured: LLM_PROVIDER_ORDER must be codex' };
  if (!githubConfigured(env)) return { skipped: 'not configured: GITHUB_TOKEN' };
  const d = { gh, complete: completeJson, openPr: openPostPr, gate: gateOne, knowledge: runtimeKnowledge, ...deps };
  const rows = (await db.query(`SELECT page, COALESCE(SUM(impressions),0)::int AS impressions, COALESCE(SUM(clicks),0)::int AS clicks,
      COALESCE(SUM(position*impressions)/NULLIF(SUM(impressions),0),0) AS position
    FROM metrics_daily WHERE provider='gsc' AND day > CURRENT_DATE - 28 AND page LIKE '%/blog/%' GROUP BY page`)).rows
    .map((r) => ({ slug: String(r.page).split('/blog/')[1].replace(/[/?#].*$/, ''), impressions: r.impressions, clicks: r.clicks, position: Number(r.position) }))
    .filter((r) => r.slug && r.impressions >= minImpressions(env));
  const recent = new Set((await db.query("SELECT slug FROM posts WHERE kind = 'refresh' AND updated_at > now() - interval '21 days'")).rows.map((r) => r.slug));
  const [cand] = findCandidates(rows.filter((r) => !recent.has(r.slug)));
  if (!cand) return { skipped: rows.length ? 'no post meets refresh criteria' : 'not enough data', checked: rows.length };
  const repo = repoName(env);
  let file = `${CONTENT_DIR}/${cand.slug}.md`, f;
  try { f = await d.gh('GET', `/repos/${repo}/contents/${file}?ref=main`, null, env); }
  catch { file = `${CONTENT_DIR}/${cand.slug}.mdx`; f = await d.gh('GET', `/repos/${repo}/contents/${file}?ref=main`, null, env); }
  const post = parsePost(Buffer.from(f.content, 'base64').toString('utf8'));
  const queries = (await db.query("SELECT query, SUM(impressions)::int AS impressions FROM metrics_daily WHERE provider='gsc' AND page LIKE $1 AND day > CURRENT_DATE - 28 GROUP BY query ORDER BY 2 DESC LIMIT 20", [`%/blog/${cand.slug}%`])).rows;
  const saved = (await db.query("SELECT id, suggestion FROM optimize_suggestions WHERE slug = $1 AND NOT used AND created_at > now() - interval '14 days' ORDER BY id DESC LIMIT 1", [cand.slug])).rows[0];
  let imp = saved && saved.suggestion, id = saved && saved.id;
  if (!imp) {
    const k = await d.knowledge(env);
    imp = await d.complete(`You are the SEO/AEO editor of the #1 SEO agency. ${BRAND}\n\n${productFacts(k)}`,
      `Improve this post's search snippet and answer-engine readiness. Problem: ${cand.reason}. Queries it ranks for: ${JSON.stringify(queries)}.
Title: ${post.title}\nDescription: ${post.description}\nAnswer: ${post.answer}\nFAQ: ${JSON.stringify(post.faq || [])}\nSources (only these may back new claims): ${JSON.stringify(post.sources || [])}
Return JSON {"title" (<= 65 chars, keeps the primary keyword),"description" (120-160 chars),"answer" (40-70 words),"faq":[{"q","a"}],"new_claims":[{"text","source"}]}. No "<" or "{" characters. No new Komendly facts beyond the product facts.`,
      { env, db, job: 'optimize' });
    id = (await db.query('INSERT INTO optimize_suggestions (slug, suggestion) VALUES ($1,$2) RETURNING id', [cand.slug, JSON.stringify(imp)])).rows[0].id;
  }
  const updated = { ...post, slug: cand.slug, title: imp.title || post.title, description: imp.description || post.description, answer: imp.answer || post.answer,
    faq: Array.isArray(imp.faq) && imp.faq.length ? imp.faq.filter((x) => x.q && x.a) : post.faq,
    claims: [...(post.claims || []), ...(imp.new_claims || []).filter((c) => c && c.text)], published: false, status: 'draft', approved_by: '' }; // date kept; gate bumps updated
  const r = await d.openPr({ db, env, post: updated, fileText: serializePost(updated), kind: 'refresh', reason: cand.reason, file, log,
    notes: '\n\n**Note:** `published` is false until the gate approves; merging without approval would unpublish the post.' });
  await db.query('UPDATE optimize_suggestions SET used = true WHERE id = $1', [id]);
  if (r.number && autoPublish(env)) {
    try { r.gate = await d.gate({ db, env, log, number: r.number }); }
    catch (e) { r.gate = e.defer ? { deferred: e.message.slice(0, 200) } : { error: e.message.slice(0, 500) }; }
  }
  return { slug: cand.slug, ...r };
}
