// Post-auth redirect: only same-origin paths (no protocol-relative or backslash tricks). Pure.
export function safeAppNext(next: string | null | undefined, fallback = "/dashboard"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\") || /[\u0000-\u001f\u007f]/.test(next)) return fallback;
  if (/^\/(login|register|ads\/login|ads\/signup)(\/|\?|$)/.test(next)) return fallback;
  return next;
}

/** Studio home with an ad link prefilled ("Remix any ad"); signed-out visitors go through sign-up first. Pure. */
export function remixStudioPath(link: string): string {
  return `/studio?remix=${encodeURIComponent(link)}`;
}

/** Where /remix sends a pasted ad link: straight to Studio, or sign-up first with it kept in ?next. Pure. */
export function remixHref(link: string, signedIn: boolean): string {
  const studio = remixStudioPath(link);
  return signedIn ? studio : `/register?next=${encodeURIComponent(studio)}`;
}
