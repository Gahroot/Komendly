'use strict';

const { describe, it, before, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const nock = require('nock');
const zapier = require('zapier-platform-core');

const App = require('../index');
const { UPGRADE_URL } = require('../lib/constants');
const { runSample, adSample } = require('../lib/samples');

const appTester = zapier.createAppTester(App);
const API = 'https://www.komendly.com';
const KEY = 'kmd_' + 'a'.repeat(40);
const bundle = (inputData = {}) => ({ authData: { api_key: KEY }, inputData });
const authed = () => nock(API, { reqheaders: { authorization: `Bearer ${KEY}`, 'x-komendly-client': 'zapier' } });

const run = (id, over = {}) => ({ ...runSample, id, run_id: id, ...over });
const summary = (id, url, over = {}) => ({ id, url, status: 'completed', isTrial: false, createdAt: '2026-11-21T10:00:00.000Z', readyCount: 3, totalCount: 3, ...over });

before(() => nock.disableNetConnect());
afterEach(() => {
  assert.ok(nock.isDone(), `pending mocks: ${nock.pendingMocks()}`);
  nock.cleanAll();
});

describe('authentication', () => {
  it('tests the key against /api/ads/me and labels the connection by email', async () => {
    authed().get('/api/ads/me').reply(200, { id: 'w1', email: 'owner@acme-hvac.com', plan: 'free' });
    const me = await appTester(App.authentication.test, bundle());
    assert.equal(me.email, 'owner@acme-hvac.com');
    assert.equal(App.authentication.connectionLabel, '{{email}}');
    assert.match(App.authentication.fields[0].helpText, /dashboard\/api\?utm_source=zapier/);
  });

  it('explains a bad key with a link to get a new one', async () => {
    nock(API).get('/api/ads/me').reply(401, { error: 'Please sign in to continue.', code: 'unauthenticated' });
    await assert.rejects(appTester(App.authentication.test, bundle()), /API key is missing, invalid or revoked.*dashboard\/api/);
  });
});

describe('create: generate_ads', () => {
  it('starts a pack with goal + offer and returns the run with links', async () => {
    authed()
      .post('/api/ads/runs', { url: 'https://acme-hvac.com', goal: 'leads', seed: { angle: '$49 AC tune-up', hook: '$49 AC tune-up', origin: 'hook_library' } })
      .reply(201, { runId: 'r1', resumed: false });
    authed().get('/api/zapier/runs/r1').reply(200, run('r1', { status: 'extracting', done: false, image_urls: [] }));
    const out = await appTester(App.creates.generate_ads.operation.perform, bundle({ website: 'https://acme-hvac.com', goal: 'leads', offer: ' $49 AC tune-up ' }));
    assert.equal(out.id, 'r1');
    assert.equal(out.resumed, false);
    assert.equal(out.upgrade_url, UPGRADE_URL);
    assert.ok(Array.isArray(out.image_urls));
  });

  it('sends only the URL by default, motion when animated', async () => {
    authed().post('/api/ads/runs', { url: 'acme.com', motion: true }).reply(200, { runId: 'r2', resumed: true });
    authed().get('/api/zapier/runs/r2').reply(200, run('r2'));
    const out = await appTester(App.creates.generate_ads.operation.perform, bundle({ website: 'acme.com', animated: true }));
    assert.equal(out.resumed, true);
  });

  it('turns out-of-credits into an upgrade link with utm_source=zapier', async () => {
    nock(API).post('/api/ads/runs').reply(402, { error: 'Your free Ad Pack was already used.', code: 'trial_used' });
    await assert.rejects(
      appTester(App.creates.generate_ads.operation.perform, bundle({ website: 'acme.com' })),
      (e) => e.message.includes('free Ad Pack was already used') && e.message.includes('utm_source=zapier'),
    );
  });

  it('retries later on rate limits', async () => {
    nock(API).post('/api/ads/runs').reply(429, { error: 'Too many requests with this API key.', code: 'rate_limited' });
    await assert.rejects(appTester(App.creates.generate_ads.operation.perform, bundle({ website: 'acme.com' })), (e) => e.name === 'ThrottledError');
  });
});

describe('search: find_run', () => {
  it('finds by id', async () => {
    authed().get('/api/zapier/runs/r1').reply(200, run('r1'));
    const out = await appTester(App.searches.find_run.operation.perform, bundle({ run_id: 'r1' }));
    assert.equal(out.length, 1);
    assert.equal(out[0].image_url, runSample.image_url);
  });

  it('returns nothing for an unknown id', async () => {
    authed().get('/api/zapier/runs/nope').reply(404, { error: 'Not found.', code: 'not_found' });
    assert.deepEqual(await appTester(App.searches.find_run.operation.perform, bundle({ run_id: 'nope' })), []);
  });

  it('still raises real errors on id lookups', async () => {
    authed().get('/api/zapier/runs/r1').reply(500, { error: 'Something went wrong. Please try again.', code: 'internal' });
    await assert.rejects(appTester(App.searches.find_run.operation.perform, bundle({ run_id: 'r1' })), /Something went wrong/);
  });

  it('finds the newest pack for a website, ignoring scheme and www', async () => {
    authed().get('/api/ads/runs').reply(200, { runs: [summary('r9', 'https://other.com'), summary('r8', 'https://www.acme-hvac.com/'), summary('r7', 'https://acme-hvac.com')] });
    authed().get('/api/zapier/runs/r8').reply(200, run('r8'));
    const out = await appTester(App.searches.find_run.operation.perform, bundle({ website: 'acme-hvac.com' }));
    assert.equal(out[0].id, 'r8');
  });

  it('returns nothing when no pack matches the website', async () => {
    authed().get('/api/ads/runs').reply(200, { runs: [summary('r9', 'https://other.com')] });
    assert.deepEqual(await appTester(App.searches.find_run.operation.perform, bundle({ website: 'acme-hvac.com' })), []);
  });
});

describe('trigger: ads_ready', () => {
  const ads = [
    { ...adSample, id: 'a2', ad_id: 'a2', website: 'https://www.acme-hvac.com' },
    { ...adSample, id: 'a1', ad_id: 'a1', website: 'https://other.com' },
  ];

  it('polls the ready-ads feed; every ad has an id, image link and upgrade link', async () => {
    authed().get('/api/zapier/ads').query({ limit: 50 }).reply(200, { ads });
    const out = await appTester(App.triggers.ads_ready.operation.perform, bundle());
    assert.deepEqual(out.map((a) => a.id), ['a2', 'a1']);
    for (const a of out) {
      assert.ok(a.image_url);
      assert.equal(a.upgrade_url, UPGRADE_URL);
    }
  });

  it('filters by website and passes the pack id through', async () => {
    authed().get('/api/zapier/ads').query({ limit: 50, run_id: 'r1' }).reply(200, { ads });
    const out = await appTester(App.triggers.ads_ready.operation.perform, bundle({ website: 'acme-hvac.com', run_id: 'r1' }));
    assert.deepEqual(out.map((a) => a.id), ['a2']);
  });
});

describe('trigger: new_run', () => {
  it('loads the newest packs in full and summarizes the rest', async () => {
    const runs = Array.from({ length: 7 }, (_, i) => summary(`r${7 - i}`, 'https://acme-hvac.com'));
    authed().get('/api/ads/runs').reply(200, { runs });
    for (const r of runs.slice(0, 5)) authed().get(`/api/zapier/runs/${r.id}`).reply(200, run(r.id));
    const out = await appTester(App.triggers.new_run.operation.perform, bundle());
    assert.deepEqual(out.map((r) => r.id), ['r7', 'r6', 'r5', 'r4', 'r3', 'r2', 'r1']);
    assert.equal(out[0].image_url, runSample.image_url);
    assert.deepEqual(out[6].image_urls, []);
    for (const r of out) assert.equal(r.upgrade_url, UPGRADE_URL);
  });
});

describe('app definition', () => {
  it('has samples with image links and upgrade links on every operation', () => {
    const ops = [...Object.values(App.triggers), ...Object.values(App.searches), ...Object.values(App.creates)];
    for (const op of ops) {
      assert.ok('image_urls' in op.operation.sample, op.key);
      assert.equal(op.operation.sample.upgrade_url, UPGRADE_URL, op.key);
    }
  });
});
