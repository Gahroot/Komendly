// Collective intelligence: one searchable knowledge base over findings from every subsystem (AdsEvent-backed).
// Other agents (copy generators, strategists) import `getRelevantKnowledge(db, topic)`. Self-contained on purpose
// (kly and engine images copy this one file). Never throws: a failing read returns [].
export type KnowledgeLevel = "measured" | "inferred" | "assumed";
export interface KnowledgeItem { source: string; claim: string; level: KnowledgeLevel; date: string; sampleSize: number; topic: string; contested?: boolean }

/** AdsEvent names that carry findings, with the props keys each uses. */
export const KNOWLEDGE_EVENTS = ["optimizer_learning", "customer_success_finding", "offer_proposal", "reel_learning", "growth_learning", "ops_decision"] as const;

const RANK: Record<KnowledgeLevel, number> = { measured: 3, inferred: 2, assumed: 1 };
const words = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w.length > 2));

export function levelFrom(v: unknown): KnowledgeLevel {
  const s = String(v ?? "").toLowerCase();
  return s === "measured" || s === "evidence" ? "measured" : s === "inferred" ? "inferred" : "assumed";
}

export function normaliseEvent(e: { name: string; props: unknown; createdAt: Date }): KnowledgeItem | null {
  const p = (e.props && typeof e.props === "object" ? e.props : {}) as Record<string, unknown>;
  const claim = String(p.claim ?? p.finding ?? p.summary ?? p.title ?? p.hypothesis ?? p.decision ?? "").trim();
  if (!claim) return null;
  const note = String(p.note ?? p.detail ?? p.why ?? "").trim();
  const n = Number(p.sampleSize ?? p.sample_size ?? p.n ?? 0);
  return { source: String(p.source ?? e.name), claim: (note && !claim.includes(note) ? `${claim}: ${note}` : claim).slice(0, 400), level: levelFrom(p.level ?? p.evidence_level ?? p.kind), date: e.createdAt.toISOString().slice(0, 10), sampleSize: Number.isFinite(n) && n > 0 ? Math.floor(n) : 0, topic: String(p.topic ?? p.surface ?? "").toLowerCase() };
}

const negated = (s: string) => /\b(no|not|never|worse|lower|fails?|failed|does ?n.t|didn.t|without)\b/i.test(s);

/**
 * De-duplicate: near-identical claims keep the best (level, sample, newest). Same-topic claims that disagree
 * (one negated, one not, high word overlap) keep the stronger one and mark it `contested`.
 */
export function dedupeKnowledge(items: readonly KnowledgeItem[]): KnowledgeItem[] {
  const better = (a: KnowledgeItem, b: KnowledgeItem) => RANK[a.level] - RANK[b.level] || a.sampleSize - b.sampleSize || a.date.localeCompare(b.date);
  const out: KnowledgeItem[] = [];
  for (const it of [...items].sort((a, b) => better(b, a))) {
    const wi = words(it.claim);
    const twin = out.find((o) => { const wo = words(o.claim); const inter = [...wi].filter((w) => wo.has(w)).length; return inter / Math.max(1, Math.min(wi.size, wo.size)) >= 0.7; });
    if (!twin) { out.push({ ...it }); continue; }
    if (negated(it.claim) !== negated(twin.claim)) twin.contested = true;
  }
  return out;
}

export function rankForTopic(items: readonly KnowledgeItem[], topic: string, limit = 8): KnowledgeItem[] {
  const tw = words(topic);
  return items
    .map((i) => ({ i, s: [...words(`${i.claim} ${i.topic} ${i.source}`)].filter((w) => tw.has(w)).length }))
    .filter((x) => x.s > 0 || !tw.size)
    .sort((a, b) => b.s - a.s || RANK[b.i.level] - RANK[a.i.level] || b.i.date.localeCompare(a.i.date))
    .slice(0, limit)
    .map((x) => x.i);
}

interface KnowledgeDb { adsEvent: { findMany(a: { where: { name: { in: string[] } }; orderBy: { createdAt: "desc" }; take: number; select: { name: true; props: true; createdAt: true } }): Promise<Array<{ name: string; props: unknown; createdAt: Date }>> } }

export async function getRelevantKnowledge(db: KnowledgeDb, topic: string, opts: { limit?: number; scan?: number } = {}): Promise<KnowledgeItem[]> {
  try {
    const rows = await db.adsEvent.findMany({ where: { name: { in: [...KNOWLEDGE_EVENTS] } }, orderBy: { createdAt: "desc" }, take: opts.scan ?? 300, select: { name: true, props: true, createdAt: true } });
    const items = rows.flatMap((r) => { const k = normaliseEvent(r); return k ? [k] : []; });
    return rankForTopic(dedupeKnowledge(items), topic, opts.limit ?? 8);
  } catch {
    return [];
  }
}

/** Prompt-ready lines for another agent. Empty string when nothing relevant. */
export function knowledgeForPrompt(items: readonly KnowledgeItem[]): string {
  if (!items.length) return "";
  return ["Known findings (from Komendly's own data; weigh by evidence level, never present assumptions as fact):", ...items.map((i) => `- [${i.level}${i.sampleSize ? `, n=${i.sampleSize}` : ""}, ${i.date}${i.contested ? ", contested" : ""}] ${i.claim}`)].join("\n");
}
