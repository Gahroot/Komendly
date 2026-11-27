import { downloadZip } from "client-zip";
import { prisma } from "@/lib/prisma";
import { trackAdsEvent } from "@/lib/ads/events";
import { domainOf } from "@/lib/ads/run";
import { adTextFile } from "@/lib/ads/launch-guide";
import { exportableAssets } from "@/lib/ads/bonus-access";
import { isBonusUnlocked, trialLockedIdsForRun } from "@/lib/ads/bonus-unlock";
import { assertCanDownload } from "@/lib/ads/download-gate-server";
import { extensionForMime, getObjectStream } from "@/lib/ads/storage";
import { adsErrorResponse, AdsHttpError, requireWorkspaceMember } from "@/lib/ads/workspace";
import { systemEnabled } from "@/lib/growth/systems";
import { agencyEnabled, isAgencyWorkspace } from "@/lib/customer-intel/agency-server";
import { exportFileName, weekKey } from "@/lib/customer-intel/agency";
import { MADE_WITH_CTA, madeWithCtaUrl, shouldBrand, VIRAL_KEY } from "@/lib/growth/viral-branding";

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
    // Locked trial bonus ads, ads past the free pack limit and preview posters never leave the server in an export.
    const packLocked = await trialLockedIdsForRun(run.id, unlocked);
    // Agencies get client-ready names (<client>_<week>_<nn>-<ratio>.<ext>, never "Komendly"): only when sys_agency_ops is on and the workspace is an agency plan. Everyone else keeps the existing names.
    const agencyNames = (await agencyEnabled().catch(() => false)) && isAgencyWorkspace(workspace);
    const clientName = (run.extraction as { brandName?: string } | null)?.brandName ?? domainOf(run.url);
    const week = weekKey(run.createdAt);
    const perAd = run.ads.filter((ad) => !packLocked.has(ad.id)).map((ad) => ({
      ad,
      files: exportableAssets(ad, unlocked).map((asset) => ({
        key: asset.storageKey,
        name: agencyNames
          ? exportFileName(clientName, week, ad.index + 1, asset.ratio, extensionForMime(asset.mime))
          : `ad-${String(ad.index + 1).padStart(2, "0")}-${ad.awareness}-${asset.ratio.replace(":", "x")}.${extensionForMime(asset.mime)}`,
      })),
    }));
    const files = perAd.flatMap((p) => p.files);
    if (files.length === 0) throw new AdsHttpError(404, "no_assets", "No finished ads to download yet.");
    const signal = request.signal;
    // viral_branding: free downloads carry the share CTA (paid workspaces don't, unless they kept the mark).
    const removeBranding = (await prisma.adsBrandingSetting.findUnique({ where: { workspaceId: workspace.id }, select: { removeBranding: true } }).catch(() => null))?.removeBranding ?? null;
    const madeWith = shouldBrand({ systemOn: await systemEnabled(prisma, VIRAL_KEY), workspace, removeBranding })
      ? `Made with Komendly.\n${MADE_WITH_CTA}: ${madeWithCtaUrl("download", id)}\n`
      : null;
    async function* entries() {
      const brand = (run.extraction as { brandName?: string } | null)?.brandName ?? domainOf(run.url);
      yield { name: "ad-text.txt", input: adTextFile(brand, perAd.map((p) => ({ files: p.files.map((f) => f.name), headline: p.ad.headline, body: p.ad.body, cta: p.ad.cta }))) };
      if (madeWith) yield { name: "made-with-komendly.txt", input: madeWith };
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
