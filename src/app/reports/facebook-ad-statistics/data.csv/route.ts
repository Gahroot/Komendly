import { REPORT_PATH, reportCsv } from "@/lib/growth/ad-report";
import { loadAdReport } from "@/lib/growth/ad-report-server";
import { SITE_URL } from "@/lib/site";

// Aggregate tables only (no business names/URLs). Refreshed daily with the page.
export const revalidate = 86400;

export async function GET() {
  const report = await loadAdReport();
  return new Response(reportCsv(report, `${SITE_URL}${REPORT_PATH}`), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="komendly-facebook-ad-statistics.csv"',
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      ...(report.indexable ? {} : { "X-Robots-Tag": "noindex" }),
    },
  });
}
