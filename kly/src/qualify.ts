// Lead qualification: one cheap AI call on the homepage text the finder already fetched.
import { z } from "zod";
import { ask, type AIProvider } from "./ai";

export const QualificationSchema = z.object({
  isLocalSmb: z.boolean(),
  sellsToConsumers: z.boolean(),
  chainOrFranchise: z.boolean(),
  excludedType: z.enum(["none", "government", "nonprofit", "directory", "agency", "other"]),
  benefitsFromSocialAds: z.boolean(),
  /** Law firm, lawyer, attorney, legal services, notary or paralegal: never called (cold email only). */
  isLegal: z.boolean(),
  score: z.number().min(0).max(100),
  reasons: z.array(z.string().max(160)).max(4),
});
export type Qualification = z.infer<typeof QualificationSchema>;

/** Final 0-100 score: hard exclusions zero it whatever the model said. */
export function qualificationScore(q: Qualification): number {
  if (!q.isLocalSmb || q.chainOrFranchise || q.excludedType !== "none") return 0;
  let s = Math.round(Math.min(100, Math.max(0, q.score)));
  if (!q.sellsToConsumers) s = Math.min(s, 40);
  if (!q.benefitsFromSocialAds) s = Math.min(s, 45);
  return s;
}

/** Tolerant parse of the model's JSON; null when it doesn't fit. */
export function parseQualification(raw: unknown): { score: number; qualification: Qualification } | null {
  const p = QualificationSchema.safeParse(raw);
  return p.success ? { score: qualificationScore(p.data), qualification: p.data } : null;
}

/** Visible text from HTML, short. */
export function pageText(html: string, max = 2500): string {
  return html
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

const SYSTEM = [
  "You screen businesses for a free Facebook/Instagram ad offer from Komendly, a paid ad-creative tool. We want businesses that can and will pay for ads.",
  "Qualify a real, independent business that sells to consumers: local services, clinics, med spas, law firms, dealers, retailers, studios.",
  "Not qualified: chains or franchises (national brands, franchise locations), government, nonprofits, directories or listing sites, marketing/web agencies (screened separately).",
  "score = 0-100: likely to pay for ad creative. Score higher for high-ticket services and businesses that clearly advertise or would profit from more customers",
  "(e.g. cosmetic, legal, remodeling, solar, pools, dealers, multi-location independents, active promos/booking/financing), lower for tiny hobby shops or dormant sites. Be strict; judge only from the text.",
  "isLegal = true for any law firm, lawyer, attorney, legal services business, notary or paralegal (whatever it was searched as); false otherwise.",
].join(" ");

const AGENCY_SYSTEM = [
  "You screen marketing, advertising, social media and web design agencies for a free ad offer from Komendly, a tool that turns any client's website into ready-to-run Facebook/Instagram ads (it has an Agency plan).",
  "Map your answer onto these fields: isLocalSmb = an independent small or mid-size agency or studio (not a holding-company network, not a freelancer marketplace, not a SaaS company);",
  "sellsToConsumers = their clients are businesses that advertise to consumers (local businesses, ecommerce, clinics...); chainOrFranchise = a franchise office of a marketing franchise;",
  "excludedType = none for a real agency (never use agency), else government/nonprofit/directory/other; benefitsFromSocialAds = they offer or could offer paid social, ads or creative to clients.",
  "isLegal = true only if this is actually a law firm, lawyer, attorney, legal services business, notary or paralegal.",
  "score = 0-100 likelihood they'd pay to make client ads faster: higher when they list paid social / Meta ads / ad creative / content for small businesses. Be strict; judge only from the text.",
].join(" ");

export async function qualifyLead(provider: AIProvider, lead: { name: string; website: string; niche: string; city: string; homeText: string; audience?: "local" | "agency" }, signal?: AbortSignal): Promise<{ score: number; qualification: Qualification; costMicros: number }> {
  const { out, costMicros } = await ask(provider, QualificationSchema, {
    system: lead.audience === "agency" ? AGENCY_SYSTEM : SYSTEM,
    prompt: `Business: ${lead.name}\nWebsite: ${lead.website}\nSearched as: ${lead.niche} in ${lead.city}\nHomepage text:\n${lead.homeText.slice(0, 2500) || "(empty)"}`,
    reasoning: "low",
    signal,
  });
  return { score: qualificationScore(out), qualification: out, costMicros };
}
