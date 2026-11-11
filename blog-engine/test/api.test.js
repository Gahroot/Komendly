import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createHandler } from '../src/api.js';
import { createScheduler } from '../src/scheduler.js';
import { memDb } from './helpers.js';

test('health public; admin needs Bearer; status reports db, codex, github, gsc/bing, topics, runs; run/<job>', async () => {
  const db = await memDb();
  await db.query("INSERT INTO topics (slug, primary_keyword, status) VALUES ('a','a','open'), ('b','b','drafted')");
  const ran = [];
  const scheduler = createScheduler({ db, jobs: { monitor: { schedule: { hour: 6 }, run: async () => { ran.push(1); return {}; } } }, log: { log() {}, error() {} } });
  const env = { GITHUB_TOKEN: 't', BING_API_KEY: 'b' };
  const handler = createHandler({ db, scheduler, adminToken: 'secret', env, log: { error() {} },
    codexStatus: async () => ({ installed: true, loggedIn: false, lastRefresh: null, lastSuccess: null, lastError: null }),
    githubStatus: async () => ({ configured: true, ok: true, repo: 'Gahroot/Komendly', push: true }) });
  const server = http.createServer(handler);
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const auth = { headers: { authorization: 'Bearer secret' } };
  try {
    assert.deepEqual(await (await fetch(base + '/api/health')).json(), { ok: true });
    assert.equal((await fetch(base + '/api/admin/status')).status, 401);
    assert.equal((await fetch(base + '/api/admin/status', { headers: { authorization: 'Bearer nope!' } })).status, 401);
    const st = await (await fetch(base + '/api/admin/status', auth)).json();
    assert.deepEqual(st.db, { connected: true });
    assert.equal(st.codex.installed, true);
    assert.equal(st.codex.loggedIn, false);
    assert.equal(st.github.tokenSet, true);
    assert.equal(st.github.repoAccess, true);
    assert.equal(st.gsc.configured, false);
    assert.equal(st.bing.configured, true);
    assert.deepEqual(st.topics, { open: 1, drafted: 1 });
    assert.ok(Array.isArray(st.recentRuns));
    assert.equal(JSON.stringify(st).includes('"t"'), false, 'token never echoed');
    assert.equal((await fetch(base + '/api/admin/run/nope', auth)).status, 404);
    const r = await fetch(base + '/api/admin/run/monitor', auth);
    assert.equal(r.status, 202);
    for (let i = 0; i < 100 && !ran.length; i++) await new Promise((x) => setTimeout(x, 10));
    assert.equal(ran.length, 1);
  } finally { server.close(); }
});
