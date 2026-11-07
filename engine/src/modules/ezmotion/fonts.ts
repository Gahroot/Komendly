// Brand fonts -> local @font-face CSS. Order: vendored EZ Motion OFL fonts, the font's own
// sourceUrl (woff2/ttf/otf), Google Fonts, then a bundled fallback. Never fetched at render time.
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const VENDOR_DIR = fileURLToPath(new URL("./vendor/", import.meta.url));
export const FALLBACK_FAMILY = "Mona Sans";

interface VendoredFont {
  family: string;
  dir: string;
  files: Array<{ file: string; style: string; weight: string; stretch: string | null }>;
}

export interface ResolvedFonts {
  css: string;
  heading: string;
  body: string;
  sources: Record<string, "vendored" | "source" | "google" | "fallback">;
}

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const safeName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-");

async function vendored(): Promise<VendoredFont[]> {
  return JSON.parse(await readFile(join(VENDOR_DIR, "fonts", "fonts.json"), "utf8")) as VendoredFont[];
}

async function fetchBuf(url: string, signal: AbortSignal): Promise<Buffer | null> {
  try {
    const res = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

async function addVendored(v: VendoredFont, outDir: string): Promise<string> {
  const css: string[] = [];
  for (const file of v.files) {
    await copyFile(join(VENDOR_DIR, "fonts", v.dir, file.file), join(outDir, file.file));
    css.push(`@font-face{font-family:'${v.family}';src:url('fonts/${file.file}') format('woff2');font-style:${file.style};font-weight:${file.weight};${file.stretch ? `font-stretch:${file.stretch};` : ""}font-display:block}`);
  }
  return css.join("\n");
}

async function addFromSource(family: string, url: string, outDir: string, signal: AbortSignal): Promise<string | null> {
  const ext = /\.(woff2|woff|ttf|otf)(\?|$)/i.exec(url)?.[1]?.toLowerCase();
  if (!ext) return null;
  const buf = await fetchBuf(url, signal);
  if (!buf || buf.length < 1000) return null;
  const file = `${safeName(family)}-src.${ext}`;
  await writeFile(join(outDir, file), buf);
  const format = { woff2: "woff2", woff: "woff", ttf: "truetype", otf: "opentype" }[ext];
  return `@font-face{font-family:'${family}';src:url('fonts/${file}') format('${format}');font-weight:100 900;font-display:block}`;
}

async function addFromGoogle(family: string, outDir: string, signal: AbortSignal): Promise<string | null> {
  const q = encodeURIComponent(family).replace(/%20/g, "+");
  const cssBuf = await fetchBuf(`https://fonts.googleapis.com/css2?family=${q}:wght@400;600;700;800&display=block`, signal);
  if (!cssBuf) return null;
  let css = cssBuf.toString("utf8");
  // Keep latin subsets only (the last block per weight is latin in Google's ordering).
  const blocks = css.split("}").filter((b) => b.includes("@font-face"));
  const latin = css.includes("/* latin */") ? css.split("/* ").filter((b) => b.startsWith("latin */")).map((b) => b.slice(9)) : blocks.map((b) => `${b}}`);
  css = latin.join("\n");
  const urls = [...new Set([...css.matchAll(/url\((https:[^)]+)\)/g)].map((m) => m[1]).filter((u): u is string => !!u))];
  if (!urls.length) return null;
  let i = 0;
  for (const u of urls) {
    const buf = await fetchBuf(u, signal);
    if (!buf) return null;
    const file = `${safeName(family)}-g${i++}.woff2`;
    await writeFile(join(outDir, file), buf);
    css = css.split(u).join(`fonts/${file}`);
  }
  return css;
}

/** Resolve heading/body families from BrandKit fonts into `<projectDir>/fonts`. */
export async function resolveFonts(fonts: Array<{ family: string; role: string; sourceUrl?: string }>, projectDir: string, signal: AbortSignal, allowNetwork = true): Promise<ResolvedFonts> {
  const outDir = join(projectDir, "fonts");
  await mkdir(outDir, { recursive: true });
  const vend = await vendored();
  const pick = (re: RegExp) => fonts.find((f) => re.test(f.role.toLowerCase()))?.family;
  const headingWanted = pick(/head|display|title/) ?? fonts[0]?.family ?? FALLBACK_FAMILY;
  const bodyWanted = pick(/body|text|paragraph/) ?? headingWanted;
  const css: string[] = [];
  const sources: ResolvedFonts["sources"] = {};
  const done = new Map<string, string>();
  const resolveOne = async (family: string): Promise<string> => {
    const key = family.toLowerCase().trim();
    const hit = done.get(key);
    if (hit) return hit;
    const v = vend.find((x) => x.family.toLowerCase() === key);
    let got: string | null = null;
    if (v) {
      css.push(await addVendored(v, outDir));
      sources[v.family] = "vendored";
      got = v.family;
    } else if (allowNetwork) {
      const src = fonts.find((f) => f.family.toLowerCase().trim() === key)?.sourceUrl;
      const fromSrc = src ? await addFromSource(family, src, outDir, signal) : null;
      const block = fromSrc ?? (await addFromGoogle(family, outDir, signal));
      if (block) {
        css.push(block);
        sources[family] = fromSrc ? "source" : "google";
        got = family;
      }
    }
    if (!got) {
      if (!done.has(FALLBACK_FAMILY.toLowerCase())) {
        const fb = vend.find((x) => x.family === FALLBACK_FAMILY);
        if (fb) css.push(await addVendored(fb, outDir));
        done.set(FALLBACK_FAMILY.toLowerCase(), FALLBACK_FAMILY);
      }
      sources[family] = "fallback";
      got = FALLBACK_FAMILY;
    }
    done.set(key, got);
    return got;
  };
  const heading = await resolveOne(headingWanted);
  const body = await resolveOne(bodyWanted);
  if (!done.has(FALLBACK_FAMILY.toLowerCase())) await resolveOne(FALLBACK_FAMILY);
  return { css: css.join("\n"), heading, body, sources };
}
