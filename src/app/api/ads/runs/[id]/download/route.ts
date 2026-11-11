import { downloadZip } from "client-zip";
import { prisma } from "@/lib/prisma";
import { trackAdsEvent } from "@/lib/ads/events";
import { domainOf } from "@/lib/ads/run";
import { adTextFile } from "@/lib/ads/launch-guide";
import { exportableAssets } from "@/lib/ads/bonus-access";
import { isBonusUnlocked } from "@/lib/ads/bonus-unlock";
import { assertCanDownload } from "@/lib/ads/download-gate-server";
import { extensionForMime, getObjectStream } from "@/lib/ads/storage";
import { adsErrorResponse, AdsHttpError, requireWorkspaceMember } from "@/lib/ads/workspace";

/** "Download all": streams every ready asset of the run as one ZIP. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user, workspace } = await requireWorkspaceMember({ runId: id });
    const run = await prisma.adRun.findFirstOrThrow({
      where: { id, workspaceId: workspace.id },
      include: { ads: { where: { status: "ready" }, orderBy: { index: "asc" }, include: { assets: true } } },
    });
    assertCanDownload(user, workspace, run);
    const unlocked = await isBonusUnlocked(workspace);
    // Locked trial bonus ads and their preview posters never leave the server in an export.
    const perAd = run.ads.map((ad) => ({
      ad,
      files: exportableAssets(ad, unlocked).map((asset) => ({
        key: asset.storageKey,
        name: `ad-${String(ad.index + 1).padStart(2, "0")}-${ad.awareness}-${asset.ratio.replace(":", "x")}.${extensionForMime(asset.mime)}`,
      })),
    }));
    const files = perAd.flatMap((p) => p.files);
    if (files.length === 0) throw new AdsHttpError(404, "no_assets", "No finished ads to download yet.");
    const signal = request.signal;
    async function* entries() {
      const brand = (run.extraction as { brandName?: string } | null)?.brandName ?? domainOf(run.url);
      yield { name: "ad-text.txt", input: adTextFile(brand, perAd.map((p) => ({ files: p.files.map((f) => f.name), headline: p.ad.headline, body: p.ad.body, cta: p.ad.cta }))) };
      for (const file of files) yield { name: file.name, input: await getObjectStream(file.key, signal) };
    }
    await trackAdsEvent("export_downloaded", { workspaceId: workspace.id, userId: user.id, runId: id, props: { kind: "zip", files: files.length } });
    const zip = downloadZip(entries());
    return new Response(zip.body, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${domainOf(run.url).replace(/[^a-z0-9.-]/g, "-")}-ads.zip"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return adsErrorResponse(error);
  }
}
