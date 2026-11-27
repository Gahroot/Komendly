// Revenue experiments: deterministic assignment, idempotent exposure/conversion logging in AdsEvent (no schema), and
// conservative Bayesian evaluation for tiny samples. Pure TS (no Next/Prisma imports): safe for web, engine and kly.
// Events: exp_defined | exp_concluded | exp_exposure | exp_conversion. A variant is only ever "winner" at >=95% probability
// best AND >=minPerVariant exposures per variant AND a few real conversions. Anything less says "insufficient evidence".

export type ExperimentDef = {
  key: string;
  surface: string;
  hypothesis: string;
  /** Event name that counts as conversion. */
  metric: string;
  variants: { id: string; weight: number; payload?: Record<string, unknown> }[];
  minPerVariant: number;
  guardrail?: { metric: string; maxDropPct: number };
  startedAt?: string;
};

/** Code-level defaults (running unless concluded). Other workers append here; DB `exp_defined` rows override by key. */
export const EXPERIMENT_DEFAULTS: ExperimentDef[] = [];

export const EXP_EVENTS = { defined: "exp_defined", concluded: "exp_concluded", exposure: "exp_exposure", conversion: "exp_conversion" } as const;
const CACHE_TTL_MS = 60_000;
export const MIN_TOTAL_CONVERSIONS = 5;
export const WINNER_PROB = 0.95;

/** Minimal Prisma surface (web, engine and kly clients all satisfy it). */
export interface ExperimentDb {
  adsEvent: {
    create(a: { data: { name: string; workspaceId?: string | null; userId?: string | null; props: object } }): Promise<unknown>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findFirst(a: any): Promise<any>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findMany(a: any): Promise<any[]>;
  };
}

// ---------- assignment ----------
export function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b) >>> 0; h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35) >>> 0; h ^= h >>> 16;
  return h >>> 0;
}

let cache: { at: number; running: ExperimentDef[] } | null = null;
export function setRunningExperiments(running: ExperimentDef[] | null, now = Date.now()): void { cache = running ? { at: now, running } : null; }

function isRunning(d: ExperimentDef, now: number): boolean {
  if (d.variants.length < 2 || d.variants.some((v) => !(v.weight > 0))) return false;
  return !d.startedAt || new Date(d.startedAt).getTime() <= now;
}

/**
 * Deterministic variant for (key, subject). `defs` given = use exactly those. Otherwise the cached list loaded by
 * loadRunningExperiments (fresh for 60s) merged over EXPERIMENT_DEFAULTS. null = experiment unknown / not running.
 */
export function assignVariant(key: string, subjectId: string, defs?: ExperimentDef[]): { variantId: string; payload?: Record<string, unknown> } | null {
  const now = Date.now();
  const list = defs ?? (cache && now - cache.at < CACHE_TTL_MS ? cache.running : EXPERIMENT_DEFAULTS);
  const def = list.find((d) => d.key === key);
  if (!def || !subjectId || !isRunning(def, now)) return null;
  const total = def.variants.reduce((t, v) => t + v.weight, 0);
  let point = (hash32(`${key}:${subjectId}`) / 0x100000000) * total;
  for (const v of def.variants) {
    if (point < v.weight) return v.payload ? { variantId: v.id, payload: v.payload } : { variantId: v.id };
    point -= v.weight;
  }
  const last = def.variants[def.variants.length - 1]!;
  return { variantId: last.id, ...(last.payload ? { payload: last.payload } : {}) };
}

const asDef = (p: unknown): ExperimentDef | null => {
  const d = (p as { def?: unknown } | null)?.def as ExperimentDef | undefined;
  return d && typeof d.key === "string" && Array.isArray(d.variants) ? d : null;
};

/** Running experiments = defaults + exp_defined rows (latest per key wins) minus exp_concluded keys. Cached 60s. */
export async function loadRunningExperiments(db: ExperimentDb, now = Date.now()): Promise<ExperimentDef[]> {
  if (cache && now - cache.at < CACHE_TTL_MS) return cache.running;
  const [defined, concluded] = await Promise.all([
    db.adsEvent.findMany({ where: { name: EXP_EVENTS.defined }, orderBy: { createdAt: "asc" }, select: { props: true } }),
    db.adsEvent.findMany({ where: { name: EXP_EVENTS.concluded }, select: { props: true } }),
  ]);
  const byKey = new Map<string, ExperimentDef>(EXPERIMENT_DEFAULTS.map((d) => [d.key, d]));
  for (const e of defined) { const d = asDef(e.props); if (d) byKey.set(d.key, d); }
  const done = new Set(concluded.map((e) => (e.props as { key?: string } | null)?.key).filter((k): k is string => !!k));
  const running = [...byKey.values()].filter((d) => !done.has(d.key));
  cache = { at: now, running };
  return running;
}

// ---------- logging ----------
const keyAndSubject = (key: string, subjectId: string) => [{ props: { path: ["key"], equals: key } }, { props: { path: ["subject"], equals: subjectId } }];

async function findFor(db: ExperimentDb, name: string, key: string, subjectId: string) {
  return db.adsEvent.findFirst({ where: { name, AND: keyAndSubject(key, subjectId) }, orderBy: { createdAt: "asc" }, select: { id: true, props: true } });
}

/** Idempotent per (key, subject): the first exposure wins. Returns true when a new row was written. */
export async function recordExposure(db: ExperimentDb, key: string, variantId: string, subjectId: string, props: Record<string, unknown> = {}): Promise<boolean> {
  if (await findFor(db, EXP_EVENTS.exposure, key, subjectId)) return false;
  await db.adsEvent.create({ data: { name: EXP_EVENTS.exposure, props: { ...props, key, variant: variantId, subject: subjectId } } });
  return true;
}

/** Idempotent per (key, subject); the subject must have been exposed (variant looked up from the exposure). */
export async function recordConversion(db: ExperimentDb, key: string, subjectId: string, props: Record<string, unknown> = {}): Promise<boolean> {
  const exposure = await findFor(db, EXP_EVENTS.exposure, key, subjectId);
  const variant = (exposure?.props as { variant?: string } | undefined)?.variant;
  if (!variant) return false;
  if (await findFor(db, EXP_EVENTS.conversion, key, subjectId)) return false;
  await db.adsEvent.create({ data: { name: EXP_EVENTS.conversion, props: { ...props, key, variant, subject: subjectId } } });
  return true;
}

export function validateDef(def: ExperimentDef): string[] {
  const errs: string[] = [];
  if (!/^[a-z0-9][a-z0-9_.-]{1,63}$/.test(def.key)) errs.push("key must be lowercase a-z0-9_.- (2-64 chars)");
  if (!def.hypothesis.trim() || !def.metric.trim() || !def.surface.trim()) errs.push("surface, hypothesis and metric are required");
  if (def.variants.length < 2) errs.push("need at least 2 variants");
  if (new Set(def.variants.map((v) => v.id)).size !== def.variants.length) errs.push("variant ids must be unique");
  if (def.variants.some((v) => !(v.weight > 0))) errs.push("variant weights must be > 0");
  if (!(def.minPerVariant >= 1)) errs.push("minPerVariant must be >= 1");
  return errs;
}

export async function defineExperiment(db: ExperimentDb, def: ExperimentDef): Promise<ExperimentDef> {
  const errs = validateDef(def);
  if (errs.length) throw new Error(`invalid experiment: ${errs.join("; ")}`);
  const full = { ...def, startedAt: def.startedAt ?? new Date().toISOString() };
  await db.adsEvent.create({ data: { name: EXP_EVENTS.defined, props: { def: full } } });
  cache = null;
  return full;
}

export async function concludeExperiment(db: ExperimentDb, key: string, winnerId: string | null, evidence: string | Record<string, unknown>): Promise<void> {
  await db.adsEvent.create({ data: { name: EXP_EVENTS.concluded, props: { key, winner: winnerId, evidence } } });
  cache = null;
}

// ---------- evaluation ----------
export type VariantCounts = { variantId: string; exposures: number; conversions: number };
export type Verdict = "insufficient" | "winner" | "loser" | "inconclusive";
export type Evaluation = { verdict: Verdict; winnerId: string | null; probBest: Record<string, number>; lift: number | null; notes: string[] };

function rng(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function normal(r: () => number) { return Math.sqrt(-2 * Math.log(r() || 1e-12)) * Math.cos(2 * Math.PI * r()); }
function gamma(shape: number, r: () => number): number {
  if (shape < 1) return gamma(shape + 1, r) * Math.pow(r() || 1e-12, 1 / shape);
  const d = shape - 1 / 3, c = 1 / Math.sqrt(9 * d);
  for (;;) {
    const x = normal(r), v = Math.pow(1 + c * x, 3);
    if (v <= 0) continue;
    const u = r() || 1e-12;
    if (Math.log(u) < 0.5 * x * x + d - d * v + d * Math.log(v)) return d * v;
  }
}
const beta = (a: number, b: number, r: () => number) => { const x = gamma(a, r), y = gamma(b, r); return x / (x + y); };

/** Beta-binomial (uniform prior) probability each variant has the highest true rate. Seeded, so repeatable. */
export function probBest(counts: readonly VariantCounts[], draws = 20000): Record<string, number> {
  const r = rng(12345);
  const wins = new Map(counts.map((c) => [c.variantId, 0]));
  for (let i = 0; i < draws; i++) {
    let best = "", bestV = -1;
    for (const c of counts) { const v = beta(1 + c.conversions, 1 + Math.max(0, c.exposures - c.conversions), r); if (v > bestV) { bestV = v; best = c.variantId; } }
    wins.set(best, (wins.get(best) ?? 0) + 1);
  }
  return Object.fromEntries([...wins].map(([k, n]) => [k, Math.round((n / draws) * 1000) / 1000]));
}

/**
 * Conservative verdict. insufficient: any variant under minPerVariant exposures, or < MIN_TOTAL_CONVERSIONS conversions.
 * winner: best variant >= 95% probability best. loser: a non-control variant <= 5% (control = first variant or opts.controlId)
 * while nobody else qualifies as winner. Otherwise inconclusive. lift = best vs control relative rate (null when control is 0).
 */
export function evaluateExperiment(counts: readonly VariantCounts[], opts: { minPerVariant?: number; controlId?: string } = {}): Evaluation {
  const min = opts.minPerVariant ?? 100;
  const notes: string[] = [];
  if (counts.length < 2) return { verdict: "insufficient", winnerId: null, probBest: {}, lift: null, notes: ["insufficient evidence: need at least 2 variants"] };
  const pb = probBest(counts);
  const control = (counts.find((c) => c.variantId === opts.controlId) ?? counts[0])!;
  const rate = (c: VariantCounts) => (c.exposures ? c.conversions / c.exposures : 0);
  const top = counts.reduce((a, b) => ((pb[b.variantId] ?? 0) > (pb[a.variantId] ?? 0) ? b : a), counts[0]!);
  const lift = rate(control) > 0 ? Math.round(((rate(top) - rate(control)) / rate(control)) * 1000) / 1000 : null;
  const total = counts.reduce((t, c) => t + c.conversions, 0);
  const short = counts.filter((c) => c.exposures < min);
  if (short.length) notes.push(`insufficient evidence: ${short.map((c) => `${c.variantId} has ${c.exposures}/${min} exposures`).join(", ")}`);
  if (total < MIN_TOTAL_CONVERSIONS) notes.push(`insufficient evidence: only ${total} conversion${total === 1 ? "" : "s"} in total (need ${MIN_TOTAL_CONVERSIONS}+)`);
  if (notes.length) return { verdict: "insufficient", winnerId: null, probBest: pb, lift, notes };
  if ((pb[top.variantId] ?? 0) >= WINNER_PROB) {
    notes.push(`${top.variantId} is best with ${((pb[top.variantId] ?? 0) * 100).toFixed(1)}% probability; still a small-sample estimate, confirm before relying on the size of the lift`);
    return { verdict: "winner", winnerId: top.variantId, probBest: pb, lift, notes };
  }
  const losing = counts.filter((c) => c.variantId !== control.variantId && (pb[c.variantId] ?? 1) <= 1 - WINNER_PROB);
  if (losing.length && (pb[control.variantId] ?? 0) >= 0.5) {
    notes.push(`${losing.map((c) => c.variantId).join(", ")} very likely worse than control (<=5% probability best)`);
    return { verdict: "loser", winnerId: null, probBest: pb, lift, notes };
  }
  notes.push("no variant reaches 95% probability best: keep running or stop for no difference");
  return { verdict: "inconclusive", winnerId: null, probBest: pb, lift, notes };
}

export type ExperimentResults = { key: string; def: ExperimentDef | null; concluded: { winner: string | null; evidence: unknown } | null; counts: VariantCounts[]; evaluation: Evaluation };

/** Counts unique exposed / converted subjects per variant for one experiment and evaluates them. */
export async function loadExperimentResults(db: ExperimentDb, key: string): Promise<ExperimentResults> {
  const [exposures, conversions, defined, concluded] = await Promise.all([
    db.adsEvent.findMany({ where: { name: EXP_EVENTS.exposure, props: { path: ["key"], equals: key } }, select: { props: true } }),
    db.adsEvent.findMany({ where: { name: EXP_EVENTS.conversion, props: { path: ["key"], equals: key } }, select: { props: true } }),
    db.adsEvent.findMany({ where: { name: EXP_EVENTS.defined }, orderBy: { createdAt: "asc" }, select: { props: true } }),
    db.adsEvent.findFirst({ where: { name: EXP_EVENTS.concluded, props: { path: ["key"], equals: key } }, orderBy: { createdAt: "desc" }, select: { props: true } }),
  ]);
  let def: ExperimentDef | null = EXPERIMENT_DEFAULTS.find((d) => d.key === key) ?? null;
  for (const e of defined) { const d = asDef(e.props); if (d?.key === key) def = d; }
  const sub = (p: unknown) => p as { variant?: string; subject?: string };
  const exp = new Map<string, Set<string>>(), conv = new Map<string, Set<string>>();
  const add = (m: Map<string, Set<string>>, v: string, s: string) => (m.get(v) ?? m.set(v, new Set()).get(v)!).add(s);
  for (const e of exposures) { const p = sub(e.props); if (p.variant && p.subject) add(exp, p.variant, p.subject); }
  for (const e of conversions) { const p = sub(e.props); if (p.variant && p.subject && exp.get(p.variant)?.has(p.subject)) add(conv, p.variant, p.subject); }
  const ids = [...new Set([...(def?.variants.map((v) => v.id) ?? []), ...exp.keys()])];
  const counts = ids.map((id) => ({ variantId: id, exposures: exp.get(id)?.size ?? 0, conversions: conv.get(id)?.size ?? 0 }));
  const c = concluded?.props as { winner?: string | null; evidence?: unknown } | undefined;
  return { key, def, concluded: c ? { winner: c.winner ?? null, evidence: c.evidence } : null, counts, evaluation: evaluateExperiment(counts, { minPerVariant: def?.minPerVariant, controlId: def?.variants[0]?.id }) };
}
