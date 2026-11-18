import { withSystemUtm } from "@/lib/growth/systems";
import { SITE_URL } from "@/lib/site";

/** /free-ads link attributed to the free_tools system (utm_source=free_tool, utm_campaign=<tool slug | hub>). */
export function toolCtaHref(campaign: string, content = "page"): string {
  const u = new URL(withSystemUtm(`${SITE_URL}/free-ads`, "free_tools", { campaign, content }));
  return `${u.pathname}${u.search}`;
}
