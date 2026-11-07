"use client";

import { useState } from "react";
import { Ozzy } from "@/components/ozzy/Ozzy";
import { ozzy, useOzzyState } from "@/components/ozzy/store";
import { OZZY_EXPRESSIONS, OZZY_FORMS, type OzzyEvent, type OzzyForm, type OzzyExpression } from "@/components/ozzy/types";

const FORM_FACE: Record<OzzyForm, OzzyExpression> = {
  classic: "neutral",
  joyful: "happy",
  explorer: "focused",
  creator: "focused",
  adventurer: "neutral",
  developer: "excited",
  chill: "sleepy",
  ascended: "excited",
};

const EVENTS: OzzyEvent[] = [
  { type: "page:landing" },
  { type: "cta:hover" },
  { type: "url:focus" },
  { type: "url:typing", length: 18 },
  { type: "url:valid" },
  { type: "url:invalid" },
  { type: "url:submit" },
  { type: "goal:select" },
  { type: "auth:signup-gate" },
  { type: "analysis:start" },
  { type: "review:shown" },
  { type: "review:editing" },
  { type: "review:confirmed" },
  { type: "generation:start", total: 4 },
  { type: "generation:ad-ready", ready: 2, total: 4 },
  { type: "generation:ad-failed" },
  { type: "generation:done" },
  { type: "run:partial" },
  { type: "edit:start" },
  { type: "error", kind: "network" },
  { type: "recovery:retry" },
  { type: "upsell:shown" },
  { type: "idle" },
  { type: "user:return" },
  { type: "poke" },
];

const isForm = (v: string | undefined): v is OzzyForm => OZZY_FORMS.some((f) => f === v);
const isExpr = (v: string | undefined): v is OzzyExpression => OZZY_EXPRESSIONS.some((e) => e === v);

export function OzzyLabClient({ form, expr }: { form?: string; expr?: string }) {
  const pinForm = isForm(form) ? form : undefined;
  const pinPose = pinForm ? { form: pinForm, expression: isExpr(expr) ? expr : FORM_FACE[pinForm] } : undefined;
  const [reduced, setReduced] = useState(false);
  const s = useOzzyState();

  return (
    <main className="min-h-screen bg-[#0c0820] p-8 text-[#fff1d6]">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Ozzy Lab</h1>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={reduced} onChange={(e) => setReduced(e.target.checked)} />
          Reduced motion
        </label>
      </header>

      <section aria-label="Forms" className="mb-10">
        <h2 className="mb-3 text-sm uppercase tracking-widest text-[#a970ff]">Forms</h2>
        <div className="flex flex-wrap gap-4">
          {OZZY_FORMS.map((f, i) => (
            <figure key={f} className="flex flex-col items-center rounded-xl bg-[#140d33] p-2">
              <Ozzy size={160} pose={{ form: f, expression: FORM_FACE[f] }} reducedMotion={reduced} seed={i + 1} />
              <figcaption className="text-xs">{f}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section aria-label="Expressions" className="mb-10">
        <h2 className="mb-3 text-sm uppercase tracking-widest text-[#a970ff]">Expressions</h2>
        <div className="flex flex-wrap gap-3">
          {OZZY_EXPRESSIONS.map((e, i) => (
            <figure key={e} className="flex flex-col items-center rounded-xl bg-[#140d33] p-2">
              <Ozzy size={112} pose={{ form: "classic", expression: e }} reducedMotion={reduced} seed={20 + i} />
              <figcaption className="text-xs">{e}</figcaption>
            </figure>
          ))}
          <figure className="flex flex-col items-center rounded-xl bg-[#140d33] p-2">
            <Ozzy size={64} pose={{ form: "classic", expression: "happy" }} reducedMotion={reduced} />
            <figcaption className="text-xs">64px</figcaption>
          </figure>
        </div>
      </section>

      <section aria-label="Live" className="grid gap-8 md:grid-cols-[auto_1fr]">
        <div className="flex flex-col items-center pt-16">
          <Ozzy size={320} interactive reducedMotion={reduced} pose={pinPose} />
          <nav aria-label="Pin form" className="mt-2 flex flex-wrap gap-1 font-mono text-[10px]">
            <a href="?" className="underline">live</a>
            {OZZY_FORMS.map((f) => (
              <a key={f} href={`?form=${f}`} className="underline">
                {f}
              </a>
            ))}
          </nav>
          <p className="mt-2 font-mono text-xs text-[#a970ff]">
            {s.form} · {s.expression} · {s.motion}
            {s.progress ? ` · ${s.progress.ready}/${s.progress.total}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap content-start gap-2">
          {EVENTS.map((ev) => (
            <button
              key={ev.type}
              type="button"
              onClick={() => ozzy.emit(ev)}
              className="rounded-md border border-[#7b3cf0] bg-[#1a0f3a] px-3 py-1.5 font-mono text-xs hover:bg-[#2a1a6e]"
            >
              {ev.type}
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}
