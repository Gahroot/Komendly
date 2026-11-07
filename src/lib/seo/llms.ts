import { ADS_GUARANTEE, ADS_PLANS, ADS_TOPUPS } from '@/lib/ads/billing-config'
import { CATEGORIES, type BlogPostMeta } from '@/lib/blog'
import { stripFootnotes } from '@/lib/blog-content'
import { SITE_URL } from '@/lib/site'

const usd = (cents: number) => `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`

/** Product facts, all derived from billing-config and the public pricing page. */
export function productFacts(): string[] {
  return [
    'Komendly turns a website URL into on-brand, ready-to-run ad creatives (static and animated) via Ozzy, its AI ad wizard.',
    'Free trial: 10 static ads + 1 animated ad, no credit card required (one trial per website, device and network; email verification required).',
    'Ad sizes: 4:5, 1:1 and 9:16. Ads cover all 5 awareness stages.',
    '1 credit = 1 static ad in one size; an animated ad costs 5 credits.',
    `Monthly plans: ${ADS_PLANS.map((p) => `${p.name} ${usd(p.priceCents)}/month (${p.monthlyCredits} credits)`).join(', ')}.`,
    'One-click publishing to Meta (Facebook and Instagram) is included on Growth and Scale.',
    `One-time credit top-ups: ${ADS_TOPUPS.map((t) => `${t.credits} credits ${usd(t.priceCents)}`).join(', ')}.`,
    ADS_GUARANTEE,
    'Second product: AI video testimonials (https://www.komendly.com/testimonials) turn written customer reviews into AI-avatar videos.',
  ]
}

function postLine(p: BlogPostMeta): string {
  return `- [${p.title}](${SITE_URL}/blog/${p.slug}): ${stripFootnotes(p.answer ?? p.description)}`
}

export function buildLlmsTxt(posts: BlogPostMeta[]): string {
  const sections = CATEGORIES.map((c) => {
    const inCat = posts.filter((p) => c.types.includes(p.type))
    return inCat.length ? `## Blog: ${c.name}\n\n${inCat.map(postLine).join('\n')}` : ''
  }).filter(Boolean)
  return [
    '# Komendly',
    '',
    '> Komendly turns a website into on-brand, ready-to-run static and animated ads with Ozzy, its AI ad wizard. Try it free: 10 static ads + 1 animated ad, no card required.',
    '',
    '## Product facts',
    '',
    ...productFacts().map((f) => `- ${f}`),
    '',
    '## Key pages',
    '',
    `- [Free ad studio (homepage)](${SITE_URL}/): paste a website URL to get free ads`,
    `- [Ads pricing](${SITE_URL}/ads/pricing): plans, credits and the free trial`,
    `- [AI video testimonials](${SITE_URL}/testimonials): turn text reviews into AI-avatar videos`,
    `- [Blog](${SITE_URL}/blog): ad creative, Meta ads and small business marketing`,
    `- [Full blog digest](${SITE_URL}/llms-full.txt): answer and key facts for every post`,
    '',
    ...sections.flatMap((s) => [s, '']),
  ].join('\n')
}

export function buildLlmsFullTxt(posts: BlogPostMeta[]): string {
  const blocks = posts.map((p) => {
    const lines = [
      `## ${p.title}`,
      '',
      `URL: ${SITE_URL}/blog/${p.slug}`,
      `Published: ${p.date.slice(0, 10)}. Updated: ${p.updated.slice(0, 10)}. Author: ${p.author}.`,
      '',
      stripFootnotes(p.answer ?? p.description),
    ]
    if (p.keyTakeaways.length) lines.push('', 'Key facts:', ...p.keyTakeaways.map((k) => `- ${stripFootnotes(k)}`))
    if (p.faq.length) lines.push('', 'FAQ:', ...p.faq.map((f) => `- Q: ${stripFootnotes(f.q)}\n  A: ${stripFootnotes(f.a)}`))
    if (p.sources.length) lines.push('', 'Sources:', ...p.sources.map((s) => `- [${s.id}] ${s.title}${s.publisher ? `, ${s.publisher}` : ''}: ${s.url}`))
    return lines.join('\n')
  })
  return ['# Komendly: full blog digest', '', '## Product facts', '', ...productFacts().map((f) => `- ${f}`), '', ...blocks.flatMap((b) => [b, ''])].join('\n')
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function buildRss(posts: BlogPostMeta[]): string {
  const items = posts
    .map(
      (p) => `    <item>
      <title>${esc(p.title)}</title>
      <link>${SITE_URL}/blog/${p.slug}</link>
      <guid isPermaLink="true">${SITE_URL}/blog/${p.slug}</guid>
      <pubDate>${new Date(p.date).toUTCString()}</pubDate>
      <dc:creator>${esc(p.author)}</dc:creator>
      <description>${esc(stripFootnotes(p.answer ?? p.description))}</description>
${p.tags.map((t) => `      <category>${esc(t)}</category>`).join('\n')}
    </item>`,
    )
    .join('\n')
  const lastBuild = posts.map((p) => p.updated).sort().at(-1)
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>The Komendly Journal</title>
    <link>${SITE_URL}/blog</link>
    <description>Ad creative, Meta ads, social proof and marketing for small businesses.</description>
    <language>en</language>
${lastBuild ? `    <lastBuildDate>${new Date(lastBuild).toUTCString()}</lastBuildDate>\n` : ''}    <atom:link href="${SITE_URL}/blog/feed.xml" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>
`
}
