"use client";

import Image from "next/image";
import useSWR from "swr";
import { adsFetcher } from "@/lib/ads/run-client";
import type { GiftListResponse } from "@/lib/ads/gift-client";
import { GiftForm } from "./gift-form";

/** Results page: "Know an owner who needs ads?" Shown only while the workspace has a gift left. */
export function GiftPackCard() {
  const { data } = useSWR<GiftListResponse>("/api/ads/gifts", adsFetcher);
  if (!data?.quota.ok) return null;
  return (
    <section className="studio-frame relative overflow-hidden rounded-3xl p-5 sm:p-7" aria-labelledby="gift-card-title">
      <div aria-hidden className="pointer-events-none absolute -left-16 -top-20 size-64 rounded-full bg-[var(--studio-gold)]/10 blur-3xl" />
      <div className="relative grid gap-6 md:grid-cols-[1fr_1.15fr] md:items-start">
        <div className="flex items-start gap-4">
          <Image src="/brand/ozzy-joyful-happy.png" alt="" width={80} height={80} unoptimized className="size-16 shrink-0 [image-rendering:pixelated] sm:size-20" />
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--studio-gold)]">{data.quota.source === "paid_monthly" ? "Buy one, give one" : "Gift a pack"}</p>
            <h2 id="gift-card-title" className="font-display mt-1.5 text-balance text-2xl font-medium leading-tight tracking-[-0.02em] sm:text-[1.75rem]">Know an owner who needs ads?</h2>
            <p className="mt-2 text-sm text-muted-foreground sm:text-base">Paste their website and Ozzy makes them 3 free ads, from you. You get a link to send them.</p>
          </div>
        </div>
        {data.emailVerified ? (
          <GiftForm defaultSender={data.senderName} />
        ) : (
          <p className="rounded-2xl border border-border p-4 text-sm text-muted-foreground">Confirm your email first, then you can send a gift pack.</p>
        )}
      </div>
    </section>
  );
}
