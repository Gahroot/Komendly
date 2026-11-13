"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { UploadCloud, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { OzzyPerch, type OzzyMood } from "@/components/testimonials/ozzy-perch";
import { COACH_LIMITS, normalizeMime, uploadKind } from "@/lib/ads/coach/contracts";
import { SAMPLE_VERDICT } from "@/lib/ads/coach/sample";
import type { CoachHome, CoachReviewView } from "@/lib/ads/coach/view";
import { CoachVerdictView } from "./coach-verdict";

const ACCEPT = ".png,.jpg,.jpeg,.webp,.csv,.xlsx";
const WORKING_LINES = ["Reading your numbers…", "Comparing your ads…", "Looking for the winner…", "Writing it up in plain words…"];

async function api<T>(url: string, init?: RequestInit): Promise<{ ok: true; data: T } | { ok: false; error: string; code?: string }> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string; code?: string };
  return res.ok ? { ok: true, data: body } : { ok: false, error: body.error ?? "Something went wrong. Try again.", code: body.code };
}

export function CoachApp() {
  const router = useRouter();
  const [home, setHome] = useState<CoachHome | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [note, setNote] = useState("");
  const [drag, setDrag] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"uploading" | "more" | null>(null);
  const [current, setCurrent] = useState<CoachReviewView | null>(null);
  const [tick, setTick] = useState(0);
  const [askUrl, setAskUrl] = useState(false);
  const [url, setUrl] = useState("");
  const input = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const r = await api<CoachHome>("/api/ads/coach");
    if (r.ok) setHome(r.data);
    else setError(r.error);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  // Poll the open check-up until Ozzy is done.
  useEffect(() => {
    if (!current || current.status === "ready" || current.status === "failed") return;
    const t = setInterval(async () => {
      setTick((n) => n + 1);
      const r = await api<{ review: CoachReviewView }>(`/api/ads/coach/${current.id}`);
      if (r.ok) {
        setCurrent(r.data.review);
        if (r.data.review.status === "ready" || r.data.review.status === "failed") void load();
      }
    }, 2500);
    return () => clearInterval(t);
  }, [current, load]);

  const addFiles = (list: FileList | File[]) => {
    setError(null);
    const next = [...files, ...Array.from(list)].slice(0, COACH_LIMITS.maxScreenshots + 1);
    const check = uploadKind(next.map((f) => ({ mime: normalizeMime(f.name, f.type), bytes: f.size })));
    if (!check.ok) setError(check.message);
    setFiles(next);
  };

  const submit = async () => {
    const check = uploadKind(files.map((f) => ({ mime: normalizeMime(f.name, f.type), bytes: f.size })));
    if (!check.ok) return setError(check.message);
    setBusy("uploading");
    setError(null);
    try {
      const start = await api<{ reviewId: string; uploads: Array<{ putUrl: string; headers: Record<string, string> }> }>("/api/ads/coach", {
        method: "POST",
        body: JSON.stringify({ files: files.map((f) => ({ name: f.name, mime: normalizeMime(f.name, f.type), bytes: f.size })), note: note.trim() || undefined }),
      });
      if (!start.ok) return setError(start.error);
      const puts = await Promise.all(start.data.uploads.map((u, i) => fetch(u.putUrl, { method: "PUT", headers: u.headers, body: files[i] })));
      if (puts.some((p) => !p.ok)) return setError("The upload didn't finish. Check your connection and try again.");
      const done = await api<{ review: CoachReviewView }>(`/api/ads/coach/${start.data.reviewId}/submit`, { method: "POST" });
      if (!done.ok) return setError(done.error);
      setCurrent(done.data.review);
      setFiles([]);
      setNote("");
    } finally {
      setBusy(null);
    }
  };

  const more = async (review: CoachReviewView) => {
    setBusy("more");
    setError(null);
    try {
      const r = await api<{ runId: string }>(`/api/ads/coach/${review.id}/more`, { method: "POST", body: JSON.stringify(askUrl && url.trim() ? { url: url.trim() } : {}) });
      if (r.ok) return router.push(`/ads/runs/${r.data.runId}`);
      if (r.code === "need_url") setAskUrl(true);
      setError(r.error);
    } finally {
      setBusy(null);
    }
  };

  if (!home) return <Skeleton className="h-96 rounded-2xl" />;
  const { access } = home;
  const mood: OzzyMood = current && current.status !== "ready" && current.status !== "failed"
    ? { form: "classic", expression: "focused", motion: "idle", line: WORKING_LINES[Math.floor(tick / 3) % WORKING_LINES.length] }
    : current?.status === "ready"
      ? { form: "classic", expression: "happy", motion: "wave", line: current.verdict?.winner ? "Found your winner!" : "Here's what I see." }
      : { form: "classic", expression: "happy", motion: "idle", line: "Show me your ads. I'll tell you what's working." };

  const moreButton = (r: CoachReviewView) =>
    r.moreRunId ? (
      <Button asChild size="sm" variant="secondary"><Link href={`/ads/runs/${r.moreRunId}`}>See your 5 new ads</Link></Button>
    ) : access.mode === "sample" ? null : (
      <div className="space-y-2">
        {askUrl ? <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Your website, e.g. yourshop.com" className="max-w-sm" /> : null}
        <Button onClick={() => void more(r)} disabled={busy !== null || (askUrl && url.trim().length < 3)}>{busy === "more" ? "Starting…" : "Make 5 more like the winner"}</Button>
      </div>
    );

  return (
    <div className="space-y-8">
      <section className="pt-10">
        <OzzyPerch size={88} className="-mb-2 ml-2" mood={mood} />
        <h1 className="text-3xl font-semibold tracking-tight">Ozzy Ad Coach</h1>
        <p className="text-sm text-muted-foreground">Drop a screenshot of Meta Ads Manager, or your ads report. Ozzy tells you, in plain words, which ads to keep and which to switch off.</p>
      </section>

      {access.mode === "sample" ? (
        <section className="space-y-4">
          <div className="rounded-2xl border border-[#f5c542]/50 bg-[#f5c542]/10 p-4">
            <p className="font-semibold">Here&apos;s what a check-up looks like.</p>
            <p className="text-sm text-muted-foreground">This is an example. Unlimited check-ups for your own ads come with Ozzy Ad Department.</p>
            <Button asChild className="mt-3"><Link href="/ads/pricing">Get Ozzy Ad Department</Link></Button>
          </div>
          <CoachVerdictView verdict={SAMPLE_VERDICT} />
        </section>
      ) : current ? (
        <section className="space-y-4">
          {current.status === "ready" && current.verdict ? (
            <CoachVerdictView verdict={current.verdict} action={moreButton(current)} />
          ) : current.status === "failed" ? (
            <p className="rounded-xl border border-destructive/40 p-4 text-sm">{current.error ?? "Ozzy couldn't read that. Try again."}</p>
          ) : (
            <div className="space-y-3 rounded-2xl border border-border p-6" aria-busy>
              <p className="font-semibold">{WORKING_LINES[Math.floor(tick / 3) % WORKING_LINES.length]}</p>
              <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full animate-pulse rounded-full bg-[#7b3cf0] transition-all" style={{ width: `${Math.min(92, 15 + tick * 4)}%` }} /></div>
              <p className="text-xs text-muted-foreground">Usually under a minute.</p>
            </div>
          )}
          {current.status === "ready" || current.status === "failed" ? <Button variant="ghost" size="sm" onClick={() => setCurrent(null)}>Start a new check-up</Button> : null}
        </section>
      ) : access.canReview ? (
        <section className="space-y-3">
          <div
            role="button"
            tabIndex={0}
            onClick={() => input.current?.click()}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              addFiles(e.dataTransfer.files);
            }}
            className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-8 text-center transition-colors ${drag ? "border-[#f5c542] bg-[#f5c542]/10" : "border-border hover:border-[#7b3cf0]"}`}
          >
            <UploadCloud aria-hidden className="size-8 text-[#f5c542]" />
            <p className="font-semibold">Drop up to 5 screenshots, or one CSV / Excel report</p>
            <p className="text-xs text-muted-foreground">PNG, JPG or WebP up to 8 MB each · CSV or XLSX up to 5 MB</p>
            <input ref={input} type="file" accept={ACCEPT} multiple hidden onChange={(e) => e.target.files && addFiles(e.target.files)} />
          </div>
          {files.length ? (
            <ul className="space-y-1 text-sm">
              {files.map((f, i) => (
                <li key={`${f.name}-${i}`} className="flex items-center gap-2">
                  <span className="truncate">{f.name}</span>
                  <span className="text-muted-foreground">{(f.size / 1024 / 1024).toFixed(1)} MB</span>
                  <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles(files.filter((_, j) => j !== i))} className="ml-auto"><X className="size-4" /></button>
                </li>
              ))}
            </ul>
          ) : null}
          <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={COACH_LIMITS.noteMax} placeholder="Optional: what's your goal? e.g. more bookings" />
          <Button onClick={() => void submit()} disabled={!files.length || busy !== null} className="w-full sm:w-auto">{busy === "uploading" ? "Sending to Ozzy…" : "Check my ads"}</Button>
          {access.mode === "one_free" ? <p className="text-xs text-muted-foreground">Your plan includes one free check-up. Unlimited check-ups come with Ozzy Ad Department.</p> : null}
        </section>
      ) : (
        <section className="rounded-2xl border border-[#f5c542]/50 bg-[#f5c542]/10 p-5">
          {access.reason === "daily_limit" ? (
            <p className="font-semibold">That&apos;s 10 check-ups today. Ozzy will be ready for more tomorrow.</p>
          ) : (
            <>
              <p className="font-semibold">You&apos;ve used your free check-up.</p>
              <p className="text-sm text-muted-foreground">Ozzy Ad Department gives you unlimited check-ups and unlimited ads.</p>
              <Button asChild className="mt-3"><Link href="/ads/pricing">Get Ozzy Ad Department</Link></Button>
            </>
          )}
        </section>
      )}

      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}

      {home.reviews.length ? (
        <section>
          <h2 className="mb-2 text-lg font-semibold">Past check-ups</h2>
          <ul className="divide-y divide-border rounded-2xl border border-border">
            {home.reviews.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => setCurrent(r)} className="flex w-full items-center gap-3 p-3 text-left hover:bg-muted/40">
                  <span className="text-sm text-muted-foreground tabular-nums">{new Date(r.createdAt).toLocaleDateString()}</span>
                  <span className="min-w-0 flex-1 truncate text-sm">{r.verdict?.summary ?? (r.status === "failed" ? "Couldn't read this one" : "Ozzy is working on it…")}</span>
                  {r.verdict?.winner ? <span className="shrink-0 rounded-full bg-[#f5c542]/20 px-2 py-0.5 text-xs">Winner found</span> : null}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
