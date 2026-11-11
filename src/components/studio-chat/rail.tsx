"use client";
import { Archive, Check, Gift, MessageSquarePlus, MoreHorizontal, Pencil, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "./api";
import type { SessionSummary } from "./types";

function Row({ s, active, onChange }: { s: SessionSummary; active: boolean; onChange: (s: SessionSummary | null) => void }) {
  const [editing, setEditing] = useState(false);
  const [menu, setMenu] = useState(false);
  const [title, setTitle] = useState(s.title);
  const router = useRouter();
  const save = async () => {
    setEditing(false);
    const t = title.trim();
    if (!t || t === s.title) return setTitle(s.title);
    const r = await api<{ session: SessionSummary }>(`/api/studio/sessions/${s.id}`, { method: "PATCH", body: { title: t } });
    if (r.ok) onChange(r.data.session);
    else toast.error(r.error);
  };
  const archive = async () => {
    setMenu(false);
    const r = await api(`/api/studio/sessions/${s.id}`, { method: "PATCH", body: { archived: true } });
    if (!r.ok) return toast.error(r.error);
    onChange(null);
    toast.success("Chat archived");
    if (active) router.push("/studio");
  };
  if (editing) {
    return (
      <li className="flex items-center gap-1 rounded-lg bg-white/8 px-2 py-1">
        <input
          autoFocus
          aria-label="Chat title"
          value={title}
          maxLength={80}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void save();
            if (e.key === "Escape") {
              setTitle(s.title);
              setEditing(false);
            }
          }}
          className="min-w-0 flex-1 bg-transparent py-1 text-sm text-white outline-none"
        />
        <button type="button" className="studio-icon-btn" aria-label="Save title" onClick={() => void save()}><Check className="size-3.5" /></button>
        <button type="button" className="studio-icon-btn" aria-label="Cancel" onClick={() => { setTitle(s.title); setEditing(false); }}><X className="size-3.5" /></button>
      </li>
    );
  }
  return (
    <li className={`group relative flex items-center rounded-lg ${active ? "bg-white/10" : "hover:bg-white/5"}`}>
      <Link href={`/studio/${s.id}`} aria-current={active ? "page" : undefined} className="min-w-0 flex-1 truncate px-3 py-2 text-sm text-[oklch(0.92_0.03_80)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-gold)] rounded-lg">
        {(s.status === "queued" || s.status === "working") && <span className="mr-2 inline-block size-1.5 -translate-y-0.5 rounded-full bg-[var(--studio-gold)]" aria-label="Ozzy is working" />}
        {s.title}
      </Link>
      <button type="button" className="studio-icon-btn mr-1 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 max-md:opacity-100" aria-label={`Options for ${s.title}`} aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
        <MoreHorizontal className="size-4" />
      </button>
      {menu && (
        <div className="absolute right-1 top-9 z-20 w-40 rounded-xl border border-white/12 bg-[oklch(0.2_0.07_295)] p-1 shadow-xl" onMouseLeave={() => setMenu(false)}>
          <button type="button" className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-white hover:bg-white/8" onClick={() => { setMenu(false); setTitle(s.title); setEditing(true); }}><Pencil className="size-3.5" />Rename</button>
          <button type="button" className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-white hover:bg-white/8" onClick={() => void archive()}><Archive className="size-3.5" />Archive</button>
        </div>
      )}
    </li>
  );
}

/** Left rail: new chat, sessions (rename / archive), invite a friend. */
export function SessionRail({ sessions, activeId, active, onInvite }: { sessions: SessionSummary[]; activeId?: string; active?: SessionSummary; onInvite: () => void }) {
  const [rows, setList] = useState(sessions);
  // The open chat's live summary (engine-set title, working dot) wins over the server-rendered list.
  const list = active ? (rows.some((x) => x.id === active.id) ? rows.map((x) => (x.id === active.id ? { ...x, title: active.title, status: active.status } : x)) : [active, ...rows]) : rows;
  return (
    <nav aria-label="Studio chats" className="flex h-full flex-col gap-3 p-3">
      <Link href="/dashboard" className="px-2 text-xs text-[oklch(0.8_0.03_80)] hover:text-[var(--studio-gold)]">← All apps</Link>
      <Link href="/dashboard" className="px-2 pt-1 font-display text-lg text-[oklch(0.97_0.03_80)]">Ozzy <span className="italic text-[var(--studio-gold)]">Studio</span></Link>
      <Link href="/studio" className="studio-chip justify-center"><MessageSquarePlus className="size-4" aria-hidden />New video</Link>
      <p className="px-2 pt-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[oklch(0.72_0.04_290)]">Your chats</p>
      <ul className="studio-scroll -mx-1 flex-1 space-y-0.5 overflow-y-auto px-1">
        {list.length === 0 && <li className="px-3 py-2 text-sm text-[oklch(0.75_0.03_290)]">No chats yet.</li>}
        {list.map((s) => (
          <Row key={s.id} s={s} active={s.id === activeId} onChange={(next) => setList((l) => (next ? l.map((x) => (x.id === s.id ? next : x)) : l.filter((x) => x.id !== s.id)))} />
        ))}
      </ul>
      <button type="button" onClick={onInvite} className="flex items-center gap-2 rounded-xl border border-dashed border-[var(--studio-gold)]/40 px-3 py-2.5 text-left text-sm text-[oklch(0.95_0.03_80)] hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-gold)]">
        <Gift className="size-4 shrink-0 text-[var(--studio-gold)]" aria-hidden />
        <span>Give a friend 2 free videos<span className="block text-xs text-[oklch(0.75_0.03_290)]">You get 1 more when they join</span></span>
      </button>
    </nav>
  );
}
