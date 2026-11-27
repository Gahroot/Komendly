// llms.txt lines for the organic resources (kept out of seo/llms.ts so that file stays a thin list).
import { SITE_URL } from "../../site";
import { COMPETITORS, VERIFIED_ON, alternativesPath, comparePath } from "./compare";
import { COPY_LIBRARY } from "./copy-library";
import { COMPARE_BASE, COPY_LIBRARY_BASE, INSPIRATION_PATH, RESOURCE_TOOLS, resourcePath } from "./registry";
import { BENCHMARKS_BASE } from "./benchmarks";

export function organicLlmsLines(adlibPath: string | null): string[] {
  return [
    `- [Competitor ad watch](${SITE_URL}/tools/competitor-ad-watch): get a weekly email of the new Facebook and Instagram ads your local rivals started, from the public Meta Ad Library`,
    `- [Seasonal ad ideas by industry](${SITE_URL}/seasonal): what to advertise each season, with the start window and a hand-written idea per trade`,
    ...RESOURCE_TOOLS.map((t) => `- [${t.name}](${SITE_URL}${resourcePath(t.slug)}): ${t.description}`),
    `- [Ad copy library](${SITE_URL}${COPY_LIBRARY_BASE}): hand-written ad headlines and texts for ${COPY_LIBRARY.length} local trades`,
    `- [Ad inspiration search](${SITE_URL}${INSPIRATION_PATH}): search hooks, offers, proof lines and headlines by trade`,
    `- [Komendly compared](${SITE_URL}${COMPARE_BASE}): sourced comparisons with ${COMPETITORS.map((c) => c.name).join(", ")} (competitor facts verified ${VERIFIED_ON})`,
    ...COMPETITORS.flatMap((c) => [`- [Komendly vs ${c.name}](${SITE_URL}${comparePath(c)})`, `- [${c.name} alternatives](${SITE_URL}${alternativesPath(c)})`]),
    ...(adlibPath ? [`- [Meta ad benchmarks by trade](${SITE_URL}${BENCHMARKS_BASE}): per-trade counts from the public Ad Library snapshot, with methodology`] : []),
  ];
}
