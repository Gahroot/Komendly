"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, Loader2, X } from "lucide-react";
import { checkAdSize, gradeAdCopy, type FreeToolSlug, type Grade, type HeadlineOutput, type ReviewOutput } from "@/lib/growth/free-tools";

const field = "w-full rounded-xl border border-border bg-white/5 px-4 py-3 text-base outline-none focus:border-[var(--studio-gold)]";
const btn = "inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[var(--studio-gold)] px-6 font-semibold text-[#2a0f10] transition hover:brightness-105 disabled:opacity-60";

function beacon(tool: FreeToolSlug) {
  void fetch("/api/free-tools", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tool }) }).catch(() => undefined);
}

function CopyLine({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <li className="flex items-start justify-between gap-3 rounded-lg border border-border px-4 py-3">
      <span className="whitespace-pre-line text-[15px]">{text}</span>
      <button type="button" aria-label="Copy" onClick={() => { void navigator.clipboard?.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); }} className="shrink-0 text-muted-foreground hover:text-foreground">
        {done ? <Check className="size-4" /> : <Copy className="size-4" />}
      </button>
    </li>
  );
}

function useAiJob(tool: FreeToolSlug) {
  const [state, setState] = useState<{ phase: "idle" | "working" | "done" | "error"; result?: unknown; error?: string }>({ phase: "idle" });
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  async function run(input: Record<string, string>) {
    setState({ phase: "working" });
    const r = await fetch("/api/free-tools", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tool, input }) }).catch(() => null);
    const j = (await r?.json().catch(() => null)) as { jobId?: string; error?: string } | null;
    if (!r?.ok || !j?.jobId) return setState({ phase: "error", error: j?.error ?? "Something went wrong. Please try again." });
    const started = Date.now();
    while (alive.current && Date.now() - started < 120_000) {
      await new Promise((res) => setTimeout(res, 2000));
      const p = (await fetch(`/api/free-tools/job/${j.jobId}`, { cache: "no-store" }).then((x) => x.json()).catch(() => null)) as { status?: string; result?: unknown; error?: string } | null;
      if (p?.status === "done") return setState({ phase: "done", result: p.result });
      if (p?.status === "failed") return setState({ phase: "error", error: p.error ?? "Please try again." });
    }
    if (alive.current) setState({ phase: "error", error: "Ozzy is busy right now. Please try again in a minute." });
  }
  return { state, run };
}

function HeadlineTool() {
  const { state, run } = useAiJob("ad-headline-generator");
  const [business, setBusiness] = useState("");
  const [audience, setAudience] = useState("");
  const out = state.phase === "done" ? (state.result as HeadlineOutput) : null;
  return (
    <div className="space-y-6">
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void run({ business, ...(audience.trim() ? { audience } : {}) }); }}>
        <label className="block text-sm font-medium" htmlFor="biz">What does your business sell, and to whom?</label>
        <textarea id="biz" required minLength={15} maxLength={1200} rows={4} value={business} onChange={(e) => setBusiness(e.target.value)} placeholder="Family-run bakery in Leeds. Sourdough, custom birthday cakes, same-day pickup." className={field} />
        <input aria-label="Audience (optional)" maxLength={200} value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="Audience (optional): busy parents nearby" className={field} />
        <button className={btn} disabled={state.phase === "working"}>{state.phase === "working" ? <><Loader2 className="size-4 animate-spin" /> Ozzy is writing…</> : "Write my ad copy"}</button>
      </form>
      {state.phase === "error" && <p role="alert" className="text-sm text-red-300">{state.error}</p>}
      {out && (
        <div className="space-y-6">
          <Section title="Headlines" items={out.headlines} />
          <Section title="Primary text" items={out.primaryTexts} />
          <Section title="Scroll-stopping hooks" items={out.hooks} />
        </div>
      )}
    </div>
  );
}

function ReviewTool() {
  const { state, run } = useAiJob("review-to-ad");
  const [review, setReview] = useState("");
  const [business, setBusiness] = useState("");
  const out = state.phase === "done" ? (state.result as ReviewOutput) : null;
  return (
    <div className="space-y-6">
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void run({ review, ...(business.trim() ? { business } : {}) }); }}>
        <label className="block text-sm font-medium" htmlFor="rev">Paste a real customer review</label>
        <textarea id="rev" required minLength={30} maxLength={2000} rows={5} value={review} onChange={(e) => setReview(e.target.value)} placeholder="We called on a Sunday with a burst pipe and they were here in an hour…" className={field} />
        <input aria-label="Business name (optional)" maxLength={120} value={business} onChange={(e) => setBusiness(e.target.value)} placeholder="Business name (optional)" className={field} />
        <button className={btn} disabled={state.phase === "working"}>{state.phase === "working" ? <><Loader2 className="size-4 animate-spin" /> Ozzy is reading…</> : "Turn it into an ad"}</button>
      </form>
      {state.phase === "error" && <p role="alert" className="text-sm text-red-300">{state.error}</p>}
      {out && (
        <div className="space-y-6">
          <Section title="Ad quotes" items={out.quotes.map((q) => `“${q.replace(/^["“]|["”]$/g, "")}”`)} />
          <Section title="Headline" items={[out.headline]} />
          <Section title="Primary text" items={[out.primaryText]} />
        </div>
      )}
    </div>
  );
}

function Section({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h3 className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--studio-gold)]">{title}</h3>
      <ul className="mt-3 space-y-2">{items.map((t) => <CopyLine key={t} text={t} />)}</ul>
    </div>
  );
}

function GraderTool() {
  const [headline, setHeadline] = useState("");
  const [text, setText] = useState("");
  const [grade, setGrade] = useState<Grade | null>(null);
  return (
    <div className="space-y-6">
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); setGrade(gradeAdCopy(headline, text)); beacon("ad-copy-grader"); }}>
        <input aria-label="Headline" maxLength={200} value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="Headline: Fresh sourdough, ready by 7am" className={field} />
        <textarea aria-label="Primary text" required rows={5} maxLength={3000} value={text} onChange={(e) => setText(e.target.value)} placeholder="Primary text: the words above your ad image" className={field} />
        <button className={btn}>Grade my ad</button>
      </form>
      {grade && (
        <div className="space-y-4">
          <p className="font-display text-5xl font-medium">{grade.score}<span className="text-2xl text-muted-foreground">/100</span></p>
          <ul className="space-y-2">
            {grade.checks.map((c) => (
              <li key={c.id} className="flex gap-3 rounded-lg border border-border px-4 py-3">
                {c.pass ? <Check className="mt-0.5 size-4 shrink-0 text-emerald-400" /> : <X className="mt-0.5 size-4 shrink-0 text-red-400" />}
                <div><p className="text-[15px] font-medium">{c.label} <span className="text-muted-foreground">({c.points}/{c.max})</span></p>{!c.pass && <p className="mt-1 text-sm text-muted-foreground">{c.tip}</p>}</div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function SizeTool() {
  const [img, setImg] = useState<{ url: string; w: number; h: number; bytes: number } | null>(null);
  const result = img ? checkAdSize(img.w, img.h, img.bytes) : null;
  function onFile(f: File | undefined) {
    if (!f) return;
    const url = URL.createObjectURL(f);
    const el = new window.Image();
    el.onload = () => { setImg({ url, w: el.naturalWidth, h: el.naturalHeight, bytes: f.size }); beacon("ad-size-checker"); };
    el.src = url;
  }
  return (
    <div className="space-y-6">
      <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-border px-6 py-10 text-center hover:border-[var(--studio-gold)]">
        <span className="font-medium">Choose an ad image</span>
        <span className="text-sm text-muted-foreground">JPG or PNG. Checked in your browser; nothing is uploaded.</span>
        <input type="file" accept="image/*" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
      </label>
      {img && result && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Your image: <strong className="text-foreground">{img.w}×{img.h}px</strong> ({(img.bytes / 1024 / 1024).toFixed(1)} MB)</p>
          {result.warnings.map((w) => <p key={w} className="text-sm text-amber-300">{w}</p>)}
          <ul className="grid gap-4 sm:grid-cols-2">
            {result.fits.map((f) => (
              <li key={f.placement.id} className="rounded-xl border border-border p-4">
                <div className="mx-auto flex h-48 items-center justify-center">
                  <div className="relative overflow-hidden rounded-md bg-white/5" style={{ aspectRatio: String(f.placement.ratio), height: f.placement.ratio < 1.2 ? "100%" : undefined, width: f.placement.ratio >= 1.2 ? "100%" : undefined }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.url} alt={`Preview in ${f.placement.name}`} className="absolute inset-0 size-full object-cover" />
                    {f.placement.id === "stories" && <><div className="absolute inset-x-0 top-0 h-[14%] bg-red-500/25" /><div className="absolute inset-x-0 bottom-0 h-[20%] bg-red-500/25" /></>}
                  </div>
                </div>
                <p className="mt-3 font-medium">{f.placement.name} <span className="text-muted-foreground">{f.placement.ratioLabel}</span></p>
                <p className={`text-sm ${f.fit === "perfect" ? "text-emerald-400" : f.fit === "cropped" ? "text-amber-300" : "text-red-300"}`}>{f.note}</p>
                <p className="text-xs text-muted-foreground">Recommended: {f.placement.recommended}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function ToolRunner({ slug }: { slug: FreeToolSlug }) {
  if (slug === "ad-headline-generator") return <HeadlineTool />;
  if (slug === "review-to-ad") return <ReviewTool />;
  if (slug === "ad-copy-grader") return <GraderTool />;
  return <SizeTool />;
}
