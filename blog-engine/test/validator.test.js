import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePost, mdxIssues } from '../src/validator.js';
import { dateIssues, parsePost, serializePost, setApproval } from '../src/frontmatter.js';
import { goodPost } from './fixtures.js';

test('a contract-shaped post validates; YAML round-trips', () => {
  const p = goodPost();
  assert.deepEqual(validatePost(p, { filename: 'content/blog/komendly-vs-adcreative-ai.md', knownSlugs: new Set(['other-post']) }), []);
  const back = parsePost(serializePost(p));
  assert.equal(back.published, false);
  assert.equal(back.date, '2026-11-07');
  assert.equal(back.sources[0].accessed, '2026-11-07');
  assert.equal(back.claims[0].source, 1);
  assert.deepEqual(validatePost(back, { filename: 'komendly-vs-adcreative-ai.md' }), []);
});

test('validator catches contract violations', () => {
  const bad = goodPost({ slug: 'x', description: 'short', answer: 'too short', author: 'Komendly Team', type: 'review', cta: 'buy',
    claims: [{ text: 'c', source: 9 }], body: '## Q?\n\nText[^7] <div>hi</div> and {props}.\n\n[^1]: def' });
  const e = validatePost(bad, { filename: 'content/blog/komendly-vs-adcreative-ai.md', knownSlugs: new Set() }).join('\n');
  for (const re of [/slug "x" does not match/, /description is 5 chars/, /answer is 2 words/, /author must be/, /type "review"/, /cta "buy"/,
    /citation \[\^7\] has no source/, /unsourced claim: c/, /"<" or ">" outside code/, /"\{" or "\}" outside code/, /footnote definition/]) assert.match(e, re);
  assert.match(validatePost(goodPost(), { knownSlugs: new Set() }).join(), /internal link \/blog\/other-post/);
  assert.deepEqual(mdxIssues('Use `a < b` and\n```js\nif (a) { b }\n```\n> quote'), []);
});

test('dateIssues: no backdating, no future dates, refresh keeps original date', () => {
  const today = '2026-11-07';
  assert.deepEqual(dateIssues({ date: '2026-11-07', updated: '2026-11-07' }, { today, prCreatedDay: '2026-11-07' }), []);
  assert.match(dateIssues({ date: '2026-11-01', updated: '2026-11-07' }, { today, prCreatedDay: '2026-11-06' }).join(), /no backdating/);
  assert.match(dateIssues({ date: '2026-11-08', updated: '2026-11-08' }, { today }).join(), /date 2026-11-08 is in the future/);
  assert.deepEqual(dateIssues({ date: '2025-12-05', updated: '2026-11-07' }, { today, prCreatedDay: '2026-11-07', originalDate: '2025-12-05' }), []);
  assert.match(dateIssues({ date: '2026-11-07', updated: '2026-11-07' }, { today, originalDate: '2025-12-05' }).join(), /changed the original date/);
  const approved = parsePost(setApproval(serializePost(goodPost({ date: '2026-11-01', updated: '2026-11-01' })), 'bot', '2026-11-07'));
  assert.equal(approved.date, '2026-11-07', 'new post: date = real publish day');
  assert.equal(approved.published, true);
  const refresh = parsePost(setApproval(serializePost(goodPost({ date: '2025-12-05' })), 'bot', '2026-11-07', { originalDate: '2025-12-05' }));
  assert.equal(refresh.date, '2025-12-05');
  assert.equal(refresh.updated, '2026-11-07');
});
