// Pure helpers that make Ozzy's MCP outputs "Meta-ready": CTA enum suggestions, placement hints, file names and
// suggested ad copy for Studio videos. No I/O here, so it is unit-tested directly.

/** How long MCP download links live: 7 days, the S3 SigV4 maximum, so an external tool (a Meta Ads MCP) can fetch them later. */
export const SHARE_LINK_SECONDS = 7 * 24 * 60 * 60;

export type MetaCta =
  | "SHOP_NOW"
  | "BUY_NOW"
  | "ORDER_NOW"
  | "GET_OFFER"
  | "SIGN_UP"
  | "SUBSCRIBE"
  | "BOOK_NOW"
  | "GET_QUOTE"
  | "CONTACT_US"
  | "APPLY_NOW"
  | "DOWNLOAD"
  | "WATCH_MORE"
  | "LEARN_MORE";

// Most specific first: "Start free trial" must win over "Learn".
const CTA_RULES: ReadonlyArray<readonly [RegExp, MetaCta]> = [
  [/\b(book|schedule|reserve|appointment)\b/i, "BOOK_NOW"],
  [/\b(quote|estimate)\b/i, "GET_QUOTE"],
  [/\bapply\b/i, "APPLY_NOW"],
  [/\b(sign ?up|register|join|create (an |your )?account|get started|start (your )?(free )?trial|try (it )?(for )?free|start free|try free)\b/i, "SIGN_UP"],
  [/\bsubscribe\b/i, "SUBSCRIBE"],
  [/\b(order|delivery)\b/i, "ORDER_NOW"],
  [/\bbuy\b/i, "BUY_NOW"],
  [/\b(shop|store|add to cart|browse (the )?collection)\b/i, "SHOP_NOW"],
  [/\b(offer|deal|discount|coupon|% off|claim)\b/i, "GET_OFFER"],
  [/\b(download|install|get the app)\b/i, "DOWNLOAD"],
  [/\b(contact|call us|talk to|message us|get in touch|book a call)\b/i, "CONTACT_US"],
  [/\b(watch)\b/i, "WATCH_MORE"],
  [/\b(learn|see how|discover|find out|read|explore|more)\b/i, "LEARN_MORE"],
];

/** Meta call_to_action type for a free-text CTA, only when it's obvious (null otherwise). */
export function metaCtaFor(cta: string | null | undefined): MetaCta | null {
  const text = (cta ?? "").trim();
  if (!text) return null;
  for (const [re, type] of CTA_RULES) if (re.test(text)) return type;
  return null;
}

export type Placement = "feed" | "stories" | "reels";

/** Where a creative of this shape fits on Facebook/Instagram. */
export function placementsFor(ratio: string): Placement[] {
  if (ratio === "9:16") return ["stories", "reels"];
  if (ratio === "4:5" || ratio === "1:1") return ["feed"];
  if (ratio === "16:9") return ["feed"];
  return ["feed"];
}

function extOf(mime: string): string {
  if (mime === "video/mp4") return "mp4";
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/webp") return "webp";
  return "png";
}

/** Stable, readable file name for a download link (keeps the real extension). */
export function creativeFilename(prefix: string, ratio: string, mime: string): string {
  const safe = prefix.replace(/[^a-zA-Z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "creative";
  return `${safe}-${ratio.replace(":", "x")}.${extOf(mime)}`;
}

/** Reduce a ratio string like "1080x1920" dims to "9:16"-style when the ratio isn't stored. */
export function ratioOf(width: number, height: number): string {
  if (!width || !height) return "";
  const r = width / height;
  const known: ReadonlyArray<readonly [string, number]> = [["9:16", 9 / 16], ["4:5", 4 / 5], ["1:1", 1], ["16:9", 16 / 9], ["1.91:1", 1.91]];
  let best = known[0] ?? ["1:1", 1];
  for (const k of known) if (Math.abs(k[1] - r) < Math.abs(best[1] - r)) best = k;
  return best[0];
}

// --------------------------------------------------------------------------------------------------------------
// Suggested ad copy for a Studio video. Derived (no model call): free, instant and deterministic. It uses the
// brand profile Ozzy already extracted plus what the user asked for, and keeps to Meta's recommended lengths.

export interface CopyInputs {
  kind: "launch" | "remix" | "video";
  brandName: string | null;
  mainOffer: string | null;
  audience: string | null;
  /** What the user asked for: launch notes, remix notes, or the video prompt. */
  ask: string | null;
  /** Landing page (brand landing page, the launched product URL, ...). */
  landingUrl: string | null;
}

export interface AdCopy {
  headline: string;
  primary_text: string;
  cta: string;
  cta_type: MetaCta;
  landing_url: string | null;
}

/** Meta's recommended lengths (longer text is truncated in most placements). */
export const HEADLINE_MAX = 40;
export const PRIMARY_TEXT_MAX = 125;

function clean(s: string | null | undefined): string {
  return (s ?? "").replace(/\s+/g, " ").trim();
}

/** Cut at a word boundary, no trailing punctuation fragments. */
export function clip(s: string, max: number): string {
  const t = clean(s);
  if (t.length <= max) return t;
  const cut = t.slice(0, max + 1);
  const at = cut.lastIndexOf(" ");
  return `${(at > max * 0.5 ? cut.slice(0, at) : t.slice(0, max)).replace(/[\s,;:.\-–—]+$/, "")}…`;
}

function firstSentence(s: string): string {
  const t = clean(s);
  const m = /^(.+?[.!?])(\s|$)/.exec(t);
  return m?.[1] ?? t;
}

function hostOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** Remove our own instruction phrasing ("Make it 9:16.", "Remix this ad...") from the ask. */
function stripInstructions(ask: string): string {
  return clean(
    ask
      .replace(/^(make a launch video for what we just shipped|remix this ad for my brand)[^\n]*\n?/i, "")
      .replace(/^what we shipped:\s*/i, "")
      .replace(/\bmake it (9:16|16:9|1:1|4:5)\.?/gi, ""),
  );
}

export function suggestAdCopy(i: CopyInputs): AdCopy {
  const name = clean(i.brandName) || hostOf(i.landingUrl) || "";
  const offer = clean(i.mainOffer);
  const ask = stripInstructions(i.ask ?? "");
  const lead = firstSentence(ask);
  let headline: string;
  let body: string;
  let cta: string;
  if (i.kind === "launch") {
    headline = name ? `New in ${name}` : "Just launched";
    if (lead && lead.length <= HEADLINE_MAX - 5) headline = `New: ${lead.replace(/[.!?]$/, "")}`;
    body = lead ? `Just shipped${name ? ` in ${name}` : ""}: ${lead}${/[.!?]$/.test(lead) ? "" : "."} Try it today.` : `${name || "We"} just shipped something new. See it in action.`;
    cta = "Try it free";
  } else {
    headline = offer ? firstSentence(offer).replace(/[.!?]$/, "") : name ? `Meet ${name}` : "See what's new";
    const who = clean(i.audience);
    body = [offer ? firstSentence(offer) : lead || (name ? `${name} makes it easy.` : ""), who ? `Made for ${who.replace(/[.!?]$/, "")}.` : ""].filter(Boolean).join(" ");
    cta = /\b(shop|store|buy|order|cart)\b/i.test(`${offer} ${ask}`) ? "Shop now" : "Learn more";
  }
  const cta_type = metaCtaFor(cta) ?? "LEARN_MORE";
  return { headline: clip(headline, HEADLINE_MAX), primary_text: clip(body || headline, PRIMARY_TEXT_MAX), cta, cta_type, landing_url: i.landingUrl };
}
