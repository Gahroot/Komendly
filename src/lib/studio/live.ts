// Ozzy Studio live preview (web side, pure): manifest lookup, token check and HTTP Range parsing.
import { timingSafeEqual } from "node:crypto";
import { LIVE_VERSION_RE, LiveManifestSchema, type LiveManifest } from "./contracts";

/** Parse a manifest JSON body; null when it is not one. */
export function parseLiveManifest(text: string): LiveManifest | null {
  try {
    const r = LiveManifestSchema.safeParse(JSON.parse(text));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

export function isLiveVersion(v: string): boolean {
  return LIVE_VERSION_RE.test(v);
}

/** Constant-time token check. */
export function liveTokenMatches(manifest: LiveManifest, token: string): boolean {
  const a = Buffer.from(manifest.token);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** The manifest file for URL path segments (decoded by Next), or null (only listed files are ever served). */
export function liveFileFor(manifest: LiveManifest, segments: readonly string[]): { rel: string; key: string; type: string } | null {
  if (!segments.length || segments.some((s) => !s || s === "." || s === ".." || s.includes("\\"))) return null;
  const rel = segments.join("/");
  const f = Object.hasOwn(manifest.files, rel) ? manifest.files[rel] : undefined;
  return f ? { rel, key: f.key, type: f.type } : null;
}

/** The player's entry URL (token in the path so the composition's relative asset paths keep working). */
export function liveEntryPath(sessionId: string, version: string, manifest: LiveManifest): string {
  return `/api/studio/live/${encodeURIComponent(sessionId)}/${version}/${manifest.token}/${manifest.entry.split("/").map(encodeURIComponent).join("/")}`;
}

/** Pure: a single `bytes=` range against `size`; null = serve whole file; "invalid" = 416. */
export function parseRange(header: string | null, size: number): { start: number; end: number } | null | "invalid" {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (!m[1] && !m[2])) return null;
  if (!m[1]) {
    const n = Number(m[2]);
    if (n <= 0) return "invalid";
    return { start: Math.max(0, size - n), end: size - 1 };
  }
  const start = Number(m[1]);
  const end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
  if (start >= size || end < start) return "invalid";
  return { start, end };
}

/** Response headers for every live file: never cached, sandboxed if opened directly, no token leaks via Referer. */
export function liveHeaders(type: string): Record<string, string> {
  return {
    "Content-Type": type,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": "sandbox allow-scripts",
    "Accept-Ranges": "bytes",
  };
}
