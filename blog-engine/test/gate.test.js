import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { memDb } from './helpers.js';
import { run, processPr, factCheck, AUTO_APPROVER } from '../src/jobs/gate.js';
import { serializePost, parsePost } from '../src/frontmatter.js';
import { loadKnowledge } from '../src/knowledge.js';
import { DeferError } from '../src/mode.js';
import { goodPost, SRC2 } from './fixtures.js';

const FILE = 'content/blog/komendly-vs-adcreative-ai.md';
const HTML = '<html><head><title>Pricing</title><meta name="description" content="Starter $39 per month"></head><body>text here and more text</body></html>';
const okFetch = (over = {}) => async (url) => { const s = over[url] ?? 200; if (s === 'throw') throw new TypeError('fetch failed'); return { status: s, text: async () => HTML, body: null }; };
const allSupported = async (sys, prompt, opts) => {
  assert.match(sys, /skeptical/);
  assert.equal(opts.job, 'gate');
  const items = JSON.parse(prompt.match(/excerpt\):\n([\s\S]*?)\n\nListed/)[1]);
  return JSON.stringify({ verdicts: items.map((i) => ({ index: i.index, verdict: 'supported', reason: 'on page' })), unlisted_statements: [] });
};
const NOW = Date.parse('2026-11-07T15:00:00Z');

function harness({ post = goodPost(), comments = [], statuses = [[{ context: 'Vercel', state: 'success' }]], fetch = okFetch(), complete = allSupported, head = 'sha0', onMain = null, created = '2026-11-07T06:00:00Z' } = {}) {
  const calls = [], issues = [], pings = [];
  const pr = { number: 7, title: 'Blog: x', html_url: 'https://github.com/Gahroot/Komendly/pull/7', created_at: created, head: { ref: 'blog/komendly-vs-adcreative-ai', sha: head, repo: { full_name: 'Gahroot/Komendly' } } };
  let pushed = null, st = 0;
  const deps = {
    gh: async (method, route, body) => {
      calls.push({ method, route, body });
      if (method === 'GET' && route.includes('/pulls?state=open')) return [pr];
      if (method === 'GET' && /\/issues\/7\/comments/.test(route)) return comments;
      if (method === 'GET' && route.endsWith('/pulls/7/files?per_page=100')) return [{ filename: FILE, status: 'added' }];
      if (method === 'GET' && route.endsWith('/status')) { const s = statuses[Math.min(st++, statuses.length - 1)]; return { statuses: s }; }
      if (method === 'GET' && route.includes('/contents/content/blog/')) { if (!onMain) throw Object.assign(new Error('-> 404'), { status: 404 }); return { content: Buffer.from(serializePost(onMain)).toString('base64') }; }
      if (method === 'GET' && /\/pulls\/7$/.test(route)) return pr;
      if (method === 'GET' && route.includes('/issues?state=open')) return [];
      return {};
    },
    withCheckout: async (fn) => {
      const dir = await mkdtemp(path.join(tmpdir(), 'gate-test-'));
      try { await mkdir(path.join(dir, 'content/blog'), { recursive: true }); await writeFile(path.join(dir, FILE), serializePost(post)); return await fn(dir); }
      finally { await rm(dir, { recursive: true, force: true }); }
    },
    commitAndPush: async (dir) => { pushed = await readFile(path.join(dir, FILE), 'utf8'); return true; },
    headSha: async () => 'sha1',
    upsertIssue: async (i) => { issues.push(i); return 'url'; },
    knowledge: async () => loadKnowledge(), competitors: async () => [], knownSlugs: async () => ['other-post'],
    waitLive: async () => true, indexNow: async (urls) => { pings.push(...urls); return { status: 200, ok: true }; },
    fetch, complete, sleep: async () => {}, now: (() => { let t = NOW; return () => (t += 60_000); })()
  };
  return { deps, calls, issues, pings, pr, pushed: () => pushed };
}
const env = { GITHUB_TOKEN: 't', GITHUB_REPO: 'Gahroot/Komendly', GATE_CI_TIMEOUT_MS: '600000', LLM_PROVIDER_ORDER: 'codex' };
const log = { log() {}, error() {} };
const merged = (calls) => calls.some((c) => c.method === 'PUT' && c.route.endsWith('/pulls/7/merge'));
const labelled = (calls) => calls.some((c) => c.method === 'POST' && c.route.endsWith('/issues/7/labels') && c.body.labels.includes('needs-review'));

test('pass: approve (published, real date), Vercel pending -> wait, success -> squash-merge, delete branch, IndexNow', async () => {
  const db = await memDb();
  const h = harness({ post: goodPost({ date: '2026-11-07' }), statuses: [[], [{ context: 'Vercel', state: 'pending' }], [{ context: 'Vercel', state: 'success' }]] });
  const out = await run({ db, env, log, deps: h.deps });
  assert.equal(out.results[0].outcome, 'merged');
  const p = parsePost(h.pushed());
  assert.equal(p.published, true);
  assert.equal(p.status, 'approved');
  assert.equal(p.approved_by, AUTO_APPROVER);
  assert.equal(p.date, '2026-11-07');
  assert.equal(h.calls.filter((c) => c.route.endsWith('/commits/sha1/status')).length, 3, 'waited for Vercel');
  const m = h.calls.find((c) => c.method === 'PUT');
  assert.equal(m.body.merge_method, 'squash');
  assert.equal(m.body.sha, 'sha1');
  assert.ok(h.calls.some((c) => c.method === 'DELETE' && c.route.endsWith('/git/refs/heads/blog/komendly-vs-adcreative-ai')));
  assert.deepEqual(h.pings, ['https://komendly.com/blog/komendly-vs-adcreative-ai']);
  assert.deepEqual((await db.query('SELECT outcome FROM gate_results ORDER BY id')).rows.map((r) => r.outcome), ['approved', 'merged']);
  assert.deepEqual((await run({ db, env, log, deps: harness().deps })).results, [], 'idempotent');
});

test('Vercel still pending at timeout -> approved, no merge; next run merges without re-checking', async () => {
  const db = await memDb();
  const h = harness({ statuses: [[{ context: 'Vercel', state: 'pending' }]] });
  const out = await run({ db, env, log, deps: h.deps });
  assert.ok(out.results[0].pending);
  assert.ok(!merged(h.calls));
  const h2 = harness({ complete: async () => { throw new Error('fact-check must not run again'); } });
  assert.equal((await run({ db, env, log, deps: h2.deps })).results[0].outcome, 'merged');
});

test('daytime: CI wait + merge of an approved PR runs any hour; only the fact-check step defers', async () => {
  const db = await memDb();
  await run({ db, env, log, deps: harness({ statuses: [[{ context: 'Vercel', state: 'pending' }]] }).deps });
  const h = harness();
  delete h.deps.complete;
  h.deps.codexBlock = async () => 'daytime';
  assert.equal((await run({ db, env, log, deps: h.deps })).results[0].outcome, 'merged');
  const db2 = await memDb();
  const h2 = harness();
  delete h2.deps.complete;
  h2.deps.codexBlock = async () => 'daytime';
  await assert.rejects(run({ db: db2, env, log, deps: h2.deps }), (e) => e.defer === true && /fact-check waits: daytime/.test(e.message));
  assert.ok(!labelled(h2.calls));
  assert.equal((await db2.query('SELECT COUNT(*)::int AS n FROM gate_results')).rows[0].n, 0);
});

const failing = {
  'unresolvable source': { fetch: okFetch({ [SRC2]: 404 }) },
  validator: { post: goodPost({ body: goodPost().body + '\n\nRaw <b>html</b>.' }) },
  backdated: { post: goodPost(), created: '2026-11-08T12:00:00Z' },
  'claims lint': { post: goodPost({ body: goodPost().body + '\n\nOver 5,000 brands use Komendly.' }) },
  'fact-check overstated': { complete: async () => JSON.stringify({ verdicts: [{ index: 0, verdict: 'supported' }, { index: 1, verdict: 'overstated', reason: 'x' }], unlisted_statements: [] }) },
  'Vercel failed': { statuses: [[{ context: 'Vercel', state: 'failure' }]] }
};
for (const [name, opts] of Object.entries(failing)) {
  test(`fail (${name}) -> no merge, needs-review label + issue for the owner`, async () => {
    const db = await memDb();
    const h = harness(opts);
    const out = await run({ db, env: { ...env, GATE_MAX_REVISIONS: '0' }, log, deps: h.deps });
    assert.equal(out.results[0].outcome, 'held', JSON.stringify(out));
    assert.ok(!merged(h.calls));
    assert.ok(labelled(h.calls));
    assert.equal(h.issues[0].label, 'needs-review');
    assert.deepEqual(h.issues[0].assignees, ['Gahroot']);
    assert.equal(h.pings.length, 0);
  });
}

test('refresh of an existing post keeps its original date', async () => {
  const db = await memDb();
  const h = harness({ post: goodPost({ date: '2025-12-05', updated: '2025-12-05' }), onMain: goodPost({ date: '2025-12-05' }) });
  assert.equal((await run({ db, env, log, deps: h.deps })).results[0].outcome, 'merged');
  const p = parsePost(h.pushed());
  assert.equal(p.date, '2025-12-05');
  assert.equal(p.updated, '2026-11-07');
});

test("owner '/approve' overrides a held PR", async () => {
  const db = await memDb();
  await run({ db, env: { ...env, GATE_MAX_REVISIONS: '0' }, log, deps: harness({ fetch: okFetch({ [SRC2]: 404 }) }).deps });
  const comments = [{ user: { login: 'stranger' }, body: '/approve', created_at: '2026-11-07T10:00:00Z' }, { user: { login: 'Gahroot' }, body: '/approve', created_at: '2026-11-07T11:00:00Z' }];
  const h = harness({ comments });
  const out = await run({ db, env: { ...env, APPROVER_NAME: 'Nolan Grout' }, log, deps: h.deps });
  assert.equal(out.results[0].outcome, 'merged');
  assert.equal(out.results[0].mode, 'override');
  assert.match(h.pushed(), /approved_by: "Nolan Grout"/);
});

test('self-revision: content failure -> writer revises, gate re-runs and merges', async () => {
  const db = await memDb();
  let n = 0;
  const h = harness({ complete: async (s, p) => { n++; const items = JSON.parse(p.match(/excerpt\):\n([\s\S]*?)\n\nListed/)[1]); return JSON.stringify({ verdicts: items.map((i) => ({ index: i.index, verdict: n === 1 && i.index === 1 ? 'overstated' : 'supported' })), unlisted_statements: [] }); } });
  let revised = 0;
  h.deps.revise = async ({ post }) => { revised++; return post; };
  h.deps.finalize = async (post) => ({ post, dropped: [], issues: [] });
  const out = await run({ db, env, log, deps: h.deps });
  assert.equal(out.results[0].outcome, 'merged');
  assert.equal(revised, 1);
  assert.deepEqual((await db.query('SELECT outcome FROM gate_results ORDER BY id')).rows.map((r) => r.outcome), ['revised', 'approved', 'merged']);
});

test('Codex unavailable during fact-check -> deferred, nothing recorded', async () => {
  const db = await memDb();
  const h = harness({ complete: async () => { throw new DeferError('codex unavailable: backing off'); } });
  await assert.rejects(run({ db, env, log, deps: h.deps }), (e) => e.defer === true);
  assert.ok(!labelled(h.calls));
  assert.equal(h.issues.length, 0);
});

test('unfetchable source is still sent to the fact-checker to open itself', async () => {
  let seen;
  const r = await factCheck(goodPost(), { fetchImpl: okFetch({ [SRC2]: 'throw' }), completeImpl: async (s, p, o) => { seen = p; return allSupported(s, p, o); } });
  assert.equal(r.ok, true);
  assert.match(seen, /could not be fetched/);
});

test('AUTO_PUBLISH=false: no gate; /approve approves but never merges', async () => {
  const db = await memDb();
  const off = { ...env, AUTO_PUBLISH: 'false' };
  assert.deepEqual((await run({ db, env: off, log, deps: harness().deps })).results, []);
  const h = harness({ comments: [{ user: { login: 'Gahroot' }, body: '/approve', created_at: '2026-11-07T11:00:00Z' }] });
  const out = await processPr(db, h.pr, { env: off, deps: h.deps, log });
  assert.equal(out.mode, 'manual');
  assert.ok(!merged(h.calls));
});
