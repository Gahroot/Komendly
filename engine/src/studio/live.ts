// Ozzy Studio live preview: publish the agent's playable composition (index.html + the files it uses) to storage
// while the turn is still running, so the chat can play it seconds after it exists (long before the final MP4).
// The web route src/app/api/studio/live/... serves exactly the files listed in the version's manifest.
import { randomBytes } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, extname, join, relative, sep } from "node:path";
import { type LiveManifest, studioKeys } from "../../../src/lib/studio/contracts";
import { errMsg, log } from "../log";
import type { Storage } from "../storage/s3";
import { ratioOf } from "./media";

export const LIVE_LIMITS = {
  /** One file larger than this is left out (huge raw footage). */
  fileBytes: 60 * 1024 * 1024,
  /** Total new bytes per published version. */
  totalBytes: 150 * 1024 * 1024,
  files: 400,
  /** Re-publish at most this often within a turn, and at most this many times. */
  minGapMs: 8_000,
  publishes: 10,
} as const;

/** Where the HyperFrames browser runtime goes inside each published version. */
export const LIVE_RUNTIME_REL = "__ozzy/hf-runtime.js";

const SKIP_DIRS = new Set(["node_modules", ".cache", ".git", ".hyperframes", ".npm", "__pycache__", "renders", "snapshots", "__ozzy"]);
const MEDIA = /\.(mp4|mov|webm|mkv|m4v|mp3|wav|m4a|aac|ogg|flac)$/i;
const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".htm": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".avif": "image/avif",
  ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf", ".otf": "font/otf",
  ".mp4": "video/mp4", ".m4v": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm", ".mkv": "video/x-matroska",
  ".mp3": "audio/mpeg", ".wav": "audio/wav", ".m4a": "audio/mp4", ".aac": "audio/aac", ".ogg": "audio/ogg", ".flac": "audio/flac",
  ".txt": "text/plain; charset=utf-8", ".vtt": "text/vtt; charset=utf-8",
};

export function liveContentType(rel: string): string {
  return TYPES[extname(rel).toLowerCase()] ?? "application/octet-stream";
}

/** Pure: relative references in HTML/CSS (src, href, poster, data-*-src, url(...)); absolute/data/hash URLs ignored. */
export function liveRefs(text: string): string[] {
  const out = new Set<string>();
  const add = (raw: string) => {
    const v = raw.trim().split(/[?#]/)[0] ?? "";
    if (!v || /^([a-z][a-z0-9+.-]*:|\/\/|\/|#)/i.test(v)) return;
    try { out.add(decodeURI(v)); } catch { out.add(v); }
  };
  for (const m of text.matchAll(/\b(?:src|href|poster|data-[\w-]*src)\s*=\s*(["'])(.*?)\1/gi)) add(m[2] ?? "");
  for (const m of text.matchAll(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi)) add(m[2] ?? "");
  return [...out].sort();
}

/** Pure: composition size from the root `data-width`/`data-height` (defaults 1080x1920). */
export function compositionSize(html: string): { width: number; height: number } {
  const root = /<[^>]*data-composition-id[^>]*>/i.exec(html)?.[0] ?? "";
  const num = (a: string) => Number(new RegExp(`data-${a}\\s*=\\s*["']?(\\d{2,5})`, "i").exec(root)?.[1]);
  const w = num("width");
  const h = num("height");
  return { width: w > 0 ? w : 1080, height: h > 0 ? h : 1920 };
}

/** Pure: is this index.html something the browser runtime can play? */
export function isPlayable(html: string): boolean {
  return /data-composition-id/i.test(html) && /<\/(body|html)>/i.test(html);
}

/** Pure: drop any runtime script the agent left in and load ours (path relative to the entry). */
export function injectRuntime(html: string, entryRel: string): string {
  const depth = entryRel.split("/").length - 1;
  const src = `${"../".repeat(depth)}${LIVE_RUNTIME_REL}`;
  const cleaned = html.replace(/<script\b[^>]*(hyperframe\.runtime|hyperframe-runtime|data-hyperframes-preview-runtime)[^>]*>\s*<\/script>/gi, "");
  const tag = `<script data-hyperframes-preview-runtime="1" src="${src}"></script>`;
  if (/<\/head>/i.test(cleaned)) return cleaned.replace(/<\/head>/i, `${tag}\n</head>`);
  if (/<body\b[^>]*>/i.test(cleaned)) return cleaned.replace(/<body\b[^>]*>/i, (m) => `${m}${tag}`);
  return tag + cleaned;
}

/** Pure: is `rel` (posix, project-relative) safe (inside the project, no dot-dot)? */
export function safeRel(rel: string): boolean {
  return rel.length > 0 && rel.length <= 300 && !rel.startsWith("/") && !rel.split("/").some((p) => p === ".." || p === "." || p === "");
}

export interface LiveFile { rel: string; abs: string; size: number; mtimeMs: number }

/** Files a composition needs: everything small under its folder + whatever its HTML/CSS references (media only when referenced). */
export async function collectLive(project: string, compDir: string): Promise<{ entry: string; files: LiveFile[]; skipped: string[] }> {
  const toRel = (abs: string) => relative(project, abs).split(sep).join("/");
  const entry = toRel(join(compDir, "index.html"));
  const found = new Map<string, LiveFile>();
  const skipped: string[] = [];
  const consider = async (abs: string, referenced: boolean) => {
    const rel = toRel(abs);
    if (found.has(rel) || !safeRel(rel)) return;
    if (!referenced && MEDIA.test(rel)) return;
    const s = await stat(abs).catch(() => null);
    if (!s?.isFile()) return;
    if (s.size > LIVE_LIMITS.fileBytes) { skipped.push(rel); return; }
    found.set(rel, { rel, abs, size: s.size, mtimeMs: s.mtimeMs });
  };
  const walk = async (d: string, depth: number): Promise<void> => {
    if (depth > 4) return;
    for (const e of (await readdir(d, { withFileTypes: true }).catch(() => [])).sort((a, b) => a.name.localeCompare(b.name))) {
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name) && e.name !== "uploads" && e.name !== "brand") await walk(join(d, e.name), depth + 1); }
      else if (e.isFile() && !/\.(tmp|log|md|tar|gz|zip)$|^\.DS_Store$/i.test(e.name)) await consider(join(d, e.name), false);
    }
  };
  await walk(compDir, 0);
  // Follow references from every HTML/CSS file (also into ../uploads or ../brand), a few levels deep.
  const queue = [...found.values()].filter((f) => /\.(html?|css)$/i.test(f.rel));
  for (let i = 0; i < queue.length && i < 200; i++) {
    const f = queue[i] as LiveFile;
    const text = await readFile(f.abs, "utf8").catch(() => "");
    for (const ref of liveRefs(text)) {
      const abs = join(dirname(f.abs), ref);
      const before = found.size;
      await consider(abs, true);
      const added = found.get(toRel(abs));
      if (found.size > before && added && /\.(html?|css)$/i.test(added.rel)) queue.push(added);
    }
  }
  // Code/images first, then media; cap count and bytes.
  const sorted = [...found.values()].sort((a, b) => Number(MEDIA.test(a.rel)) - Number(MEDIA.test(b.rel)) || a.rel.localeCompare(b.rel));
  const files: LiveFile[] = [];
  let total = 0;
  for (const f of sorted) {
    if (files.length >= LIVE_LIMITS.files || total + f.size > LIVE_LIMITS.totalBytes) { skipped.push(f.rel); continue; }
    files.push(f);
    total += f.size;
  }
  return { entry, files, skipped };
}

/** Pure: a fingerprint of a file set (changes when any file is added, removed or rewritten). */
export function liveSignature(entry: string, files: readonly LiveFile[]): string {
  return [entry, ...files.map((f) => `${f.rel}:${f.size}:${Math.round(f.mtimeMs)}`)].join("|");
}

function runtimePath(): string | null {
  try {
    const require = createRequire(import.meta.url);
    return join(dirname(require.resolve("hyperframes/package.json")), "dist", "hyperframe.runtime.iife.js");
  } catch {
    return null;
  }
}

export interface LivePublisherOptions {
  storage: Pick<Storage, "put">;
  workspaceId: string;
  sessionId: string;
  messageId: string;
  project: string;
  /** Newest composition folder changed this turn, or null (turn.ts passes changedComposition). */
  findComposition: () => Promise<string | null>;
  emit: (row: { type: "live"; data: { version: string; width: number; height: number; ratio: string } }) => void;
  now: () => number;
  /** Override for tests. */
  runtimeJs?: () => Promise<Buffer | null>;
}

/** Throttled publisher for one turn: call tick() on an interval and once (force) when the agent stops. */
export function livePublisher(o: LivePublisherOptions) {
  let busy: Promise<void> | null = null;
  let lastSig = "";
  let lastAt = -Infinity;
  let count = 0;
  /** rel -> already-uploaded key for an unchanged file (no re-upload across versions of the same turn). */
  const uploaded = new Map<string, { sig: string; key: string }>();
  let runtime: { key: string; size: number } | null = null;

  const publish = async (force: boolean): Promise<void> => {
    if (count >= LIVE_LIMITS.publishes) return;
    if (!force && o.now() - lastAt < LIVE_LIMITS.minGapMs) return;
    const comp = await o.findComposition();
    if (!comp) return;
    const html = await readFile(join(comp, "index.html"), "utf8").catch(() => "");
    if (!isPlayable(html)) return;
    const { entry, files, skipped } = await collectLive(o.project, comp);
    const sig = liveSignature(entry, files);
    if (sig === lastSig) return;
    const version = `${o.messageId}-${count + 1}`;
    const manifest: LiveManifest = { token: randomBytes(24).toString("base64url"), entry, ...compositionSize(html), files: {} };
    if (!runtime) {
      const js = o.runtimeJs ? await o.runtimeJs() : await (async () => { const p = runtimePath(); return p ? readFile(p).catch(() => null) : null; })();
      if (!js) { log("warn", "studio live: hyperframes runtime missing"); return; }
      const key = studioKeys.liveFile(o.workspaceId, o.sessionId, version, LIVE_RUNTIME_REL);
      await o.storage.put(key, js, "text/javascript; charset=utf-8");
      runtime = { key, size: js.length };
    }
    manifest.files[LIVE_RUNTIME_REL] = { key: runtime.key, type: "text/javascript; charset=utf-8", size: runtime.size };
    for (const f of files) {
      const type = liveContentType(f.rel);
      const fsig = `${f.size}:${f.mtimeMs}`;
      const prev = uploaded.get(f.rel);
      if (f.rel !== entry && prev?.sig === fsig) { manifest.files[f.rel] = { key: prev.key, type, size: f.size }; continue; }
      const key = studioKeys.liveFile(o.workspaceId, o.sessionId, version, f.rel);
      const body = f.rel === entry ? Buffer.from(injectRuntime(await readFile(f.abs, "utf8"), entry)) : await readFile(f.abs);
      await o.storage.put(key, body, type);
      if (f.rel !== entry) uploaded.set(f.rel, { sig: fsig, key });
      manifest.files[f.rel] = { key, type, size: body.length };
    }
    if (!manifest.files[entry]) return;
    await o.storage.put(studioKeys.liveManifest(o.workspaceId, o.sessionId, version), Buffer.from(JSON.stringify(manifest)), "application/json");
    lastSig = sig;
    lastAt = o.now();
    count++;
    if (skipped.length) log("info", "studio live: files left out", { count: skipped.length });
    o.emit({ type: "live", data: { version, width: manifest.width, height: manifest.height, ratio: ratioOf(manifest.width, manifest.height) } });
  };

  const run = (force: boolean): Promise<void> => {
    if (busy) return force ? busy.then(() => run(true)) : busy;
    busy = publish(force)
      .catch((e) => log("warn", "studio live publish failed", { error: errMsg(e) }))
      .finally(() => { busy = null; });
    return busy;
  };
  return {
    tick: () => run(false),
    /** Final publish after the agent stops (ignores the gap; still skips when nothing changed). */
    flush: () => run(true),
    get published() { return count; },
  };
}
