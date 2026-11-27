import type { MetadataRoute } from 'next'
import { AUTHORS } from '@/lib/authors'
import { CATEGORIES, MIN_INDEXABLE_TAG_POSTS, getAllTags, getBlogPosts, getBlogPostsByTag, tagSlug } from '@/lib/blog'
import { loadIndexableIndustryLinks } from '@/lib/growth/industry-examples-server'
import { loadAllGalleryPageStates } from '@/lib/growth/ad-pages-server'
import { FREE_TOOLS } from '@/lib/growth/free-tools'
import { CHROME_EXTENSION_PATH } from '@/lib/growth/chrome-extension'
import { SITE_URL } from '@/lib/site'
import { AUDIENCES, audiencePath } from '@/lib/growth/audiences'
import { INTEGRATION_PATHS } from '@/lib/integrations'
import { REPORT_PATH } from '@/lib/growth/ad-report'
import { loadAdReport } from '@/lib/growth/ad-report-server'
import { ADLIB_REPORT_PATH, LEADERBOARD_BASE, leaderboardPath } from '@/lib/growth/adlib-report'
import { loadAdlibReport } from '@/lib/growth/adlib-report-server'
import { loadPublicCaseStudies } from '@/lib/growth/proof-server'
import { benchmarkPath, benchmarkTrades, BENCHMARKS_BASE } from '@/lib/growth/organic/benchmarks'
import { organicPaths } from '@/lib/growth/organic/registry'
import { CATEGORIES as TRADE_CATEGORIES, SEASONS, IDEAS_BASE, allAnglePages, ideasPath } from '@/lib/growth/trade-playbooks'

function latest(dates: string[]): string | undefined {
  return dates.sort().at(-1)
}

import { GENERATED_TRADE_SLUGS } from '@/lib/growth/free-ads-trades'

export const revalidate = 3600

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const posts = getBlogPosts()
  const blogLastMod = latest(posts.map((p) => p.updated))

  const staticPages: MetadataRoute.Sitemap = [
    { url: SITE_URL, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE_URL}/ozzy-studio`, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${SITE_URL}/remix`, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${SITE_URL}/free-ads`, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${SITE_URL}/free-ads/roofers`, changeFrequency: 'monthly', priority: 0.8 },
    ...GENERATED_TRADE_SLUGS.map((t) => ({ url: `${SITE_URL}/free-ads/${t}`, changeFrequency: 'monthly' as const, priority: 0.8 })),
    { url: `${SITE_URL}/ads/pricing`, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${SITE_URL}/partners`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${SITE_URL}/examples`, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${SITE_URL}/agents`, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${SITE_URL}/developers/api`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${SITE_URL}/developers/embed`, changeFrequency: 'monthly', priority: 0.4 },
    ...AUDIENCES.map((x) => ({ url: `${SITE_URL}${audiencePath(x.slug)}`, changeFrequency: 'monthly' as const, priority: 0.6 })),
    ...INTEGRATION_PATHS.map((p) => ({ url: `${SITE_URL}${p}`, changeFrequency: 'monthly' as const, priority: 0.7 })),
    { url: `${SITE_URL}/ad-examples`, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${SITE_URL}/tools`, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${SITE_URL}/tools/competitor-ad-watch`, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${SITE_URL}/seasonal`, changeFrequency: 'monthly', priority: 0.6 },
    ...SEASONS.map((s) => ({ url: `${SITE_URL}/seasonal/${s.key}`, changeFrequency: 'monthly' as const, priority: 0.5 })),
    ...FREE_TOOLS.map((t) => ({ url: `${SITE_URL}/tools/${t.slug}`, changeFrequency: 'monthly' as const, priority: 0.7 })),
    { url: `${SITE_URL}${CHROME_EXTENSION_PATH}`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${SITE_URL}/ad-of-the-week`, changeFrequency: 'weekly', priority: 0.6 },
    { url: `${SITE_URL}/testimonials`, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${SITE_URL}/pricing`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${SITE_URL}/privacy`, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${SITE_URL}/terms`, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${SITE_URL}/blog`, lastModified: blogLastMod, changeFrequency: 'daily', priority: 0.8 },
  ]

  const postPages: MetadataRoute.Sitemap = posts.map((post) => ({
    url: `${SITE_URL}/blog/${post.slug}`,
    lastModified: post.updated,
    changeFrequency: 'monthly',
    priority: 0.7,
  }))

  const categoryPages: MetadataRoute.Sitemap = CATEGORIES.flatMap((c) => {
    const inCat = posts.filter((p) => c.types.includes(p.type))
    if (!inCat.length) return []
    return [{ url: `${SITE_URL}/blog/category/${c.slug}`, lastModified: latest(inCat.map((p) => p.updated)), changeFrequency: 'weekly' as const, priority: 0.6 }]
  })

  const authorPages: MetadataRoute.Sitemap = AUTHORS.flatMap((a) => {
    const mine = posts.filter((p) => p.authorSlug === a.slug)
    if (!mine.length) return []
    return [{ url: `${SITE_URL}/blog/author/${a.slug}`, lastModified: latest(mine.map((p) => p.updated)), changeFrequency: 'weekly' as const, priority: 0.5 }]
  })

  // Thin tag pages (noindex) stay out
  const tagPages: MetadataRoute.Sitemap = getAllTags().flatMap((tag) => {
    const tagged = getBlogPostsByTag(tagSlug(tag))
    if (tagged.length < MIN_INDEXABLE_TAG_POSTS) return []
    return [{ url: `${SITE_URL}/blog/tag/${tagSlug(tag)}`, lastModified: latest(tagged.map((p) => p.updated)), changeFrequency: 'weekly' as const, priority: 0.4 }]
  })

  // Industry galleries: only those with enough consented ads to be indexable
  const galleryPages: MetadataRoute.Sitemap = (await loadIndexableIndustryLinks()).map((x) => ({
    url: `${SITE_URL}/ad-examples/${x.slug}`,
    lastModified: x.updatedAt,
    changeFrequency: 'weekly' as const,
    priority: 0.6,
  }))

  // Intent pages (platform/format/occasion/facebook-ads-for-<industry>): only once they have substance
  const intentPages: MetadataRoute.Sitemap = (await loadAllGalleryPageStates()).filter((x) => x.indexable).map((x) => ({
    url: `${SITE_URL}${x.page.path}`,
    lastModified: x.updatedAt,
    changeFrequency: 'weekly' as const,
    priority: 0.6,
  }))

  // Data report: only once the sample is big enough to be indexable
  const report = await loadAdReport()
  const reportPages: MetadataRoute.Sitemap = report.indexable ? [{ url: `${SITE_URL}${REPORT_PATH}`, lastModified: report.to ?? undefined, changeFrequency: 'weekly' as const, priority: 0.7 }] : []

  // Ad Library data report + monthly trade leaderboards: only when their sample thresholds are met
  const adlib = await loadAdlibReport()
  const adlibPages: MetadataRoute.Sitemap = adlib.indexable ? [ADLIB_REPORT_PATH, LEADERBOARD_BASE, ...adlib.leaderboards.filter((l) => l.indexable).map((l) => leaderboardPath(l.slug))].map((p, i) => ({ url: `${SITE_URL}${p}`, lastModified: adlib.collectedOn, changeFrequency: 'monthly' as const, priority: i === 0 ? 0.7 : 0.5 })) : []

  // Customer results: only once at least one consented, measured case study exists
  const resultsPages: MetadataRoute.Sitemap = (await loadPublicCaseStudies().catch(() => [])).length >= 1 ? [{ url: `${SITE_URL}/results`, changeFrequency: 'weekly' as const, priority: 0.6 }] : []

  // Local-service ad library: ideas hub, category pages and angle pages (hand-written content, always indexable)
  const ideaPages: MetadataRoute.Sitemap = [IDEAS_BASE, ...TRADE_CATEGORIES.map((c) => ideasPath(c.slug)), ...allAnglePages().map((a) => a.path)].map((p) => ({
    url: `${SITE_URL}${p}`,
    changeFrequency: 'monthly' as const,
    priority: 0.5,
  }))

  // Organic resources: tools, copy library, ad inspiration, comparisons; benchmarks only with the (indexable) Ad Library report
  const organicPages: MetadataRoute.Sitemap = organicPaths().map((path) => ({ url: `${SITE_URL}${path}`, changeFrequency: 'monthly' as const, priority: 0.6 }))
  const benchmarkPages: MetadataRoute.Sitemap = adlib.indexable ? [BENCHMARKS_BASE, ...benchmarkTrades(adlib).map((t) => benchmarkPath(t.slug))].map((path) => ({ url: `${SITE_URL}${path}`, lastModified: adlib.collectedOn, changeFrequency: 'monthly' as const, priority: 0.5 })) : []

  return [...organicPages, ...benchmarkPages, ...reportPages, ...adlibPages, ...staticPages, ...postPages, ...categoryPages, ...authorPages, ...tagPages, ...galleryPages, ...intentPages, ...ideaPages, ...resultsPages]
}
