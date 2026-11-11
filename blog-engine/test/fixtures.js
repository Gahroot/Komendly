// Shared builders (fresh objects per call; no shared mutable fixtures).
export const SRC1 = 'https://www.adcreative.ai/pricing';
export const SRC2 = 'https://www.facebook.com/business/help/123';
export const answer = () => Array(50).fill('word').join(' ');

export function goodPost(over = {}) {
  return {
    title: 'Komendly vs AdCreative.ai: which AI ad tool fits you?',
    slug: 'komendly-vs-adcreative-ai',
    description: 'Komendly vs AdCreative.ai compared on price, free trial, ad formats and Meta publishing, with an honest verdict on which AI ad tool fits.',
    date: '2026-11-07', updated: '2026-11-07', author: 'Nolan Grout', type: 'comparison', tags: ['AI ad generator'],
    published: false, status: 'draft', approved_by: '', primary_keyword: 'komendly vs adcreative.ai', secondary_keywords: ['adcreative.ai pricing'],
    answer: answer(), key_takeaways: ['Pick by use case.'], competitors: ['AdCreative.ai'], cta: 'ads',
    faq: [{ q: 'Is AdCreative.ai worth it?', a: 'It depends on volume.[^1]' }],
    sources: [{ id: 1, title: 'AdCreative.ai pricing', publisher: 'AdCreative.ai', url: SRC1, accessed: '2026-11-07' },
      { id: 2, title: 'About Advantage+', publisher: 'Meta', url: SRC2, accessed: '2026-11-07' }],
    claims: [{ text: "AdCreative.ai's Starter plan costs $39 per month as of November 2026.", source: 1 }, { text: 'Meta offers Advantage+ campaigns.', source: 2 }],
    body: "## Which is cheaper?\n\nKomendly's Starter plan is $49 a month for 20 credits, and the free trial gives 10 static ads plus 1 animated ad with no card. AdCreative.ai's Starter plan costs $39 per month as of November 2026.[^1]\n\n## Can I publish to Meta?\n\nMeta offers Advantage+ campaigns.[^2] See [pricing](/pricing) and [our guide](/blog/other-post).\n\n```\nconst x = { a: 1 } < 2\n```\n",
    ...over
  };
}
