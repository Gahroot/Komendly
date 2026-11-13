import { ADS_GUARANTEE, ADS_TOPUPS, FOUNDING_TERMS, PLANS_FOR_SALE, unlimitedLine } from '@/lib/ads/billing-config'
import { CATEGORIES, type BlogPostMeta } from '@/lib/blog'
import { stripFootnotes } from '@/lib/blog-content'
import { SITE_URL } from '@/lib/site'
import { STUDIO_MAX_SECONDS, STUDIO_PRICE } from '@/lib/studio/contracts'

const usd = (cents: number) => `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`

/** Product facts, all derived from billing-config and the public pricing page. */
export function productFacts(): string[] {
  return [
    'Komendly turns a website URL into on-brand, ready-to-run ad creatives (static and animated) via Ozzy, its AI ad wizard.',
    'Free trial: 10 static ads + 1 animated ad, no credit card required (one trial per website, device and network; email verification required).',
    'Ad sizes: 4:5, 1:1 and 9:16. Ads cover all 5 awareness stages.',
    '1 credit = 1 static ad in one size; an animated ad costs 5 credits.',
    `Monthly plans: ${PLANS_FOR_SALE.map((p) => `${p.name} ${usd(p.priceCents)}/month (${p.unlimited ? `${unlimitedLine(p)}; 6 fresh ads every Monday; Ozzy Ad Coach${p.key === 'agency' ? '; 3 testimonial videos a month' : ''}` : `${p.monthlyCredits} credits`})`).join(', ')}.`,
    `${FOUNDING_TERMS}`,
    `One-time credit top-ups: ${ADS_TOPUPS.map((t) => `${t.credits} credits ${usd(t.priceCents)}`).join(', ')}.`,
    ADS_GUARANTEE,
    `Ozzy Studio (${SITE_URL}/ozzy-studio): chat with Ozzy to make video ads, motion graphics and animations, or edit your own footage with captions. 1 free video (no watermark), no card. A new video costs ${STUDIO_PRICE.newShort} credits (${STUDIO_PRICE.newLong} over ${STUDIO_PRICE.longOverSeconds}s); ${STUDIO_PRICE.includedRevisions} revisions included, then ${STUDIO_PRICE.revision} credit each. Videos up to ${STUDIO_MAX_SECONDS.free}s free, ${STUDIO_MAX_SECONDS.paid}s on paid plans. Credits are shared with ad packs.`,
    'Second product: AI video testimonials (https://www.komendly.com/testimonials) turn written customer reviews into AI-avatar videos.',
  ]
}

/** Ozzy Studio facts, from the Studio contract. */
export function studioFacts(): string[] {
  return [
    `What it is: a chat app at ${SITE_URL}/ozzy-studio. Tell Ozzy what you want; he streams his reply, shows each step, and delivers the video in the chat.`,
    'What you can make: promos, hype ads, logo animations, edits of your own footage with captions, launch videos, and reviews turned into motion graphics.',
    `Uploads: video, images and audio; up to 500 MB on paid plans, 200 MB on the free video.`,
    'No watermark on any video, free or paid. You own the videos you make.',
    'Referral: give a friend 2 free Studio videos; you get 1 more free video when they join.',
  ]
}

function postLine(p: BlogPostMeta): string {
  return `- [${p.title}](${SITE_URL}/blog/${p.slug}): ${stripFootnotes(p.answer ?? p.description)}`
}

/** Indexable /ad-examples industry pages listed in llms.txt. */
export interface GalleryLink {
  slug: string
  plural: string
  count: number
}

export function buildLlmsTxt(posts: BlogPostMeta[], galleries: readonly GalleryLink[] = []): string {
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
    `- [Ozzy Studio](${SITE_URL}/ozzy-studio): make video ads, motion graphics and footage edits by chatting with Ozzy; 1 free video`,
    `- [Remix any ad](${SITE_URL}/remix): paste a link to any ad (TikTok, Reels, YouTube Shorts, Facebook, X) and Ozzy rebuilds its hook, pacing and style for your brand, never its footage, logos or words; first video free`,
    `- [Pricing](${SITE_URL}/pricing): one plan for Ozzy Studio, Ad Packs and Testimonials`,
    `- [Ads pricing](${SITE_URL}/ads/pricing): plans, credits and the free trial`,
    `- [Partner program](${SITE_URL}/partners): web designers, freelancers and agencies earn 30% of what referred clients pay for 12 months`,
    `- [Ad of the week](${SITE_URL}/ad-of-the-week): real customer ads made with Komendly, featured weekly`,
    `- [Examples](${SITE_URL}/examples): Ozzy Studio animated ads, Ad Pack static ads and a video testimonial, all made with Komendly`,
    `- [Ozzy for AI agents](${SITE_URL}/agents): let Claude, Cursor, ChatGPT or scripts make Studio videos and ad packs via the Komendly MCP server (https://www.komendly.com/api/mcp; add it as a connector and sign in) or the \`komendly\` CLI (personal API key), on the same plan and credits`,
    `- [Facebook ad examples by industry](${SITE_URL}/ad-examples): real customer ads made with Komendly, shared with permission`,
    `- [AI video testimonials](${SITE_URL}/testimonials): turn text reviews into AI-avatar videos`,
    `- [Blog](${SITE_URL}/blog): ad creative, Meta ads and small business marketing`,
    `- [Full blog digest](${SITE_URL}/llms-full.txt): answer and key facts for every post`,
    `- [Terms and refund policy](${SITE_URL}/terms): credits, subscriptions, cancellation and money-back guarantees`,
    `- [Privacy policy](${SITE_URL}/privacy): data collected, cookies, processors and your rights`,
    '',
    '## Ozzy Studio',
    '',
    ...studioFacts().map((f) => `- ${f}`),
    '',
    ...(galleries.length
      ? ['## Ad examples by industry', '', ...galleries.map((g) => `- [Facebook ad examples for ${g.plural}](${SITE_URL}/ad-examples/${g.slug}): ${g.count} real customer ads`), '']
      : []),
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
  return ['# Komendly: full blog digest', '', '## Product facts', '', ...productFacts().map((f) => `- ${f}`), '', '## Ozzy Studio', '', ...studioFacts().map((f) => `- ${f}`), '', ...blocks.flatMap((b) => [b, ''])].join('\n')
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
