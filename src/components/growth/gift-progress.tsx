"use client";
/* eslint-disable @next/next/no-img-element -- token-checked streamed ad images */

import { useSyncExternalStore } from "react";
import Image from "next/image";
import Link from "next/link";
import useSWR from "swr";
import { ArrowLeft, Eye, ExternalLink } from "lucide-react";
import { adsFetcher } from "@/lib/ads/run-client";
import { giftMessage, postGiftShared, type GiftView } from "@/lib/ads/gift-client";
import { GiftStatusBadge } from "./gift-status";
import { ShareButtons } from "./share-buttons";

const noop = () => () => undefined;

/** Right after creating a gift: polls until Ozzy is done, shows ads as they land, then share buttons. */
export function GiftProgress({ initial }: { initial: GiftView }) {
  const { data } = useSWR<GiftView>(`/api/ads/gifts/${initial.id}`, adsFetcher, {
    fallbackData: initial,
    refreshInterval: (g) => (g && (g.status === "ready" || g.status === "failed") ? 0 : 3000),
  });
  const g = data ?? initial;
  const origin = useSyncExternalStore(noop, () => window.location.origin, () => "");
  const link = `${origin}/gift/${g.token}`;
  const msg = giftMessage(g, link);
  const done = g.status === "ready";
  const slots = Array.from({ length: g.expected }, (_, i) => g.ads[i] ?? null);

  return (
    <div className="space-y-6">
      <Link href="/ads/gifts" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-3.5" /> All gifts</Link>
      <header className="flex items-start gap-4">
        <Image src={done ? "/brand/ozzy-joyful-happy.png" : "/brand/ozzy-creator-focused.png"} alt="" width={80} height={80} unoptimized className="size-16 shrink-0 [image-rendering:pixelated] sm:size-20" />
        <div className="min-w-0 space-y-2">
          <GiftStatusBadge status={g.status} />
          <h1 className="font-display text-balance text-[1.7rem] font-medium leading-tight tracking-[-0.02em] sm:text-4xl">
            {done ? `${g.businessName}'s 3 ads are ready` : g.status === "failed" ? "Ozzy couldn't finish this one" : `Ozzy is making 3 ads for ${g.businessName}`}
          </h1>
          <p className="text-sm text-muted-foreground">
            {done ? "Send them the link. They see the ads with your name on them, and can get their own free pack."
              : g.status === "failed" ? "Their website didn't give Ozzy enough to work with. This gift doesn't count toward your allowance."
              : "Usually 2 to 5 minutes. You can send the link now: the page fills in as each ad lands."}
          </p>
        </div>
      </header>

      <div className="grid grid-cols-3 gap-2.5 sm:gap-4">
        {slots.map((ad, i) => (
          <div key={ad?.id ?? `slot-${i}`} className="studio-frame aspect-square overflow-hidden rounded-xl p-1 sm:rounded-2xl sm:p-1.5">
            {ad ? (
              <img src={ad.imageUrl} alt={ad.headline} className="size-full rounded-lg object-cover" />
            ) : (
              <div className="flex size-full items-center justify-center rounded-lg bg-gradient-to-br from-white/[0.06] to-white/[0.02]">
                <span className="flex flex-col items-center gap-2 text-[11px] text-muted-foreground sm:text-xs"><span className="size-2 animate-ping rounded-full bg-[var(--studio-gold)]" aria-hidden />{g.status === "failed" ? "—" : "Drawing…"}</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {g.status !== "failed" && (
        <section className="glass space-y-3 rounded-3xl p-5 sm:p-6" aria-labelledby="send-title">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="send-title" className="text-lg font-semibold">Send it to {g.recipientName ?? g.businessName}</h2>
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><Eye className="size-3.5" aria-hidden />{g.viewCount} {g.viewCount === 1 ? "view" : "views"}</span>
          </div>
          <ShareButtons link={link} text={msg.text} subject={msg.subject} onShare={(c) => postGiftShared(g.id, c)} />
          <a href={`/gift/${g.token}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
            Preview their page <ExternalLink className="size-3.5" aria-hidden />
          </a>
        </section>
      )}
    </div>
  );
}
