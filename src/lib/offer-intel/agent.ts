// Offer-intelligence agent contract: output schema, prompt, and conversion of proposals into ExperimentDef drafts. Pure.
import type { ExperimentDef } from "../revenue/experiments";
import { SURFACES } from "./surfaces";
import { HARD_RULES } from "../growth/review-gate";
import type { ObjectionTheme } from "./objections";
import { FACT_TOKENS } from "./facts";

export const LEVERS = ["dream_outcome", "perceived_likelihood", "time_delay", "effort_sacrifice"] as const;
export type Lever = (typeof LEVERS)[number];
export const PAYLOAD_SLOTS = ["headline", "sub", "title", "lead", "firstMonth", "cta", "intro", "order", "guaranteePlacement"] as const;
/** Plain-TS shape of the agent output; the zod schema lives in engine/src/offerintel/weekly.ts (engine's own zod copy). */
export interface AgentProposal { key: string; surface: string; lever: Lever; hypothesis: string; rationale: string; metric: string; minPerVariant: number; variant: { id: string; payload: Record<(typeof PAYLOAD_SLOTS)[number], string> } }
export interface AgentOutputT { gap: { weakestLever: Lever; scores: Record<Lever, number>; evidence: string; summary: string }; proposals: AgentProposal[] }

export const AGENT_SYSTEM = `You are the offer analyst for Komendly, a small SaaS selling Facebook/Instagram ads to local service businesses. Use Alex Hormozi's value equation: Value = (Dream Outcome x Perceived Likelihood of Achievement) / (Time Delay x Effort & Sacrifice). Score each lever 1-5 (5 = strong for the buyer) from the EVIDENCE only, name the weakest lever, and propose at most 3 copy experiments that attack it (Grand Slam Offer thinking: answer the most common objection, reduce risk with existing guarantees only).
Hard limits: you may only fill the allowed copy slots of the listed surfaces; never change prices; never invent numbers, results, proof or guarantees; use the {tokens} for any price or count; never promise leads or sales; no fake scarcity. If evidence is thin say so in "evidence" and propose fewer experiments (zero is fine).
Rules every public line must obey:\n${HARD_RULES.map((r) => `- ${r}`).join("\n")}`;

export interface AgentContext {
  themes: readonly ObjectionTheme[]; signalTotal: number; funnel: string; constraint: string;
  competitors: { name: string; facts: string[] }[]; running: readonly { key: string; surface: string }[];
}

export function buildAgentPrompt(c: AgentContext): string {
  const surfaces = Object.entries(SURFACES).map(([k, s]) => `- ${k} (${s.label}): slots ${Object.entries(s.slots).map(([n, v]) => `${n}${v.type === "text" ? `<=${v.max} chars` : `=${v.values.join("|")}`}`).join(", ")}`).join("\n");
  return [
    `OBJECTION MAP (from ${c.signalTotal} real signals; counts, anonymised quotes):`,
    c.themes.length ? c.themes.slice(0, 8).map((t) => `- ${t.label}: ${t.count} (${Math.round(t.share * 100)}%). e.g. ${t.quotes.map((q) => `"${q}"`).join(" / ")}`).join("\n") : "(no signals this week)",
    `FUNNEL AND CONSTRAINT:\n${c.funnel}\n${c.constraint}`,
    `COMPETITOR OFFERS (verified public pages):\n${c.competitors.map((x) => `- ${x.name}: ${x.facts.slice(0, 3).join(" | ")}`).join("\n")}`,
    `ALLOWED SURFACES AND SLOTS:\n${surfaces}\nTokens you may use inside text: ${Object.keys(FACT_TOKENS).join(" ")}. Unused slots: empty string. The control is the current copy and is added for you; give ONE challenger variant per proposal. metric must be one of signed_up, checkout_started, offer_clicked; minPerVariant at least 80.`,
    `ALREADY RUNNING (do not duplicate): ${c.running.map((r) => `${r.key}@${r.surface}`).join(", ") || "none"}`,
  ].join("\n\n");
}

/** Agent proposal -> ExperimentDef draft (control + challenger). Empty payload slots are dropped. */
export function toExperimentDef(p: AgentProposal): ExperimentDef {
  const payload = Object.fromEntries(Object.entries(p.variant.payload).filter(([, v]) => typeof v === "string" && v.trim() !== ""));
  return { key: p.key.toLowerCase().replace(/[^a-z0-9_.-]+/g, "_").slice(0, 60), surface: p.surface, hypothesis: p.hypothesis, metric: p.metric, minPerVariant: Math.round(p.minPerVariant), variants: [{ id: "control", weight: 1 }, { id: p.variant.id.toLowerCase().replace(/[^a-z0-9_]+/g, "_") || "challenger", weight: 1, payload }] };
}
