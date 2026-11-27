// Autonomous customer-success agent, pure part (system `success_agent`): cluster recurring problems from raw signals
// (inbound reply categories + text, failed jobs, stuck states, refunds, cancel intents) with keyword rules. AI only
// rewrites the suggested fix of the top clusters under a strict JSON schema (see engine/src/customersuccess). It never
// contacts customers and never changes billing.
export const SUCCESS_FINDING_EVENT = "customer_success_finding";
export const SIGNAL_SOURCES = ["reply", "failed_job", "stuck", "refund", "cancel_intent"] as const;
export type SignalSource = (typeof SIGNAL_SOURCES)[number];
export interface Signal { source: SignalSource; text: string; category?: string | null; at: Date; ref?: string }

export type Severity = "high" | "medium" | "low";
export interface CauseDef { cause: string; label: string; match: RegExp; ourBug: boolean; fix: string }
/** Order matters: first match wins. */
export const CAUSES: readonly CauseDef[] = [
  { cause: "download_failed", label: "Can't download ads", match: /(can'?t|cannot|unable|won'?t|not|fail\w*|error|403|refus\w*)[^.]{0,40}download|download[^.]{0,40}(fail|error|not work|403|refus)|paid_download_refused/i, ourBug: true, fix: "Check the download route and asset URLs for the affected workspace; confirm unlocked packs never return 403." },
  { cause: "pack_failed", label: "Free pack failed or came out empty", match: /pack_failed|pack_empty|run failed|no ads|empty pack|extract\w* (fail|error)|nothing (came|was)/i, ourBug: true, fix: "Review the failing extraction/render jobs for these sites; retry and fix the common failure." },
  { cause: "stuck_before_download", label: "Stuck before downloading their ads", match: /no_url|never_downloaded|buyer_never_downloaded|tried_locked/i, ourBug: false, fix: "Look at where people stop between sign-up and download; tighten the first-run guide." },
  { cause: "login_problem", label: "Login or verification trouble", match: /log ?in|sign ?in|password|verification|verify|code (never|didn'?t)|didn'?t (get|receive) (the )?(email|code)/i, ourBug: false, fix: "Check email deliverability of verification codes and the password reset path." },
  { cause: "meta_connect", label: "Stuck connecting Meta", match: /\bmeta\b.*(connect|access|permission|ad account|business manager)|ad account|autopilot_pre_meta|business manager|page access/i, ourBug: false, fix: "Improve the Meta connection walkthrough or offer a live setup call." },
  { cause: "refund", label: "Refund requests", match: /refund|money back|charge[sd]? (me|back)|chargeback/i, ourBug: false, fix: "Read the refund reasons together; fix the expectation gap they point to." },
  { cause: "billing", label: "Billing or charge question", match: /\bcharge[sd]?\b|invoice|billing|subscription|cancel/i, ourBug: false, fix: "Clarify billing terms on the pricing page and in the receipt email." },
  { cause: "price_objection", label: "Too expensive", match: /expensive|too much|can'?t afford|cheaper|price|cost/i, ourBug: false, fix: "Consider a lower entry step or clearer value framing." },
  { cause: "no_results", label: "Not seeing results", match: /no (leads|results|sales|calls)|not working|didn'?t work|zero (leads|sales)|waste/i, ourBug: false, fix: "Review the offer, targeting and budget of these accounts; set expectations earlier." },
  { cause: "how_to", label: "How do I use it?", match: /how (do|can|to)|where (do|can|is)|what (do|should) i|help me/i, ourBug: false, fix: "Add the missing step to the in-app guide or the first-run email." },
];
export const FALLBACK_CAUSE: CauseDef = { cause: "other", label: "Other", match: /./, ourBug: false, fix: "Read these examples and decide whether a pattern is emerging." };

export function causeOf(s: Signal): CauseDef {
  if (s.source === "refund") return CAUSES.find((c) => c.cause === "refund")!;
  if (s.source === "cancel_intent") return CAUSES.find((c) => c.cause === "billing")!;
  if (s.source === "stuck") return CAUSES.find((c) => c.match.test(s.text)) ?? FALLBACK_CAUSE;
  if (s.source === "failed_job") return CAUSES.find((c) => c.cause === "pack_failed")!;
  const text = `${s.category ?? ""} ${s.text}`;
  if (s.category === "refund_request") return CAUSES.find((c) => c.cause === "refund")!;
  return CAUSES.find((c) => c.match.test(text)) ?? FALLBACK_CAUSE;
}

export interface Cluster { cause: string; label: string; count: number; sources: SignalSource[]; example: string; suggestedFix: string; severity: Severity; ourBug: boolean }

export function severityOf(def: CauseDef, count: number, sources: readonly SignalSource[]): Severity {
  if (def.cause === "other") return "low";
  if (sources.includes("refund") || (def.ourBug && count >= 3) || count >= 8) return "high";
  if (def.ourBug || count >= 3) return "medium";
  return "low";
}
const RANK: Record<Severity, number> = { high: 0, medium: 1, low: 2 };

const clip = (s: string, n = 220) => s.replace(/\s+/g, " ").trim().slice(0, n);
/** Cluster signals by cause; sorted by severity then count. Excerpts only (no emails, no full text). */
export function clusterSignals(signals: readonly Signal[]): Cluster[] {
  const by = new Map<string, { def: CauseDef; items: Signal[] }>();
  for (const s of signals) {
    const def = causeOf(s);
    const e = by.get(def.cause) ?? { def, items: [] };
    e.items.push(s);
    by.set(def.cause, e);
  }
  return [...by.values()]
    .map(({ def, items }) => {
      const sources = [...new Set(items.map((i) => i.source))];
      const newest = [...items].sort((a, b) => b.at.getTime() - a.at.getTime())[0]!;
      return { cause: def.cause, label: def.label, count: items.length, sources, example: redact(clip(newest.text)), suggestedFix: def.fix, severity: severityOf(def, items.length, sources), ourBug: def.ourBug };
    })
    .sort((a, b) => RANK[a.severity] - RANK[b.severity] || b.count - a.count);
}
export function redact(s: string): string {
  return s.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]").replace(/\+?\d[\d\s().-]{8,}\d/g, "[phone]");
}

/** Strict JSON schema the AI summariser must return (cause keys limited to the input clusters). */
export const SUMMARY_SCHEMA = { type: "object", additionalProperties: false, required: ["items"], properties: { items: { type: "array", maxItems: 5, items: { type: "object", additionalProperties: false, required: ["cause", "suggestedFix"], properties: { cause: { type: "string" }, suggestedFix: { type: "string", maxLength: 280 } } } } } } as const;
export function applySummary(clusters: readonly Cluster[], raw: unknown): Cluster[] {
  const items = raw && typeof raw === "object" && Array.isArray((raw as { items?: unknown }).items) ? ((raw as { items: unknown[] }).items) : [];
  const fixes = new Map<string, string>();
  for (const it of items) {
    if (!it || typeof it !== "object") continue;
    const { cause, suggestedFix } = it as { cause?: unknown; suggestedFix?: unknown };
    if (typeof cause === "string" && typeof suggestedFix === "string" && suggestedFix.trim().length >= 10 && suggestedFix.length <= 280 && clusters.some((c) => c.cause === cause)) fixes.set(cause, redact(suggestedFix.trim()));
  }
  return clusters.map((c) => (fixes.has(c.cause) ? { ...c, suggestedFix: fixes.get(c.cause)! } : c));
}

export interface FindingRow { cause: string; label: string; count: number; example: string; suggestedFix: string; severity: Severity; day: string; ourBug: boolean }
export function parseFinding(props: unknown): FindingRow | null {
  const p = (props && typeof props === "object" ? props : null) as Record<string, unknown> | null;
  if (!p || typeof p.cause !== "string") return null;
  const sev = p.severity === "high" || p.severity === "medium" ? p.severity : "low";
  return { cause: p.cause, label: typeof p.label === "string" ? p.label : p.cause, count: Number(p.count) || 0, example: String(p.example ?? ""), suggestedFix: String(p.suggestedFix ?? ""), severity: sev, day: String(p.day ?? ""), ourBug: p.ourBug === true };
}
/** Latest finding per cause, top N by severity then count. */
export function topFindings(rows: readonly FindingRow[], n = 8): FindingRow[] {
  const latest = new Map<string, FindingRow>();
  for (const r of [...rows].sort((a, b) => a.day.localeCompare(b.day))) latest.set(r.cause, r);
  return [...latest.values()].sort((a, b) => RANK[a.severity] - RANK[b.severity] || b.count - a.count).slice(0, n);
}
