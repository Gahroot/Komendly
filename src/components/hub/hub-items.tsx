import Link from "next/link";
import { ImageIcon, Loader2, PlayCircle, AlertTriangle } from "lucide-react";
import { HUB_APP_LABEL, type HubItem } from "@/lib/hub/summary";

/** One made thing (ad, Studio video, testimonial) as a tile. Thumbnails are plain <img>: they are signed/vendor URLs. */
export function HubItemTile({ item }: { item: HubItem }) {
  return (
    <Link href={item.href} className="group block min-w-0 overflow-hidden rounded-2xl border border-border bg-[oklch(0.16_0.06_290/0.6)] transition-colors hover:border-[var(--studio-gold)]/50">
      <div className="relative aspect-[4/5] bg-[oklch(0.12_0.05_290)]">
        {item.thumbUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.thumbUrl} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-muted-foreground">
            {item.status === "working" ? <Loader2 aria-hidden className="size-6 animate-spin" /> : item.status === "failed" ? <AlertTriangle aria-hidden className="size-6" /> : item.media === "video" ? <PlayCircle aria-hidden className="size-7" /> : <ImageIcon aria-hidden className="size-6" />}
          </span>
        )}
        {item.media === "video" && item.thumbUrl ? <PlayCircle aria-hidden className="absolute bottom-2 right-2 size-6 text-white drop-shadow" /> : null}
        <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white">{HUB_APP_LABEL[item.app]}</span>
      </div>
      <div className="p-2.5">
        <p className="truncate text-sm font-medium">{item.title}</p>
        <p className="text-xs text-muted-foreground">
          {item.status === "working" ? "Being made" : item.status === "failed" ? "Didn't finish" : new Date(item.createdAt).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
        </p>
      </div>
    </Link>
  );
}
