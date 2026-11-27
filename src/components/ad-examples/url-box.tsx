// Plain GET form into the free ads flow (/free-ads prefills ?url=). Works without JS; UTM = growth system attribution.
import { ArrowRight } from "lucide-react";
import { FREE_TRIAL_ADS } from "@/lib/ads/bonus-access";

export function MakeYoursUrlBox({ href, label = "Make my free ads", id = "mk-url" }: { href: string; label?: string; id?: string }) {
  const u = new URL(href, "https://www.komendly.com");
  return (
    <form action={u.pathname} method="get" className="mx-auto flex w-full max-w-xl flex-col gap-2 sm:flex-row">
      {[...u.searchParams.entries()].map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <label htmlFor={id} className="sr-only">Your website</label>
      <input id={id} name="url" type="text" inputMode="url" autoComplete="url" placeholder="yourbusiness.com" required className="h-12 flex-1 rounded-xl border border-border bg-white/5 px-4 text-base outline-none focus:border-[var(--studio-gold)]" />
      <button type="submit" className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[var(--studio-gold)] px-6 font-semibold text-[#2a0f10] transition hover:brightness-105">
        {label} <ArrowRight className="size-4" aria-hidden />
      </button>
    </form>
  );
}

/** Free-pack box for the top of an example page, right under the intro. `note` explains what the free pack is. */
export function HeroFreePack({ href, note }: { href: string; note?: React.ReactNode }) {
  return (
    <div className="mx-auto mt-7 w-full max-w-xl" role="group" aria-label="Free ads from your website">
      <p className="font-display text-xl font-medium tracking-[-0.01em] sm:text-2xl">Paste your website. Get {FREE_TRIAL_ADS} ads. Free.</p>
      <div className="mt-3"><MakeYoursUrlBox id="mk-url-hero" href={href} /></div>
      <p className="mt-2 text-xs text-muted-foreground">{note ?? "No card. Ozzy, Komendly's AI ad maker, makes Facebook & Instagram ads from your own site. You post them yourself."}</p>
    </div>
  );
}
