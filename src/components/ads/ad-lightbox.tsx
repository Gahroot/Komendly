"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Ratio } from "@/lib/ads/contracts";
import type { AdView } from "@/lib/ads/run-types";
import { AdMedia } from "./ad-media";
import { AwarenessBadge } from "./awareness-badge";

/** Full-size view of one ad, with ratio tabs when it has several. */
export function AdLightbox({ ad, initialRatio, open, onOpenChange }: { ad: AdView; initialRatio: Ratio; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [ratio, setRatio] = useState<Ratio>(initialRatio);
  const images = ad.assets.filter((a) => a.mime.startsWith("image/"));
  const isMotion = ad.kind === "motion";
  const asset = isMotion ? ad.assets.find((a) => a.mime.startsWith("video/")) : (images.find((a) => a.ratio === ratio) ?? images[0]);
  const ratios = [...new Set(images.map((a) => a.ratio))];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[95dvh] overflow-y-auto rounded-3xl sm:max-w-2xl">
        <DialogTitle className="pr-6 leading-snug">{ad.headline}</DialogTitle>
        <DialogDescription>{ad.angle}</DialogDescription>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <AwarenessBadge level={ad.awareness} />
          {!isMotion && ratios.length > 1 && (
            <Tabs value={ratio} onValueChange={(v) => setRatio(v as Ratio)}>
              <TabsList>{ratios.map((r) => <TabsTrigger key={r} value={r}>{r}</TabsTrigger>)}</TabsList>
            </Tabs>
          )}
        </div>
        {asset && (
          <div className="mx-auto w-full" style={{ maxWidth: `calc(58dvh * ${asset.width} / ${asset.height})` }}>
            <AdMedia asset={asset} poster={images[0]?.previewUrl} alt={ad.headline} className="rounded-xl border" />
          </div>
        )}
        {asset && (
          <Button asChild>
            <a href={asset.downloadUrl} download><Download /> Download {isMotion ? "MP4" : asset.ratio}</a>
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
