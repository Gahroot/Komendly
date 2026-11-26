// Trade wording for the free-pack lifecycle emails (pure; the engine copies lifecycle/ whole). Maps the trade slug stored on
// the workspace (AdsEvent trade_tagged / signed_up props.trade) to the phrase emails use: "your roofing company".
const TERMS: Record<string, string> = {
  roofers: "roofing company",
  plumbers: "plumbing company",
  hvac: "HVAC company",
  landscapers: "landscaping business",
  "cleaning-services": "cleaning business",
  electricians: "electrical business",
  "pest-control": "pest control company",
  painters: "painting company",
};

/** "roofing company" for a known top trade, else null (copy then says "your business"). */
export function tradeTermFor(slug: unknown): string | null {
  return typeof slug === "string" ? (TERMS[slug.trim().toLowerCase()] ?? null) : null;
}

/** The dream-outcome line the free-pack nudges lead with ("Facebook ads for your roofing company, made from your website"). */
export function dreamLine(term: string | null | undefined): string {
  return `Facebook ads for your ${term ?? "business"}, made from your website`;
}
