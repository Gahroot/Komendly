// Server side of the ads -> Studio bridge: flag, S3 copy, per-workspace bridge data (for /ads/app).
import { CopyObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { prisma } from "@/lib/prisma";
import { parseBonus } from "@/lib/ads/bonus-access";
import { parseExtraction } from "@/lib/ads/run-confirm";
import { domainOf, pickBridgeAd, STUDIO_BRIDGE_FLAG } from "./bridge";

/** Kill switch: AdsFeatureFlag studio_bridge. Default OFF when the row is missing. */
export async function studioBridgeEnabled(): Promise<boolean> {
  const flag = await prisma.adsFeatureFlag.findUnique({ where: { key: STUDIO_BRIDGE_FLAG } }).catch(() => null);
  return flag?.enabled === true;
}

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env ${name}`);
  return value;
}

/** Server-side copy inside the shared bucket (AdAsset -> StudioUpload key). */
export async function copyObject(fromKey: string, toKey: string, contentType: string, signal?: AbortSignal): Promise<void> {
  const client = new S3Client({
    endpoint: env("S3_ENDPOINT"),
    region: process.env.S3_REGION || "auto",
    forcePathStyle: process.env.S3_URL_STYLE === "path",
    credentials: { accessKeyId: env("S3_ACCESS_KEY_ID"), secretAccessKey: env("S3_SECRET_ACCESS_KEY") },
  });
  const bucket = env("S3_BUCKET");
  await client.send(
    new CopyObjectCommand({ Bucket: bucket, Key: toKey, CopySource: `${bucket}/${fromKey.split("/").map(encodeURIComponent).join("/")}`, ContentType: contentType, MetadataDirective: "REPLACE" }),
    { abortSignal: signal },
  );
}

export interface WorkspaceBridge {
  runId: string;
  domain: string;
  bestAdId: string | null;
  hasLogo: boolean;
  freeVideosLeft: number;
}

/** Bridge data for a workspace's latest completed trial run; null when the flag is off or there is none. */
export async function bridgeForWorkspace(workspaceId: string, freeVideosLeft: number): Promise<WorkspaceBridge | null> {
  if (!(await studioBridgeEnabled())) return null;
  const run = await prisma.adRun.findFirst({
    where: { workspaceId, isTrial: true, status: { in: ["completed", "partial"] } },
    orderBy: { completedAt: "desc" },
    include: { ads: { select: { id: true, index: true, kind: true, status: true, visualBrief: true } }, brandProfile: { select: { logoKey: true } } },
  });
  if (!run) return null;
  const ads = run.ads.map((a) => ({ id: a.id, index: a.index, kind: a.kind, status: a.status, ...(parseBonus(a.visualBrief) ? { bonusKind: "bonus", locked: true } : {}) }));
  const best = pickBridgeAd(ads);
  if (!best) return null;
  const extraction = parseExtraction(run.extraction);
  return { runId: run.id, domain: extraction?.domain ?? domainOf(run.url), bestAdId: best.id, hasLogo: Boolean(extraction?.logoKey || run.brandProfile?.logoKey), freeVideosLeft };
}
