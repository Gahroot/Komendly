import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { writeFile } from 'node:fs/promises';
import { codexDeps, codexBlock, codexArgs, weeklyCap, isNight, recordUsage, keepalive } from '../src/codex.js';
import { complete, llmConfigured } from '../src/llm.js';
import { createScheduler } from '../src/scheduler.js';
import { codexOnly, DeferError } from '../src/mode.js';
import * as aiVis from '../src/jobs/aiVisibility.js';
import { memDb } from './helpers.js';

const ENV = { LLM_PROVIDER_ORDER: 'codex', CODEX_MODEL: 'gpt-6.1-sol', CODEX_REASONING_EFFORT: 'high' };
const NIGHT = new Date('2026-11-07T07:00:00Z'); // 2:00 EST
const DAY = new Date('2026-11-07T17:00:00Z');   // 12:00 EST
const quiet = { log() {}, error() {} };

function fakeSpawn({ reply = 'hello', code = 0, stderr = '', events = [], calls = [] } = {}) {
  return (cmd, args) => {
    calls.push(args);
    const child = new EventEmitter();
    child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
    child.stdin = Object.assign(new EventEmitter(), { end: async () => {
      if (code === 0) await writeFile(args[args.indexOf('--output-last-message') + 1], reply);
      for (const e of events) child.stdout.emit('data', JSON.stringify(e) + '\n');
      child.stdout.emit('data', JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 100, cached_input_tokens: 20, output_tokens: 7 } }) + '\n');
      if (stderr) child.stderr.emit('data', stderr);
      child.emit('close', code);
    } });
    child.kill = () => {};
    return child;
  };
}
const setup = (over = {}) => Object.assign(codexDeps, { spawn: fakeSpawn(), available: async () => true, notify: async () => {}, ...over });

test('codex-only is the default; args carry model + reasoning effort; cap 120', () => {
  assert.equal(codexOnly({}), true);
  assert.equal(codexOnly({ LLM_PROVIDER_ORDER: 'codex,anthropic' }), false);
  assert.equal(llmConfigured({}), true);
  const a = codexArgs(ENV, '/tmp/o', '/tmp/c');
  assert.deepEqual(a.slice(a.indexOf('-m'), a.indexOf('-m') + 2), ['-m', 'gpt-6.1-sol']);
  assert.ok(a.includes('model_reasoning_effort="high"'));
  assert.ok(codexArgs(ENV, '/o', '/c', { search: true }).includes('web_search="live"'));
  assert.ok(!codexArgs({ CODEX_REASONING_EFFORT: 'high"; rm -rf' }, '/o', '/c').some((x) => /rm -rf/.test(x)));
  assert.equal(weeklyCap({}), 120);
});

test('polite use: night window, weekly cap, keepalive exempt from both', async () => {
  const db = await memDb();
  setup();
  assert.equal(isNight(NIGHT), true);
  assert.equal(isNight(DAY), false);
  assert.equal(await codexBlock(db, 'draft', { env: ENV, now: NIGHT }), null);
  assert.match(await codexBlock(db, 'draft', { env: ENV, now: DAY }), /daytime/);
  assert.equal(await codexBlock(db, 'draft', { env: { ...ENV, CODEX_ANYTIME: 'true' }, now: DAY }), null);
  assert.equal(await codexBlock(db, 'codex_keepalive', { env: ENV, now: DAY }), null);
  for (let i = 0; i < 3; i++) await recordUsage(db, { job: 'draft' });
  assert.match(await codexBlock(db, 'draft', { env: { ...ENV, CODEX_MAX_CALLS_PER_WEEK: '3' }, now: NIGHT }), /weekly cap/);
});

test('complete() at night runs codex; daytime defers; usage limit -> 24h back-off; auth -> defer; transient -> retryable', async () => {
  const db = await memDb();
  const calls = [];
  setup({ spawn: fakeSpawn({ reply: 'checked', calls }) });
  assert.equal(await complete('sys', 'p', { env: ENV, db, job: 'gate', now: NIGHT }), 'checked');
  assert.equal(calls.length, 1);
  await assert.rejects(complete('s', 'p', { env: ENV, db, job: 'draft', now: DAY }), (e) => e.defer === true && /daytime/.test(e.message));
  setup({ spawn: fakeSpawn({ code: 1, stderr: 'You have hit your usage limit. Try again later.' }) });
  await assert.rejects(complete('s', 'p', { env: ENV, db, job: 'draft', now: NIGHT }), (e) => e.defer === true && /usage limit/.test(e.message));
  await assert.rejects(complete('s', 'p', { env: ENV, db, job: 'draft', now: NIGHT }), (e) => e.defer === true && /backing off/.test(e.message));
  const db2 = await memDb();
  setup({ spawn: fakeSpawn({ code: 1, stderr: '401 Unauthorized: refresh token expired' }) });
  await assert.rejects(complete('s', 'p', { env: ENV, db: db2, job: 'gate', now: NIGHT }), (e) => e.defer === true && /login/.test(e.message));
  const db3 = await memDb();
  setup({ spawn: fakeSpawn({ code: 1, stderr: 'stream disconnected' }) });
  await assert.rejects(complete('s', 'p', { env: ENV, db: db3, job: 'draft', now: NIGHT }), (e) => !e.defer && e.retryable === true);
  setup({ available: async () => false });
  await assert.rejects(complete('s', 'p', { env: ENV, db: db3, job: 'draft', now: NIGHT }), (e) => e.defer === true && /not available/.test(e.message));
  assert.match((await keepalive({ db: db3, env: ENV, log: quiet })).skipped, /not available/);
  setup();
});

test('scheduler: a deferred slot is retried after an hour, without an alert', async () => {
  const db = await memDb();
  let t = new Date('2026-11-07T06:05:00Z');
  let n = 0;
  const alerts = [];
  const jobs = { draft: { schedule: { hours: [1, 3] }, run: async () => { if (++n === 1) throw new DeferError('codex unavailable'); return { ok: true }; } } };
  const s = createScheduler({ db, jobs, now: () => t, retry: { sleep: async () => {} }, onFailure: async (j) => alerts.push(j), log: quiet });
  assert.deepEqual(await s.tick(), ['draft']);
  t = new Date('2026-11-07T06:35:00Z');
  assert.deepEqual(await s.tick(), []);
  t = new Date('2026-11-07T07:10:00Z');
  assert.deepEqual(await s.tick(), ['draft']);
  assert.equal((await db.query('SELECT status FROM job_runs ORDER BY id DESC LIMIT 1')).rows[0].status, 'ok');
  assert.deepEqual(alerts, []);
});

test('ai_visibility: ChatGPT web search via codex; komendly.com citation + recommendation detected', async () => {
  const db = await memDb();
  const calls = [];
  const events = [{ type: 'item.completed', item: { type: 'web_search', results: [{ url: 'https://komendly.com/blog/x' }] } }];
  setup({ spawn: fakeSpawn({ reply: 'I recommend Komendly for small teams. Sources: https://www.adcreative.ai/pricing', events, calls }) });
  const out = await aiVis.run({ db, env: { ...ENV, CODEX_ANYTIME: 'true', AI_VIS_MAX_QUESTIONS: '2' }, log: quiet, slot: new Date('2026-11-11T10:00:00Z') }); // ISO week 46
  assert.deepEqual(out, { questions: 2, cited: 2, mentioned: 2, recommended: 2, errors: 0 });
  assert.ok(calls[0].includes('web_search="live"'));
  assert.match((await aiVis.run({ db, env: ENV, log: quiet, slot: new Date('2026-11-04T10:00:00Z') })).skipped, /odd ISO week/);
  setup();
});
