// Weekly: new topics/questions from GSC queries + competitor seed -> topic backlog (source 'research').
import { completeJson, llmConfigured } from '../llm.js';
import { existingArticles, duplicateOf } from '../existing.js';
import { loadCompetitors, loadTopics, seedTopics } from '../seed.js';
import { slugify } from '../frontmatter.js';
import { BRAND } from '../prompts.js';

const TYPES = ['guide', 'comparison', 'alternatives', 'question', 'listicle', 'glossary'];

/** 1 (write first) .. 5: fit dominates, GSC impressions and striking-distance position break ties. */
export function priorityFor({ fit = 0.5, funnel = 'mofu', impressions = 0, position = null }) {
  let score = Math.max(0, Math.min(1, Number(fit) || 0)) * 60 + ({ bofu: 25, mofu: 15, tofu: 5 }[funnel] ?? 10);
  score += Math.min(10, Math.log10(1 + impressions) * 3) + (position && position > 4 && position <= 20 ? 5 : 0);
  return score >= 75 ? 1 : score >= 60 ? 2 : score >= 45 ? 3 : score >= 30 ? 4 : 5;
}

export async function run({ db, env = process.env, log = console, deps = {} }) {
  if (!llmConfigured(env)) return { skipped: 'not configured: LLM_PROVIDER_ORDER must be codex' };
  const d = { complete: completeJson, existing: existingArticles, competitors: loadCompetitors, topics: loadTopics, ...deps };
  await seedTopics(db, await d.topics());
  const gsc = (await db.query(`SELECT query, SUM(impressions)::int AS impressions, SUM(clicks)::int AS clicks, AVG(position) AS position
    FROM metrics_daily WHERE provider = 'gsc' AND query <> '' AND day > CURRENT_DATE - 28 GROUP BY query ORDER BY impressions DESC LIMIT 150`)).rows;
  const backlog = (await db.query('SELECT slug, primary_keyword FROM topics ORDER BY id')).rows;
  const articles = await d.existing({ db, env });
  const comps = (await d.competitors()).map((c) => ({ name: c.name, category: c.category, best_for: c.best_for }));
  const ideas = await d.complete(`You are the SEO/AEO strategist of the #1 SEO agency. ${BRAND}`,
    `Find NEW blog topics that will bring qualified readers (small businesses, founders, marketers running Meta ads) who would try Komendly's free ads.
Search Console queries (28 days, may be empty): ${JSON.stringify(gsc)}
Competitors: ${JSON.stringify(comps)}
Already in the backlog (do NOT propose these or close variants): ${JSON.stringify(backlog.map((b) => b.primary_keyword))}
Published posts (no near-duplicates; complementary topics only): ${JSON.stringify(articles.map((a) => a.title))}
Return a JSON array of up to 12: [{"slug","title","type":"${TYPES.join('|')}","primary_keyword","secondary_keywords":[],"intent","funnel":"tofu|mofu|bofu","cta":"ads|motion","competitors":[],"angle","questions":[],"fit":0-1 (how likely the searcher would make ads with Komendly)}]`,
    { env, db, job: 'research' });
  const gscBy = new Map(gsc.map((g) => [String(g.query).toLowerCase(), g]));
  let stored = 0;
  for (const o of Array.isArray(ideas) ? ideas : []) {
    if (!o || typeof o.primary_keyword !== 'string' || !o.primary_keyword.trim()) continue;
    const kw = o.primary_keyword.trim().toLowerCase().slice(0, 200);
    const slug = slugify(o.slug || o.title || kw);
    if (!slug || duplicateOf({ slug, keyword: kw, title: o.title }, [...articles, ...backlog.map((b) => ({ slug: b.slug, primary_keyword: b.primary_keyword }))])) continue;
    const g = gscBy.get(kw) || {};
    const r = await db.query(`INSERT INTO topics (slug, title, type, primary_keyword, secondary_keywords, intent, funnel, priority, cta, competitors, angle, questions, source, impressions, position)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'research',$13,$14) ON CONFLICT (slug) DO NOTHING RETURNING id`,
    [slug, String(o.title || '').slice(0, 200), TYPES.includes(o.type) ? o.type : 'guide', kw, JSON.stringify(o.secondary_keywords || []), o.intent || null,
      ['tofu', 'mofu', 'bofu'].includes(o.funnel) ? o.funnel : 'mofu', priorityFor({ ...o, impressions: g.impressions || 0, position: g.position ? Number(g.position) : null }),
      o.cta === 'motion' ? 'motion' : 'ads', JSON.stringify(o.competitors || []), String(o.angle || '').slice(0, 1000), JSON.stringify(o.questions || []), g.impressions || 0, g.position ? Number(g.position) : null]);
    if (r.rows.length) { stored++; backlog.push({ slug, primary_keyword: kw }); }
  }
  log.log(`[research] stored ${stored} topics`);
  return { stored, gscQueries: gsc.length };
}
