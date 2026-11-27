// Builds the organizational knowledge index: docs/ops/knowledge/{index.json,README.md}.
//   npx tsx scripts/ops-build-knowledge.ts                 regenerate (reads MEMORY.md + docs/**/*.md)
//   npx tsx scripts/ops-build-knowledge.ts search "query"  BM25 keyword search over the index
//   npx tsx scripts/ops-build-knowledge.ts decision "what" "why" [area]   append to docs/ops/decisions.md (also write the AdsEvent with --db, needs DATABASE_URL via --env-file=.env.local)
// Secrets: only paths are ever indexed. Anything that looks like a token/key/long hex is redacted before it is written.
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { decisionLine, searchMemory, type MemoryDoc } from "../src/lib/ops/control/memory";

const ROOT = path.resolve(__dirname, "..");
const MEMORY = process.env.OPS_MEMORY_FILE || "/Users/groot/.ezcoder/goals/paying-custys/MEMORY.md";
const OUT = path.join(ROOT, "docs/ops/knowledge");

export const redact = (s: string) => s
  .replace(/\b(sk|pk|rk|whsec|kmd)_[A-Za-z0-9_]{8,}/g, "[redacted]")
  .replace(/\b[A-Fa-f0-9]{24,}\b/g, "[redacted]")
  .replace(/\b[A-Za-z0-9+/=_-]{40,}\b/g, "[redacted]")
  .replace(/(password|passwd|token|secret)\s*[:=]\s*\S+/gi, "$1: [redacted]");

export const classify = (t: string): string =>
  /\b(user decision|decided|decision|rule|never|must not|do not)\b/i.test(t) ? "decision"
  : /\b(deploy|railway up|worktree|psql|import|runbook|how to|run:|npx tsx|npm )/i.test(t) ? "runbook"
  : /\b(account|login|pw secret|logged in|connected|app id|dev account)\b/i.test(t) ? "account"
  : /\b(fix|fixed|lesson|bug|root cause|learned|finding)\b/i.test(t) ? "lesson" : "note";

function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = path.join(dir, n);
    if (p.startsWith(OUT) || n === "node_modules") continue;
    statSync(p).isDirectory() ? walk(p, out) : /\.md$/.test(n) && out.push(p);
  }
  return out;
}

/** Split markdown into one doc per top-level bullet / heading section. */
export function splitDocs(file: string, text: string, source: string): MemoryDoc[] {
  const docs: MemoryDoc[] = [];
  let heading = path.basename(file, ".md"), buf: string[] = [];
  const flush = () => { const body = redact(buf.join("\n").trim()); if (body.length > 30) docs.push({ id: `${source}#${docs.length}`, title: heading.slice(0, 120), text: body.slice(0, 1500), source, kind: classify(body) }); buf = []; };
  for (const line of text.split("\n")) {
    if (/^#{1,3} /.test(line)) { flush(); heading = line.replace(/^#+\s*/, ""); continue; }
    if (/^- /.test(line) && buf.length) flush();
    buf.push(line);
  }
  flush();
  return docs;
}

export function buildIndex(): MemoryDoc[] {
  const docs: MemoryDoc[] = [];
  if (existsSync(MEMORY)) docs.push(...splitDocs(MEMORY, readFileSync(MEMORY, "utf8"), "MEMORY.md"));
  for (const f of walk(path.join(ROOT, "docs"))) docs.push(...splitDocs(f, readFileSync(f, "utf8"), path.relative(ROOT, f)));
  return docs;
}

const [cmd, ...args] = process.argv.slice(2);
if (cmd === "search") {
  const idx = JSON.parse(readFileSync(path.join(OUT, "index.json"), "utf8")) as MemoryDoc[];
  for (const h of searchMemory(args.join(" "), idx, 5)) console.log(`[${h.doc.kind}] ${h.doc.source} :: ${h.doc.title} (${h.score.toFixed(1)})\n  ${h.doc.text.slice(0, 240).replace(/\n/g, " ")}\n`);
} else if (cmd === "decision") {
  const [decision, why, area = "general"] = args;
  if (!decision || !why) throw new Error('usage: decision "what" "why" [area]');
  mkdirSync(path.join(ROOT, "docs/ops"), { recursive: true });
  const f = path.join(ROOT, "docs/ops/decisions.md");
  if (!existsSync(f)) writeFileSync(f, "# Decisions log\n\nAppend-only. Newest last. Written by `scripts/ops-build-knowledge.ts decision` and mirrored as AdsEvent `ops_decision`.\n\n");
  appendFileSync(f, decisionLine({ decision, why, area, by: "owner" }, new Date().toISOString().slice(0, 10)));
  console.log("appended to docs/ops/decisions.md");
} else {
  const docs = buildIndex();
  mkdirSync(OUT, { recursive: true });
  writeFileSync(path.join(OUT, "index.json"), JSON.stringify(docs, null, 1));
  const kinds = ["decision", "runbook", "account", "lesson", "note"];
  const md = [`# Knowledge index (generated ${new Date().toISOString().slice(0, 10)})`, "", `${docs.length} entries from MEMORY.md and docs/**. Regenerate: \`npx tsx scripts/ops-build-knowledge.ts\`. Search: \`npx tsx scripts/ops-build-knowledge.ts search "postal address"\`. Secrets are never indexed (paths only; token-like strings are redacted).`, "",
    ...kinds.flatMap((k) => { const d = docs.filter((x) => x.kind === k); return [`## ${k} (${d.length})`, "", ...d.slice(0, k === "note" ? 0 : 60).map((x) => `- **${x.title}** (${x.source}): ${x.text.replace(/\s+/g, " ").slice(0, 160)}`), ""]; })];
  writeFileSync(path.join(OUT, "README.md"), md.join("\n"));
  console.log(`wrote ${docs.length} entries`);
}
