// Client-safe helpers for the brand profile editor (/ads/brands/[id]).
import type { BrandUpdate } from "./brand";
import type { BrandDetail } from "./brand-view";

export type ProofKind = "testimonial" | "stat" | "logo" | "award" | "other";
export const PROOF_KINDS: ProofKind[] = ["testimonial", "stat", "logo", "award", "other"];

export interface BrandForm {
  name: string;
  colors: { hex: string; role: string }[];
  fonts: { family: string; role: string; sourceUrl?: string }[];
  audience: string;
  mainOffer: string;
  landingPage: string;
  voice: string;
  pains: { text: string; sourceUrl: string; quote?: string }[];
  proof: { text: string; sourceUrl: string; kind: ProofKind }[];
  facts: { claim: string; sourceUrl: string; quote: string }[];
}

type Obj = Record<string, unknown>;
const objects = (v: unknown): Obj[] => (Array.isArray(v) ? v.filter((x): x is Obj => typeof x === "object" && x !== null) : []);
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const optStr = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);
const proofKind = (v: unknown): ProofKind => PROOF_KINDS.find((k) => k === v) ?? "other";

export function toBrandForm(b: BrandDetail): BrandForm {
  return {
    name: b.name ?? "",
    colors: b.colors.map((c) => ({ hex: c.hex, role: c.role })),
    fonts: objects(b.fonts).map((f) => ({ family: str(f.family), role: str(f.role), sourceUrl: optStr(f.sourceUrl) })),
    audience: b.audience,
    mainOffer: b.mainOffer,
    landingPage: b.landingPage,
    voice: b.voice,
    pains: objects(b.pains).map((p) => ({ text: str(p.text), sourceUrl: str(p.sourceUrl), quote: optStr(p.quote) })),
    proof: objects(b.proof).map((p) => ({ text: str(p.text), sourceUrl: str(p.sourceUrl), kind: proofKind(p.kind) })),
    facts: objects(b.facts).map((f) => ({ claim: str(f.claim), sourceUrl: str(f.sourceUrl), quote: str(f.quote) })),
  };
}

/** Only the fields that differ from the saved profile, so the API marks just those as user-edited. */
export function changedFields(saved: BrandForm, draft: BrandForm): BrandUpdate {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(draft) as (keyof BrandForm)[]) {
    if (JSON.stringify(saved[key]) !== JSON.stringify(draft[key])) out[key] = draft[key];
  }
  return out as BrandUpdate;
}

export function isHex(value: string): boolean {
  return /^#[0-9a-fA-F]{3,8}$/.test(value);
}

export function editedKeys(b: BrandDetail): Set<string> {
  return new Set(Object.keys(b.userEdited as Obj));
}
