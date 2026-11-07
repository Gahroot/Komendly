"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { OzzyLazy } from "@/components/ozzy/OzzyLazy";
import type { OzzyExpression, OzzyForm, OzzyMotion } from "@/components/ozzy/types";
import { STAGE_RAIL } from "@/lib/ads/run-stage";
import { cn } from "@/lib/utils";
import { seeded } from "./pixel-art";

type Stage = { key: "read" | "review" | "build" | "ready"; ms: number; title: string; text: string; line: string; form: OzzyForm; expression: OzzyExpression; motion: OzzyMotion };

// A scripted example run (clearly labelled), mirroring the real run's four stages.
const STAGES: Stage[] = [
  { key: "read", ms: 3600, title: "Reads your site", text: "Audience, offer, proof and brand kit, straight from your own pages", line: "Reading tidybooks.app like a strategist…", form: "explorer", expression: "focused", motion: "scan" },
  { key: "review", ms: 3600, title: "Finds their words", text: "The pains and phrases your customers already use, for you to check", line: "Found it. That's exactly how their customers talk", form: "classic", expression: "excited", motion: "nod" },
  { key: "build", ms: 3800, title: "Crafts the ad", text: "Their words become your headline, on brand and in every size", line: "Turning their words into your headline…", form: "creator", expression: "focused", motion: "type" },
  { key: "ready", ms: 4200, title: "Ready to run", text: "10 static ads and an animated one, export-ready in minutes", line: "Ta-da! One down, nine more on the way", form: "joyful", expression: "happy", motion: "celebrate" },
];
const QUOTE = "I became a freelancer to design, not to chase receipts at 11pm.";
const MOSAIC = (() => {
  const r = seeded(5);
  return Array.from({ length: 80 }, () => `${1400 + Math.round(r() * 1100)}ms`);
})();

/** "Ozzy's workshop": a short looping demo of how a run turns customer words into an ad. Plays only when visible. */
export function StudioWorkshop() {
  const [i, setI] = useState(0);
  const [hold, setHold] = useState(false);
  const [visible, setVisible] = useState(false);
  const [reduced, setReduced] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      setReduced(mq.matches);
      if (mq.matches) setI(STAGES.length - 1);
    };
    sync();
    mq.addEventListener("change", sync);
    const el = ref.current;
    const io = el ? new IntersectionObserver(([e]) => setVisible(Boolean(e?.isIntersecting)), { threshold: 0.4 }) : null;
    if (el) io?.observe(el);
    return () => {
      mq.removeEventListener("change", sync);
      io?.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!visible || hold || reduced) return;
    const t = window.setTimeout(() => setI((n) => (n + 1) % STAGES.length), STAGES[i].ms);
    return () => window.clearTimeout(t);
  }, [i, visible, hold, reduced]);

  const s = STAGES[i];
  return (
    <div
      ref={ref}
      className="ws pixel-frame relative overflow-hidden bg-[linear-gradient(180deg,#1d1040,#120a28)] shadow-[0_40px_100px_-30px_#000,inset_0_1px_0_#ffffff14]"
      data-stage={s.key}
      onPointerEnter={() => setHold(true)}
      onPointerLeave={() => setHold(false)}
      onFocusCapture={() => setHold(true)}
      onBlurCapture={() => setHold(false)}
    >
      {/* Window bar: same rail as a real run */}
      <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
          <span aria-hidden className="size-2 bg-[var(--studio-gold)]" /> Example run · tidybooks.app
        </p>
        <ol className="flex gap-1.5" aria-label="Run stages">
          {STAGES.map((st, n) => (
            <li key={st.key}>
              <button
                type="button"
                onClick={() => setI(n)}
                aria-current={n === i ? "step" : undefined}
                className={cn("flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors", n === i ? "bg-[var(--studio-gold)] text-[#2a0f10]" : n < i ? "text-foreground hover:bg-accent" : "text-muted-foreground hover:bg-accent")}
              >
                {STAGE_RAIL[n]}
              </button>
            </li>
          ))}
        </ol>
      </div>

      <div className="grid items-center gap-6 px-4 py-8 sm:px-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] md:py-12">
        {/* Ozzy at his bench, telling you what stage he's on */}
        <div className="flex flex-col gap-6">
          <div key={s.key} className="studio-rise space-y-2">
            <p className="font-mono text-xs text-[var(--studio-gold)]">0{i + 1} / 04</p>
            <h3 className="font-display text-3xl font-medium tracking-[-0.015em] sm:text-4xl">{s.title}</h3>
            <p className="max-w-sm text-base text-muted-foreground sm:text-[17px]">{s.text}</p>
          </div>
          <div className="flex items-end gap-2">
            <div className="relative shrink-0">
              <OzzyLazy size={168} perch="ground" speech={false} pose={{ form: s.form, expression: s.expression, motion: s.motion }} />
              <div aria-hidden className="ws-bench" />
            </div>
            <p key={s.key} className="ozzy-say relative mb-[96px] max-w-[13rem] rounded-xl border-2 border-[#1a0f3a] bg-[#fff1d6] px-3 py-2 text-sm font-semibold leading-snug text-[#2a1a6e] shadow-[0_3px_0_#1a0f3a]">
              {s.line}
            </p>
          </div>
        </div>

        {/* What he's crafting */}
        <div className="relative mx-auto aspect-[4/5] w-full max-w-[340px]" aria-hidden>
          {/* READ: the site, being scanned */}
          <div className="ws-layer ws-read">
            <div className="h-full overflow-hidden rounded-xl border border-border bg-[#f6f4ef] text-[#14322b]">
              <div className="flex items-center gap-1.5 border-b border-black/10 bg-white/70 px-3 py-2 text-[11px] text-black/50"><i className="size-2 rounded-full bg-black/15" /><i className="size-2 rounded-full bg-black/15" /><span className="ml-2 rounded bg-black/5 px-2 py-0.5">tidybooks.app</span></div>
              <div className="space-y-3 p-5">
                <p className="flex items-center gap-2 text-lg font-bold text-[#0f766e]"><span className="size-5 rounded-md border-[3px] border-[#0f766e]" />tidybooks</p>
                <p className="text-xl font-bold leading-tight">Bookkeeping that sorts itself</p>
                <div className="space-y-1.5">{[90, 75, 82].map((w) => <div key={w} className="h-2 rounded bg-black/10" style={{ width: `${w}%` }} />)}</div>
                <div className="h-20 rounded-lg bg-[#0f766e]/10" />
                <div className="rounded-lg bg-white p-3 text-[12px] leading-snug shadow-sm">★★★★★ “Finally, no more chasing receipts at 11pm.”</div>
              </div>
            </div>
            <div className="ws-scan" />
            <div className="ws-chips absolute -left-6 top-[46%] flex flex-col items-start gap-2">
              {["Who: UK freelancers", "Offer: VAT ready in 10 min", "Brand: teal + cream"].map((c, n) => (
                <span key={c} className="ws-chip" style={{ ["--d" as string]: `${700 + n * 650}ms` }}>{c}</span>
              ))}
            </div>
          </div>

          {/* REVIEW: Ozzy's notes, customer words highlighted */}
          <div className="ws-layer ws-review">
            <div className="flex h-full flex-col justify-center gap-4 rounded-xl border border-border bg-[oklch(0.22_0.075_295/0.9)] p-5">
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--studio-gold)]">Ozzy&apos;s notes</p>
              <div className="space-y-1"><p className="text-xs text-muted-foreground">Audience</p><p className="text-sm">Freelancers who do their own books</p></div>
              <div className="space-y-1"><p className="text-xs text-muted-foreground">Pain</p><p className="text-sm">Late nights matching receipts</p></div>
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">In their words</p>
                <p className="font-display text-xl leading-snug"><mark className="ws-mark">“{QUOTE}”</mark></p>
              </div>
            </div>
          </div>

          {/* BUILD + READY: the ad assembles from pixels, the quote lands as the headline */}
          <div className="ws-layer ws-ad">
            <div className="ws-fan ws-fan--a"><Image src="/ads/samples/tidybooks-ad-1-1x1.jpg" alt="" width={300} height={300} className="rounded-lg" /></div>
            <div className="ws-fan ws-fan--b"><Image src="/ads/samples/plausible-ad-1-4x5.jpg" alt="" width={240} height={300} className="rounded-lg" /></div>
            <div className="relative h-full overflow-hidden rounded-xl border border-border shadow-[0_30px_60px_-20px_#000]">
              <Image src="/ads/samples/tidybooks-ad-0-4x5.jpg" alt="" fill sizes="340px" className="object-cover" />
              <div className="ws-mosaic">{MOSAIC.map((d, n) => <i key={n} style={{ animationDelay: d }} />)}</div>
              <p className="ws-quote font-display">“{QUOTE}”</p>
            </div>
            <span className="ws-badge">Ready · 1:1, 4:5, 9:16</span>
          </div>
        </div>
      </div>
      <p className="sr-only">Example: Ozzy reads tidybooks.app, notes the audience, pain and a customer phrase, then builds an ad whose headline uses that phrase.</p>
    </div>
  );
}
