"use client";

import Image from "next/image";
import { ShareButtons, type ShareChannel } from "@/components/growth/share-buttons";

/** "Know a business that'd love this?" block on /gift/<token>: share link + a beacon per copy/share. */
export function GiftPassOn({ token, link }: { token: string; link: string }) {
  function beacon(channel: ShareChannel) {
    void fetch(`/api/ads/gift-public/${token}/passed-on`, { method: "POST", keepalive: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channel }) }).catch(() => undefined);
  }
  return (
    <section className="mx-auto mt-14 max-w-xl rounded-3xl border border-[var(--studio-gold)]/25 bg-[var(--studio-gold)]/[0.04] p-6">
      <div className="flex items-end gap-3">
        <Image src="/brand/ozzy-classic-love.png" alt="" width={64} height={64} unoptimized className="size-14 shrink-0 [image-rendering:pixelated]" />
        <p className="ozzy-say relative mb-6 rounded-xl border-2 border-[#1a0f3a] bg-[#fff1d6] px-3 py-1.5 text-[13px] font-semibold leading-snug text-[#2a1a6e] shadow-[0_3px_0_#1a0f3a]">Got a mate with a business? Send them my way. I love a new canvas.</p>
      </div>
      <h2 className="font-display mt-2 text-xl font-medium sm:text-2xl">Know a business that&apos;d love this?</h2>
      <p className="mt-1.5 text-sm text-muted-foreground">Ozzy will make them a free pack too, straight from their website. No card needed.</p>
      <ShareButtons
        className="mt-4"
        link={link}
        subject="Free Facebook & Instagram ads for your business"
        text={`Ozzy the ad wizard makes free Facebook & Instagram ads straight from your website. Thought of you: ${link}`}
        onShare={beacon}
      />
    </section>
  );
}
