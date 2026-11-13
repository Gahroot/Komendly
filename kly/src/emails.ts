// Own-site email extraction for the finder: decodes common obfuscations (Cloudflare data-cfemail, [at]/(dot),
// HTML/URL entities, JSON-LD, vCard, meta tags) and keeps only addresses on the business's own registrable domain.
// Never guesses an address: everything returned was literally present on a page.
import { domainOfUrl, extractOwnEmails, registrableDomain } from "../../src/lib/ads/outbound/policy";

/** Cloudflare email protection: hex string, first byte is the XOR key. */
export function decodeCfEmail(hex: string): string | null {
  if (!/^[0-9a-f]{4,}$/i.test(hex) || hex.length % 2) return null;
  const key = parseInt(hex.slice(0, 2), 16);
  let s = "";
  for (let i = 2; i < hex.length; i += 2) s += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ key);
  return /^[^\s@]+@[^\s@]+\.[a-z]{2,24}$/i.test(s) ? s : null;
}

const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", commat: "@", period: "." };

export function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);?/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);?/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n: string) => NAMED[n.toLowerCase()] ?? m);
}

/** Turn every obfuscated / encoded form we recognise into plain `local@domain.tld` text. */
export function deobfuscate(html: string): string {
  let s = html.replace(/(?:data-cfemail=["']|\/cdn-cgi\/l\/email-protection#)([0-9a-f]+)/gi, (m, hex: string) => ` ${decodeCfEmail(hex) ?? ""} `);
  s = decodeEntities(s);
  s = s.replace(/%40/gi, "@").replace(/\\u0040/gi, "@").replace(/\\u002e/gi, ".");
  // "name [at] domain [dot] com", "name (at) domain (dot) com", "name AT domain DOT com": bracketed any case, bare only uppercase.
  const AT = String.raw`(?:\s*[\[({]\s*[aA][tT]\s*[\])}]\s*|\s+AT\s+)`;
  const DOT = String.raw`(?:\s*[\[({]\s*[dD][oO][tT]\s*[\])}]\s*|\s+DOT\s+)`;
  s = s.replace(new RegExp(String.raw`([A-Za-z0-9._%+-]+)${AT}([A-Za-z0-9-]+(?:(?:${DOT}|\.)[A-Za-z0-9-]+)+)`, "g"), (_, l: string, d: string) =>
    `${l}@${d.replace(new RegExp(DOT, "g"), ".")}`);
  return s;
}

/** Addresses from schema.org JSON-LD (`"email": "..."`) and vCard (`EMAIL;...:x@y`), already inside deobfuscated text. */
function structured(s: string): string {
  const out: string[] = [];
  for (const m of s.matchAll(/"email"\s*:\s*"(?:mailto:)?([^"]+)"/gi)) out.push(m[1] ?? "");
  for (const m of s.matchAll(/^EMAIL[^:\n]*:(.+)$/gim)) out.push((m[1] ?? "").trim());
  for (const m of s.matchAll(/<meta\b[^>]*(?:name|property)=["'][^"']*email[^"']*["'][^>]*content=["']([^"']+)["']/gi)) out.push(m[1] ?? "");
  return out.join(" ");
}

/** Image / asset names like logo@2x.png, and vendor/platform addresses that are never the business. */
const PLATFORM = /(^|\.)(sentry\.io|sentry-next\.wixpress\.com|wixpress\.com|wix\.com|squarespace\.com|godaddy\.com|example\.(com|org|net)|domain\.com|email\.com|yoursite\.com|yourdomain\.com|mysite\.com)$/;

/**
 * Own-domain business emails in a page, best first (role addresses, then others). Builds on the shared
 * `extractOwnEmails` filters (own domain, not webmail / no-reply / hex ids / file names) after deobfuscating.
 */
export function extractEmails(html: string, siteDomain: string): string[] {
  const s = deobfuscate(html);
  // Strip asset-like tokens ("logo@2x.png", "img@3x.webp") so they never look like emails.
  const clean = s.replace(/[a-z0-9._-]+@\d+x[a-z0-9._-]*/gi, " ");
  return extractOwnEmails(`${clean} ${structured(clean)}`, siteDomain).filter((e) => {
    const dom = e.split("@")[1] ?? "";
    return !PLATFORM.test(dom) && !/\.(png|jpe?g|gif|webp|svg|avif|ico|css|js|pdf)$/i.test(e);
  });
}

const PAGE_HINT = /contact|about|team|staff|our-?story|who-?we-?are|get.?in.?touch|reach|quote|estimate|privacy|impressum|imprint|location|support|connect/;
const PAGE_RANK = [/contact|get.?in.?touch|reach|connect/, /about|team|staff|story|who-?we/, /quote|estimate|location|support/, /privacy|impressum|imprint/];
const FALLBACK_PATHS = ["/contact", "/contact-us", "/about", "/about-us"];

/** Same-site pages worth checking for an email, best first; falls back to common paths when the nav has none. */
export function candidatePages(html: string, base: string, max = 5): string[] {
  const own = domainOfUrl(base);
  const found: Array<{ url: string; rank: number }> = [];
  const seen = new Set<string>([normalize(base)]);
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = decodeEntities(m[1] ?? "");
    const text = (m[2] ?? "").replace(/<[^>]+>/g, " ").toLowerCase();
    const key = `${href.toLowerCase()} ${text}`;
    if (!PAGE_HINT.test(key)) continue;
    let u: URL;
    try { u = new URL(href, base); } catch { continue; }
    if (!/^https?:$/.test(u.protocol) || !own || registrableDomain(u.hostname) !== own) continue;
    if (/\.(pdf|jpe?g|png|gif|webp|zip|docx?)$/i.test(u.pathname)) continue;
    u.hash = "";
    const n = normalize(u.toString());
    if (seen.has(n)) continue;
    seen.add(n);
    const rank = PAGE_RANK.findIndex((r) => r.test(key));
    found.push({ url: u.toString(), rank: rank === -1 ? PAGE_RANK.length : rank });
  }
  const out = found.sort((a, b) => a.rank - b.rank).map((f) => f.url);
  if (!out.some((u) => /contact/i.test(u))) {
    for (const p of FALLBACK_PATHS) {
      try {
        const u = new URL(p, base).toString();
        if (!seen.has(normalize(u))) { seen.add(normalize(u)); out.push(u); }
      } catch { /* bad base */ }
    }
  }
  return out.slice(0, max);
}

function normalize(u: string): string {
  return u.toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/\/+$/, "");
}
