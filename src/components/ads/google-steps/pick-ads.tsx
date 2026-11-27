"use client";

import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { youtubeId } from "./logic";

export function PickAdsStep({
  previews, selected, onChange, youtubeUrl, onYoutubeUrl,
}: {
  previews: Array<{ adId: string; previewUrl: string }>;
  selected: string[];
  onChange: (ids: string[]) => void;
  youtubeUrl: string;
  onYoutubeUrl: (v: string) => void;
}) {
  const all = previews.map((p) => p.adId);
  const allOn = all.length > 0 && all.every((id) => selected.includes(id));
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  const badLink = youtubeUrl.trim() !== "" && !youtubeId(youtubeUrl);
  return (
    <div className="space-y-4 text-sm">
      <p className="text-muted-foreground">Your text ad for Google search is always made. Pick the images to also show on YouTube, Gmail and Discover.</p>
      {previews.length > 0 ? (
        <>
          <div className="flex items-center justify-between gap-2">
            <p className="text-muted-foreground">{selected.length} of {previews.length} picked</p>
            <Button variant="outline" size="sm" onClick={() => onChange(allOn ? [] : all)}>{allOn ? "Clear" : "Select all"}</Button>
          </div>
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {previews.map((p, i) => {
              const on = selected.includes(p.adId);
              return (
                <li key={p.adId}>
                  <label className={`relative block cursor-pointer overflow-hidden rounded-md border-2 ${on ? "border-primary" : "border-border"}`}>
                    <input type="checkbox" className="peer sr-only" checked={on} onChange={() => toggle(p.adId)} aria-label={`Image ${i + 1}`} />
                    <img src={p.previewUrl} alt="" loading="lazy" className="aspect-square w-full bg-muted object-cover" />
                    <span className={`absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded-full border-2 border-background shadow peer-focus-visible:ring-2 peer-focus-visible:ring-ring ${on ? "bg-primary text-primary-foreground" : "bg-background/80"}`}>
                      {on && <Check className="size-4" />}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <p className="rounded-md bg-muted/50 px-3 py-2 text-muted-foreground">No images are ready for Google in this pack. Your text ad still works on its own.</p>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="google-youtube">Video (optional): YouTube link</Label>
        <Input id="google-youtube" type="url" inputMode="url" placeholder="https://youtube.com/watch?v=..." value={youtubeUrl}
          onChange={(e) => onYoutubeUrl(e.target.value)} aria-invalid={badLink} aria-describedby="google-youtube-help" />
        <p id="google-youtube-help" className={`text-xs ${badLink ? "text-destructive" : "text-muted-foreground"}`}>
          {badLink ? "That doesn't look like a YouTube link." : "Google only runs videos that are on YouTube. Upload yours there first, then paste the link."}
        </p>
      </div>
    </div>
  );
}
