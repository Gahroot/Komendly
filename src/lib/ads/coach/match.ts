// Match an uploaded ad (name/headline text) to the user's own Komendly ads by headline similarity. Pure.

function words(s: string): string[] {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1);
}

/** Dice coefficient on word sets (0..1). */
export function textSimilarity(a: string, b: string): number {
  const A = new Set(words(a));
  const B = new Set(words(b));
  if (!A.size || !B.size) return 0;
  let hit = 0;
  for (const w of A) if (B.has(w)) hit++;
  return (2 * hit) / (A.size + B.size);
}

export interface OwnAd {
  id: string;
  headline: string;
  createdAt: Date;
}

/** Best own ad whose headline matches any of the texts (>= 0.6 similarity, or containment). Ties: newest, then id. */
export function matchOwnAd(texts: Array<string | null | undefined>, own: OwnAd[], threshold = 0.6): OwnAd | null {
  const cands = texts.filter((t): t is string => typeof t === "string" && t.trim().length > 2);
  let best: { ad: OwnAd; score: number } | null = null;
  for (const ad of own) {
    const h = ad.headline.toLowerCase().trim();
    for (const t of cands) {
      const tl = t.toLowerCase().trim();
      const score = h.length > 8 && (tl.includes(h) || h.includes(tl)) ? 1 : textSimilarity(t, ad.headline);
      if (score < threshold) continue;
      const better =
        !best || score > best.score || (score === best.score && (ad.createdAt.getTime() > best.ad.createdAt.getTime() || (ad.createdAt.getTime() === best.ad.createdAt.getTime() && ad.id < best.ad.id)));
      if (better) best = { ad, score };
    }
  }
  return best?.ad ?? null;
}
