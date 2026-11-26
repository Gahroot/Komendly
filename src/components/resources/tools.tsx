"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { PLAYBOOKS } from "@/lib/growth/trade-playbooks-data";
import { OFFER_GOALS, discountMath, generateOffers, type OfferGoal } from "@/lib/growth/organic/offers";
import { buildCalendar, calendarCsv, calendarIcs } from "@/lib/growth/organic/calendar";
import { SIZE_PRESETS, cropLoss, fitRect, presetFilename, type FitMode } from "@/lib/growth/organic/sizes";
import { QUIZ_BUDGETS, QUIZ_GOALS, buildPlan, type QuizAnswers } from "@/lib/growth/organic/playbook-quiz";
import { CATEGORY_OPTIONS, buildInspirationIndex, searchInspiration, type InspirationKind } from "@/lib/growth/organic/inspiration";
import type { TradeCategory } from "@/lib/growth/trade-playbooks-data";

const field = "w-full rounded-xl border border-border bg-white/5 px-4 py-3 text-base outline-none focus:border-[var(--studio-gold)]";
const btn = "inline-flex h-11 items-center justify-center rounded-xl bg-[var(--studio-gold)] px-5 font-semibold text-[#2a0f10] transition hover:brightness-105 disabled:opacity-60";
const label = "block text-sm font-medium text-muted-foreground";
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const TRADES = PLAYBOOKS.map((p) => ({ slug: p.slug, name: cap(p.term) })).sort((a, b) => a.name.localeCompare(b.name));

function TradeSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className={label}>Your trade
      <select className={`${field} mt-1`} value={value} onChange={(e) => onChange(e.target.value)}>{TRADES.map((t) => <option key={t.slug} value={t.slug}>{t.name}</option>)}</select>
    </label>
  );
}
function download(name: string, mime: string, data: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([data], { type: mime }));
  a.download = name; a.click(); URL.revokeObjectURL(a.href);
}

export function OfferTool() {
  const [trade, setTrade] = useState("roofers");
  const [goal, setGoal] = useState<OfferGoal>("new-customers");
  const [price, setPrice] = useState("500"); const [cost, setCost] = useState("300"); const [disc, setDisc] = useState("15");
  const ideas = useMemo(() => generateOffers(trade, goal), [trade, goal]);
  const m = discountMath(Number(price), Number(cost), Number(disc));
  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-2">
        <TradeSelect value={trade} onChange={setTrade} />
        <label className={label}>Your goal
          <select className={`${field} mt-1`} value={goal} onChange={(e) => setGoal(e.target.value as OfferGoal)}>{OFFER_GOALS.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}</select>
        </label>
      </div>
      <ul className="space-y-4">
        {ideas.map((o) => (
          <li key={o.id} className="rounded-xl border border-border p-5">
            <p className="font-medium">{o.name}</p>
            <p className="mt-2 text-lg">{o.line}</p>
            <p className="mt-2 text-sm text-muted-foreground"><strong>Why it works:</strong> {o.why}</p>
            <p className="mt-1 text-sm text-muted-foreground"><strong>Watch out:</strong> {o.watch}</p>
          </li>
        ))}
      </ul>
      <section className="rounded-xl border border-border p-5" aria-label="Discount check">
        <h2 className="font-display text-xl font-medium">Can your discount pay off?</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <label className={label}>Normal price ($)<input className={`${field} mt-1`} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} /></label>
          <label className={label}>Your cost per sale ($)<input className={`${field} mt-1`} inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} /></label>
          <label className={label}>Discount (%)<input className={`${field} mt-1`} inputMode="decimal" value={disc} onChange={(e) => setDisc(e.target.value)} /></label>
        </div>
        <p className="mt-4 text-sm" aria-live="polite">
          {m.normalProfit === 0 ? "Enter a price above your cost and a discount under 100%." : m.viable
            ? `Profit per sale drops from $${m.normalProfit.toFixed(2)} to $${m.discountedProfit.toFixed(2)}. You need about ${m.extraSalesNeededPct}% more sales just to earn the same total profit.`
            : `At this discount you make $${m.discountedProfit.toFixed(2)} per sale, so you lose money on every sale. Pick a smaller discount or add value instead of cutting price.`}
        </p>
      </section>
    </div>
  );
}

export function CalendarTool() {
  const [trade, setTrade] = useState("roofers");
  const [year, setYear] = useState(2027);
  const events = useMemo(() => buildCalendar(trade, year), [trade, year]);
  const t = TRADES.find((x) => x.slug === trade)?.name ?? trade;
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <TradeSelect value={trade} onChange={setTrade} />
        <label className={label}>Year<select className={`${field} mt-1`} value={year} onChange={(e) => setYear(Number(e.target.value))}>{[2026, 2027, 2028].map((y) => <option key={y}>{y}</option>)}</select></label>
      </div>
      <div className="flex flex-wrap gap-3">
        <button type="button" className={btn} onClick={() => download(`marketing-calendar-${trade}-${year}.csv`, "text/csv", calendarCsv(events))}>Download CSV</button>
        <button type="button" className={`${btn} !bg-transparent !text-foreground border border-border`} onClick={() => download(`marketing-calendar-${trade}-${year}.ics`, "text/calendar", calendarIcs(events, t))}>Add to my calendar (.ics)</button>
      </div>
      <ol className="space-y-3">
        {events.map((e) => (
          <li key={e.key} className="rounded-xl border border-border p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2"><p className="font-medium">{e.name}</p><p className="font-mono text-xs text-muted-foreground">{e.date} · start ads {e.startAds}</p></div>
            <p className="mt-1 text-sm text-muted-foreground">{e.note}</p>
            {e.tradeIdea && <p className="mt-2 text-sm"><strong>Idea for {t.toLowerCase()}:</strong> {e.tradeIdea}</p>}
          </li>
        ))}
      </ol>
    </div>
  );
}

export function ResizerTool() {
  const [img, setImg] = useState<{ el: HTMLImageElement; name: string } | null>(null);
  const [mode, setMode] = useState<FitMode>("cover");
  const [sel, setSel] = useState<Set<string>>(new Set(["meta-square", "meta-portrait", "meta-story"]));
  const [fmt, setFmt] = useState<"png" | "jpg">("jpg");
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const platforms = [...new Set(SIZE_PRESETS.map((p) => p.platform))];
  function load(f: File | undefined) {
    if (!f) return;
    const el = new Image(); const url = URL.createObjectURL(f);
    el.onload = () => { setImg({ el, name: f.name }); URL.revokeObjectURL(url); };
    el.src = url;
  }
  function render(id: string): Promise<Blob | null> {
    const p = SIZE_PRESETS.find((x) => x.id === id)!;
    const c = canvas.current ?? document.createElement("canvas");
    c.width = p.w; c.height = p.h;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, p.w, p.h);
    const r = fitRect(img!.el.naturalWidth, img!.el.naturalHeight, p.w, p.h, mode);
    ctx.imageSmoothingQuality = "high"; ctx.drawImage(img!.el, r.dx, r.dy, r.dw, r.dh);
    return new Promise((res) => c.toBlob(res, fmt === "png" ? "image/png" : "image/jpeg", 0.92));
  }
  async function save(ids: string[]) {
    for (const id of ids) {
      const blob = await render(id); if (!blob) continue;
      const p = SIZE_PRESETS.find((x) => x.id === id)!;
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = presetFilename(img!.name, p, fmt); a.click(); URL.revokeObjectURL(a.href);
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  return (
    <div className="space-y-6">
      <label className={label}>Your image<input type="file" accept="image/*" className={`${field} mt-1`} onChange={(e) => load(e.target.files?.[0])} /></label>
      <div className="flex flex-wrap gap-4 text-sm">
        <label>Mode <select className="ml-2 rounded-lg border border-border bg-transparent px-2 py-1" value={mode} onChange={(e) => setMode(e.target.value as FitMode)}><option value="cover">Crop to fill</option><option value="contain">Fit whole image</option></select></label>
        <label>Format <select className="ml-2 rounded-lg border border-border bg-transparent px-2 py-1" value={fmt} onChange={(e) => setFmt(e.target.value as "png" | "jpg")}><option value="jpg">JPG</option><option value="png">PNG</option></select></label>
      </div>
      {platforms.map((pl) => (
        <fieldset key={pl}><legend className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--studio-gold)]">{pl}</legend>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {SIZE_PRESETS.filter((p) => p.platform === pl).map((p) => {
              const loss = img && mode === "cover" ? Math.round(cropLoss(img.el.naturalWidth, img.el.naturalHeight, p.w, p.h) * 100) : null;
              return (
                <li key={p.id} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                  <label className="flex items-center gap-2"><input type="checkbox" checked={sel.has(p.id)} onChange={() => toggle(p.id)} />{p.name} <span className="text-muted-foreground">{p.w}x{p.h}</span></label>
                  {loss !== null && loss > 0 && <span className="text-xs text-muted-foreground">{loss}% cropped</span>}
                </li>
              );
            })}
          </ul>
        </fieldset>
      ))}
      <canvas ref={canvas} className="hidden" />
      <button type="button" className={btn} disabled={!img || sel.size === 0} onClick={() => void save([...sel])}>{img ? `Download ${sel.size} size${sel.size === 1 ? "" : "s"}` : "Choose an image first"}</button>
    </div>
  );
}

export function QuizTool() {
  const [a, setA] = useState<QuizAnswers>({ trade: "roofers", goal: "calls", budget: "small", hasWebsite: true, reviews: "some", hoursPerWeek: 3 });
  const [done, setDone] = useState(false);
  const plan = useMemo(() => buildPlan(a), [a]);
  const set = <K extends keyof QuizAnswers>(k: K, v: QuizAnswers[K]) => { setA((x) => ({ ...x, [k]: v })); setDone(false); };
  if (done) return (
    <div className="space-y-5">
      <h2 className="font-display text-2xl font-medium">{plan.headline}</h2>
      <p className="rounded-xl border border-border p-4 text-sm"><strong>Starting budget:</strong> {plan.testBudget}</p>
      <ol className="space-y-3">{plan.steps.map((s, i) => (
        <li key={s.title} className="rounded-xl border border-border p-4"><p className="font-medium">{i + 1}. {s.title}</p><p className="mt-1 text-sm text-muted-foreground">{s.why}</p>
          {s.href && <Link href={s.href} className="mt-2 inline-block text-sm text-[var(--studio-gold)] hover:underline" target="_top">{s.cta} →</Link>}</li>))}</ol>
      <button type="button" className={btn} onClick={() => setDone(false)}>Change my answers</button>
    </div>
  );
  return (
    <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); setDone(true); }}>
      <TradeSelect value={a.trade} onChange={(v) => set("trade", v)} />
      <label className={label}>Main goal<select className={`${field} mt-1`} value={a.goal} onChange={(e) => set("goal", e.target.value as QuizAnswers["goal"])}>{QUIZ_GOALS.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}</select></label>
      <label className={label}>Monthly ad budget<select className={`${field} mt-1`} value={a.budget} onChange={(e) => set("budget", e.target.value as QuizAnswers["budget"])}>{QUIZ_BUDGETS.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}</select></label>
      <label className={label}>Do you have a website?<select className={`${field} mt-1`} value={a.hasWebsite ? "y" : "n"} onChange={(e) => set("hasWebsite", e.target.value === "y")}><option value="y">Yes</option><option value="n">No</option></select></label>
      <label className={label}>Customer reviews<select className={`${field} mt-1`} value={a.reviews} onChange={(e) => set("reviews", e.target.value as QuizAnswers["reviews"])}><option value="none">None yet</option><option value="some">A few</option><option value="many">Plenty</option></select></label>
      <label className={label}>Time for marketing each week<select className={`${field} mt-1`} value={a.hoursPerWeek} onChange={(e) => set("hoursPerWeek", Number(e.target.value) as 1 | 3 | 6)}><option value={1}>About 1 hour</option><option value={3}>About 3 hours</option><option value={6}>6 hours or more</option></select></label>
      <button type="submit" className={btn}>Build my plan</button>
    </form>
  );
}

const KINDS: Array<[InspirationKind | "", string]> = [["", "All types"], ["headline", "Headlines"], ["hook", "Hooks"], ["offer", "Offers"], ["proof", "Proof"], ["primary-text", "Ad text"]];
export function InspirationTool() {
  const items = useMemo(() => buildInspirationIndex(), []);
  const [q, setQ] = useState(""); const [kind, setKind] = useState<InspirationKind | "">(""); const [category, setCategory] = useState<TradeCategory | "">("");
  const [copied, setCopied] = useState("");
  const results = useMemo(() => searchInspiration(items, { q, kind, category }), [items, q, kind, category]);
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <input className={field} type="search" placeholder="Search: roof, free quote, review…" aria-label="Search" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className={field} aria-label="Type" value={kind} onChange={(e) => setKind(e.target.value as InspirationKind | "")}>{KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <select className={field} aria-label="Industry group" value={category} onChange={(e) => setCategory(e.target.value as TradeCategory | "")}><option value="">All industries</option>{CATEGORY_OPTIONS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select>
      </div>
      <p className="text-sm text-muted-foreground" aria-live="polite">{results.length} of {items.length} ideas</p>
      <ul className="space-y-2">
        {results.slice(0, 60).map((r) => (
          <li key={r.id} className="flex items-start justify-between gap-3 rounded-lg border border-border px-4 py-3">
            <div><p className="text-[15px]">{r.text}</p><p className="mt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{r.kind.replace("-", " ")}{r.angle ? ` · ${r.angle}` : ""} · {r.term}</p></div>
            <button type="button" className="shrink-0 text-xs text-[var(--studio-gold)]" onClick={() => { void navigator.clipboard?.writeText(r.text); setCopied(r.id); }}>{copied === r.id ? "Copied" : "Copy"}</button>
          </li>
        ))}
      </ul>
      {results.length > 60 && <p className="text-sm text-muted-foreground">Showing the first 60. Narrow the search to see more.</p>}
    </div>
  );
}
