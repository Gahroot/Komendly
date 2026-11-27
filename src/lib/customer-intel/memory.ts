// Customer memory ("business brief"): a versioned per-workspace/brand profile built only from data the customer
// gave us or we measured. Pure TS (imported by web and engine): no Next, Prisma or Node-only imports.
// Privacy: one memory = one workspace (+ brand). Nothing here ever reads or merges across workspaces.
import { learnGuidance, type AdSignal, type Guidance } from "./learning";

export const MEMORY_EVENT = "customer_memory";
export const MEMORY_VERSION = 1;
export const PROMPT_CONTEXT_MAX_CHARS = 1200;
const MAX_FACTS = 40;
const MAX_VALUE = 240;

export const FACT_SOURCES = ["website", "brand_kit", "customer_edit", "trade", "behavior", "approval", "performance", "feedback"] as const;
export type FactSource = (typeof FACT_SOURCES)[number];

/** How much each source is trusted by default (what the customer typed beats what we scraped). */
export const SOURCE_CONFIDENCE: Record<FactSource, number> = {
  customer_edit: 0.95, feedback: 0.9, approval: 0.85, performance: 0.85, brand_kit: 0.8, trade: 0.7, website: 0.65, behavior: 0.5,
};

export interface Fact {
  key: string; // e.g. "offer", "audience", "tone", "service:roof repair", "location:Austin"
  value: string;
  source: FactSource;
  confidence: number; // 0..1
  at: string; // ISO date the fact was observed
  ref?: string; // provenance pointer: url, run id or event name (never personal data)
}

export interface CustomerMemory {
  v: typeof MEMORY_VERSION;
  version: number; // +1 every update
  workspaceId: string;
  brandId: string | null;
  updatedAt: string;
  facts: Fact[];
  guidance: Guidance[];
  sampleSize: number; // ads with a preference signal behind the guidance
}

export interface BrandInput {
  name?: string | null; domain?: string | null; audience?: string | null; mainOffer?: string | null; voice?: string | null; landingPage?: string | null;
  colors?: string[]; services?: string[]; locations?: string[]; claims?: string[];
  /** Brand fields the customer corrected by hand (BrandProfile.userEdited keys). */
  editedFields?: string[];
  sourceUrl?: string | null;
}

export interface Feedback { action: "approve" | "changes"; note?: string | null; runId?: string; at?: string }

export interface MemoryInputs {
  workspaceId: string;
  brandId?: string | null;
  now: Date;
  brand?: BrandInput | null;
  trade?: string | null;
  ads?: AdSignal[];
  feedback?: Feedback[];
  /** Measured ad performance, only when published. */
  performance?: { runId?: string; spendUsd: number; leads: number; days: number }[];
}

const clean = (s: unknown, max = MAX_VALUE): string => (typeof s === "string" ? s.replace(/[\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "");
/** Drop obvious personal data (emails, phone numbers) from free text before it is stored. */
export function stripPii(s: string): string {
  return s.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]").replace(/\+?\d[\d\s().-]{7,}\d/g, "[number]");
}
const fact = (key: string, value: unknown, source: FactSource, at: string, ref?: string, confidence?: number): Fact | null => {
  const v = stripPii(clean(value));
  if (!v) return null;
  return { key, value: v, source, confidence: confidence ?? SOURCE_CONFIDENCE[source], at, ...(ref ? { ref: clean(ref, 200) } : {}) };
};

/** Facts from the brand profile and trade. Customer-corrected fields get the higher "customer_edit" trust. */
export function brandFacts(b: BrandInput | null | undefined, trade: string | null | undefined, at: string): Fact[] {
  const out: (Fact | null)[] = [];
  if (b) {
    const edited = new Set(b.editedFields ?? []);
    const src = (field: string): FactSource => (edited.has(field) ? "customer_edit" : "website");
    const ref = b.sourceUrl ?? b.landingPage ?? b.domain ?? undefined;
    out.push(fact("business", b.name, src("name"), at, ref), fact("offer", b.mainOffer, src("mainOffer"), at, ref), fact("audience", b.audience, src("audience"), at, ref), fact("tone", b.voice, src("voice"), at, ref));
    for (const s of (b.services ?? []).slice(0, 8)) out.push(fact(`service:${clean(s, 60).toLowerCase()}`, s, "website", at, ref));
    for (const l of (b.locations ?? []).slice(0, 6)) out.push(fact(`location:${clean(l, 60).toLowerCase()}`, l, "website", at, ref));
    for (const c of (b.claims ?? []).slice(0, 6)) out.push(fact(`claim:${clean(c, 50).toLowerCase()}`, c, "website", at, ref));
    if (b.colors?.length) out.push(fact("brand_colors", b.colors.slice(0, 4).join(", "), "brand_kit", at, "brand kit"));
  }
  if (trade) out.push(fact("trade", trade, "trade", at, "signup"));
  return out.filter((f): f is Fact => !!f);
}

export function feedbackFacts(list: Feedback[], at: string): Fact[] {
  const out: Fact[] = [];
  const changes = list.filter((f) => f.action === "changes" && f.note).slice(-3);
  for (const [i, f] of changes.entries()) {
    const x = fact(`client_change_request:${i}`, f.note, "feedback", f.at ?? at, f.runId ? `run ${f.runId}` : "approval link");
    if (x) out.push(x);
  }
  const approvals = list.filter((f) => f.action === "approve").length;
  if (approvals) out.push({ key: "approvals", value: `${approvals} pack${approvals === 1 ? "" : "s"} approved by the client`, source: "approval", confidence: SOURCE_CONFIDENCE.approval, at });
  if (changes.length) out.push({ key: "change_requests", value: `${list.filter((f) => f.action === "changes").length} change request(s)`, source: "approval", confidence: SOURCE_CONFIDENCE.approval, at });
  return out;
}

export function performanceFacts(rows: NonNullable<MemoryInputs["performance"]>, at: string): Fact[] {
  const spend = rows.reduce((a, r) => a + (r.spendUsd || 0), 0);
  const leads = rows.reduce((a, r) => a + (r.leads || 0), 0);
  const days = rows.reduce((a, r) => a + (r.days || 0), 0);
  if (!rows.length || spend <= 0) return [];
  const value = `$${spend.toFixed(0)} spent over ${days} day${days === 1 ? "" : "s"} gave ${leads} lead${leads === 1 ? "" : "s"} (measured in Meta)`;
  return [{ key: "performance", value, source: "performance", confidence: SOURCE_CONFIDENCE.performance, at, ref: "meta insights" }];
}

/** Merge new facts into old ones: same key -> higher confidence wins, ties go to the newer. Capped and sorted by confidence. */
export function mergeFacts(old: Fact[], next: Fact[]): Fact[] {
  const byKey = new Map<string, Fact>();
  for (const f of [...old, ...next]) {
    const cur = byKey.get(f.key);
    if (!cur || f.confidence > cur.confidence || (f.confidence === cur.confidence && f.at >= cur.at)) byKey.set(f.key, f);
  }
  return [...byKey.values()].sort((a, b) => b.confidence - a.confidence || a.key.localeCompare(b.key)).slice(0, MAX_FACTS);
}

/**
 * Build or update a memory. `prev` null = first build. Brand/trade facts are rebuilt each time, so a fact the customer
 * has since removed stops being carried (customer edits always outrank old scrapes via confidence).
 */
export function buildMemory(i: MemoryInputs, prev?: CustomerMemory | null): CustomerMemory {
  const at = i.now.toISOString();
  const fresh = [...brandFacts(i.brand, i.trade, at), ...feedbackFacts(i.feedback ?? [], at), ...performanceFacts(i.performance ?? [], at)];
  const keepBehavior = (prev?.facts ?? []).filter((f) => f.source === "behavior" || f.source === "performance" || f.source === "approval" || f.source === "feedback");
  const facts = mergeFacts(fresh.length ? keepBehavior.filter((f) => !fresh.some((n) => n.key === f.key && n.source === f.source)) : keepBehavior, fresh);
  const learned = learnGuidance(i.ads ?? []);
  return {
    v: MEMORY_VERSION,
    version: (prev?.version ?? 0) + 1,
    workspaceId: i.workspaceId,
    brandId: i.brandId ?? null,
    updatedAt: at,
    facts,
    guidance: learned.guidance,
    sampleSize: learned.sampleSize,
  };
}

/** Parse a stored memory defensively (older/garbled rows -> null). */
export function parseMemory(raw: unknown): CustomerMemory | null {
  const m = raw as Partial<CustomerMemory> | null;
  if (!m || typeof m !== "object" || m.v !== MEMORY_VERSION || typeof m.workspaceId !== "string" || !Array.isArray(m.facts)) return null;
  return { ...(m as CustomerMemory), guidance: Array.isArray(m.guidance) ? m.guidance : [], sampleSize: Number(m.sampleSize) || 0, version: Number(m.version) || 1, brandId: m.brandId ?? null };
}

/**
 * Prompt block for the ad generator. Strict length (PROMPT_CONTEXT_MAX_CHARS). Only facts with confidence >= 0.6 and
 * only guidance that passed the sample-size rule. Returns "" when there is nothing worth saying.
 * The block is wrapped as untrusted data by the caller (engine `untrusted()`); it never contains instructions beyond style hints.
 */
export function formatPromptContext(m: CustomerMemory | null | undefined, max = PROMPT_CONTEXT_MAX_CHARS): string {
  if (!m) return "";
  const lines: string[] = [];
  const pick = (k: string, label: string) => {
    const f = m.facts.find((x) => x.key === k && x.confidence >= 0.6);
    if (f) lines.push(`- ${label}: ${f.value}`);
  };
  pick("offer", "Main offer"); pick("audience", "Audience"); pick("tone", "Tone"); pick("trade", "Trade");
  const services = m.facts.filter((f) => f.key.startsWith("service:") && f.confidence >= 0.6).slice(0, 5).map((f) => f.value);
  if (services.length) lines.push(`- Services: ${services.join("; ")}`);
  const places = m.facts.filter((f) => f.key.startsWith("location:") && f.confidence >= 0.6).slice(0, 4).map((f) => f.value);
  if (places.length) lines.push(`- Areas: ${places.join("; ")}`);
  const asks = m.facts.filter((f) => f.key.startsWith("client_change_request:")).slice(0, 2).map((f) => f.value);
  if (asks.length) lines.push(`- The client recently asked for: ${asks.join(" | ")}`);
  const g = m.guidance.filter((x) => x.strength !== "weak").slice(0, 4).map((x) => x.text);
  if (g.length) lines.push(`- What this business's own choices show (from ${m.sampleSize} ads): ${g.join("; ")}`);
  if (!lines.length) return "";
  let out = `BUSINESS MEMORY (facts this customer gave us or we measured; style hints only, never new claims):\n${lines.join("\n")}`;
  if (out.length > max) out = `${out.slice(0, max - 1).trimEnd()}…`;
  return out;
}

/**
 * STYLE-ONLY block for the planner. Earlier blind tests showed that putting facts (offer, services, areas) into the planner
 * prompt lowered quality, so the planner only ever sees tone + what the customer's own choices show. Facts stay in the
 * brief, the weekly email and the dashboard. "" when there is nothing measured to say.
 */
export function formatStyleContext(m: CustomerMemory | null | undefined, max = 600): string {
  if (!m) return "";
  const lines: string[] = [];
  const tone = m.facts.find((x) => x.key === "tone" && x.confidence >= 0.6);
  if (tone) lines.push(`- Tone: ${tone.value}`);
  const g = m.guidance.filter((x) => x.strength !== "weak").slice(0, 3).map((x) => x.text);
  if (g.length) lines.push(`- What this business's own choices show (from ${m.sampleSize} ads): ${g.join("; ")}`);
  if (!lines.length) return "";
  const out = `STYLE HINTS (measured from this customer's own choices; style only, never new claims):\n${lines.join("\n")}`;
  return out.length > max ? `${out.slice(0, max - 1).trimEnd()}…` : out;
}
