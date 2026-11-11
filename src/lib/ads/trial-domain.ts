// Pre-sign-up "has this website already had its free pack?" check (one free trial per registrable domain).
// The authoritative check stays in checkTrialEligibility at run start; this only warns early.
import { prisma } from "@/lib/prisma";
import { hashIdentity, parseTargetUrl, registrableDomain } from "./abuse";

/** Registrable domain for a pasted URL ("https://www.shop.example.co.uk/x" -> "example.co.uk"); null if unparseable. */
export function trialDomainFor(raw: string): string | null {
  try {
    return registrableDomain(parseTargetUrl(raw).hostname);
  } catch {
    return null;
  }
}

/** True when some account already claimed the free trial for this website's domain. */
export async function isDomainTrialUsed(domain: string): Promise<boolean> {
  const claim = await prisma.adsTrialClaim.findFirst({ where: { domainHash: hashIdentity("domain", domain) }, select: { id: true } });
  return Boolean(claim);
}
