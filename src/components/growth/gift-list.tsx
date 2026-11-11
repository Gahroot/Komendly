"use client";
/* eslint-disable @next/next/no-img-element -- token-checked streamed ad images */

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Check, Copy, Eye, Gift, PartyPopper } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { adsFetcher } from "@/lib/ads/run-client";
import { giftLink, postGiftShared, type GiftListResponse, type GiftView } from "@/lib/ads/gift-client";
import { GiftForm } from "./gift-form";
import { GiftStatusBadge } from "./gift-status";

function CopyLink({ gift }: { gift: GiftView }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(giftLink(gift.token)).catch(() => undefined);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
        postGiftShared(gift.id, "copy");
      }}
      className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-border px-3 text-sm font-medium hover:bg-white/[0.06]"
    >
      {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}{copied ? "Copied" : "Copy link"}
    </button>
  );
}

export function GiftList({ admin = false }: { admin?: boolean }) {
  const { data, error } = useSWR<GiftListResponse>("/api/ads/gifts", adsFetcher, { refreshInterval: 15000 });
  if (error) return <p className="text-sm text-destructive">Couldn&apos;t load your gifts. Refresh to try again.</p>;
  if (!data) return <Skeleton className="h-64 rounded-3xl" />;
  const q = data.quota;
  return (
    <div className="space-y-6">
      <section className="studio-frame rounded-3xl p-5 sm:p-7" aria-labelledby="new-gift">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 id="new-gift" className="flex items-center gap-2 text-lg font-semibold"><Gift className="size-5 text-[var(--studio-gold)]" aria-hidden />Send a gift pack</h2>
          {q.ok && (
            <span className="rounded-full border border-[var(--studio-gold)]/40 bg-[var(--studio-gold)]/10 px-2.5 py-1 text-xs font-medium text-[var(--studio-gold)]">
              {q.source === "admin_outreach" ? "Admin outreach · unlimited" : q.source === "partner_demo" ? `Partner demo · ${q.remaining ?? 0} more this month` : q.source === "paid_monthly" ? `${(q.remaining ?? 0) + 1} left this month` : "1 free gift"}
            </span>
          )}
        </div>
        {!q.ok ? (
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>{q.message}</p>
            {q.perk === "trial" && <Link href="/ads/billing" className="spellbar__cta inline-flex h-11 items-center rounded-xl px-4 font-semibold">See plans</Link>}
          </div>
        ) : !data.emailVerified ? (
          <p className="text-sm text-muted-foreground">Confirm your email first, then you can send a gift pack.</p>
        ) : (
          <GiftForm defaultSender={data.senderName} cta={admin ? "Make outreach pack" : "Make their 3 ads"} />
        )}
      </section>

      <section aria-labelledby="sent-title" className="space-y-3">
        <h2 id="sent-title" className="text-lg font-semibold">Sent</h2>
        {data.gifts.length === 0 ? (
          <p className="rounded-3xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Gifts you send show up here, with how many times they were opened.</p>
        ) : (
          <ul className="space-y-3">
            {data.gifts.map((g) => (
              <li key={g.id} className="glass flex flex-col gap-3 rounded-2xl p-3 sm:flex-row sm:items-center sm:p-4">
                <Link href={`/ads/gifts/${g.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                  <div className="size-14 shrink-0 overflow-hidden rounded-xl bg-white/[0.05]">
                    {g.ads[0] ? <img src={g.ads[0].imageUrl} alt="" className="size-full object-cover" /> : <Gift className="m-4 size-6 text-muted-foreground" aria-hidden />}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-medium">{g.businessName}</p>
                    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span>{g.domain}</span>
                      <span className="inline-flex items-center gap-1"><Eye className="size-3" aria-hidden />{g.viewCount}</span>
                      {g.claimedAt && <span className="inline-flex items-center gap-1 text-[var(--studio-gold)]"><PartyPopper className="size-3" aria-hidden />Claimed</span>}
                    </p>
                  </div>
                </Link>
                <div className="flex items-center gap-2">
                  <GiftStatusBadge status={g.status} />
                  {g.status !== "failed" && <CopyLink gift={g} />}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
