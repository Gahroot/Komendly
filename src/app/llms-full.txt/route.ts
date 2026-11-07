import { getBlogPosts } from '@/lib/blog'
import { buildLlmsFullTxt } from '@/lib/seo/llms'

export const dynamic = 'force-static'

export function GET() {
  return new Response(buildLlmsFullTxt(getBlogPosts()), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' },
  })
}
