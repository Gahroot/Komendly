import type { MetadataRoute } from 'next'
import { AUTHORS } from '@/lib/authors'
import { CATEGORIES, MIN_INDEXABLE_TAG_POSTS, getAllTags, getBlogPosts, getBlogPostsByTag, tagSlug } from '@/lib/blog'
import { loadIndexableIndustries } from '@/lib/ads/gallery'
import { SITE_URL } from '@/lib/site'

function latest(dates: string[]): string | undefined {
  return dates.sort().at(-1)
}

export const revalidate = 3600

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const posts = getBlogPosts()
  const blogLastMod = latest(posts.map((p) => p.updated))

  const staticPages: MetadataRoute.Sitemap = [
    { url: SITE_URL, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE_URL}/ozzy-studio`, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${SITE_URL}/remix`, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${SITE_URL}/free-ads`, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${SITE_URL}/ads/pricing`, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${SITE_URL}/partners`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${SITE_URL}/examples`, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${SITE_URL}/agents`, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${SITE_URL}/ad-examples`, changeFrequency: 'weekly', priority: 0.7 },
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
  const galleryPages: MetadataRoute.Sitemap = (await loadIndexableIndustries()).map((x) => ({
    url: `${SITE_URL}/ad-examples/${x.industry.slug}`,
    changeFrequency: 'weekly' as const,
    priority: 0.6,
  }))

  return [...staticPages, ...postPages, ...categoryPages, ...authorPages, ...tagPages, ...galleryPages]
}
