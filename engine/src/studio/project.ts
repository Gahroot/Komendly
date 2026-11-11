// Ozzy Studio project snapshots: what goes into the session's tar.gz between turns.
import { readdir, stat, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { run } from "../modules/ezmotion/runtime";

const SKIP_DIRS = new Set(["node_modules", ".cache", ".git", ".hyperframes", "uploads", "brand", ".npm", "__pycache__"]);
const VIDEO = /\.(mp4|mov|webm|mkv)$/i;

/** Pure: should this project-relative path (posix) be in the snapshot? Uploads/brand are re-fetched each turn. */
export function includeInSnapshot(rel: string, delivered: ReadonlySet<string> = new Set()): boolean {
  const parts = rel.split("/");
  if (parts.some((p) => SKIP_DIRS.has(p))) return false;
  if (delivered.has(rel)) return false;
  if (VIDEO.test(rel) && parts.slice(0, -1).some((p) => p === "renders" || p === "snapshots")) return false;
  if (/\.(tmp|log)$|\.ez-session-tmp-|(^|\/)\.DS_Store$/.test(rel)) return false;
  return true;
}

export async function listSnapshotFiles(dir: string, delivered: ReadonlySet<string> = new Set()): Promise<string[]> {
  const out: string[] = [];
  const walk = async (d: string): Promise<void> => {
    for (const e of (await readdir(d, { withFileTypes: true }).catch(() => [])).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = join(d, e.name);
      const rel = relative(dir, p).split(sep).join("/");
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) await walk(p);
      } else if (e.isFile() && includeInSnapshot(rel, delivered)) out.push(rel);
    }
  };
  await walk(dir);
  return out;
}

export async function packProject(dir: string, outFile: string, delivered: ReadonlySet<string>, signal?: AbortSignal): Promise<{ ok: boolean; files: number; bytes: number; error?: string }> {
  const files = await listSnapshotFiles(dir, delivered);
  const list = `${outFile}.list`;
  await writeFile(list, files.join("\n") + "\n");
  const r = await run("tar", ["-czf", outFile, "-C", dir, "-T", list], { signal, timeoutMs: 5 * 60_000 });
  if (r.code !== 0) return { ok: false, files: files.length, bytes: 0, error: r.stderr.slice(-300) };
  return { ok: true, files: files.length, bytes: (await stat(outFile)).size };
}

export async function unpackProject(tarFile: string, dir: string, signal?: AbortSignal): Promise<boolean> {
  const r = await run("tar", ["-xzf", tarFile, "-C", dir], { signal, timeoutMs: 5 * 60_000 });
  return r.code === 0;
}

/** Video files (project-relative) with mtimes, to spot what the agent produced this turn. */
export async function videoFiles(dir: string): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const walk = async (d: string, depth: number): Promise<void> => {
    if (depth > 5) return;
    for (const e of await readdir(d, { withFileTypes: true }).catch(() => [])) {
      const p = join(d, e.name);
      if (e.isDirectory()) {
        if (!["node_modules", ".git", "uploads", "brand"].includes(e.name)) await walk(p, depth + 1);
      } else if (e.isFile() && /\.(mp4|mov)$/i.test(e.name)) {
        const s = await stat(p).catch(() => null);
        if (s && s.size > 10_000) out.set(relative(dir, p).split(sep).join("/"), s.mtimeMs);
      }
    }
  };
  await walk(dir, 0);
  return out;
}

/** Pure: the newest video that is new or changed since `before` (renders/ and final-ish names preferred). */
export function pickDelivered(before: ReadonlyMap<string, number>, after: ReadonlyMap<string, number>): string | null {
  const changed = [...after].filter(([k, m]) => before.get(k) !== m);
  if (!changed.length) return null;
  const score = (k: string) => (/(^|\/)renders\//.test(k) ? 2 : 0) + (/final|v\d+|export|ad/i.test(k.split("/").pop() ?? "") ? 1 : 0);
  changed.sort((a, b) => b[1] - a[1] || score(b[0]) - score(a[0]) || a[0].localeCompare(b[0]));
  const newest = changed[0]?.[1] ?? 0;
  // Within 2s of the newest write, prefer the render-looking file.
  const near = changed.filter(([, m]) => newest - m < 2_000).sort((a, b) => score(b[0]) - score(a[0]) || b[1] - a[1]);
  return near[0]?.[0] ?? null;
}

/** Newest index.html changed since the turn started (a composition the engine can render itself). */
export async function changedComposition(dir: string, sinceMs: number): Promise<string | null> {
  let best: { d: string; m: number } | null = null;
  const walk = async (d: string, depth: number): Promise<void> => {
    if (depth > 3) return;
    for (const e of await readdir(d, { withFileTypes: true }).catch(() => [])) {
      const p = join(d, e.name);
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name) && e.name !== "renders") await walk(p, depth + 1);
      } else if (e.name === "index.html") {
        const m = (await stat(p)).mtimeMs;
        if (m >= sinceMs && (!best || m > best.m)) best = { d, m };
      }
    }
  };
  await walk(dir, 0);
  return (best as { d: string; m: number } | null)?.d ?? null;
}
