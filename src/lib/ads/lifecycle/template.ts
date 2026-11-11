// Branded lifecycle email (HTML + plain text). Table layout, inline CSS, 600px max, mobile-safe;
// designed dark (Studio palette) with color-scheme meta so clients don't invert it. Pure; engine imports it.

export interface LifecycleEmailInput {
  appUrl: string;
  /** Absolute base for static images (default https://www.komendly.com: must be public). */
  assetBaseUrl?: string;
  subject: string;
  preheader: string;
  paragraphs: string[];
  cta: { label: string; href: string };
  code?: string;
  thumbnails?: Array<{ src: string; alt: string }>;
  /** One big image (monthly fresh ad: the blurred locked preview) with a caption under it. */
  hero?: { src: string; alt: string; href: string; caption: string; /** Lock icon before the caption (default true). */ locked?: boolean; /** "top" = the email leads with it (above the headline), full width. */ position?: "top" | "inline" };
  /** One quiet P.S. line under the main button (e.g. the Studio bridge in day7/day10). Href must be absolute. */
  ps?: { text: string; linkLabel: string; href: string };
  /** Extra link sections under the button (e.g. "Ways to get more free ads"). Hrefs must be absolute. */
  blocks?: Array<{ title: string; items: Array<{ text: string; linkLabel: string; href: string }> }>;
  unsubscribeUrl: string;
}

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const SERIF = "Fraunces,Georgia,'Times New Roman',serif";
const C = { bg: "#0c0820", card: "#150d2e", border: "#2b1556", text: "#fff1d6", muted: "#c9b8e8", gold: "#ffcf4a", ink: "#2a0f10" };

function thumbs(list: Array<{ src: string; alt: string }>, href: string): string {
  if (!list.length) return "";
  const cells = list
    .slice(0, 3)
    .map((t) => `<td class="th" width="33%" valign="top" style="padding:0 4px;"><a href="${esc(href)}" target="_blank"><img src="${esc(t.src)}" width="168" alt="${esc(t.alt)}" style="display:block;width:100%;max-width:168px;height:auto;border:1px solid ${C.border};border-radius:10px;"></a></td>`)
    .join("");
  return `<tr><td style="padding:8px 0 16px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${cells}</tr></table></td></tr>`;
}

function hero(h: LifecycleEmailInput["hero"]): string {
  if (!h) return "";
  const w = h.position === "top" ? 520 : 320;
  return `<tr><td align="center" style="padding:4px 0 18px;"><a href="${esc(h.href)}" target="_blank" style="text-decoration:none;"><img src="${esc(h.src)}" width="${w}" alt="${esc(h.alt)}" style="display:block;width:100%;max-width:${w}px;height:auto;border:1px solid ${C.border};border-radius:12px;"></a>
${h.caption ? `<div style="padding-top:10px;font-family:${SANS};font-size:13px;line-height:1.5;color:${C.gold};">${h.locked === false ? "" : "&#128274; "}${esc(h.caption)}</div>` : ""}</td></tr>`;
}

function blocks(list: LifecycleEmailInput["blocks"]): string {
  if (!list?.length) return "";
  return list
    .map((b) => {
      const items = b.items
        .map((i) => `<tr><td style="padding:0 0 12px;font-family:${SANS};font-size:14px;line-height:1.55;color:${C.muted};">${esc(i.text)}<br><a href="${esc(i.href)}" target="_blank" style="color:${C.gold};font-weight:700;text-decoration:underline;">${esc(i.linkLabel)} &rarr;</a></td></tr>`)
        .join("");
      return `<tr><td style="padding:22px 0 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${C.border};"><tr><td style="padding:18px 0 10px;font-family:${SERIF};font-size:18px;font-weight:700;color:${C.text};">${esc(b.title)}</td></tr>${items}</table></td></tr>`;
    })
    .join("");
}

export function renderLifecycleHtml(input: LifecycleEmailInput): string {
  const asset = (input.assetBaseUrl ?? "https://www.komendly.com").replace(/\/$/, "");
  const ozzy = `${asset}/brand/ozzy-classic-happy@3.png`;
  const logo = `${asset}/brand/komendly-logo-email.png`;
  const href = esc(input.cta.href);
  const paras = input.paragraphs
    .map((p) => `<p style="margin:0 0 14px;font-family:${SANS};font-size:16px;line-height:1.6;color:${C.text};">${esc(p)}</p>`)
    .join("");
  const code = input.code
    ? `<tr><td align="center" style="padding:4px 0 18px;"><div style="display:inline-block;padding:14px 22px;border:1px dashed ${C.gold};border-radius:12px;font-family:'SFMono-Regular',Menlo,Consolas,monospace;font-size:32px;letter-spacing:8px;font-weight:700;color:${C.gold};">${esc(input.code)}</div></td></tr>`
    : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark light">
<meta name="supported-color-schemes" content="dark light">
<title>${esc(input.subject)}</title>
<style>
:root{color-scheme:dark light;supported-color-schemes:dark light;}
a{color:${C.gold};}
@media only screen and (max-width:480px){.pad{padding:24px 20px 28px !important;}.th{padding:0 3px !important;}.ctat{width:100% !important;}.ctat a{display:block !important;text-align:center;}h1{font-size:24px !important;}}
</style>
</head>
<body style="margin:0;padding:0;background-color:${C.bg};color:${C.text};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${esc(input.preheader)}&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.bg}" style="background-color:${C.bg};background-image:linear-gradient(180deg,#0c0820 0%,#2b1556 70%,#b8513d 100%);">
<tr><td align="center" style="padding:28px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;">
<tr><td align="center" style="padding-bottom:16px;"><a href="${esc(input.appUrl)}" target="_blank" style="text-decoration:none;"><img src="${esc(logo)}" width="36" height="36" alt="" style="display:inline-block;vertical-align:middle;border:0;"><span style="display:inline-block;vertical-align:middle;padding-left:8px;font-family:${SERIF};font-size:22px;font-weight:700;color:${C.text};">Komendly</span></a></td></tr>
<tr><td style="height:6px;line-height:6px;font-size:0;background-color:${C.gold};background-image:linear-gradient(90deg,#2b1556,#b8513d,#ffcf4a);border-radius:14px 14px 0 0;">&nbsp;</td></tr>
<tr><td class="pad" bgcolor="${C.card}" style="background-color:${C.card};padding:32px 40px 36px;border-radius:0 0 16px 16px;border:1px solid ${C.border};border-top:0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td style="padding-bottom:16px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td valign="middle"><img src="${esc(ozzy)}" width="56" height="56" alt="Ozzy" style="display:block;width:56px;height:56px;border:0;image-rendering:pixelated;"></td>
<td valign="middle" style="padding-left:12px;font-family:${SANS};font-size:13px;line-height:1.4;color:${C.muted};"><strong style="color:${C.text};">Ozzy</strong> from Komendly</td>
</tr></table></td></tr>
${input.hero?.position === "top" ? hero(input.hero) : ""}<tr><td><h1 style="margin:0 0 18px;font-family:${SERIF};font-size:26px;line-height:1.25;font-weight:700;color:${C.text};">${esc(input.subject)}</h1>${paras}</td></tr>
${code}${input.hero?.position === "top" ? "" : hero(input.hero)}${thumbs(input.thumbnails ?? [], input.cta.href)}
<tr><td style="padding:6px 0 4px;">
<table class="ctat" role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="${C.gold}" style="border-radius:12px;background-color:${C.gold};">
<a href="${href}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:${SANS};font-size:16px;font-weight:700;color:${C.ink};text-decoration:none;border-radius:12px;">${esc(input.cta.label)}</a>
</td></tr></table>
</td></tr>
${input.ps ? `<tr><td style="padding:18px 0 0;font-family:${SANS};font-size:14px;line-height:1.55;color:${C.muted};">${esc(input.ps.text)} <a href="${esc(input.ps.href)}" target="_blank" style="color:${C.gold};font-weight:700;text-decoration:underline;">${esc(input.ps.linkLabel)} &rarr;</a></td></tr>` : ""}
${blocks(input.blocks)}
</table>
</td></tr>
<tr><td align="center" style="padding:20px 16px 0;font-family:${SANS};font-size:12px;line-height:1.6;color:#a898c8;">You're getting this because you signed up at komendly.com.<br><a href="${esc(input.unsubscribeUrl)}" style="color:#a898c8;text-decoration:underline;">Unsubscribe</a></td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

export function renderLifecycleText(input: LifecycleEmailInput): string {
  return [
    ...input.paragraphs,
    ...(input.code ? [`Your code: ${input.code}`] : []),
    ...(input.hero?.caption ? [input.hero.caption] : []),
    `${input.cta.label}: ${input.cta.href}`,
    ...(input.ps ? [`${input.ps.text} ${input.ps.linkLabel}: ${input.ps.href}`] : []),
    ...(input.blocks ?? []).map((b) => [b.title, ...b.items.map((i) => `- ${i.text} ${i.linkLabel}: ${i.href}`)].join("\n")),
    "--",
    "Ozzy from Komendly",
    `Unsubscribe: ${input.unsubscribeUrl}`,
  ].join("\n\n");
}

/** RFC 8058 one-click unsubscribe headers. */
export function unsubscribeHeaders(unsubscribeUrl: string): Record<string, string> {
  return { "List-Unsubscribe": `<${unsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" };
}
