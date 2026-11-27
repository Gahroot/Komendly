// Daily customer-success agent: read the last 7 days of signals (inbound replies + their auto-reply category, failed jobs,
// stuck states, refunds, cancel intents), cluster with keyword rules (src/lib/revenue-lifecycle/success.ts), let the Codex
// provider only reword the suggested fix of the top clusters (strict JSON schema, validated, falls back to the rules text),
// and write one AdsEvent `customer_success_finding` per cluster. Never emails customers, never touches billing.
import { z } from "zod";
import { applySummary, clusterSignals, SUCCESS_FINDING_EVENT, SUMMARY_SCHEMA, type Cluster, type Signal } from "../../../src/lib/revenue-lifecycle/success";
import { errMsg, log } from "../log";
import { structured } from "../providers/structured";
import type { CsDeps } from "./loop";

const WINDOW_DAYS = 7;
const RUN_EVENT = "customer_success_run";
const Summary = z.object({ items: z.array(z.object({ cause: z.string(), suggestedFix: z.string().max(280) })).max(5) });
const SYSTEM = `You help a small SaaS founder fix recurring customer problems. You get problem clusters (cause, count, an anonymised example, a draft fix). Reword each draft fix into one concrete, specific engineering/product/support action of at most 280 characters. Never invent facts, numbers or customers, never promise results to customers, and never suggest contacting customers automatically. Return JSON only: {"items":[{"cause":"<same cause key>","suggestedFix":"..."}]}`;

export async function gatherSignals(db: CsDeps["db"], now: Date): Promise<Signal[]> {
  const since = new Date(now.getTime() - WINDOW_DAYS * 86_400_000);
  const [replies, cats, jobs, stuck, refunds, intents] = await Promise.all([
    db.adsEvent.findMany({ where: { name: "email_replied", createdAt: { gte: since } }, select: { id: true, props: true, createdAt: true }, take: 500 }),
    db.adsEvent.findMany({ where: { name: { in: ["email_needs_human", "email_auto_replied"] }, createdAt: { gte: since } }, select: { props: true }, take: 1000 }),
    db.adJob.findMany({ where: { status: "failed", updatedAt: { gte: since } }, select: { id: true, type: true, lastError: true, updatedAt: true }, take: 300 }),
    db.adsEvent.findMany({ where: { name: "activation_stuck", createdAt: { gte: since } }, select: { id: true, props: true, createdAt: true }, take: 500 }),
    db.adsRefund.findMany({ where: { createdAt: { gte: since } }, select: { id: true, reason: true, createdAt: true }, take: 100 }),
    db.adsEvent.findMany({ where: { name: "cancel_intent", createdAt: { gte: since } }, select: { id: true, props: true, createdAt: true }, take: 100 }),
  ]);
  const catBy = new Map<string, string>();
  for (const c of cats) { const p = c.props as { emailId?: string; category?: string } | null; if (p?.emailId && p.category) catBy.set(p.emailId, p.category); }
  const out: Signal[] = [];
  for (const r of replies) { const p = (r.props ?? {}) as { emailId?: string; subject?: string; text?: string }; out.push({ source: "reply", text: `${p.subject ?? ""} ${p.text ?? ""}`.slice(0, 600), category: p.emailId ? catBy.get(p.emailId) ?? null : null, at: r.createdAt, ref: r.id }); }
  for (const j of jobs) out.push({ source: "failed_job", text: `${j.type}: ${j.lastError ?? "failed"}`.slice(0, 300), at: j.updatedAt, ref: j.id });
  for (const s of stuck) out.push({ source: "stuck", text: String((s.props as { cause?: string } | null)?.cause ?? "stuck"), at: s.createdAt, ref: s.id });
  for (const r of refunds) out.push({ source: "refund", text: r.reason ?? "refund", at: r.createdAt, ref: r.id });
  for (const i of intents) out.push({ source: "cancel_intent", text: `cancel intent ${String((i.props as { plan?: string } | null)?.plan ?? "")}`, at: i.createdAt, ref: i.id });
  return out;
}

export async function successTick(d: CsDeps, now: Date): Promise<number> {
  const day = now.toISOString().slice(0, 10);
  const done = await d.db.adsEvent.findFirst({ where: { name: RUN_EVENT, props: { path: ["day"], equals: day } }, select: { id: true } });
  if (done) return 0;
  const signals = await gatherSignals(d.db, now);
  let clusters: Cluster[] = clusterSignals(signals);
  let source: "ai" | "rules" = "rules";
  const top = clusters.filter((c) => c.cause !== "other").slice(0, 5);
  if (top.length && d.provider?.name === "codex") {
    try {
      const prompt = JSON.stringify(top.map((c) => ({ cause: c.cause, label: c.label, count: c.count, sources: c.sources, example: c.example, draftFix: c.suggestedFix })));
      const r = await structured(d.provider, Summary, { system: SYSTEM, prompt, reasoning: "low", signal: AbortSignal.timeout(90_000) }, []);
      clusters = applySummary(clusters, r);
      source = "ai";
    } catch (e) {
      log("warn", "success agent summary failed, using rules text", { error: errMsg(e) });
    }
  }
  void SUMMARY_SCHEMA;
  for (const c of clusters) {
    await d.db.adsEvent.create({ data: { name: SUCCESS_FINDING_EVENT, props: { day, cause: c.cause, label: c.label, count: c.count, sources: c.sources, example: c.example, suggestedFix: c.suggestedFix, severity: c.severity, ourBug: c.ourBug, summarisedBy: source } } });
  }
  await d.db.adsEvent.create({ data: { name: RUN_EVENT, props: { day, signals: signals.length, clusters: clusters.length } } });
  return clusters.length;
}
