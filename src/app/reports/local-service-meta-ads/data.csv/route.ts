import { ADLIB_REPORT_PATH, adlibReportCsv } from "@/lib/growth/adlib-report";
import { loadAdlibReport } from "@/lib/growth/adlib-report-server";
import { SITE_URL } from "@/lib/site";

// Aggregate tables only (no business names, pages, websites or ad copy). Refreshed with the page.
export const revalidate = 86400;

export async function GET() {
  const report = await loadAdlibReport();
  return new Response(adlibReportCsv(report, `${SITE_URL}${ADLIB_REPORT_PATH}`), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="komendly-local-service-meta-ads.csv"',
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      ...(report.indexable ? {} : { "X-Robots-Tag": "noindex" }),
    },
  });
}
