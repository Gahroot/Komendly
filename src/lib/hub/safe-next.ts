// Post-auth redirect: only same-origin paths (no protocol-relative or backslash tricks). Pure.
export function safeAppNext(next: string | null | undefined, fallback = "/dashboard"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return fallback;
  if (/^\/(login|register|ads\/login|ads\/signup)(\/|\?|$)/.test(next)) return fallback;
  return next;
}
