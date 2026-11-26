"use client";
import { useEffect, useState } from "react";

interface Mine { slug: string; title: string; blurb: string; adIds: string[]; enabled: boolean; botd: boolean }
export function ShowcaseSettings({ ads }: { ads: Array<{ id: string; headline: string }> }) {
  const [m, setM] = useState<Mine | null>(null);
  const [title, setTitle] = useState(""); const [blurb, setBlurb] = useState(""); const [sel, setSel] = useState<string[]>([]); const [botd, setBotd] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { fetch("/api/ads/showcase").then((r) => r.json()).then((j: { showcase: Mine | null }) => { if (j.showcase) { setM(j.showcase); setTitle(j.showcase.title); setBlurb(j.showcase.blurb); setSel(j.showcase.adIds); setBotd(j.showcase.botd); } }).catch(() => {}); }, []);
  async function save(enabled: boolean) {
    const r = await fetch("/api/ads/showcase", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title, blurb, adIds: sel, enabled, botd }) });
    const j = (await r.json().catch(() => ({}))) as { slug?: string; error?: string };
    if (r.ok) { setM({ slug: j.slug ?? "", title, blurb, adIds: sel, enabled, botd: enabled && botd }); setMsg(enabled ? "Published. Switch it off any time." : "Unpublished."); } else setMsg(j.error ?? "Couldn't save.");
  }
  const f = "w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm";
  return (
    <div className="space-y-4">
      <p className="rounded-lg border border-border p-3 text-sm">Status: <strong>{m?.enabled ? `public at /showcase/${m.slug}` : "private (not public)"}</strong>. Nothing is shown until you tick the box and publish.</p>
      <input className={f} placeholder="Business name" maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea className={f} placeholder="One line about you (optional, shown as written)" maxLength={300} value={blurb} onChange={(e) => setBlurb(e.target.value)} />
      <fieldset className="space-y-1"><legend className="text-sm font-medium">Ads to show</legend>{ads.map((a) => <label key={a.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={sel.includes(a.id)} onChange={(e) => setSel((s) => e.target.checked ? [...s, a.id] : s.filter((x) => x !== a.id))} />{a.headline}</label>)}</fieldset>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={botd} onChange={(e) => setBotd(e.target.checked)} /> Also let Ozzy pick me for &quot;business of the day&quot;.</label>
      <div className="flex gap-2"><button onClick={() => void save(true)} className="h-10 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground">I agree: publish</button>{m?.enabled && <button onClick={() => void save(false)} className="h-10 rounded-lg border border-border px-4 text-sm">Unpublish</button>}</div>
      {msg && <p role="status" className="text-sm">{msg}</p>}
    </div>
  );
}
