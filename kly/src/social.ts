// Ozzy's daily organic post to Komendly's OWN Facebook Page + linked Instagram business account.
// Off unless KlySettings.socialEnabled AND an admin connected the Page (KlySocialConnection). One post per platform per
// ET day: the KlySocialPost row (unique day+platform) is claimed before publishing, so restarts never double-post.
// Content: Komendly-owned samples, Ozzy art tips, or ads whose owner consented via "Ad of the week" (never Kly gifts).
import { z } from "zod";
import { reelsState } from "./reels";
import { staticShouldYield } from "../../src/lib/growth/reels-core";
import { openSecret } from "./mailboxes";
import type { Db } from "./db";
import { errMsg, log } from "./log";
import { ask, type AIProvider } from "./ai";
import { addCost, type KlySettingsRow } from "./settings";
import {
  SOCIAL_CONSENTED_STATUSES, checkCaption, etDay, etHour, fallbackCaptions, ownedContent, pickContent, publishFacebook, publishInstagram,
  showcaseContent, socialGate, socialLink, type FetchFn, type SocialContent, type SocialPlatform,
} from "../../src/lib/kly/social-core";
// Same as src/lib/ads/meta/core/graph-publisher DEFAULT_GRAPH_VERSION (not imported: Kly's image ships only a few web files).
const DEFAULT_GRAPH_VERSION = "v25.0";

const CaptionSchema = z.object({ facebook: z.string(), instagram: z.string() });

const SYSTEM = `You write one organic social post for Komendly, in the voice of Ozzy: a friendly Aussie dingo wizard who makes ads for small businesses.
Komendly: paste your website and Ozzy makes you 10 free Facebook/Instagram ads (no card).
Rules: short (2-4 sentences), warm, genuinely useful, light Aussie flavour. No hype, no promises of results, sales, ROI or numbers you can't back up, no urgency, no exclamation chains. At most 2 hashtags.
Ozzy made the ad in the post; never tell people to copy it or swap in their own details: Ozzy makes ads for THEIR business from their website.
Never claim people in the videos are real customers or that anything is unscripted or real footage.
facebook: must include this exact link once: {fb}
instagram: no links or URLs at all; say "link in bio".`;

/** Two captions from MiMo (via the provider stack), checked; template captions when the AI is off or fails twice. */
export async function writeCaptions(provider: AIProvider | null, c: SocialContent, db: Db | null, now: Date): Promise<Record<SocialPlatform, string>> {
  const fb = fallbackCaptions(c);
  if (!provider) return fb;
  for (let i = 0; i < 2; i++) {
    try {
      const { out, costMicros } = await ask(provider, CaptionSchema, {
        system: SYSTEM.replace("{fb}", socialLink("facebook")),
        prompt: `Post about: ${c.brief}.${c.kind === "showcase" && (c.handle || c.brandName) ? ` Thank ${c.handle || c.brandName} for letting us share it.` : ""}`,
        reasoning: "low",
      });
      if (db) await addCost(db, null, costMicros, now).catch(() => undefined);
      const bad = checkCaption(out.facebook, "facebook") ?? checkCaption(out.instagram, "instagram");
      if (!bad) return { facebook: out.facebook.trim(), instagram: out.instagram.trim() };
      log("info", "kly social caption rejected", { reason: bad });
    } catch (e) {
      log("warn", "kly social caption failed", { error: errMsg(e) });
    }
  }
  return fb;
}

/** Owned content + consented showcases (Ad of the week). */
export async function contentPool(db: Db): Promise<SocialContent[]> {
  const features = await db.adsFeature.findMany({ where: { status: { in: [...SOCIAL_CONSENTED_STATUSES] } }, orderBy: { consentAt: "asc" }, take: 200, select: { adId: true, brandName: true, handle: true } });
  return [...features.map((f) => showcaseContent(f)), ...ownedContent()];
}

export interface SocialDeps {
  db: Db;
  settings: Pick<KlySettingsRow, "socialEnabled" | "socialHourEt">;
  provider: AIProvider | null;
  env: NodeJS.ProcessEnv;
  now: Date;
  fetch?: FetchFn;
}

export type SocialResult = { skipped: string } | { posted: Array<{ platform: SocialPlatform; ok: boolean; id?: string; error?: string }> };

export async function socialTick(d: SocialDeps): Promise<SocialResult> {
  const { db, now } = d;
  // Cheap gate first (no DB) when switched off.
  if (!d.settings.socialEnabled) return { skipped: "switched off" };
  const conn = await db.klySocialConnection.findUnique({ where: { id: "komendly" } });
  const key = d.env.ADS_TOKEN_KEY?.trim();
  const gate = socialGate({ socialEnabled: d.settings.socialEnabled, socialHourEt: d.settings.socialHourEt, connected: Boolean(conn?.pageId && conn.pageTokenEnc), hasTokenKey: Boolean(key), now });
  if (gate || !conn) return { skipped: gate ?? "not connected" };
  const day = etDay(now);
  const done = await db.klySocialPost.findMany({ where: { day }, select: { platform: true } });
  // Reels (sys_reels) take the day's slot: the static post only stands in when no reel went out / is ready (src/lib/growth/reels-core staticShouldYield).
  const rs = await reelsState(db, now).catch(() => null);
  const platforms = (["facebook", ...(conn.igUserId ? ["instagram"] : [])] as SocialPlatform[]).filter((p) => !done.some((x) => x.platform === p) && !(rs && staticShouldYield({ reelsOn: rs.on, reelPostedToday: rs.postedToday.has(p), reelReady: rs.ready, etHour: etHour(now), hourEt: d.settings.socialHourEt, paused: rs.paused.has(p) })));
  if (!platforms.length) return { skipped: "already posted today" };

  const recent = await db.klySocialPost.findMany({ where: { status: "posted" }, orderBy: { createdAt: "desc" }, take: 200, select: { sourceRef: true, createdAt: true } });
  const content = pickContent(await contentPool(db), recent.map((r) => ({ ref: r.sourceRef, at: r.createdAt })), day);
  if (!content) return { skipped: "no content" };
  const captions = await writeCaptions(d.provider, content, db, now);
  const token = openSecret(conn.pageTokenEnc, key);
  const version = d.env.META_GRAPH_VERSION || DEFAULT_GRAPH_VERSION;
  const f = d.fetch ?? fetch;
  const posted: Array<{ platform: SocialPlatform; ok: boolean; id?: string; error?: string }> = [];
  for (const platform of platforms) {
    const imageUrl = platform === "facebook" ? content.imageUrl : content.igImageUrl;
    const videoUrl = platform === "facebook" ? content.videoUrl : content.videoUrl ?? content.igVideoUrl;
    // Claim first: the unique (day, platform) makes a second claim (restart, overlapping tick) throw instead of posting.
    let rowId: string;
    try {
      const row = await db.klySocialPost.create({ data: { day, platform, sourceKind: content.kind, sourceRef: content.ref, caption: captions[platform], imageUrl: videoUrl ?? imageUrl } });
      rowId = row.id;
    } catch {
      continue;
    }
    try {
      const signal = AbortSignal.timeout(videoUrl ? 240_000 : 60_000);
      const id = platform === "facebook"
        ? await publishFacebook({ f, version, pageId: conn.pageId, token, imageUrl, videoUrl, caption: captions.facebook, signal })
        : await publishInstagram({ f, version, igUserId: conn.igUserId ?? "", token, imageUrl, videoUrl, caption: captions.instagram, signal });
      await db.klySocialPost.update({ where: { id: rowId }, data: { status: "posted", postId: id } });
      posted.push({ platform, ok: true, id });
    } catch (e) {
      const error = errMsg(e).slice(0, 500);
      await db.klySocialPost.update({ where: { id: rowId }, data: { status: "failed", error } });
      posted.push({ platform, ok: false, error });
    }
  }
  return { posted };
}
