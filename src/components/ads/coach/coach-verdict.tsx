"use client";

import type { CoachVerdict } from "@/lib/ads/coach/contracts";

const TAG: Record<CoachVerdict["ads"][number]["verdict"], { label: string; cls: string }> = {
  keep: { label: "Keep", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/40" },
  kill: { label: "Switch off", cls: "bg-rose-500/15 text-rose-400 border-rose-500/40" },
  watch: { label: "Watch", cls: "bg-amber-500/15 text-amber-300 border-amber-500/40" },
};

export function CoachVerdictView({ verdict, action }: { verdict: CoachVerdict; action?: React.ReactNode }) {
  return (
    <div className="space-y-5">
      <div className="rounded-2xl border-2 border-[#1a0f3a] bg-[#fff1d6] p-4 text-[#2a1a6e] shadow-[0_3px_0_#1a0f3a]">
        <p className="text-base font-semibold leading-snug sm:text-lg">{verdict.summary}</p>
        <p className="mt-1 text-xs font-medium opacity-75">
          Ozzy is {verdict.confidence === "high" ? "pretty sure" : verdict.confidence === "medium" ? "fairly sure" : "not sure yet"} about this.
          {!verdict.enoughData && verdict.waitDays ? ` Let your ads run about ${verdict.waitDays} more day${verdict.waitDays === 1 ? "" : "s"}, then check again.` : ""}
        </p>
      </div>

      {verdict.winner ? (
        <section className="rounded-2xl border border-[#f5c542]/50 bg-[#f5c542]/10 p-4">
          <p className="font-mono text-xs font-bold uppercase tracking-wider text-[#f5c542]">Your winner</p>
          <p className="mt-1 text-lg font-semibold">{verdict.winner.name}</p>
          <dl className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
            <div><dt className="inline text-muted-foreground">Idea: </dt><dd className="inline">{verdict.winner.angle}</dd></div>
            <div><dt className="inline text-muted-foreground">Opening: </dt><dd className="inline">{verdict.winner.hook}</dd></div>
            <div className="sm:col-span-2"><dt className="inline text-muted-foreground">Look: </dt><dd className="inline">{verdict.winner.style}</dd></div>
          </dl>
          {action ? <div className="mt-3">{action}</div> : null}
        </section>
      ) : null}

      <section>
        <h3 className="mb-2 text-sm font-semibold">Ad by ad</h3>
        <ul className="divide-y divide-border rounded-2xl border border-border">
          {verdict.ads.map((a) => (
            <li key={a.name} className="flex flex-col gap-1 p-3 sm:flex-row sm:items-center sm:gap-3">
              <span className={`w-fit shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold ${TAG[a.verdict].cls}`}>{TAG[a.verdict].label}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{a.name}</span>
                <span className="block text-sm text-muted-foreground">{a.reason}</span>
              </span>
              <span className="shrink-0 text-sm font-semibold tabular-nums">{a.keyNumber}</span>
            </li>
          ))}
        </ul>
      </section>

      {verdict.actions.length ? (
        <section>
          <h3 className="mb-2 text-sm font-semibold">Do this next</h3>
          <ol className="list-decimal space-y-1 pl-5 text-sm">{verdict.actions.map((x, i) => <li key={i}>{x.text}</li>)}</ol>
        </section>
      ) : null}
    </div>
  );
}
