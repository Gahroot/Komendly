import test from 'node:test';
import assert from 'node:assert/strict';
import { memDb } from './helpers.js';
import { similarity, duplicateOf, existingArticles, relatedArticles } from '../src/existing.js';
import * as draft from '../src/jobs/draft.js';
import * as audit from '../src/jobs/audit.js';
import * as monitor from '../src/jobs/monitor.js';
import * as research from '../src/jobs/research.js';
import * as optimize from '../src/jobs/optimize.js';
import * as report from '../src/jobs/report.js';
import { seedTopics, loadTopics, loadCompetitors } from '../src/seed.js';
import { serializePost, parsePost } from '../src/frontmatter.js';
import { loadKnowledge } from '../src/knowledge.js';
import { DeferError } from '../src/mode.js';
import { goodPost, answer } from './fixtures.js';

const log = { log() {}, error() {} };
const LIVE = [{ slug: 'best-ai-video-testimonial-tools-small-businesses', title: 'Best AI video testimonial tools for small businesses', primary_keyword: 'ai video testimonial tools', secondary_keywords: [], published: true }];

test('duplicates and internal-link candidates', () => {
  assert.ok(duplicateOf({ keyword: 'best ai video testimonial tools small business' }, LIVE));
  assert.ok(duplicateOf({ slug: 'best-ai-video-testimonial-tools-small-businesses', keyword: 'zzz' }, LIVE));
  assert.equal(duplicateOf({ keyword: 'komendly vs adcreative.ai' }, LIVE), null);
  assert.ok(similarity('adcreative.ai alternatives', 'alternatives to adcreative ai') >= 0.6);
  assert.equal(relatedArticles({ slug: 'x', title: 'video testimonials guide', primary_keyword: 'video testimonial' }, LIVE)[0].slug, LIVE[0].slug);
});

test('seed files load into the backlog idempotently, in priority order', async () => {
  const db = await memDb();
  const topics = await loadTopics();
  assert.ok(topics.length > 0 && (await loadCompetitors()).length > 0, 'seed files present');
  const n = await seedTopics(db, topics);
  assert.equal(n, new Set(topics.map((t) => t.slug)).size);
  assert.equal(await seedTopics(db, topics), 0);
  assert.equal((await db.query("SELECT priority FROM topics ORDER BY priority, id LIMIT 1")).rows[0].priority, 1);
  assert.deepEqual(await loadTopics('/nonexistent'), []);
});

test('existingArticles reads content/blog (.md and .mdx) on main and merges DB rows', async () => {
  const db = await memDb();
  await db.query("INSERT INTO posts (slug, title, primary_keyword, status) VALUES ('pending-one','P','kw','pending')");
  const md = Buffer.from('---\ntitle: "Old post"\ndate: 2025-12-05\npublished: true\n---\nBody').toString('base64');
  const ghImpl = async (m, route) => (route.endsWith('content/blog?ref=main') ? [{ name: 'old-post.mdx' }, { name: 'x.txt' }] : { content: md });
  const list = await existingArticles({ db, env: { GITHUB_TOKEN: 't' }, ghImpl });
  assert.deepEqual(list.map((a) => a.slug).sort(), ['old-post', 'pending-one']);
});

const RAW = (over = {}) => ({ ...goodPost(), ...over });

test('draft: picks highest-priority open topic, skips duplicates, opens PR, gates it; quota DRAFTS_PER_DAY', async () => {
  const db = await memDb();
  const topics = [
    { slug: 'best-ai-video-testimonial-tools', title: 'Best AI video testimonial tools', type: 'listicle', primary_keyword: 'ai video testimonial tools', priority: 1 },
    { slug: 'komendly-vs-adcreative-ai', title: 'Komendly vs AdCreative.ai', type: 'comparison', primary_keyword: 'komendly vs adcreative.ai', priority: 1, competitors: ['AdCreative.ai'] },
    { slug: 'later', title: 'Later', primary_keyword: 'later topic', priority: 5 }
  ];
  const prompts = [], opened = [];
  const deps = {
    topics: async () => topics, competitors: async () => [], knowledge: async () => loadKnowledge(), existing: async () => LIVE,
    complete: async (sys, prompt, o) => { prompts.push(prompt); assert.equal(o.search, true); assert.match(sys, /price: 49/); return RAW(); },
    finalize: async (post) => ({ post, dropped: [], issues: [] }),
    openPr: async ({ post, fileText }) => { opened.push({ post, fileText }); await db.query("INSERT INTO posts (slug, status, kind, pr_number) VALUES ($1,'draft','new',3) ON CONFLICT (slug) DO UPDATE SET pr_number = 3", [post.slug]); return { number: 3 }; },
    gate: async () => ({ outcome: 'merged' }), now: () => new Date()
  };
  const env = { GITHUB_TOKEN: 't', DRAFTS_PER_DAY: '1' };
  const r = await draft.run({ db, env, log, deps });
  assert.equal(r.number, 3);
  assert.match(prompts[0], /Slug \(use exactly\): komendly-vs-adcreative-ai/);
  const p = parsePost(opened[0].fileText);
  assert.equal(p.published, false);
  assert.equal(p.author, 'Nolan Grout');
  const st = Object.fromEntries((await db.query('SELECT slug, status FROM topics')).rows.map((t) => [t.slug, t.status]));
  assert.equal(st['best-ai-video-testimonial-tools'], 'duplicate');
  assert.equal(st['komendly-vs-adcreative-ai'], 'drafted');
  assert.match((await draft.run({ db, env, log, deps })).skipped, /daily quota/);
  assert.match((await draft.run({ db, env: {}, log, deps })).skipped, /GITHUB_TOKEN/);
});

test('draft: Codex unavailable -> DeferError propagates (job deferred)', async () => {
  const db = await memDb();
  const deps = { topics: async () => [{ slug: 'a-topic', primary_keyword: 'a topic' }], competitors: async () => [], knowledge: async () => loadKnowledge(), existing: async () => [],
    complete: async () => { throw new DeferError('codex unavailable: daytime'); }, now: () => new Date() };
  await assert.rejects(draft.run({ db, env: { GITHUB_TOKEN: 't' }, log, deps }), (e) => e.defer === true);
});

const LEGACY = '---\ntitle: "Why your 5-star reviews are not converting"\ndescription: "x"\ndate: 2025-12-05\nauthor: "Komendly Team"\npublished: true\n---\n\n79% of consumers trust video more than text.\n';

test('audit: older post with unsourced stats -> rewrite PR (cite or remove), original date kept; engine post passing -> ok', async () => {
  const db = await memDb();
  const good = serializePost({ ...goodPost(), published: true, status: 'approved', approved_by: 'x' });
  const opened = [], gated = [], revised = [];
  const deps = {
    gh: async () => [],
    list: async () => [{ name: 'why-your-5-star-reviews-arent-converting.mdx', path: 'content/blog/why-your-5-star-reviews-arent-converting.mdx', text: LEGACY },
      { name: 'komendly-vs-adcreative-ai.md', path: 'content/blog/komendly-vs-adcreative-ai.md', text: good }],
    factCheck: async () => ({ ok: true, verdicts: [{ verdict: 'supported' }], unlisted: [] }),
    revise: async ({ post, lint }) => { revised.push(lint); return { ...goodPost(), slug: 'ignored', date: '2026-11-07', body: '## Why?\n\nReviews matter.[^1]' }; },
    finalize: async (post) => ({ post, dropped: [], issues: [] }),
    knowledge: async () => loadKnowledge(), competitors: async () => [],
    openPr: async (a) => { opened.push(a); return { number: 12 }; },
    gate: async ({ number }) => { gated.push(number); return { outcome: 'merged' }; }
  };
  const out = await audit.run({ db, env: { GITHUB_TOKEN: 't' }, log, deps });
  assert.equal(out.audited, 2);
  assert.equal(opened.length, 1);
  assert.equal(opened[0].file, 'content/blog/why-your-5-star-reviews-arent-converting.mdx');
  const p = parsePost(opened[0].fileText);
  assert.equal(p.slug, 'why-your-5-star-reviews-arent-converting');
  assert.equal(p.date, '2025-12-05', 'original date kept');
  assert.equal(p.published, false);
  assert.match(revised[0].join('\n'), /cited to a real source.*or removed/);
  assert.match(revised[0].join('\n'), /statistic without a citation/);
  assert.deepEqual(gated, [12]);
  assert.match((await audit.run({ db, env: { GITHUB_TOKEN: 't' }, log, deps })).skipped, /audited recently/);
});

test('missing keys -> skipped, never crash', async () => {
  const db = await memDb();
  const fetchImpl = async () => ({ ok: true, status: 200, text: async () => '<loc>https://komendly.com/blog/a</loc>' });
  const m = await monitor.run({ db, env: {}, log, fetchImpl });
  assert.match(m.gsc, /skipped/);
  assert.match(m.bing, /skipped/);
  assert.match(m.sitemap, /200, 1 urls, 1 blog/);
  assert.match((await optimize.run({ db, env: {}, log })).skipped, /GITHUB_TOKEN/);
  assert.match((await audit.run({ db, env: {}, log })).skipped, /GITHUB_TOKEN/);
  assert.match((await report.run({ db, env: {} })).issue, /saved in DB only/);
});

test('research adds non-duplicate topics with a priority', async () => {
  const db = await memDb();
  const deps = { topics: async () => [], competitors: async () => [], existing: async () => LIVE,
    complete: async () => [{ slug: 'how-to-launch-mass-ad-campaign', title: 'How do I launch a mass ad campaign?', type: 'question', primary_keyword: 'mass ad campaign', funnel: 'bofu', fit: 0.9 },
      { title: 'dup', primary_keyword: 'best ai video testimonial tools small business' }] };
  const r = await research.run({ db, env: {}, log, deps });
  assert.equal(r.stored, 1);
  assert.equal((await db.query("SELECT priority, source FROM topics")).rows[0].priority, 1);
  assert.equal(research.priorityFor({ fit: 0.1, funnel: 'tofu' }), 5);
});

test('buildPost normalises Codex output to CONTRACT.md', () => {
  const p = draft.buildPost({ title: 'T', description: 'd'.repeat(200), answer: answer(), type: 'nope', cta: 'x', sources: [{ title: 's', url: 'https://a.b' }] }, { today: '2026-11-07', topic: { slug: 'my-topic', primary_keyword: 'KW', type: 'question' } });
  assert.equal(p.slug, 'my-topic');
  assert.equal(p.type, 'question');
  assert.equal(p.cta, 'ads');
  assert.ok(p.description.length <= 160);
  assert.equal(p.sources[0].accessed, '2026-11-07');
});
