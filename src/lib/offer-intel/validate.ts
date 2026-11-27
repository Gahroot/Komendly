// Pure validator for offer proposals (ExperimentDef drafts written by the offer-intelligence agent). It returns
// "auto" ONLY when every rule passes AND the AI review gate approved; anything else is "needs_owner" with reasons.
// No I/O: the engine job calls defineExperiment after an "auto" decision.
import type { ExperimentDef } from "../revenue/experiments";
import { validateDef } from "../revenue/experiments";
import { isSurface, MAX_RUNNING_PER_SURFACE, payloadProblems } from "./surfaces";

export interface Decision { decision: "auto" | "needs_owner"; reasons: string[] }

export function validateProposal(
  def: ExperimentDef,
  ctx: { running: readonly ExperimentDef[]; reviewApproved: boolean | null; flagOn: boolean },
): Decision {
  const reasons: string[] = [];
  reasons.push(...validateDef(def));
  if (!isSurface(def.surface)) reasons.push(`surface "${def.surface}" is not a pre-approved surface`);
  if (ctx.running.some((d) => d.key === def.key)) reasons.push("an experiment with this key already exists");
  if (isSurface(def.surface) && ctx.running.filter((d) => d.surface === def.surface).length >= MAX_RUNNING_PER_SURFACE) reasons.push(`${MAX_RUNNING_PER_SURFACE} experiments already running on ${def.surface}`);
  const [control, ...rest] = def.variants;
  if (control?.payload) reasons.push("the first variant must be the control (no payload)");
  if (def.variants.length > 3) reasons.push("at most 3 variants (volume is tiny)");
  if (def.minPerVariant < 50) reasons.push("minPerVariant under 50 is too small to learn anything");
  if (!/^[a-z_]+$/.test(def.metric) || !["signed_up", "checkout_started", "offer_clicked"].includes(def.metric)) reasons.push(`metric "${def.metric}" is not a wired conversion event (signed_up, checkout_started, offer_clicked)`);
  for (const v of rest) for (const p of payloadProblems(def.surface, v.payload)) reasons.push(`variant ${v.id}: ${p}`);
  if (ctx.reviewApproved === false) reasons.push("AI review gate rejected the copy");
  if (ctx.reviewApproved === null && !reasons.length) reasons.push("AI review gate has not approved this proposal");
  if (!ctx.flagOn) reasons.push("sys_offer_intel is off");
  return { decision: reasons.length ? "needs_owner" : "auto", reasons };
}
