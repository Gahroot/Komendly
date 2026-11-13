// Legal businesses (law firms, lawyers, attorneys, legal services, notaries, paralegals) are NEVER pushed to voice
// calls. They may still get cold email. Three independent checks: the niche, the AI qualifier's isLegal flag, and a
// name/domain keyword guard.

const NICHE_RE = /\b(law|laws|lawyers?|attorneys?|legal|notar(?:y|ies)|paralegals?|solicitors?)\b/i;
const NAME_RE = /\b(law|lawyers?|attorneys?(?:[- ]at[- ]law)?|legal|esq\.?|esquire|notar(?:y|ies)|paralegals?|litigation|litigators?|injury|counsel(?:ors?)?|solicitors?|abogados?)\b/i;
// Domain labels have no word boundaries: "law" only as a whole leading/trailing piece (not lawn, flawless, lawrence).
const LAW_SUFFIX = "(?:firm|group|yers?|offices?|pc|pllc|llp|llc)";
const DOMAIN_RES = [/legal|attorney|lawyer|esquire|injury|notary|paralegal|abogado/, new RegExp(`^law${LAW_SUFFIX}`), new RegExp(`law${LAW_SUFFIX}?$`), /esq$/];

export function isLegalNiche(niche: string | null | undefined): boolean {
  return Boolean(niche && NICHE_RE.test(niche));
}

/** Keyword guard on the business name and its registrable domain (the label before the TLD). */
export function isLegalName(name: string | null | undefined, domain?: string | null): boolean {
  if (name && NAME_RE.test(name)) return true;
  const label = (domain ?? "").toLowerCase().split(".")[0]?.replace(/[^a-z]/g, "") ?? "";
  return label.length > 0 && DOMAIN_RES.some((re) => re.test(label));
}

/** The qualifier's flag (category legal / isLegal true) on a stored qualification JSON. */
export function qualifiedAsLegal(qualification: unknown): boolean {
  const q = qualification as { isLegal?: unknown; category?: unknown } | null;
  return Boolean(q && (q.isLegal === true || q.category === "legal"));
}

export function isLegalLead(l: { niche: string; businessName: string; domain: string; qualification?: unknown }): boolean {
  return isLegalNiche(l.niche) || qualifiedAsLegal(l.qualification) || isLegalName(l.businessName, l.domain);
}
