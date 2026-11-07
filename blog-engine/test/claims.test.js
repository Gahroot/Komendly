import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { claimsLint } from '../src/claims.js';
import { parseBillingConfig, buildKnowledge, loadKnowledge, runtimeKnowledge } from '../src/knowledge.js';
import { goodPost } from './fixtures.js';

const fixture = readFileSync(new URL('./fixtures/billing-config.ts', import.meta.url), 'utf8');
const file = readFileSync(new URL('../knowledge/komendly.md', import.meta.url), 'utf8');

test('billing-config.ts parsing (live prices from main) replaces the fallback list', async () => {
  assert.deepEqual(parseBillingConfig(fixture), { plans: [{ name: 'Starter', price: 39, credits: 15 }, { name: 'Growth', price: 99, credits: 45 }], topups: [{ name: '10 credits', price: 25, credits: 10 }] });
  const k = buildKnowledge(file, parseBillingConfig(fixture));
  assert.equal(k.source, 'billing-config.ts (main)');
  assert.match(k.text, /plan: Starter \| price: 39/);
  assert.doesNotMatch(k.text, /price: 49/);
  assert.equal(loadKnowledge().source, 'fallback');
  const gh = async (m, route) => { assert.match(route, /contents\/src\/lib\/ads\/billing-config\.ts\?ref=main$/); return { content: Buffer.from(fixture).toString('base64') }; };
  assert.equal((await runtimeKnowledge({ GITHUB_TOKEN: 't' }, gh)).plans[0].price, 39);
  assert.equal((await runtimeKnowledge({ GITHUB_TOKEN: 't' }, async () => { throw new Error('502'); })).source, 'fallback');
});

test('claims lint: clean post passes with fallback facts; Komendly price checked against runtime facts', () => {
  assert.deepEqual(claimsLint(goodPost(), { knowledge: loadKnowledge() }), []);
  const live = buildKnowledge(file, parseBillingConfig(fixture));
  assert.match(claimsLint(goodPost(), { knowledge: live }).join('\n'), /Komendly price \$49 is not in the product facts/);
});

test('claims lint catches invented stats, counts, testimonials, undated/uncited competitor prices, disparagement', () => {
  const k = loadKnowledge();
  const lint = (body) => claimsLint(goodPost({ body }), { knowledge: k }).join('\n');
  assert.match(lint('Komendly costs $59 a month.'), /Komendly price \$59/);
  assert.match(lint('Over 10,000 businesses use Komendly.'), /customer\/user count/);
  assert.match(lint('Komendly is rated 4.9 out of 5 stars.'), /rating/);
  assert.match(lint('Komendly ads increase CTR by 35%.'), /performance stat/);
  assert.match(lint('79% of consumers prefer video.'), /statistic without a citation/);
  assert.match(lint('AdCreative.ai costs $39 per month.[^1]'), /not dated "as of/);
  assert.match(lint('AdCreative.ai costs $39 per month as of November 2026.'), /without a citation/);
  assert.match(lint('AdCreative.ai is a scam.'), /disparaging/);
  assert.match(lint('Komendly gives 20 free static ads in the free trial.'), /10 static \+ 1 animated/);
  assert.match(lint('Komendly can publish your ads to TikTok.'), /only publishes to Meta/);
  assert.equal(lint('79% of marketers test creatives weekly.[^2]'), '');
});
