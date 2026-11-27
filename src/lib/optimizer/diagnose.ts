// Optimiser step (b): DIAGNOSE with pure code, before any AI. Business stage, the one constraint (dominant funnel drop vs
// benchmark), evidence-vs-assumption tagging and sample-size sanity. No I/O; no Next/Prisma imports (engine imports this).

export type EvidenceLevel = "measured" | "inferred" | "assumed";
export interface FunnelStep { step: string; count: number }
export interface Confident { value: number | null; confidence?: string | null }

/** Tolerant view of AdsEvent `revenue_snapshot` props (rev-core owns the real shape; unknown fields are ignored). */
export interface SnapshotView {
  stage?: string | null;
  payingCustomers?: number | null;
  funnel?: FunnelStep[];
  constraints?: Array<{ name: string; score?: number | null }>;
  economics?: { paybackDays?: Confident; ltgpCac?: Confident; cacCents?: Confident; ltgpCents?: Confident };
}

export function parseSnapshot(props: unknown): SnapshotView {
  const p = (props && typeof props === "object" ? props : {}) as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const conf = (v: unknown): Confident | undefined => {
    if (typeof v === "number") return { value: v, confidence: null };
    if (v && typeof v === "object") { const o = v as Record<string, unknown>; return { value: num(o.value), confidence: typeof o.confidence === "string" ? o.confidence : null }; }
    return undefined;
  };
  const funnelRaw = Array.isArray(p.funnel) ? p.funnel : [];
  const funnel = funnelRaw.flatMap((f) => { const o = f as Record<string, unknown>; const step = String(o?.step ?? o?.name ?? ""); const count = num(o?.count ?? o?.n); return step && count !== null ? [{ step, count }] : []; });
  const consRaw = Array.isArray(p.constraints) ? p.constraints : Array.isArray(p.constraint_ranking) ? p.constraint_ranking : [];
  const constraints = consRaw.flatMap((c) => { const o = (typeof c === "string" ? { name: c } : c) as Record<string, unknown>; return o?.name ? [{ name: String(o.name), score: num(o.score) }] : []; });
  const e = (p.economics && typeof p.economics === "object" ? p.economics : {}) as Record<string, unknown>;
  return { stage: typeof p.stage === "string" ? p.stage : null, payingCustomers: num(p.payingCustomers ?? p.paying_customers), funnel, constraints, economics: { paybackDays: conf(e.paybackDays ?? e.payback_days), ltgpCac: conf(e.ltgpCac ?? e.ltgp_cac), cacCents: conf(e.cacCents), ltgpCents: conf(e.ltgpCents) } };
}

/** Rough step-to-step conversion benchmarks for a small SaaS with a self-serve trial. Used only to rank gaps, never as a promise. */
export const BENCHMARKS: Record<string, number> = { signup: 0.03, activated: 0.4, free_ad: 0.4, checkout: 0.1, paid: 0.3 };
export const MIN_STEP_SAMPLE = 30;

export type Stage = "pre_revenue" | "first_customers" | "early_traction" | "scaling";
export function businessStage(paying: number | null | undefined): Stage {
  const n = paying ?? 0;
  return n <= 0 ? "pre_revenue" : n < 10 ? "first_customers" : n < 50 ? "early_traction" : "scaling";
}

export interface StepGap { from: string; to: string; fromCount: number; toCount: number; rate: number; benchmark: number; shortfall: number; enoughData: boolean }
export interface Constraint { name: string; kind: "conversion" | "volume"; detail: string; level: EvidenceLevel; n: number; gap?: StepGap }

/** Dominant funnel drop: largest relative shortfall vs benchmark among steps with enough upstream volume. */
export function funnelGaps(funnel: readonly FunnelStep[]): StepGap[] {
  const out: StepGap[] = [];
  for (let i = 1; i < funnel.length; i++) {
    const a = funnel[i - 1]!, b = funnel[i]!;
    const bm = BENCHMARKS[b.step.toLowerCase()];
    if (bm === undefined || a.count <= 0) continue;
    const rate = b.count / a.count;
    out.push({ from: a.step, to: b.step, fromCount: a.count, toCount: b.count, rate, benchmark: bm, shortfall: Math.max(0, (bm - rate) / bm), enoughData: a.count >= MIN_STEP_SAMPLE });
  }
  return out;
}

export interface SpendGate { allowPaidScale: boolean; reasons: string[] }
/** Hormozi gate: do not scale paid before payback < 30 days and LTGP:CAC >= 3, and only on measured numbers. */
export function spendGate(e: SnapshotView["economics"] | undefined): SpendGate {
  const reasons: string[] = [];
  const pb = e?.paybackDays, lc = e?.ltgpCac;
  const measured = (c?: Confident) => c?.value != null && /measured|high/i.test(c.confidence ?? "");
  if (pb?.value == null || !(pb.value < 30)) reasons.push(`payback ${pb?.value == null ? "unknown" : `${pb.value}d`} (needs < 30d)`);
  if (lc?.value == null || !(lc.value >= 3)) reasons.push(`LTGP:CAC ${lc?.value == null ? "unknown" : lc.value.toFixed(1)} (needs >= 3)`);
  if (!measured(pb) || !measured(lc)) reasons.push("economics not measured yet (small sample)");
  return { allowPaidScale: reasons.length === 0, reasons };
}

export interface Diagnosis { stage: Stage; constraint: Constraint; gaps: StepGap[]; spend: SpendGate; cautions: string[]; snapshotConstraint: string | null; agreesWithSnapshot: boolean | null }

export function diagnose(snap: SnapshotView | null, extra: { payingCustomers?: number | null; signups7d?: number | null } = {}): Diagnosis {
  const s = snap ?? {};
  const stage = businessStage(s.payingCustomers ?? extra.payingCustomers);
  const funnel = s.funnel ?? [];
  const gaps = funnelGaps(funnel);
  const cautions: string[] = [];
  if (!snap) cautions.push("No revenue snapshot yet: everything below is assumption until the first snapshot lands.");
  const top = funnel[0]?.count ?? 0;
  const usable = gaps.filter((g) => g.enoughData).sort((a, b) => b.shortfall - a.shortfall);
  let constraint: Constraint;
  if (!funnel.length || top < MIN_STEP_SAMPLE) {
    constraint = { name: "volume", kind: "volume", detail: `Only ${top} people at the top of the funnel: too few to judge any conversion step. The constraint is getting more people in (Rule of 100: 100 outreach actions a day).`, level: funnel.length ? "inferred" : "assumed", n: top };
    cautions.push(`Top-of-funnel sample is ${top} (< ${MIN_STEP_SAMPLE}): conversion rates are noise.`);
  } else if (!usable.length || usable[0]!.shortfall <= 0) {
    constraint = { name: "volume", kind: "volume", detail: "No funnel step is clearly below benchmark; more qualified volume is the next lever.", level: "inferred", n: top };
  } else {
    const g = usable[0]!;
    constraint = { name: `${g.from}_to_${g.to}`, kind: "conversion", detail: `${g.from} -> ${g.to}: ${(g.rate * 100).toFixed(1)}% vs ~${(g.benchmark * 100).toFixed(0)}% benchmark (${g.toCount}/${g.fromCount}).`, level: g.fromCount >= 100 ? "measured" : "inferred", n: g.fromCount, gap: g };
    if (g.fromCount < 100) cautions.push(`Constraint rests on ${g.fromCount} upstream people: treat as a lead, not a verdict.`);
  }
  const snapTop = s.constraints?.[0]?.name ?? null;
  const agrees = snapTop ? snapTop.toLowerCase().includes(constraint.name.split("_to_").pop() ?? "") || constraint.name.toLowerCase().includes(snapTop.toLowerCase()) : null;
  const spend = spendGate(s.economics);
  if (!spend.allowPaidScale) cautions.push(`Do not scale paid: ${spend.reasons.join("; ")}.`);
  return { stage, constraint, gaps, spend, cautions, snapshotConstraint: snapTop, agreesWithSnapshot: agrees };
}

/** Wilson-ish sample sanity: can this many events support a conclusion at all? */
export function sampleVerdict(n: number, events: number): { ok: boolean; note: string } {
  if (n < 100) return { ok: false, note: `only ${n} observations` };
  if (events < 10) return { ok: false, note: `only ${events} conversions` };
  return { ok: true, note: `${events} conversions from ${n}` };
}
