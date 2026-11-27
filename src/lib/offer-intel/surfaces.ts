// Pre-approved experiment surfaces: which copy slots a variant payload may fill. Everything else in a payload is
// dropped; an invalid or unlintable payload renders the control (returns null). Never prices, links, claims.
import { fillTokens } from "./facts";
import { lintCopy } from "./copy-lint";

type Slot = { type: "text"; max: number } | { type: "enum"; values: readonly string[] };
export const SURFACES = {
  home_hero: { label: "Homepage hero", slots: { headline: { type: "text", max: 110 }, sub: { type: "text", max: 330 } } },
  free_ads_hero: { label: "/free-ads hero", slots: { headline: { type: "text", max: 140 }, sub: { type: "text", max: 280 } } },
  unlock_upsell: { label: "Post-$9 upsell modal", slots: { title: { type: "text", max: 90 }, lead: { type: "text", max: 220 }, firstMonth: { type: "text", max: 120 }, cta: { type: "text", max: 40 } } },
  autopilot_card: { label: "Offer card after the free ads", slots: { title: { type: "text", max: 90 }, intro: { type: "text", max: 200 }, order: { type: "enum", values: ["default", "money_first"] }, guaranteePlacement: { type: "enum", values: ["below_button", "above_button"] } } },
} as const satisfies Record<string, { label: string; slots: Record<string, Slot> }>;
export type SurfaceKey = keyof typeof SURFACES;
export const MAX_RUNNING_PER_SURFACE = 2;

export const isSurface = (s: string): s is SurfaceKey => s in SURFACES;

/** Resolve a payload for a surface: known slots only, tokens filled, every text linted. Null = unusable (render control). */
export function sanitizePayload(surface: string, payload: unknown): Record<string, string> | null {
  if (!isSurface(surface) || !payload || typeof payload !== "object") return null;
  const slots = SURFACES[surface].slots as Record<string, Slot>;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(payload as Record<string, unknown>)) {
    const slot = slots[k];
    if (!slot || typeof v !== "string") continue;
    if (slot.type === "enum") { if (slot.values.includes(v)) out[k] = v; continue; }
    const filled = fillTokens(v).trim();
    if (!filled || filled.length > slot.max || !lintCopy(v).ok) return null;
    out[k] = filled;
  }
  return Object.keys(out).length ? out : null;
}

/** Problems with a payload, for validators and owner review (sanitizePayload only says unusable). */
export function payloadProblems(surface: string, payload: unknown): string[] {
  if (!isSurface(surface)) return [`unknown surface ${surface}`];
  if (!payload || typeof payload !== "object") return ["variant has no payload"];
  const slots = SURFACES[surface].slots as Record<string, Slot>;
  const problems: string[] = [];
  let used = 0;
  for (const [k, v] of Object.entries(payload as Record<string, unknown>)) {
    const slot = slots[k];
    if (!slot) { problems.push(`slot "${k}" is not allowed on ${surface}`); continue; }
    if (typeof v !== "string") { problems.push(`slot "${k}" must be text`); continue; }
    used++;
    if (slot.type === "enum") { if (!slot.values.includes(v)) problems.push(`slot "${k}" must be one of ${slot.values.join("/")}`); continue; }
    const filled = fillTokens(v);
    if (filled.length > slot.max) problems.push(`slot "${k}" is ${filled.length} chars (max ${slot.max})`);
    for (const p of lintCopy(v).problems) problems.push(`${k}: ${p}`);
  }
  if (!used) problems.push("payload fills no slot");
  return problems;
}
