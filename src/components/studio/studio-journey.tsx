import { StudioPose } from "./studio-pose";
import type { OzzyExpression, OzzyForm, OzzyMotion } from "@/components/ozzy/types";

const STEPS: { n: string; title: string; text: string; tone: string; form: OzzyForm; expression: OzzyExpression; motion: OzzyMotion }[] = [
  { n: "01", title: "Paste your website", text: "Ozzy reads it like a strategist: your audience, offer, the pains customers describe and your brand kit.", tone: "var(--studio-cyan)", form: "explorer", expression: "focused", motion: "scan" },
  { n: "02", title: "Check his notes", text: "You get 30 seconds to see exactly what he found. Fix anything that's off, or send him back for another look.", tone: "var(--studio-violet-soft)", form: "classic", expression: "focused", motion: "nod" },
  { n: "03", title: "Get export-ready ads", text: "10 on-brand static ads and an animated ad, each on a different angle. First ad in under 3 minutes.", tone: "var(--studio-gold)", form: "creator", expression: "focused", motion: "type" },
];

/** How it works, as a trail across the night. */
export function StudioJourney() {
  return (
    <section className="relative mx-auto max-w-6xl px-4 py-20 sm:px-6 md:py-28" aria-labelledby="journey-title">
      <div className="max-w-xl space-y-3">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--studio-gold)]">How it works</p>
        <h2 id="journey-title" className="font-display text-4xl font-medium tracking-[-0.02em] sm:text-5xl">From a link to a launch, in three moves.</h2>
      </div>
      <ol className="relative mt-24 grid gap-x-5 gap-y-28 md:grid-cols-3">
        <div aria-hidden className="absolute left-0 right-0 top-[27px] hidden h-px border-t border-dashed border-[oklch(0.88_0.08_70/25%)] md:block" />
        {STEPS.map((s) => (
          <li key={s.n} className="relative">
            <div className="absolute -top-[88px] right-2 md:right-6"><StudioPose form={s.form} expression={s.expression} motion={s.motion} size={96} /></div>
            <span className="relative z-10 flex size-14 items-center justify-center bg-[#1a0f30] font-mono text-sm font-semibold pixel-frame" style={{ color: s.tone, boxShadow: `inset 0 0 0 1px ${s.tone}` }}>
              {s.n}
            </span>
            <h3 className="mt-6 text-lg font-semibold">{s.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
