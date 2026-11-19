import type { ReactNode } from "react";
import { fraunces } from "@/components/studio/fonts";
import { StudioFooter } from "@/components/studio/studio-footer";
import { StudioNav } from "@/components/studio/studio-nav";
import { StudioRoot } from "@/components/studio/studio-spell";
import { MCP_TOOLS } from "@/lib/integrations";
import "@/components/studio/studio.css";

export const H2 = "font-display text-3xl font-medium tracking-[-0.02em] sm:text-5xl";
export const LINK = "text-[var(--studio-gold)] underline-offset-4 hover:underline";

export function Shell({ jsonLd, children }: { jsonLd: string; children: ReactNode }) {
  return (
    <StudioRoot className={`${fraunces.variable} min-h-screen bg-[#0c0820]`}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      <StudioNav signedIn={false} />
      <main>{children}</main>
      <StudioFooter />
    </StudioRoot>
  );
}

export function Hero({ kicker, title, also, intro, cta }: { kicker: string; title: string; also?: string; intro: ReactNode; cta: ReactNode }) {
  return (
    <section className="mx-auto max-w-3xl px-4 pt-8 text-center sm:px-6 sm:pt-14">
      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--studio-gold)]">{kicker}</p>
      <h1 className="font-display mt-3 text-balance text-[2.3rem] font-medium leading-[1.05] tracking-[-0.025em] sm:text-6xl">{title}</h1>
      {also && <p className="mt-3 text-sm text-muted-foreground">{also}</p>}
      <div className="mx-auto mt-5 max-w-2xl text-pretty text-base text-muted-foreground sm:text-lg">{intro}</div>
      <div className="mt-8 flex justify-center">{cta}</div>
    </section>
  );
}

export function Section({ id, title, children, narrow }: { id: string; title: string; children: ReactNode; narrow?: boolean }) {
  return (
    <section className={`mx-auto ${narrow ? "max-w-3xl" : "max-w-6xl"} px-4 py-14 sm:px-6`} aria-labelledby={id}>
      <h2 id={id} className={H2}>{title}</h2>
      {children}
    </section>
  );
}

export function Steps({ steps }: { steps: { title: string; body: ReactNode; code?: string }[] }) {
  return (
    <ol className="mt-8 space-y-6">
      {steps.map((s, i) => (
        <li key={s.title}>
          <h3 className="font-medium"><span className="text-[var(--studio-gold)]">{i + 1}.</span> {s.title}</h3>
          <div className="mt-2 text-sm text-muted-foreground">{s.body}</div>
          {s.code && <pre className="mt-3 overflow-x-auto whitespace-pre rounded-md bg-black/40 p-3 font-mono text-xs text-foreground"><code>{s.code}</code></pre>}
        </li>
      ))}
    </ol>
  );
}

export function Prompts({ prompts }: { prompts: string[] }) {
  return (
    <ul className="mt-6 space-y-3">
      {prompts.map((p) => (
        <li key={p} className="rounded-xl border border-border bg-[oklch(0.2_0.07_295/0.5)] px-4 py-3 text-sm text-foreground">“{p}”</li>
      ))}
    </ul>
  );
}

export function Cards({ items }: { items: { title: string; line: string }[] }) {
  return (
    <ul className="mt-8 grid gap-4 sm:grid-cols-2">
      {items.map((c) => (
        <li key={c.title} className="studio-frame rounded-xl p-5">
          <h3 className="font-medium text-foreground">{c.title}</h3>
          <p className="mt-2 text-sm text-muted-foreground">{c.line}</p>
        </li>
      ))}
    </ul>
  );
}

export function ToolList({ only }: { only?: string[] }) {
  const tools = only ? MCP_TOOLS.filter((t) => only.some((o) => t.name.includes(o))) : MCP_TOOLS;
  return (
    <ul className="mt-6 divide-y divide-border rounded-2xl border border-border">
      {tools.map((t) => (
        <li key={t.name} className="px-5 py-3 text-sm">
          <code className="font-mono text-[var(--studio-gold)]">{t.name}</code>
          <span className="text-muted-foreground"> · {t.line}</span>
        </li>
      ))}
    </ul>
  );
}

export function Faq({ items }: { items: { q: string; a: string }[] }) {
  return (
    <section className="mx-auto max-w-3xl px-4 py-14 sm:px-6" aria-labelledby="faq-title">
      <h2 id="faq-title" className="font-display text-3xl font-medium tracking-[-0.02em]">Questions</h2>
      <div className="mt-6 divide-y divide-border rounded-2xl border border-border bg-[oklch(0.2_0.07_295/0.5)]">
        {items.map((f) => (
          <details key={f.q} className="group px-5 py-4">
            <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-4 font-medium [&::-webkit-details-marker]:hidden">
              {f.q}
              <span aria-hidden className="text-[var(--studio-gold)] transition-transform group-open:rotate-45">+</span>
            </summary>
            <p className="mt-2 text-sm text-muted-foreground">{f.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

export function FinalCta({ title, line, cta }: { title: string; line: string; cta: ReactNode }) {
  return (
    <section className="mx-auto max-w-3xl px-4 pb-16 pt-8 text-center sm:px-6">
      <h2 className="font-display text-3xl font-medium tracking-[-0.02em] sm:text-4xl">{title}</h2>
      <p className="mt-3 text-muted-foreground">{line}</p>
      <div className="mt-6 flex justify-center">{cta}</div>
    </section>
  );
}
