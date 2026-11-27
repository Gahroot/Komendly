// Organizational memory: BM25 keyword search over knowledge docs + decision log. Pure (no fs); the script and the
// web helper feed docs in. recordDecision writes AdsEvent `ops_decision` (and optionally appends to docs/ops/decisions.md via a callback).
export interface MemoryDoc { id: string; title: string; text: string; source: string; date?: string; kind?: string }
export interface MemoryHit { doc: MemoryDoc; score: number }

const STOP = new Set(["the", "and", "for", "are", "with", "that", "this", "was", "not", "but", "from", "have", "has", "our", "you", "its", "all", "any", "can"]);
export const tokenize = (s: string): string[] => s.toLowerCase().replace(/[^a-z0-9$%]+/g, " ").split(/\s+/).filter((w) => w.length > 1 && !STOP.has(w));

export function searchMemory(query: string, docs: readonly MemoryDoc[], limit = 5): MemoryHit[] {
  const q = [...new Set(tokenize(query))];
  if (!q.length || !docs.length) return [];
  const toks = docs.map((d) => tokenize(`${d.title} ${d.title} ${d.text}`));
  const avg = toks.reduce((a, t) => a + t.length, 0) / docs.length || 1;
  const df = new Map<string, number>();
  for (const t of toks) for (const w of new Set(t)) df.set(w, (df.get(w) ?? 0) + 1);
  const k1 = 1.5, b = 0.75;
  const hits: MemoryHit[] = [];
  docs.forEach((doc, i) => {
    const t = toks[i], tf = new Map<string, number>();
    for (const w of t) tf.set(w, (tf.get(w) ?? 0) + 1);
    let score = 0;
    for (const w of q) {
      const f = tf.get(w) ?? 0;
      if (!f) continue;
      const n = df.get(w) ?? 0;
      score += Math.log(1 + (docs.length - n + 0.5) / (n + 0.5)) * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * t.length) / avg)));
    }
    if (score > 0) hits.push({ doc, score });
  });
  return hits.sort((a, c) => c.score - a.score || (c.doc.date ?? "").localeCompare(a.doc.date ?? "")).slice(0, limit);
}

export const DECISION_EVENT = "ops_decision";
export interface Decision { decision: string; why: string; area: string; by: "owner" | "agent" | "system"; date?: string }

export const decisionLine = (d: Decision, date: string) => `- ${date} [${d.area}] (${d.by}) ${d.decision.replace(/\n/g, " ")}: ${d.why.replace(/\n/g, " ")}\n`;

export async function recordDecision(
  db: { adsEvent: { create(a: { data: { name: string; props: object } }): Promise<unknown> } },
  d: Decision,
  appendFile?: (line: string) => Promise<void>,
  now = new Date(),
): Promise<void> {
  const date = d.date ?? now.toISOString().slice(0, 10);
  await db.adsEvent.create({ data: { name: DECISION_EVENT, props: { ...d, date } } });
  try { await appendFile?.(decisionLine(d, date)); } catch { /* the file is a mirror; the event is the record */ }
}

/** Decision events -> memory docs (so searchMemory finds decisions made in-app). */
export function decisionsToDocs(events: ReadonlyArray<{ id: string; props: unknown; createdAt: Date }>): MemoryDoc[] {
  return events.map((e) => {
    const p = (e.props ?? {}) as Partial<Decision>;
    return { id: `decision:${e.id}`, title: String(p.decision ?? "decision").slice(0, 120), text: `${p.decision ?? ""}. Why: ${p.why ?? ""}`, source: "ops_decision", date: e.createdAt.toISOString().slice(0, 10), kind: "decision" };
  });
}
