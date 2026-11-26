"use client";
import { useState } from "react";
import { Check } from "lucide-react";

export function ApprovePanel({ token }: { token: string }) {
  const [name, setName] = useState(""); const [note, setNote] = useState("");
  const [st, setSt] = useState<{ phase: "idle" | "busy" | "done" | "error"; msg?: string }>({ phase: "idle" });
  async function send(action: "approve" | "changes") {
    setSt({ phase: "busy" });
    const r = await fetch(`/api/approve/${encodeURIComponent(token)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, note, name }) }).catch(() => null);
    const j = (await r?.json().catch(() => null)) as { error?: string } | null;
    setSt(r?.ok ? { phase: "done", msg: action === "approve" ? "Approved. We told the owner." : "Sent. We told the owner what to change." } : { phase: "error", msg: j?.error ?? "Something went wrong." });
  }
  if (st.phase === "done") return <p role="status" className="flex gap-2 rounded-2xl border border-border p-5 font-medium"><Check className="size-5" aria-hidden /> {st.msg}</p>;
  const f = "w-full rounded-xl border border-border bg-white/5 px-4 py-3 outline-none focus:border-[var(--studio-gold)]";
  return (
    <div className="space-y-3">
      <input className={f} placeholder="Your name (optional)" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
      <textarea className={`${f} min-h-24`} placeholder="Comments or what to change (needed to request changes)" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="flex flex-wrap gap-3">
        <button disabled={st.phase === "busy"} onClick={() => void send("approve")} className="h-12 rounded-xl bg-[var(--studio-gold)] px-6 font-semibold text-[#2a0f10] disabled:opacity-60">Approve</button>
        <button disabled={st.phase === "busy"} onClick={() => void send("changes")} className="h-12 rounded-xl border border-border px-6 font-semibold disabled:opacity-60">Request changes</button>
      </div>
      {st.phase === "error" && <p role="alert" className="text-sm text-red-300">{st.msg}</p>}
    </div>
  );
}
