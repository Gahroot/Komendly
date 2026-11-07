export type EmailLayoutInput = {
  appUrl: string;
  preheader: string;
  heading: string;
  /** Paragraphs of plain text; escaped before rendering. */
  paragraphs: string[];
  button: { label: string; href: string };
  note?: string;
  /** Override the mascot image URL (previews only). */
  imageUrl?: string;
};

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const SERIF = "Fraunces,Georgia,'Times New Roman',serif";

/** Email-client-safe Studio-branded HTML wrapper (tables + inline styles). */
export function renderEmailLayout(input: EmailLayoutInput): string {
  const base = input.appUrl.replace(/\/$/, "");
  const img = escapeHtml(input.imageUrl ?? `${base}/brand/ozzy-classic-happy@3.png`);
  const href = escapeHtml(input.button.href);
  const paras = input.paragraphs
    .map((p) => `<p style="margin:0 0 16px;font-family:${SANS};font-size:16px;line-height:1.6;color:#fff1d6;">${escapeHtml(p)}</p>`)
    .join("");
  const note = input.note
    ? `<p style="margin:24px 0 0;font-family:${SANS};font-size:13px;line-height:1.5;color:#c9b8e8;">${escapeHtml(input.note)}</p>`
    : "";
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${escapeHtml(input.heading)}</title>
<style>:root{color-scheme:dark;supported-color-schemes:dark;}a{color:#ffcf4a;}</style>
</head>
<body style="margin:0;padding:0;background-color:#0c0820;color:#fff1d6;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${escapeHtml(input.preheader)}&#8199;&#847;&#8199;&#847;&#8199;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0c0820" style="background-color:#0c0820;background-image:linear-gradient(180deg,#0c0820 0%,#2b1556 70%,#b8513d 100%);">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;">
<tr><td style="height:6px;line-height:6px;font-size:0;background-color:#ffcf4a;background-image:linear-gradient(90deg,#2b1556,#b8513d,#ffcf4a);border-radius:12px 12px 0 0;">&nbsp;</td></tr>
<tr><td bgcolor="#150d2e" style="background-color:#150d2e;padding:32px 40px 36px;border-radius:0 0 16px 16px;border:1px solid #2b1556;border-top:0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td align="center" style="padding-bottom:8px;"><img src="${img}" width="96" height="96" alt="Ozzy the dingo wizard" style="display:block;width:96px;height:96px;border:0;image-rendering:pixelated;"></td></tr>
<tr><td align="center" style="padding-bottom:24px;font-family:${SERIF};font-size:20px;font-weight:700;color:#fff1d6;"><span style="color:#ffcf4a;">&#9670;</span>&nbsp;Komendly</td></tr>
<tr><td><h1 style="margin:0 0 20px;font-family:${SERIF};font-size:28px;line-height:1.25;font-weight:700;color:#fff1d6;">${escapeHtml(input.heading)}</h1>${paras}</td></tr>
<tr><td style="padding:12px 0 8px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="#ffcf4a" style="border-radius:12px;background-color:#ffcf4a;">
<a href="${href}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:${SANS};font-size:16px;font-weight:700;color:#2a0f10;text-decoration:none;border-radius:12px;">${escapeHtml(input.button.label)}</a>
</td></tr></table>
</td></tr>
<tr><td style="padding-top:16px;font-family:${SANS};font-size:13px;line-height:1.5;color:#c9b8e8;">Button not working? Paste this link into your browser:<br><a href="${href}" style="color:#ffcf4a;word-break:break-all;">${href}</a>${note}</td></tr>
</table>
</td></tr>
<tr><td align="center" style="padding:24px 16px 0;font-family:${SANS};font-size:12px;line-height:1.5;color:#a898c8;">You're getting this because you signed up at komendly.com</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}
