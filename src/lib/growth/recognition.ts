// Recognition (opportunity #100): "Ad of the Month" built on the existing consent-based Ad of the week pipeline
// (AdsFeature rows, src/lib/ads/features.ts). Pure. Only ads whose owner ticked the consent box are eligible; withdrawn or
// declined rows never are. This picks and drafts; publishing stays with the admin "feature" action (/admin/ads/features).
import { SITE_URL } from "../site";
import { withSystemUtm } from "./systems";

export interface FeatureRow { id: string; adId: string; brandName: string | null; handle: string | null; status: string; consentAt: Date | string; featuredAt: Date | string | null }
export const monthOf = (d: Date | string): string => new Date(d).toISOString().slice(0, 7);
const ELIGIBLE = new Set(["featured", "shortlisted", "consented"]);
const RANK: Record<string, number> = { featured: 3, shortlisted: 2, consented: 1 };

/** Best consented ad for `month` (YYYY-MM): featured beats shortlisted beats consented, newest first; null when nobody qualifies. */
export function pickAdOfTheMonth(rows: readonly FeatureRow[], month: string, alreadyAwarded: ReadonlySet<string> = new Set()): FeatureRow | null {
  const inMonth = rows.filter((r) => ELIGIBLE.has(r.status) && !alreadyAwarded.has(r.adId) && monthOf(r.featuredAt ?? r.consentAt) === month);
  inMonth.sort((a, b) => (RANK[b.status]! - RANK[a.status]!) || (+new Date(b.featuredAt ?? b.consentAt) - +new Date(a.featuredAt ?? a.consentAt)));
  return inMonth[0] ?? null;
}

export interface AwardDraft { month: string; title: string; caption: string; link: string; notice: { subject: string; text: string } }
const label = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

export function buildAwardDraft(f: FeatureRow, month: string): AwardDraft {
  const who = f.handle || f.brandName || "this brand";
  const link = withSystemUtm(`${SITE_URL}/ad-of-the-week`, "content_queue", { medium: "social", campaign: `ad-of-the-month-${month}`, content: "award" });
  const title = `Komendly Ad of the Month, ${label(month)}: ${who}`;
  return {
    month,
    title,
    caption: `Ad of the Month for ${label(month)}: ${who} 🏆\n\nChosen from the ads our customers let us feature, made from their own website with Komendly (Ozzy, our AI). See it and make yours free: ${link}`,
    link,
    notice: { subject: `Your ad is Komendly's Ad of the Month (${label(month)})`, text: `Your ad for ${f.brandName || "your business"} was picked as Komendly's Ad of the Month for ${label(month)}. You gave permission to feature it; reply to this email to withdraw it at any time.` },
  };
}

/** The draft is only fine to publish when consent exists and the caption names no result. */
export function checkAward(d: AwardDraft, f: FeatureRow): string | null {
  if (!ELIGIBLE.has(f.status)) return "no consent on this ad";
  if (/\b(guarantee|\d+x|leads? generated|sales? (up|increase)|ROI)\b/i.test(d.caption)) return "caption claims a result";
  if (!d.link.includes("utm_source=content_queue")) return "link without utm";
  return null;
}
