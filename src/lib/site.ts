/** Canonical site constants shared by metadata, JSON-LD, sitemap, robots, feeds and llms.txt. */
export const SITE_URL = "https://www.komendly.com";
export const SITE_NAME = "Komendly";
export const ORG_ID = `${SITE_URL}/#organization`;
export const WEBSITE_ID = `${SITE_URL}/#website`;
export const LOGO_URL = `${SITE_URL}/brand/icon-512.png`;

export function absoluteUrl(pathname: string): string {
  if (/^https?:\/\//.test(pathname)) return pathname;
  return `${SITE_URL}${pathname.startsWith("/") ? "" : "/"}${pathname}`;
}
