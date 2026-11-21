import type { AdlibReport } from "@/lib/growth/adlib-report";
import snapshot from "@/lib/growth/adlib-report-data.json";
import { OG_SIZE, ozzyDataUrl, studioOg } from "@/lib/og/studio-og";

export const alt = "State of Local Service Meta Ads: data from the public Meta Ad Library";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image() {
  const r = snapshot as unknown as AdlibReport;
  return studioOg({
    label: "Data report",
    headline: `State of Local Service Meta Ads: ${r.advertisers.toLocaleString("en-US")} US advertisers`,
    headlineSize: 64,
    pill: `Median ad running ${r.runDays.median} days · free CSV`,
    ozzy: await ozzyDataUrl("explorer-focused"),
  });
}
