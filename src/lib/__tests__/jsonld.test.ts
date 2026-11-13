import { describe, expect, it } from 'vitest'
import { PLANS_FOR_SALE } from '@/lib/ads/billing-config'
import { resolveAuthor } from '@/lib/authors'
import { parsePostFile } from '@/lib/blog'
import { blogPostingJsonLd, breadcrumbJsonLd, faqJsonLd, graph, jsonLdString, organizationJsonLd, softwareApplicationJsonLd, studioApplicationJsonLd } from '@/lib/seo/jsonld'
import { buildLlmsFullTxt, buildLlmsTxt, buildRss } from '@/lib/seo/llms'
import { NOINDEX_PATHS, PRIVATE_PATHS } from '@/lib/seo/crawl'
import { firstTouchFromUrl, parseFirstTouch, serializeFirstTouch } from '@/lib/analytics/first-touch'

const NOW = new Date('2026-01-01T00:00:00Z')
const post = parsePostFile(
  'komendly-vs-x',
  '---\ntitle: "Komendly vs X"\ndescription: D\ndate: 2026-11-07\nupdated: 2026-11-08\ntype: comparison\ncompetitors: [X]\nanswer: "A.[^1]"\nfaq:\n  - q: "Q?"\n    a: "Ans.[^1]"\n---\n',
  NOW,
)
const author = resolveAuthor(post.author)

describe('JSON-LD builders', () => {
  it('BlogPosting/Article for comparison posts', () => {
    const ld = blogPostingJsonLd(post, author, '/blog/komendly-vs-x/opengraph-image')
    expect(ld).toMatchObject({
      '@type': 'Article',
      headline: 'Komendly vs X',
      datePublished: '2026-11-07T00:00:00.000Z',
      dateModified: '2026-11-08T00:00:00.000Z',
      author: { '@type': 'Person', name: 'Nolan Grout', url: 'https://www.komendly.com/blog/author/nolan-grout' },
      publisher: { '@type': 'Organization', name: 'Komendly' },
      image: 'https://www.komendly.com/blog/komendly-vs-x/opengraph-image',
      mainEntityOfPage: { '@id': 'https://www.komendly.com/blog/komendly-vs-x' },
      about: [{ '@type': 'Thing', name: 'X' }],
      abstract: 'A.',
    })
  })
  it('FAQPage strips footnotes; null without faq', () => {
    const ld = faqJsonLd(post.faq, 'https://www.komendly.com/blog/komendly-vs-x')
    expect(ld).toMatchObject({ '@type': 'FAQPage', mainEntity: [{ name: 'Q?', acceptedAnswer: { text: 'Ans.' } }] })
    expect(faqJsonLd([], 'u')).toBeNull()
  })
  it('BreadcrumbList positions + absolute urls', () => {
    expect(breadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: 'Blog', path: '/blog' }])).toEqual({
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://www.komendly.com/' },
        { '@type': 'ListItem', position: 2, name: 'Blog', item: 'https://www.komendly.com/blog' },
      ],
    })
  })
  it('Organization has the founder; software offers come from billing-config', () => {
    expect(organizationJsonLd(author)).toMatchObject({ founder: { name: 'Nolan Grout' } })
    const offers = softwareApplicationJsonLd().offers as Array<{ name: string; price: string }>
    expect(offers.map((o) => [o.name, o.price])).toEqual([
      ['Free trial', '0'],
      // New-buyer plans only: Growth/Scale are hidden during the founding offer.
      ...PLANS_FOR_SALE.map((p) => [`${p.name} plan`, (p.priceCents / 100).toFixed(2)]),
    ])
  })
  it('graph skips nulls and serialization escapes <', () => {
    expect(graph(null, { a: 1 })).toEqual({ '@context': 'https://schema.org', '@graph': [{ a: 1 }] })
    expect(jsonLdString({ x: '</script>' })).not.toContain('</script>')
  })
})

describe('feeds', () => {
  it('llms.txt lists the post with its answer', () => {
    expect(buildLlmsTxt([post])).toContain('- [Komendly vs X](https://www.komendly.com/blog/komendly-vs-x): A.')
  })
  it('rss escapes and links', () => {
    const rss = buildRss([{ ...post, title: 'A & B' }])
    expect(rss).toContain('<title>A &amp; B</title>')
    expect(rss).toContain('<link>https://www.komendly.com/blog/komendly-vs-x</link>')
  })
})

describe('first-touch attribution', () => {
  it('captures utm params from a blog CTA and round-trips the cookie', () => {
    const ft = firstTouchFromUrl(new URL('https://www.komendly.com/?utm_source=blog&utm_medium=article&utm_campaign=my-post&utm_content=inline'), NOW)
    expect(ft).toEqual({ utm_source: 'blog', utm_medium: 'article', utm_campaign: 'my-post', utm_content: 'inline', landing: '/', at: NOW.toISOString() })
    expect(parseFirstTouch(serializeFirstTouch(ft ?? {}))).toEqual(ft)
  })
  it('ignores visits without utm and garbage cookies', () => {
    expect(firstTouchFromUrl(new URL('https://www.komendly.com/blog'), NOW)).toBeNull()
    expect(parseFirstTouch('%7Bbad')).toBeNull()
    expect(parseFirstTouch(encodeURIComponent(JSON.stringify({ utm_source: '<script>', evil: 1 })))).toEqual({ utm_source: 'script' })
  })
})

describe('llms.txt ad examples', () => {
  it('lists only the gallery pages passed in', () => {
    const txt = buildLlmsTxt([], [{ slug: 'bakeries', plural: 'bakeries', count: 4 }])
    expect(txt).toContain('- [Facebook ad examples for bakeries](https://www.komendly.com/ad-examples/bakeries): 4 real customer ads')
    expect(buildLlmsTxt([])).not.toContain('## Ad examples by industry')
  })
})

describe('Ozzy Studio SEO', () => {
  it('has a free offer plus one offer per plan', () => {
    const app = studioApplicationJsonLd()
    const offers = app.offers as Array<{ name: string; price: string }>
    expect(app.url).toBe('https://www.komendly.com/ozzy-studio')
    expect(offers[0]).toMatchObject({ name: 'Free video', price: '0' })
    expect(offers).toHaveLength(PLANS_FOR_SALE.length + 1)
  })
  it('is listed in llms.txt and llms-full.txt', () => {
    expect(buildLlmsTxt([])).toContain('## Ozzy Studio')
    expect(buildLlmsTxt([])).toContain('https://www.komendly.com/ozzy-studio')
    expect(buildLlmsFullTxt([])).toContain('## Ozzy Studio')
  })
  it('keeps /ozzy-studio crawlable', () => {
    for (const p of [...PRIVATE_PATHS, ...NOINDEX_PATHS]) expect('/ozzy-studio'.startsWith(p)).toBe(false)
  })
})
