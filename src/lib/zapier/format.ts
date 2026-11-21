// Zapier integration (growth system `zapier`, packages/komendly-zapier): flat, Zapier-friendly shapes for Ad Packs and ads.
// Pure (no I/O): the routes resolve the 7-day share links first and pass them in.
import type { AdView, RunView } from "@/lib/ads/run-types";
import { metaCtaFor, placementsFor } from "@/lib/agent-keys/meta-kit";
import { withSystemUtm } from "@/lib/growth/systems";

export const ZAPIER_SITE = "https://www.komendly.com";
export const ZAPIER_UPGRADE_URL = withSystemUtm(`${ZAPIER_SITE}/pricing`, "zapier", { medium: "integration" });
const SETTLED = new Set(["completed", "partial", "failed", "canceled"]);
// Feed (4:5) first: it is what most Meta placements and Slack/Sheets previews want.
const RATIO_ORDER = ["4:5", "1:1", "9:16"];

export interface ZapierAsset { asset_id: string; ratio: string; mime: string; width: number; height: number; url: string; placements: string[] }

export interface ZapierAd {
  id: string;
  ad_id: string;
  run_id: string;
  website: string;
  kind: string;
  status: string;
  headline: string;
  primary_text: string | null;
  cta: string | null;
  cta_type: string | null;
  angle: string;
  awareness: string;
  landing_url: string;
  image_url: string | null;
  video_url: string | null;
  image_urls: string[];
  assets: ZapierAsset[];
  links_expire_at: string;
  view_url: string;
  upgrade_url: string;
  created_at: string | null;
}

export interface ZapierRun {
  id: string;
  run_id: string;
  website: string;
  status: string;
  done: boolean;
  is_trial: boolean;
  created_at: string;
  completed_at: string | null;
  ready_count: number;
  total_count: number;
  locked_count: number;
  error: string | null;
  download_note: string | null;
  image_url: string | null;
  image_urls: string[];
  ads: ZapierAd[];
  links_expire_at: string;
  view_url: string;
  upgrade_url: string;
}

const rank = (ratio: string) => (RATIO_ORDER.indexOf(ratio) + 1 || RATIO_ORDER.length + 1);

/** One ad; `urls` maps asset id -> long-lived link (missing = not downloadable: gated, locked or not ready). */
export function zapierAd(
  ad: AdView,
  ctx: { runId: string; website: string; landingUrl: string; urls: ReadonlyMap<string, string>; expiresAt: string; origin: string; createdAt?: string | null },
): ZapierAd {
  const assets: ZapierAsset[] = ad.assets
    .filter((a) => ctx.urls.has(a.id))
    .sort((a, b) => rank(a.ratio) - rank(b.ratio))
    .map((a) => ({ asset_id: a.id, ratio: a.ratio, mime: a.mime, width: a.width, height: a.height, url: ctx.urls.get(a.id)!, placements: placementsFor(a.ratio) }));
  const images = assets.filter((a) => a.mime.startsWith("image/")).map((a) => a.url);
  return {
    id: ad.id,
    ad_id: ad.id,
    run_id: ctx.runId,
    website: ctx.website,
    kind: ad.kind,
    status: ad.locked ? "locked" : ad.status,
    headline: ad.headline,
    primary_text: ad.body,
    cta: ad.cta,
    cta_type: metaCtaFor(ad.cta),
    angle: ad.angle,
    awareness: ad.awareness,
    landing_url: ctx.landingUrl,
    image_url: images[0] ?? null,
    video_url: assets.find((a) => a.mime.startsWith("video/"))?.url ?? null,
    image_urls: images,
    assets,
    links_expire_at: ctx.expiresAt,
    view_url: `${ctx.origin}/ads/runs/${ctx.runId}`,
    upgrade_url: ZAPIER_UPGRADE_URL,
    created_at: ctx.createdAt ?? null,
  };
}

/** A whole Ad Pack. `done` = settled and no bonus ads still expected (stop polling). */
export function zapierRun(
  view: RunView,
  ctx: { landingUrl: string; urls: ReadonlyMap<string, string>; expiresAt: string; origin: string; gateNote: string | null },
): ZapierRun {
  const ads = view.ads.map((a) => zapierAd(a, { runId: view.id, website: view.url, landingUrl: ctx.landingUrl, urls: ctx.urls, expiresAt: ctx.expiresAt, origin: ctx.origin }));
  const ready = view.ads.filter((a) => a.status === "ready");
  return {
    id: view.id,
    run_id: view.id,
    website: view.url,
    status: view.status,
    done: SETTLED.has(view.status) && !view.bonusPending,
    is_trial: view.isTrial,
    created_at: view.createdAt,
    completed_at: view.completedAt,
    ready_count: ready.length,
    total_count: Math.max(view.staticCount + view.motionCount, view.ads.length),
    locked_count: ready.filter((a) => a.locked).length,
    error: view.error ? "This pack ran into a problem. Open it on Komendly to retry." : null,
    download_note: ctx.gateNote,
    image_url: ads.find((a) => a.image_url)?.image_url ?? null,
    image_urls: ads.flatMap((a) => a.image_urls),
    ads,
    links_expire_at: ctx.expiresAt,
    view_url: `${ctx.origin}/ads/runs/${view.id}`,
    upgrade_url: ZAPIER_UPGRADE_URL,
  };
}

/** Ready ads with at least one usable link (what the "Ads ready" trigger emits). */
export function isDeliverable(ad: ZapierAd): boolean {
  return ad.status === "ready" && ad.assets.length > 0;
}
