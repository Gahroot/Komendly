// Searchable ad inspiration (/ad-inspiration): one flat index over the hand-written trade playbooks and the copy library.
import { CATEGORIES, PLAYBOOKS, type TradeCategory } from "../trade-playbooks-data";
import { COPY_LIBRARY, ANGLE_LABEL } from "./copy-library";

export type InspirationKind = "hook" | "offer" | "proof" | "headline" | "primary-text";
export interface InspirationItem { id: string; kind: InspirationKind; text: string; trade: string; term: string; category: TradeCategory; angle?: string }

const stripNote = (s: string) => s.replace(/\s*\([^)]*\)/g, "").trim();
export function buildInspirationIndex(): InspirationItem[] {
  const items: InspirationItem[] = [];
  for (const p of PLAYBOOKS) {
    const base = { trade: p.slug, term: p.term, category: p.category };
    p.hooks.forEach((t, i) => items.push({ ...base, id: `${p.slug}-hook-${i}`, kind: "hook", text: t }));
    p.offers.forEach((t, i) => items.push({ ...base, id: `${p.slug}-offer-${i}`, kind: "offer", text: stripNote(t) }));
    p.proof.forEach((t, i) => items.push({ ...base, id: `${p.slug}-proof-${i}`, kind: "proof", text: stripNote(t) }));
  }
  for (const c of COPY_LIBRARY) {
    const p = PLAYBOOKS.find((x) => x.slug === c.slug);
    if (!p) continue;
    const base = { trade: p.slug, term: p.term, category: p.category };
    c.headlines.forEach((h, i) => items.push({ ...base, id: `${p.slug}-headline-${i}`, kind: "headline", text: h.text, angle: ANGLE_LABEL[h.angle] }));
    c.primaryTexts.forEach((t, i) => items.push({ ...base, id: `${p.slug}-text-${i}`, kind: "primary-text", text: t }));
  }
  return items;
}

export interface InspirationQuery { q?: string; kind?: InspirationKind | ""; category?: TradeCategory | "" }
/** Every query word must appear in the text, trade term or angle (case-insensitive). */
export function searchInspiration(items: InspirationItem[], { q = "", kind = "", category = "" }: InspirationQuery): InspirationItem[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  return items.filter((it) => (!kind || it.kind === kind) && (!category || it.category === category) && words.every((w) => `${it.text} ${it.term} ${it.angle ?? ""}`.toLowerCase().includes(w)));
}
export const CATEGORY_OPTIONS = CATEGORIES.map((c) => ({ id: c.slug as TradeCategory, label: c.label }));
