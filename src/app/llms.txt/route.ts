import { getBlogPosts } from '@/lib/blog'
import { loadIndexableIndustryLinks } from '@/lib/growth/industry-examples-server'
import { buildLlmsTxt } from '@/lib/seo/llms'

// Hourly: lists indexable /ad-examples industry pages (DB-backed).
export const revalidate = 3600

export async function GET() {
  const galleries = await loadIndexableIndustryLinks()
  return new Response(buildLlmsTxt(getBlogPosts(), galleries), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' },
  })
}
