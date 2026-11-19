import { getBlogPosts } from '@/lib/blog'
import { loadIndexableIndustryLinks } from '@/lib/growth/industry-examples-server'
import { buildLlmsTxt } from '@/lib/seo/llms'
import { REPORT_PATH } from '@/lib/growth/ad-report'
import { loadAdReport } from '@/lib/growth/ad-report-server'
import { loadAllGalleryPageStates } from '@/lib/growth/ad-pages-server'
import { alsoCalled } from '@/lib/growth/vocabulary'

// Hourly: lists indexable /ad-examples industry pages (DB-backed).
export const revalidate = 3600

export async function GET() {
  const [galleries, report, states] = await Promise.all([loadIndexableIndustryLinks(), loadAdReport(), loadAllGalleryPageStates()])
  const intents = states.filter((x) => x.indexable).map((x) => ({ path: x.page.path, h1: x.page.entry.h1, also: alsoCalled(x.page.entry) }))
  return new Response(buildLlmsTxt(getBlogPosts(), galleries, report.indexable ? { path: REPORT_PATH, ads: report.ads, sites: report.sites } : null, intents), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' },
  })
}
