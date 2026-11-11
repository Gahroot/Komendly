// Ad of the week: user consent to feature an ad on Komendly's socials, admin queue transitions, copy.
import { z } from "zod";

export type FeatureStatus = "consented" | "shortlisted" | "featured" | "declined" | "withdrawn";
export type FeatureAction = "consent" | "withdraw" | "shortlist" | "feature" | "decline";

const FROM: Record<FeatureAction, readonly (FeatureStatus | null)[]> = {
  consent: [null, "withdrawn", "declined"],
  withdraw: ["consented", "shortlisted", "featured"],
  shortlist: ["consented"],
  feature: ["consented", "shortlisted"],
  decline: ["consented", "shortlisted"],
};
const TO: Record<FeatureAction, FeatureStatus> = { consent: "consented", withdraw: "withdrawn", shortlist: "shortlisted", feature: "featured", decline: "declined" };

function asStatus(s: string | null): FeatureStatus | null {
  return s === "consented" || s === "shortlisted" || s === "featured" || s === "declined" || s === "withdrawn" ? s : null;
}

/** Next status, or null when the action isn't allowed from `current` (null = no feature row yet). */
export function nextFeatureStatus(current: string | null, action: FeatureAction): FeatureStatus | null {
  return FROM[action].includes(asStatus(current)) ? TO[action] : null;
}

/** Only ready, unlocked ads from normal (non-gift) runs can be offered for featuring. */
export function canFeatureAd(ad: { status: string; locked?: boolean }, runKind: string): boolean {
  return ad.status === "ready" && !ad.locked && runKind !== "gift";
}

/** "@acme", "acme", "instagram.com/acme/", "https://facebook.com/AcmePage" -> "@acme" / "@AcmePage"; "" when blank. */
export function normalizeHandle(raw: string | null | undefined): string {
  let s = (raw ?? "").trim();
  if (!s) return "";
  if (/^(https?:\/\/)?(www\.|m\.)?(instagram|facebook|fb)\.com\//i.test(s)) {
    const path = s.replace(/^(https?:\/\/)?[^/]+\//i, "").split(/[/?#]/)[0] ?? "";
    s = path;
  }
  s = s.replace(/^@+/, "").replace(/[^A-Za-z0-9._-]/g, "").slice(0, 60);
  return s ? `@${s}` : "";
}

export const FeatureConsent = z.object({
  adId: z.string().min(1).max(64),
  handle: z.string().max(200).optional().default(""),
  brandName: z.string().trim().max(80).optional().default(""),
  consent: z.literal(true, { message: "Please tick the box to give permission." }),
});

export const FeatureAdminAction = z.object({
  featureId: z.string().min(1).max(64),
  action: z.enum(["shortlist", "feature", "decline"]),
  caption: z.string().trim().max(2200).optional(),
  postUrl: z.string().trim().url().max(500).optional().or(z.literal("")),
});

export function defaultCaption(brandName: string | null, handle: string | null): string {
  const who = handle || brandName || "this brand";
  return `Ad of the week: ${who} 🏆\n\nMade from their website in minutes with Komendly. Paste your site, get 10 ready-to-run ads free: komendly.com/free-ads\n\n#adoftheweek #facebookads #smallbusiness`;
}

export function featuredEmailCopy(brandName: string | null, postUrl: string | null): { subject: string; paragraphs: string[] } {
  const brand = brandName || "your brand";
  return {
    subject: "Your ad is Ad of the week 🏆",
    paragraphs: [
      `Good news: we picked your ad for ${brand} as Komendly's Ad of the week.`,
      postUrl ? `It's live on our socials now: ${postUrl}. Share it or reply to it, we'd love that.` : "It goes up on our socials this week, tagged with your handle.",
      "Thanks for letting us show it off. You'll also see a badge on that ad in your studio.",
    ],
  };
}
