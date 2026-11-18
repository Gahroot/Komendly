// Plain GET form into the free ads flow (/free-ads prefills ?url=). Works without JS; UTM = growth system attribution.
import { ArrowRight } from "lucide-react";

export function MakeYoursUrlBox({ href, label = "Make my free ads" }: { href: string; label?: string }) {
  const u = new URL(href, "https://www.komendly.com");
  return (
    <form action={u.pathname} method="get" className="mx-auto flex w-full max-w-xl flex-col gap-2 sm:flex-row">
      {[...u.searchParams.entries()].map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <label htmlFor="mk-url" className="sr-only">Your website</label>
      <input id="mk-url" name="url" type="text" inputMode="url" autoComplete="url" placeholder="yourbusiness.com" required className="h-12 flex-1 rounded-xl border border-border bg-white/5 px-4 text-base outline-none focus:border-[var(--studio-gold)]" />
      <button type="submit" className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[var(--studio-gold)] px-6 font-semibold text-[#2a0f10] transition hover:brightness-105">
        {label} <ArrowRight className="size-4" aria-hidden />
      </button>
    </form>
  );
}
