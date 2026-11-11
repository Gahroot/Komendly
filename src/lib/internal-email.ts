// Pure (client-safe) rule for internal/test accounts; DB loader lives in internal-accounts.ts.
const INTERNAL_PATTERNS: readonly RegExp[] = [
  /^e2e[-+._]/i, // e2e-adrdy+…, e2e-studio+…, e2e+hype…, e2e-live+… (any domain)
  /@komendly\.com$/i,
  /@nolangrout\.com$/i,
  /@resend\.dev$/i,
  /@(example|tester)\.(com|org|net)$/i,
  /\.test$/i,
];
const INTERNAL_EXACT = ["test@gmail.com", "ngrout71@gmail.com"];

function extraEmails(env: Record<string, string | undefined> = process.env): string[] {
  return (env.INTERNAL_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}

export function isInternalEmail(email: string | null | undefined, env: Record<string, string | undefined> = process.env): boolean {
  if (!email) return false;
  const e = email.trim().toLowerCase();
  return INTERNAL_PATTERNS.some((re) => re.test(e)) || INTERNAL_EXACT.includes(e) || extraEmails(env).includes(e);
}
