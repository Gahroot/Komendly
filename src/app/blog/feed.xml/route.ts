import { getBlogPosts } from '@/lib/blog'
import { buildRss } from '@/lib/seo/llms'

export const dynamic = 'force-static'

export function GET() {
  return new Response(buildRss(getBlogPosts()), {
    headers: { 'Content-Type': 'application/rss+xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' },
  })
}
