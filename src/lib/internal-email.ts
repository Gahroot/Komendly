// Pure (client-safe) rule for internal/test accounts; DB loader lives in internal-accounts.ts.
const INTERNAL_PATTERNS: readonly RegExp[] = [
  /^e2e[-+._]/i, // e2e-adrdy+…, e2e-studio+…, e2e+hype…, e2e-live+… (any domain)
  /@(?:[a-z0-9-]+\.)*komendly\.com$/i, // also subdomains, e.g. the Shopify review account @shopify.users.komendly.com
  /@prestyj\.com$/i, // the owner's company (Shopify test store)
  /@nolangrout\.com$/i,
  /@resend\.dev$/i,
  /@(example|tester)\.(com|org|net)$/i,
  /\.test$/i,
];
const INTERNAL_EXACT = ["test@gmail.com", "ngrout71@gmail.com", "hello+funnel-test@getkomendly.com"];

function extraEmails(env: Record<string, string | undefined> = process.env): string[] {
  return (env.INTERNAL_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}

export function isInternalEmail(email: string | null | undefined, env: Record<string, string | undefined> = process.env): boolean {
  if (!email) return false;
  const e = email.trim().toLowerCase();
  return INTERNAL_PATTERNS.some((re) => re.test(e)) || INTERNAL_EXACT.includes(e) || extraEmails(env).includes(e);
}
