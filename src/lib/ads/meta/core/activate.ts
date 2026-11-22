// Turning a Komendly-created campaign on (framework-free). The only path that sets anything ACTIVE.
import type { MetaPublisher } from "./types";

export interface PublishedRow { campaignId: string | null; adSetId: string | null; metaAdId: string | null; status: string }
export interface ActivationTargets { campaignId: string; adSetIds: string[]; adIds: string[] }

/** Ads and ad sets of one campaign from our own MetaPublish rows; null when we didn't publish anything into it. */
export function activationTargets(rows: readonly PublishedRow[], campaignId: string): ActivationTargets | null {
  const mine = rows.filter((r) => r.status === "published" && r.campaignId === campaignId);
  const adIds = [...new Set(mine.map((r) => r.metaAdId).filter((x): x is string => !!x))];
  const adSetIds = [...new Set(mine.map((r) => r.adSetId).filter((x): x is string => !!x))];
  return adIds.length && adSetIds.length ? { campaignId, adSetIds, adIds } : null;
}

/** Ads, then ad sets, then the campaign: delivery (and spend) can only start once the campaign flips. */
export async function activateCampaign(publisher: MetaPublisher, t: ActivationTargets, signal?: AbortSignal): Promise<void> {
  await publisher.activate([...t.adIds, ...t.adSetIds, t.campaignId], signal);
}
