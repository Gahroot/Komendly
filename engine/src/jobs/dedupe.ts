// Near-duplicate detection between planned ads (distinct angles doctrine).
import { tokens } from "./grounding";

function shingles(s: string): Set<string> {
  const t = tokens(s);
  const out = new Set<string>(t);
  for (let i = 0; i + 1 < t.length; i++) out.add(`${t[i]} ${t[i + 1]}`);
  return out;
}

export function similarity(a: string, b: string): number {
  const A = shingles(a);
  const B = shingles(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / Math.min(A.size, B.size);
}

export interface Dedupeable {
  angle: string;
  hook: string;
  headline: string;
}

export function adText(a: Dedupeable): string {
  return `${a.angle} ${a.hook} ${a.headline}`;
}

/** Indexes of ads that are near-duplicates of an earlier ad (the later one is flagged). */
export function findNearDuplicates(ads: Dedupeable[], threshold = 0.45): number[] {
  const dup: number[] = [];
  for (let i = 0; i < ads.length; i++) {
    for (let j = 0; j < i; j++) {
      if (dup.includes(j)) continue;
      const a = ads[i];
      const b = ads[j];
      if (!a || !b) continue;
      const s = Math.max(similarity(adText(a), adText(b)), similarity(a.headline, b.headline), similarity(a.hook, b.hook));
      if (s >= threshold) {
        dup.push(i);
        break;
      }
    }
  }
  return dup;
}
