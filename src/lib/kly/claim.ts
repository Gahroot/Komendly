// Kly signup attribution: the claim link sets kmd_kly = lead.claimToken; signup links the lead. Pure helpers, no DB.

export const KLY_COOKIE = "kmd_kly";
export const KLY_COOKIE_MAX_AGE = 60 * 60 * 24 * 90;

export const klyCookieOptions = { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: KLY_COOKIE_MAX_AGE } as const;

export function isKlyClaimToken(v: string | null | undefined): v is string {
  return typeof v === "string" && /^[A-Za-z0-9_-]{20,32}$/.test(v);
}

/** Gift page path with outbound UTMs; utm_content carries the claim token for first-touch attribution. */
export function claimGiftPath(giftToken: string, campaign: string, claimToken: string): string {
  const utm = new URLSearchParams({ utm_source: "outbound", utm_medium: "email", utm_campaign: campaign, utm_content: claimToken });
  return `/gift/${giftToken}?${utm.toString()}`;
}

/** Kly prospects clicked a link we sent to this exact inbox, so signing up with that address proves they own it. */
export function sameInbox(leadEmail: string | null | undefined, signupEmail: string): boolean {
  const a = (leadEmail ?? "").trim().toLowerCase();
  return a.length > 3 && a === signupEmail.trim().toLowerCase();
}

/** Lead update at signup: link user/workspace; never downgrade a paid lead or relink another account. */
export function klySignupUpdate(
  lead: { status: string; userId: string | null },
  link: { userId: string; workspaceId: string; now: Date },
): { userId: string; workspaceId: string; signedUpAt: Date; status?: "signed_up" } | null {
  if (lead.userId && lead.userId !== link.userId) return null;
  return { userId: link.userId, workspaceId: link.workspaceId, signedUpAt: link.now, ...(lead.status === "paid" ? {} : { status: "signed_up" as const }) };
}
