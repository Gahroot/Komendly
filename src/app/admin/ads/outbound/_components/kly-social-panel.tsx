/* eslint-disable @next/next/no-img-element -- our own public images (Ozzy art, samples, consented ads) */
import { Facebook, Instagram, Link2, Sparkles } from "lucide-react";
import { OzzyLazy } from "@/components/ozzy/OzzyLazy";
import type { loadSocialPanel } from "@/lib/kly/social-connect";
import { cn } from "@/lib/utils";
import { InputActionForm } from "../../_components/input-action-form";
import { PostActionButton } from "../../_components/post-action-button";

const API = "/api/admin/ads/social";
const KIND: Record<string, string> = { showcase: "Ad of the week (consented)", example: "Ozzy's sample", tip: "Ozzy's tip" };

type Data = Awaited<ReturnType<typeof loadSocialPanel>>;

/** Ozzy's daily organic post to Komendly's own Facebook Page + Instagram. Off by default. */
export function KlySocialPanel({ d, notice }: { d: Data; notice?: string }) {
  const c = d.connection;
  const live = d.enabled && Boolean(c);
  const say = !c ? "Connect our Page and I'll share one helpful post a day. Promise I won't spam, mate." : live ? `Posting daily from ${d.hourEt}:00 ET. Only our own ads, tips and ads folks said yes to.` : "Page's connected. Flick me on when you're ready.";
  return (
    <section className="relative overflow-hidden rounded-3xl border border-[var(--studio-gold)]/15 bg-[oklch(0.2_0.07_295/0.62)] p-5 shadow-[inset_0_1px_0_#ffffff12,0_24px_60px_-24px_#000c] sm:p-6">
      <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full bg-[var(--studio-gold)]/10 blur-3xl" />
      <div className="relative flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--studio-gold)]/80">Ozzy&apos;s daily post</p>
          <h2 className="font-display mt-1 text-xl font-medium tracking-[-0.015em] sm:text-2xl">{live ? "Ozzy is posting once a day" : "Daily posting is switched off"}</h2>
          <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className={cn("inline-flex items-center gap-1.5 rounded-full border border-border bg-black/20 px-2.5 py-0.5", c && "text-emerald-300")}><Facebook className="size-3.5" />{c ? c.pageName : "No Page"}</span>
            <span className={cn("inline-flex items-center gap-1.5 rounded-full border border-border bg-black/20 px-2.5 py-0.5", c?.igUsername && "text-emerald-300")}><Instagram className="size-3.5" />{c?.igUsername ? `@${c.igUsername}` : "No Instagram linked"}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a href={`${API}/connect`} className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--studio-gold)] px-3 py-1.5 text-sm font-semibold text-[#2a0f10] shadow-[inset_0_-2px_0_#c98a1a]"><Link2 className="size-4" />{c ? "Reconnect Page" : "Connect Komendly Page"}</a>
          {c && <PostActionButton url={API} body={{ action: "enable", enabled: !d.enabled }} label={d.enabled ? "Switch off" : "Switch on"} variant={d.enabled ? "outline" : "default"} confirm={d.enabled ? undefined : { title: "Let Ozzy post daily?", description: `One post a day on ${c.pageName}${c.igUsername ? ` and @${c.igUsername}` : ""}, from ${d.hourEt}:00 ET.` }} />}
          {c && <PostActionButton url={API} body={{ action: "disconnect" }} label="Disconnect" variant="ghost" confirm={{ title: "Disconnect the Page?", description: "Ozzy stops posting and forgets the Page token." }} />}
        </div>
      </div>
      {notice && <p role="status" className="relative mt-3 rounded-xl border border-border bg-black/20 px-3 py-2 text-sm">{notice === "connected" ? "Page connected. G'day, socials!" : notice}</p>}
      <div className="relative mt-4 flex items-end gap-2">
        <OzzyLazy size={64} speech={false} pose={{ form: "classic", expression: live ? "happy" : "neutral", motion: live ? "wave" : "idle" }} />
        <p className="ozzy-say relative mb-8 max-w-md rounded-xl border-2 border-[#1a0f3a] bg-[#fff1d6] px-3 py-1.5 text-[13px] font-semibold leading-snug text-[#2a1a6e] shadow-[0_3px_0_#1a0f3a]">{say}</p>
      </div>
      <div className="relative mt-3 max-w-xs">
        <InputActionForm url={API} body={{ action: "hour" }} field="hourEt" placeholder={`Posting hour, ET (now ${d.hourEt})`} label="Set hour" variant="outline" required />
      </div>
      <div className="relative mt-5">
        {d.posts.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">No posts yet. Ozzy&apos;s posts land here, one a day.</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {d.posts.map((p) => (
              <li key={p.id} className="flex gap-3 rounded-2xl border border-border bg-white/[0.02] p-2.5">
                <img src={p.imageUrl} alt="" width={56} height={56} loading="lazy" className="size-14 shrink-0 rounded-xl bg-white/5 object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-xs">
                    {p.platform === "facebook" ? <Facebook className="size-3.5" /> : <Instagram className="size-3.5" />}
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", p.status === "posted" ? "bg-[var(--studio-gold)] text-[#2a0f10]" : p.status === "failed" ? "bg-red-500/15 text-red-300" : "bg-white/10")}>{p.status}</span>
                    <span className="text-muted-foreground">{p.day}</span>
                    <Sparkles className="size-3 text-[var(--studio-cyan)]" aria-hidden /><span className="truncate text-muted-foreground">{KIND[p.sourceKind] ?? p.sourceKind}</span>
                  </p>
                  <p className="mt-1 line-clamp-2 text-xs leading-snug">{p.caption}</p>
                  {p.error && <p className="mt-0.5 truncate text-[11px] text-red-300" title={p.error}>{p.error}</p>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
