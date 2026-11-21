// Pure Meta Ad Library card parser. No chrome.* or network: takes DOM nodes, returns plain data.
// Meta's class names are generated and change often, so this keys off stable things only:
// the "Library ID: <digits>" label, the pre-wrap body text, line-clamped footer lines, l.facebook.com
// outbound links, facebook.com page links and fbcdn image sizes.

export interface AdCardInfo {
  libraryId: string;
  /** Public Ad Library link for this one ad. */
  libraryUrl: string;
  pageName: string | null;
  pageUrl: string | null;
  /** Numeric page id or vanity name (first path segment of pageUrl). */
  pageId: string | null;
  text: string | null;
  headline: string | null;
  description: string | null;
  cta: string | null;
  destinationUrl: string | null;
  imageUrl: string | null;
  videoUrl: string | null;
  multipleVersions: boolean;
}

/** "Library ID: 123" in the languages the Ad Library is most used in. */
export const LIBRARY_ID_RE = /(?:Library ID|ID de la biblioteca|ID da biblioteca|ID de la bibliothèque|ID de bibliothèque|Bibliotheks-ID|ID libreria|ID della libreria)\s*[:：]\s*(\d{5,})/i;
const DETAILS_RE = /^(see (ad|summary) details|open dropdown|remove)$/i;
const DOMAIN_RE = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i;
/** Marks everything this extension injects so the parser never reads its own UI. */
export const OWN_ATTR = "data-komendly";

const clean = (s: string | null | undefined): string => (s ?? "").replace(/[\u200b\u200c\u200d\ufeff]/g, "").replace(/[ \t\u00a0]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();
const orNull = (s: string): string | null => (s ? s : null);

/** Text with <br> kept as line breaks (textContent drops them). */
export function textWithBreaks(el: Node): string {
  let out = "";
  const walk = (n: Node) => {
    if (n.nodeType === 3) out += n.nodeValue ?? "";
    else if (n.nodeType === 1) {
      const e = n as Element;
      if (e.hasAttribute(OWN_ATTR)) return;
      if (e.tagName === "BR") out += "\n";
      else e.childNodes.forEach(walk);
    }
  };
  walk(el);
  return clean(out);
}

/** Smallest elements whose own text holds a Library ID label, with the id. */
export function findLibraryIdElements(root: ParentNode): { el: Element; id: string }[] {
  const doc = (root as Node).ownerDocument ?? (root as Document);
  const walker = doc.createTreeWalker(root as Node, 4 /* NodeFilter.SHOW_TEXT */);
  const out: { el: Element; id: string }[] = [];
  const seen = new Set<Element>();
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = n.parentElement;
    if (!el || seen.has(el) || el.closest(`[${OWN_ATTR}]`)) continue;
    // The label's own short element (it may be split over a few text nodes), never a big container.
    const own = el.textContent ?? "";
    const m = own.length <= 100 ? LIBRARY_ID_RE.exec(own) : null;
    if (!m) continue;
    seen.add(el);
    out.push({ el, id: m[1]! });
  }
  return out;
}

function hasAdContent(e: Element): boolean {
  const page = [...e.querySelectorAll("a[href]")].some((a) => isPageLink(a.getAttribute("href")));
  return page && !!e.querySelector('div[style*="pre-wrap"], img, video');
}

/** One element per ad card. A card is the nearest ancestor of a Library ID label that holds the ad itself
 *  (page link + body or media), never one that also holds another card's label. */
export function findAdCards(root: ParentNode): Element[] {
  const ids = findLibraryIdElements(root);
  const cards: Element[] = [];
  for (const { el } of ids) {
    let e: Element = el;
    let found: Element | null = null;
    for (let depth = 0; depth < 30 && e.parentElement && e.parentElement.tagName !== "BODY"; depth++) {
      const p = e.parentElement;
      if (ids.some((o) => o.el !== el && p.contains(o.el))) break;
      e = p;
      if (hasAdContent(e)) {
        found = e;
        break;
      }
    }
    if (found && !cards.includes(found)) cards.push(found);
  }
  return cards;
}

function isPageLink(href: string | null): boolean {
  if (!href) return false;
  try {
    const u = new URL(href, "https://www.facebook.com/");
    if (!/^(www\.|m\.|web\.)?facebook\.com$/i.test(u.hostname)) return false;
    const seg = u.pathname.split("/").filter(Boolean)[0] ?? "";
    if (!seg || /^(ads|l\.php|business|help|policies|privacy|legal|login|watch|hashtag|sharer|share|groups|events)$/i.test(seg)) return false;
    return seg !== "profile.php" || u.searchParams.has("id");
  } catch {
    return false;
  }
}

function pageIdOf(href: string): string | null {
  const u = new URL(href, "https://www.facebook.com/");
  const seg = u.pathname.split("/").filter(Boolean)[0] ?? "";
  if (seg === "profile.php") return u.searchParams.get("id");
  return seg || null;
}

function outboundUrl(href: string | null): string | null {
  if (!href) return null;
  try {
    const u = new URL(href, "https://www.facebook.com/");
    if (/^l\.facebook\.com$/i.test(u.hostname) && u.pathname === "/l.php") {
      const dest = u.searchParams.get("u");
      return dest && /^https?:\/\//i.test(dest) ? dest : null;
    }
    if (/(^|\.)(facebook|fbcdn|instagram)\.(com|net)$/i.test(u.hostname)) return null;
    return /^https?:$/.test(u.protocol) ? u.toString() : null;
  } catch {
    return null;
  }
}

/** fbcdn size hint ("..._s60x60_...") so avatars/thumbnails are skipped. */
function isSmallImage(img: Element): boolean {
  const src = img.getAttribute("src") ?? "";
  const m = /[_=]s(\d{2,4})x(\d{2,4})(?:[_&]|$)/.exec(src);
  if (m && Number(m[1]) < 150 && Number(m[2]) < 150) return true;
  const w = Number(img.getAttribute("width"));
  return w > 0 && w < 150;
}

const precedes = (a: Node, b: Node) => (a.compareDocumentPosition(b) & 4) !== 0; // Node.DOCUMENT_POSITION_FOLLOWING

/** Read one ad card. Returns null when the element isn't an ad card. */
export function parseAdCard(card: Element): AdCardInfo | null {
  const idEl = findLibraryIdElements(card)[0];
  if (!idEl) return null;
  const libraryId = idEl.id;
  const own = (e: Element) => !e.closest(`[${OWN_ATTR}]`);

  const body = [...card.querySelectorAll('div[style*="pre-wrap"]')].find(own) ?? null;
  const text = body ? orNull(textWithBreaks(body)) : null;

  // Advertiser: the last facebook.com page link above the body ("Creator with Brand" -> Brand).
  const pageLinks = [...card.querySelectorAll("a[href]")].filter((a) => own(a) && isPageLink(a.getAttribute("href")) && (!body || !body.contains(a)) && (!body || precedes(a, body)));
  const pageA = pageLinks.at(-1) ?? [...card.querySelectorAll("a[href]")].find((a) => own(a) && isPageLink(a.getAttribute("href"))) ?? null;
  const pageUrl = pageA ? new URL(pageA.getAttribute("href")!, "https://www.facebook.com/").toString() : null;
  const pageName = pageA ? orNull(clean(pageA.textContent)) : null;

  // Footer lines (caption / headline / description) are line-clamped divs with an explicit line-height.
  const lines = [...card.querySelectorAll('div[style*="line-clamp"]')]
    .filter((d) => own(d) && !(body && (d.contains(body) || body.contains(d))) && !d.querySelector('div[style*="pre-wrap"]'))
    .map((d) => {
      const style = d.getAttribute("style") ?? "";
      const clamp = Number(/line-clamp:\s*(\d+)/.exec(style)?.[1] ?? 0);
      const lh = Number(/line-height:\s*([\d.]+)px/.exec(style)?.[1] ?? 0);
      return { text: clean(d.textContent), clamp, lh };
    })
    .filter((l) => l.lh > 0 && l.clamp > 0 && l.clamp <= 3);
  let headline: string | null = null;
  let description: string | null = null;
  const maxLh = Math.max(0, ...lines.filter((l) => l.text).map((l) => l.lh));
  const hi = lines.findIndex((l) => l.text && l.lh === maxLh && !DOMAIN_RE.test(l.text));
  if (hi >= 0) {
    headline = lines[hi]!.text;
    const next = lines[hi + 1];
    if (next && next.lh === maxLh && next.text && !DOMAIN_RE.test(next.text)) description = next.text;
  }

  // CTA: the first short plain button that isn't Meta's own UI and doesn't wrap a footer line.
  const ctaEl = [...card.querySelectorAll('[role="button"]')].find((b) => {
    if (!own(b) || b.querySelector('[style*="line-clamp"]') || b.closest('[style*="line-clamp"]') || b.getAttribute("aria-label")) return false;
    const t = clean(b.textContent);
    return !!t && t.length <= 30 && !DETAILS_RE.test(t) && !LIBRARY_ID_RE.test(t) && !(body && b.contains(body));
  });
  const cta = ctaEl ? orNull(clean(ctaEl.textContent)) : null;

  const destinationUrl = [...card.querySelectorAll("a[href]")].filter(own).map((a) => outboundUrl(a.getAttribute("href"))).find(Boolean) ?? null;

  const imgs = [...card.querySelectorAll("img[src]")].filter((i) => own(i) && /^https:\/\//.test(i.getAttribute("src")!) && !isSmallImage(i) && !(pageName && i.getAttribute("alt") === pageName));
  const video = [...card.querySelectorAll("video")].find(own) ?? null;
  const imageUrl = imgs[0]?.getAttribute("src") ?? video?.getAttribute("poster") ?? null;
  const videoSrc = video?.getAttribute("src") ?? null;
  const videoUrl = videoSrc && /^https:\/\//.test(videoSrc) ? videoSrc : null;

  return {
    libraryId,
    libraryUrl: `https://www.facebook.com/ads/library/?id=${libraryId}`,
    pageName,
    pageUrl,
    pageId: pageUrl ? pageIdOf(pageUrl) : null,
    text,
    headline,
    description,
    cta,
    destinationUrl,
    imageUrl,
    videoUrl,
    multipleVersions: /multiple versions/i.test(card.textContent ?? ""),
  };
}

/** Where the Remake button goes: right after Meta's "See ad details" button, else at the top of the card. */
export function findButtonAnchor(card: Element): { parent: Element; before: Node | null; alignWith?: Element } {
  const details = [...card.querySelectorAll('[role="button"]')].find((b) => /^see (ad|summary) details$/i.test(clean(b.textContent)));
  if (details) {
    // Meta wraps the button in a flex row (role="none") that carries the card's side margins: go after the wrapper.
    const wrap = details.parentElement && details.parentElement !== card && details.parentElement.getAttribute("role") === "none" ? details.parentElement : details;
    if (wrap.parentElement) return { parent: wrap.parentElement, before: wrap.nextSibling, alignWith: wrap };
  }
  return { parent: card, before: card.firstChild };
}

/** Distinct advertisers among cards (for the popup's "Check this advertiser's ads"). */
export function advertisersOf(ads: (AdCardInfo | null)[]): { name: string; pageId: string; pageUrl: string }[] {
  const out = new Map<string, { name: string; pageId: string; pageUrl: string }>();
  for (const a of ads) if (a?.pageId && a.pageUrl && !out.has(a.pageId)) out.set(a.pageId, { name: a.pageName ?? a.pageId, pageId: a.pageId, pageUrl: a.pageUrl });
  return [...out.values()];
}
