// Wider sweep of the public-copy rules (the same banned patterns as public-copy-lint.test.ts): blog posts, llms/SEO
// builders, lifecycle + outbound email builders. "one-click" is banned in marketing copy (no one-click publishing claim
// before Meta approval); the RFC 8058 List-Unsubscribe-Post header value is the only legitimate use.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const BANNED = [/guarantee[ds]? (leads|sales|revenue|roi)/i, /\bget \d+ (leads|customers|sign-?ups|appointments)/i, /one[- ]click/i];
const root = process.cwd();
const walk = (dir: string): string[] => readdirSync(join(root, dir), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === "__tests__" ? [] : walk(join(dir, e.name))) : [join(dir, e.name)]));
const strip = (s: string) => s.replace(/List-Unsubscribe=One-Click/g, "").replace(/RFC 8058 one-click[^\n]*/g, "");

describe("wide public copy lint", () => {
  const files = [
    ...walk("content/blog").filter((f) => /\.mdx?$/.test(f)),
    ...walk("src/lib/ads/lifecycle"),
    ...walk("src/lib/seo"),
    "src/lib/ads/outbound/copy.ts",
    "src/lib/ads/public-offer.ts",
    "src/lib/ads/dream-copy.ts",
    "src/lib/revenue-lifecycle/nurture.ts",
  ];
  it("has no banned promise phrases", () => {
    expect(files.length).toBeGreaterThan(20);
    for (const f of files) {
      const src = strip(readFileSync(join(root, f), "utf8"));
      for (const re of BANNED) expect(src, `${f} ${re}`).not.toMatch(re);
    }
  });
});
