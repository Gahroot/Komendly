import { getBlogPosts } from '@/lib/blog'
import { loadIndexableIndustries } from '@/lib/ads/gallery'
import { buildLlmsTxt } from '@/lib/seo/llms'

// Hourly: lists indexable /ad-examples industry pages (DB-backed).
export const revalidate = 3600

export async function GET() {
  const galleries = (await loadIndexableIndustries()).map((x) => ({ slug: x.industry.slug, plural: x.industry.plural, count: x.count }))
  return new Response(buildLlmsTxt(getBlogPosts(), galleries), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' },
  })
}
