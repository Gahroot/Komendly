"use client";
// Config-driven public form for the creative hubs. Posts to /api/hub/submit. The server enforces flags, consent and limits.
import { useState } from "react";
import { Check } from "lucide-react";

interface Field { name: string; label: string; type: "text" | "email" | "url" | "textarea" | "checkbox"; required?: boolean; max?: number }
export interface HubFormConfig { kind: string; submit: string; done: string; fields: Field[] }

const input = "w-full rounded-xl border border-border bg-white/5 px-4 py-3 text-base outline-none focus:border-[var(--studio-gold)]";

export function HubForm({ config, defaults = {} }: { config: HubFormConfig; defaults?: Record<string, string> }) {
  const [vals, setVals] = useState<Record<string, string | boolean>>(defaults);
  const [st, setSt] = useState<{ phase: "idle" | "busy" | "done" | "error"; msg?: string }>({ phase: "idle" });
  async function go(e: React.FormEvent) {
    e.preventDefault();
    setSt({ phase: "busy" });
    const r = await fetch("/api/hub/submit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: config.kind, ...vals }) }).catch(() => null);
    const j = (await r?.json().catch(() => null)) as { error?: string; message?: string } | null;
    setSt(r?.ok ? { phase: "done", msg: j?.message ?? config.done } : { phase: "error", msg: j?.error ?? "Something went wrong. Please try again." });
  }
  if (st.phase === "done") return <p role="status" className="flex items-start gap-2 rounded-2xl border border-border p-6 font-medium"><Check className="mt-0.5 size-5 shrink-0" aria-hidden /> {st.msg}</p>;
  return (
    <form onSubmit={go} className="space-y-4">
      <input type="text" name="hp" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" onChange={(e) => setVals((v) => ({ ...v, hp: e.target.value }))} />
      {config.fields.map((f) => f.type === "checkbox" ? (
        <label key={f.name} className="flex items-start gap-3 text-sm">
          <input type="checkbox" className="mt-1 size-4" checked={vals[f.name] === true} required={f.required} onChange={(e) => setVals((v) => ({ ...v, [f.name]: e.target.checked }))} />
          <span>{f.label}</span>
        </label>
      ) : (
        <label key={f.name} className="block text-sm font-medium">
          {f.label}
          {f.type === "textarea"
            ? <textarea className={`${input} mt-1 min-h-28`} maxLength={f.max} required={f.required} value={String(vals[f.name] ?? "")} onChange={(e) => setVals((v) => ({ ...v, [f.name]: e.target.value }))} />
            : <input className={`${input} mt-1`} type={f.type === "url" ? "text" : f.type} inputMode={f.type === "url" ? "url" : undefined} maxLength={f.max} required={f.required} value={String(vals[f.name] ?? "")} onChange={(e) => setVals((v) => ({ ...v, [f.name]: e.target.value }))} />}
        </label>
      ))}
      {st.phase === "error" && <p role="alert" className="text-sm text-red-300">{st.msg}</p>}
      <button disabled={st.phase === "busy"} className="inline-flex h-12 items-center justify-center rounded-xl bg-[var(--studio-gold)] px-6 font-semibold text-[#2a0f10] transition hover:brightness-105 disabled:opacity-60">{st.phase === "busy" ? "Sending..." : config.submit}</button>
    </form>
  );
}
