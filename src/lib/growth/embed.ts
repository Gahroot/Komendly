// Embeddable "Make ads from your website" widget. The widget is a plain GET form that opens the public free-pack page
// with UTM tags: it calls no API, stores nothing and never sees an email or a client's data, so there is nothing to
// rate-limit or leak. Pure (no Next/Prisma).
export const EMBED_PATH = "/embed/ads";
export const EMBED_SCRIPT_PATH = "/embed/komendly-embed.js";
export const PARTNER_TAG_RE = /^[a-z0-9][a-z0-9_-]{0,39}$/;

/** Partner tag from ?p= (lower-case slug, max 40). Anything else becomes "embed". Never a PII carrier. */
export function cleanPartnerTag(raw: string | null | undefined): string {
  const t = (raw ?? "").trim().toLowerCase();
  return PARTNER_TAG_RE.test(t) ? t : "embed";
}

/** Hidden UTM fields the widget form submits to /free-ads (utm_campaign = partner tag). */
export function embedUtm(tag: string): Record<string, string> {
  return { utm_source: "embed", utm_medium: "widget", utm_campaign: cleanPartnerTag(tag) };
}

export function embedSnippet(origin: string, tag = "your-agency"): string {
  const t = cleanPartnerTag(tag);
  return `<div data-komendly-embed data-partner="${t}"></div>\n<script async src="${origin.replace(/\/$/, "")}${EMBED_SCRIPT_PATH}"></script>`;
}

export function embedIframeSnippet(origin: string, tag = "your-agency"): string {
  const t = cleanPartnerTag(tag);
  return `<iframe src="${origin.replace(/\/$/, "")}${EMBED_PATH}?p=${t}" title="Make ads from your website" width="100%" height="230" style="border:0;max-width:520px" loading="lazy"></iframe>`;
}
