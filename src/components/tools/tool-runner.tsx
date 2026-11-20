"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Copy, Loader2, X } from "lucide-react";
import { AI_TOOL_FIELDS, AI_TOOL_SECTIONS, CTA_GOALS, CTA_PLATFORMS, LINKEDIN_LIMITS, PLATFORM_LIMITS, RSA_LIMITS, budgetMath, buildHashtags, charCount, checkAdSize, checkLength, gradeAdCopy, isAiTool, keywordHits, pickCta, type AiToolSlug, type CtaGoal, type FreeToolSlug, type Grade, type LinkedInVariant, type ReviewOutput, type RsaOutput, type VideoScriptOutput } from "@/lib/growth/free-tools";
import { FREE_TRIAL_ADS } from "@/lib/ads/bonus-access";
import { MockupTool } from "./ad-mockup";

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

function ReviewTool() {
  const { state, run } = useAiJob("testimonial-generator");
  const [review, setReview] = useState("");
  const [business, setBusiness] = useState("");
  const out = state.phase === "done" ? (state.result as ReviewOutput) : null;
  return (
    <div className="space-y-6">
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void run({ review, ...(business.trim() ? { business } : {}) }); }}>
        <label className="block text-sm font-medium" htmlFor="rev">Paste a review a real customer wrote</label>
        <p className="text-xs text-muted-foreground">Real reviews only: the tool trims your customer&apos;s words, it never invents praise.</p>
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
    el.onload = () => { setImg({ url, w: el.naturalWidth, h: el.naturalHeight, bytes: f.size }); beacon("ad-size-guide"); };
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

/** Editable result line with a live character count against a hard limit. */
function CountedLine({ initial, max, note }: { initial: string; max: number; note?: string }) {
  const [text, setText] = useState(initial);
  const [done, setDone] = useState(false);
  const n = charCount(text);
  return (
    <li className="rounded-lg border border-border px-3 py-2">
      <div className="flex items-center gap-2">
        <input aria-label="Edit line" value={text} onChange={(e) => setText(e.target.value)} className="min-w-0 flex-1 bg-transparent py-1 text-[15px] outline-none" />
        <span className={`shrink-0 font-mono text-xs ${n > max ? "text-red-300" : "text-muted-foreground"}`}>{n}/{max}</span>
        <button type="button" aria-label="Copy" onClick={() => { void navigator.clipboard?.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); }} className="shrink-0 text-muted-foreground hover:text-foreground">
          {done ? <Check className="size-4" /> : <Copy className="size-4" />}
        </button>
      </div>
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
    </li>
  );
}

function RsaResult({ out, keywords }: { out: RsaOutput; keywords: string }) {
  const note = (text: string, pin: string) => [pin !== "none" ? `Pin to position ${pin}` : "", keywordHits(text, keywords).length ? `Keyword: ${keywordHits(text, keywords).join(", ")}` : ""].filter(Boolean).join(" · ");
  const withKw = out.headlines.filter((h) => keywordHits(h.text, keywords).length).length;
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">{out.headlines.length} headlines, {out.descriptions.length} descriptions. {withKw} headline{withKw === 1 ? "" : "s"} contain{withKw === 1 ? "s" : ""} your keywords. Edit any line; the counter turns red over Google&apos;s limit.</p>
      <div><h3 className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--studio-gold)]">Headlines (max {RSA_LIMITS.headline})</h3><ul className="mt-3 space-y-2">{out.headlines.map((h) => <CountedLine key={h.text} initial={h.text} max={RSA_LIMITS.headline} note={note(h.text, h.pin)} />)}</ul></div>
      <div><h3 className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--studio-gold)]">Descriptions (max {RSA_LIMITS.description})</h3><ul className="mt-3 space-y-2">{out.descriptions.map((d) => <CountedLine key={d.text} initial={d.text} max={RSA_LIMITS.description} note={note(d.text, d.pin)} />)}</ul></div>
      {out.paths.length > 0 && <div><h3 className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--studio-gold)]">Display path (max {RSA_LIMITS.path} each)</h3><ul className="mt-3 space-y-2">{out.paths.map((p) => <CountedLine key={p} initial={p} max={RSA_LIMITS.path} />)}</ul></div>}
    </div>
  );
}

function LinkedInResult({ variants }: { variants: LinkedInVariant[] }) {
  return (
    <div className="space-y-6">
      {variants.map((v, i) => (
        <div key={`${i}-${v.headline}`} className="rounded-xl border border-border p-4">
          <h3 className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--studio-gold)]">Variant {i + 1}{v.angle ? `: ${v.angle}` : ""} · button: {v.cta}</h3>
          <ul className="mt-3 space-y-2">
            <CountedLine initial={v.intro} max={LINKEDIN_LIMITS.intro} note="Intro text (all of it shows before 'see more')" />
            <CountedLine initial={v.headline} max={LINKEDIN_LIMITS.headline} note="Headline" />
            {v.description && <CountedLine initial={v.description} max={LINKEDIN_LIMITS.description} note="Description" />}
          </ul>
        </div>
      ))}
    </div>
  );
}

function ScriptResult({ out }: { out: VideoScriptOutput }) {
  const plain = (s: VideoScriptOutput["scripts"][number]) => [`HOOK: ${s.hook}`, ...s.scenes.map((c) => `[${c.time}] ${c.shot}${c.onScreen ? `\nOn screen: ${c.onScreen}` : ""}${c.voiceover ? `\nSay: ${c.voiceover}` : ""}`), `CTA: ${s.cta}`].join("\n\n");
  return (
    <div className="space-y-6">
      {out.scripts.map((s, i) => (
        <div key={`${i}-${s.hook}`} className="rounded-xl border border-border p-4">
          <h3 className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--studio-gold)]">Script {i + 1}: {s.angle}</h3>
          <p className="mt-3 font-medium">Hook: {s.hook}</p>
          <ol className="mt-3 space-y-2">
            {s.scenes.map((c, j) => (
              <li key={j} className="rounded-lg border border-border px-3 py-2 text-sm">
                <p><span className="font-mono text-xs text-[var(--studio-gold)]">{c.time}</span> {c.shot}</p>
                {c.onScreen && <p className="mt-1 text-muted-foreground">On screen: <span className="text-foreground">{c.onScreen}</span></p>}
                {c.voiceover && <p className="mt-1 text-muted-foreground">Say: <span className="text-foreground">{c.voiceover}</span></p>}
              </li>
            ))}
          </ol>
          <p className="mt-3 font-medium">CTA: {s.cta}</p>
          <ul className="mt-3"><CopyLine text={plain(s)} /></ul>
        </div>
      ))}
    </div>
  );
}

function customResult(tool: AiToolSlug, out: Record<string, unknown>, input: Record<string, string>): ReactNode | null {
  if (tool === "google-ads-headline-generator") return <RsaResult out={out as unknown as RsaOutput} keywords={input.keywords ?? ""} />;
  if (tool === "linkedin-ad-copy-generator") return <LinkedInResult variants={(out as { variants: LinkedInVariant[] }).variants ?? []} />;
  if (tool === "ugc-script-generator" || tool === "youtube-ad-script-generator") return <ScriptResult out={out as unknown as VideoScriptOutput} />;
  return null;
}

function GenericAiTool({ tool }: { tool: AiToolSlug }) {
  const { state, run } = useAiJob(tool);
  const fields = AI_TOOL_FIELDS[tool] ?? [];
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(fields.filter((f) => f.options).map((f) => [f.name, f.options![0][0]])));
  const out = state.phase === "done" ? (state.result as Record<string, unknown>) : null;
  return (
    <div className="space-y-6">
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void run(Object.fromEntries(Object.entries(values).filter(([, v]) => v.trim()))); }}>
        {fields.map((f) => (
          <div key={f.name} className="space-y-1.5">
            <label className="block text-sm font-medium" htmlFor={`f-${f.name}`}>{f.label}</label>
            {f.options ? (
              <select id={`f-${f.name}`} value={values[f.name] ?? ""} onChange={(e) => setValues({ ...values, [f.name]: e.target.value })} className={field}>
                {f.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            ) : f.multiline ? (
              <textarea id={`f-${f.name}`} required={f.required} rows={4} maxLength={2000} value={values[f.name] ?? ""} onChange={(e) => setValues({ ...values, [f.name]: e.target.value })} placeholder={f.placeholder} className={field} />
            ) : (
              <input id={`f-${f.name}`} required={f.required} maxLength={200} value={values[f.name] ?? ""} onChange={(e) => setValues({ ...values, [f.name]: e.target.value })} placeholder={f.placeholder} className={field} />
            )}
          </div>
        ))}
        <button className={btn} disabled={state.phase === "working"}>{state.phase === "working" ? <><Loader2 className="size-4 animate-spin" /> Ozzy is writing…</> : "Write it for me"}</button>
      </form>
      {state.phase === "error" && <p role="alert" className="text-sm text-red-300">{state.error}</p>}
      {out && (customResult(tool, out, values) ?? (
        <div className="space-y-6">
          {AI_TOOL_SECTIONS[tool].map(([key, label]) => {
            const v = out[key];
            const items = Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : typeof v === "string" ? [v] : [];
            return items.length ? <Section key={key} title={label} items={items} /> : null;
          })}
        </div>
      ))}
    </div>
  );
}

function Num({ label, value, onChange, step = "any" }: { label: string; value: string; onChange: (v: string) => void; step?: string }) {
  return (
    <label className="block space-y-1.5 text-sm font-medium">{label}
      <input type="number" inputMode="decimal" min="0" step={step} value={value} onChange={(e) => onChange(e.target.value)} className={field} />
    </label>
  );
}

function BudgetTool() {
  const [v, setV] = useState({ dailyBudget: "20", cpc: "0.80", conversionRatePct: "3", orderValue: "45", marginPct: "40", days: "30" });
  const r = budgetMath(Object.fromEntries(Object.entries(v).map(([k, x]) => [k, Number(x)])) as unknown as Parameters<typeof budgetMath>[0]);
  const used = useRef(false);
  const set = (k: keyof typeof v) => (x: string) => { setV({ ...v, [k]: x }); if (!used.current) { used.current = true; beacon("ad-budget-calculator"); } };
  const money = (n: number) => n.toLocaleString(undefined, { style: "currency", currency: "USD" });
  const stats: Array<[string, string]> = [["Spend", money(r.spend)], ["Clicks", r.clicks.toLocaleString()], ["Sales / leads", r.conversions.toLocaleString()], ["Revenue", money(r.revenue)], ["ROAS", `${r.roas}x`], ["Break-even ROAS", `${r.breakEvenRoas}x`], ["Cost per sale (CPA)", money(r.cpa)], ["Break-even CPA", money(r.breakEvenCpa)], ["Profit after ads", money(r.profit)]];
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2">
        <Num label="Daily budget ($)" value={v.dailyBudget} onChange={set("dailyBudget")} />
        <Num label="Days" value={v.days} onChange={set("days")} step="1" />
        <Num label="Cost per click ($)" value={v.cpc} onChange={set("cpc")} />
        <Num label="Conversion rate (%)" value={v.conversionRatePct} onChange={set("conversionRatePct")} />
        <Num label="Average order value ($)" value={v.orderValue} onChange={set("orderValue")} />
        <Num label="Profit margin (%)" value={v.marginPct} onChange={set("marginPct")} />
      </div>
      <ul className="grid gap-3 sm:grid-cols-3">
        {stats.map(([k, x]) => <li key={k} className="rounded-xl border border-border p-4"><p className="text-xs text-muted-foreground">{k}</p><p className="mt-1 text-xl font-semibold">{x}</p></li>)}
      </ul>
      <p className={`text-sm ${r.roas >= r.breakEvenRoas && r.spend > 0 ? "text-emerald-400" : "text-amber-300"}`}>
        {r.spend === 0 ? "Enter a budget to see results." : r.roas >= r.breakEvenRoas ? "These numbers are profitable: ROAS is above your break-even." : "At these numbers the ads lose money: raise conversion rate or order value, or lower your cost per click."}
      </p>
    </div>
  );
}

function CounterTool() {
  const [platform, setPlatform] = useState(PLATFORM_LIMITS[0].id);
  const [texts, setTexts] = useState<Record<string, string>>({});
  const used = useRef(false);
  const p = PLATFORM_LIMITS.find((x) => x.id === platform) ?? PLATFORM_LIMITS[0];
  return (
    <div className="space-y-5">
      <select aria-label="Platform" value={platform} onChange={(e) => setPlatform(e.target.value)} className={field}>
        {PLATFORM_LIMITS.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
      </select>
      {p.fields.map((f) => {
        const key = `${p.id}:${f.id}`;
        const text = texts[key] ?? "";
        const r = checkLength(text, f);
        const onChange = (x: string) => { setTexts({ ...texts, [key]: x }); if (!used.current) { used.current = true; beacon("ad-character-counter"); } };
        return (
          <div key={key} className="space-y-1.5">
            <div className="flex items-baseline justify-between text-sm"><label htmlFor={key} className="font-medium">{f.label}</label><span className={r.status === "over" ? "text-red-300" : r.status === "truncated" ? "text-amber-300" : "text-muted-foreground"}>{r.count}{f.max !== null ? ` / ${f.max}` : ""}{f.visible !== null ? ` (shows ${f.visible})` : ""}</span></div>
            {f.multiline ? <textarea id={key} rows={4} value={text} onChange={(e) => onChange(e.target.value)} className={field} /> : <input id={key} value={text} onChange={(e) => onChange(e.target.value)} className={field} />}
            {r.note && <p className={`text-xs ${r.status === "over" ? "text-red-300" : r.status === "truncated" ? "text-amber-300" : "text-emerald-400"}`}>{r.note}</p>}
          </div>
        );
      })}
    </div>
  );
}

function CtaTool() {
  const [goal, setGoal] = useState<CtaGoal>("book");
  const [platform, setPlatform] = useState("meta");
  const used = useRef(false);
  const r = pickCta(goal, platform);
  const touch = () => { if (!used.current) { used.current = true; beacon("cta-generator"); } };
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <select aria-label="Goal" value={goal} onChange={(e) => { setGoal(e.target.value as CtaGoal); touch(); }} className={field}>{CTA_GOALS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <select aria-label="Platform" value={platform} onChange={(e) => { setPlatform(e.target.value); touch(); }} className={field}>{CTA_PLATFORMS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      </div>
      <Section title="Button to choose" items={r.buttons} />
      <Section title="Call-to-action lines for your text" items={r.phrases} />
      <p className="text-sm text-muted-foreground">{r.tip}</p>
    </div>
  );
}

function HashtagTool() {
  const [v, setV] = useState({ business: "", city: "", keywords: "" });
  const [out, setOut] = useState<ReturnType<typeof buildHashtags> | null>(null);
  return (
    <div className="space-y-6">
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); setOut(buildHashtags(v)); beacon("hashtag-generator"); }}>
        <input aria-label="Business type" required value={v.business} onChange={(e) => setV({ ...v, business: e.target.value })} placeholder="Business type: bakery" className={field} />
        <input aria-label="Town or city (optional)" value={v.city} onChange={(e) => setV({ ...v, city: e.target.value })} placeholder="Town or city (optional): Leeds" className={field} />
        <input aria-label="Topics (optional)" value={v.keywords} onChange={(e) => setV({ ...v, keywords: e.target.value })} placeholder="Topics, comma separated: sourdough, birthday cakes" className={field} />
        <button className={btn}>Get hashtags</button>
      </form>
      {out && (
        <div className="space-y-6">
          <Section title="Use these 3-5" items={[out.suggested.join(" ")]} />
          {out.local.length > 0 && <Section title="Local" items={[out.local.join(" ")]} />}
          {out.niche.length > 0 && <Section title="Niche" items={[out.niche.join(" ")]} />}
          <Section title="Broad (use sparingly)" items={[out.broad.join(" ")]} />
        </div>
      )}
    </div>
  );
}

function MakerTool() {
  const [url, setUrl] = useState("");
  const [err, setErr] = useState("");
  return (
    <form className="space-y-3" onSubmit={(e) => {
      e.preventDefault();
      const raw = url.trim();
      let host = "";
      try { host = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).hostname; } catch { /* invalid */ }
      if (!host.includes(".")) return setErr("Enter your website, like yourbusiness.com");
      beacon("ad-maker");
      const q = new URLSearchParams({ url: raw, utm_source: "free_tool", utm_medium: "acquire", utm_campaign: "ad-maker", utm_content: "runner" });
      window.location.href = `/free-ads?${q.toString()}`;
    }}>
      <label className="block text-sm font-medium" htmlFor="site">Your website</label>
      <div className="flex flex-col gap-3 sm:flex-row">
        <input id="site" type="text" inputMode="url" autoComplete="url" required value={url} onChange={(e) => { setUrl(e.target.value); setErr(""); }} placeholder="yourbusiness.com" className={field} />
        <button className={`${btn} shrink-0`}>Make my free ads</button>
      </div>
      {err && <p role="alert" className="text-sm text-red-300">{err}</p>}
      <p className="text-xs text-muted-foreground">{FREE_TRIAL_ADS} free ads, no watermark, no card.</p>
    </form>
  );
}

export function ToolRunner({ slug }: { slug: FreeToolSlug }) {
  if (slug === "ad-maker") return <MakerTool />;
  if (slug === "testimonial-generator") return <ReviewTool />;
  if (slug === "ad-copy-grader") return <GraderTool />;
  if (slug === "ad-size-guide") return <SizeTool />;
  if (slug === "ad-budget-calculator") return <BudgetTool />;
  if (slug === "ad-character-counter") return <CounterTool />;
  if (slug === "cta-generator") return <CtaTool />;
  if (slug === "hashtag-generator") return <HashtagTool />;
  if (slug === "ad-mockup-generator") return <MockupTool onUse={() => beacon("ad-mockup-generator")} />;
  return isAiTool(slug) ? <GenericAiTool tool={slug} /> : null;
}
