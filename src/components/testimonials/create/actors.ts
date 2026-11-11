"use client";

import type { FalActorData } from "@/lib/fal-lipsync/types";
import type { PresenterGender } from "@/lib/testimonial-draft";

export type StudioActor = FalActorData & { recommended?: boolean; recommendRank?: number };

type RankEntry = { id?: unknown; actorId?: unknown; rank?: unknown; recommendRank?: unknown };

function rankMap(data: unknown): Map<string, number> {
  const out = new Map<string, number>();
  if (typeof data !== "object" || data === null) return out;
  const o = data as Record<string, unknown>;
  const ids = Array.isArray(o.actorIds) ? o.actorIds : null;
  if (ids) ids.forEach((id, i) => typeof id === "string" && out.set(id, i + 1));
  const list = Array.isArray(o.actors) ? o.actors : Array.isArray(o.recommendations) ? o.recommendations : [];
  (list as RankEntry[]).forEach((e, i) => {
    const id = typeof e?.id === "string" ? e.id : typeof e?.actorId === "string" ? e.actorId : null;
    if (!id) return;
    const r = typeof e.recommendRank === "number" ? e.recommendRank : typeof e.rank === "number" ? e.rank : i + 1;
    out.set(id, r);
  });
  return out;
}

/** Actors for this review, with recommendations merged in when the server provides them (tolerates their absence). */
export async function fetchActors(reviewId: string | null, signal?: AbortSignal): Promise<StudioActor[]> {
  const res = await fetch(`/api/fal-generate/actors${reviewId ? `?reviewId=${encodeURIComponent(reviewId)}` : ""}`, { signal });
  if (!res.ok) throw new Error("Couldn't load presenters");
  const data = (await res.json()) as { actors?: StudioActor[] };
  const actors = data.actors ?? [];
  if (reviewId && !actors.some((a) => a.recommended)) {
    try {
      const r = await fetch("/api/fal-generate/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewId }),
        signal,
      });
      if (r.ok) {
        const ranks = rankMap(await r.json());
        for (const a of actors) {
          const rank = ranks.get(a.id);
          if (rank !== undefined) {
            a.recommended = true;
            a.recommendRank = rank;
          }
        }
      }
    } catch (e) {
      if (signal?.aborted) throw e;
      // recommendations are optional
    }
  }
  return actors;
}

/** Recommended first (by rank), then the server's own order. */
export function sortActors(actors: StudioActor[]): StudioActor[] {
  return [...actors].sort((a, b) => {
    const ra = a.recommended ? (a.recommendRank ?? 999) : Infinity;
    const rb = b.recommended ? (b.recommendRank ?? 999) : Infinity;
    if (ra !== rb) return ra - rb;
    return a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);
  });
}

export function pickDefaultActor(actors: StudioActor[], gender: PresenterGender): StudioActor | undefined {
  const sorted = sortActors(actors);
  return sorted.find((a) => gender === "any" || a.gender === gender) ?? sorted[0];
}

export function thumbSources(a: StudioActor): string[] {
  return [`/actors/thumbs/${a.slug}.jpg`, a.thumbnailUrl, a.referenceImageUrl].filter((u, i, arr) => !!u && arr.indexOf(u) === i);
}
