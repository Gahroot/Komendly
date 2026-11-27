// Shared types for the executive strategy engine. Pure TS, no imports beyond type-only ones (engine image copies src/lib/exec/).
export type EvidenceLevel = "measured" | "inferred" | "assumed";
export interface EvidenceItem { level: EvidenceLevel; text: string; /** AdsEvent id (or event name) the claim comes from. Never invented. */ eventId?: string; constraintId?: string }
export type ObjectiveType = "hold_and_measure" | "evidence_gathering" | "experiment" | "build" | "operate";
export type ObjectiveStatus = "proposed" | "approved" | "active" | "verifying" | "done" | "abandoned";
export type ApprovalState = "auto_approved" | "needs_owner" | "owner_approved" | "owner_rejected";
export type Reversibility = "reversible" | "costly" | "irreversible";
/** Minimal DB surface (Prisma client satisfies it). */
export type ExecDb = { [k: string]: any }; // eslint-disable-line @typescript-eslint/no-explicit-any
export const asObj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
export const FNV = (s: string): string => {
  let h1 = 0x811c9dc5, h2 = 0x1b873593;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619) >>> 0; h2 = Math.imul(h2 + c, 2246822519) >>> 0; }
  return `${h1.toString(16).padStart(8, "0")}${h2.toString(16).padStart(8, "0")}`;
};
