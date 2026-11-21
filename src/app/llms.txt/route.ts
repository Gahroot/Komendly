import { getBlogPosts } from '@/lib/blog'
import { loadIndexableIndustryLinks } from '@/lib/growth/industry-examples-server'
import { buildLlmsTxt } from '@/lib/seo/llms'
import { REPORT_PATH } from '@/lib/growth/ad-report'
import { loadAdReport } from '@/lib/growth/ad-report-server'
import { loadAllGalleryPageStates } from '@/lib/growth/ad-pages-server'
import { alsoCalled } from '@/lib/growth/vocabulary'
import { ADLIB_REPORT_PATH, leaderboardPath } from '@/lib/growth/adlib-report'
import { loadAdlibReport } from '@/lib/growth/adlib-report-server'

// Hourly: lists indexable /ad-examples industry pages (DB-backed).
export const revalidate = 3600

export async function GET() {
  const [galleries, report, states, adlib] = await Promise.all([loadIndexableIndustryLinks(), loadAdReport(), loadAllGalleryPageStates(), loadAdlibReport()])
  const intents = states.filter((x) => x.indexable).map((x) => ({ path: x.page.path, h1: x.page.entry.h1, also: alsoCalled(x.page.entry) }))
  return new Response(buildLlmsTxt(getBlogPosts(), galleries, report.indexable ? { path: REPORT_PATH, ads: report.ads, sites: report.sites } : null, intents, adlib.indexable ? { path: ADLIB_REPORT_PATH, advertisers: adlib.advertisers, month: adlib.collectedOn.slice(0, 7), medianDays: adlib.runDays.median, medianLiveAds: adlib.liveAds.median, leaderboards: adlib.leaderboards.filter((l) => l.indexable).map((l) => ({ path: leaderboardPath(l.slug), label: l.label, advertisers: l.advertisers })) } : null), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' },
  })
}
