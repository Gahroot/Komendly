"use client";
import { AlertTriangle, Check, ChevronDown, Copy, FileAudio, Pencil, RotateCcw } from "lucide-react";
import { memo, useState } from "react";
import { composeAnswers, type RenderView, type StudioQuestion, type ThreadMessage, type UploadView } from "@/lib/studio/thread";
import { mediaUrl } from "./api";
import { PhaseOrb } from "./phase-orb";
import { Markdown } from "./markdown";
import { LiveCard } from "./live-card";
import { RenderCard } from "./render-card";
import { useSmoothText } from "./use-smooth-text";

const PHASE_LABEL: Record<string, string> = {
  thinking: "Ozzy is thinking",
  looking: "Ozzy is looking at your files",
  building: "Ozzy is building scenes",
  rendering: "Ozzy is rendering",
  reviewing: "Ozzy is checking every frame",
};

function Attachment({ u }: { u: UploadView | undefined }) {
  if (!u) return null;
  const thumb = u.posterKey ?? (u.mime.startsWith("image/") ? u.key : null);
  return (
    <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-xl border border-white/12 bg-black/30" title={u.filename}>
      {thumb ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={mediaUrl({ key: thumb })} alt={u.filename} className="h-full w-full object-cover" loading="lazy" />
      ) : u.mime.startsWith("video/") ? (
        <video src={mediaUrl({ key: u.key })} muted playsInline preload="metadata" className="h-full w-full object-cover" aria-label={u.filename} />
      ) : (
        <span className="flex flex-col items-center gap-1 px-1 text-center text-[10px] text-[oklch(0.85_0.03_80)]"><FileAudio className="size-5 text-[var(--studio-gold)]" aria-hidden />{u.filename.slice(0, 14)}</span>
      )}
    </div>
  );
}

export const UserMessage = memo(function UserMessage({ m, uploads, canEdit, onEdit }: { m: ThreadMessage; uploads: Record<string, UploadView>; canEdit: boolean; onEdit: () => void }) {
  return (
    <div className="group flex flex-col items-end gap-2">
      {m.uploadIds.length > 0 && <div className="flex flex-wrap justify-end gap-2">{m.uploadIds.map((id) => <Attachment key={id} u={uploads[id]} />)}</div>}
      <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-3xl rounded-br-lg bg-[oklch(0.3_0.1_295/0.92)] px-4 py-2.5 text-[15px] leading-7 text-[oklch(0.97_0.03_80)] shadow-[inset_0_1px_0_#ffffff14]">
        {m.content}
      </div>
      {canEdit && (
        <button type="button" onClick={onEdit} className="studio-icon-btn opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 max-sm:opacity-100" aria-label="Edit and resend">
          <Pencil className="size-3.5" />
        </button>
      )}
    </div>
  );
});

/** Slim gold render bar: real pct from the renderer, ETA only when the engine knows it. */
export function RenderProgress({ pct, label, etaSec }: { pct: number; label: string; etaSec?: number }) {
  const eta = etaSec === undefined ? null : etaSec < 60 ? `about ${Math.max(1, etaSec)}s left` : `about ${Math.round(etaSec / 60)} min left`;
  return (
    <div className="studio-rise w-full max-w-md" data-testid="render-progress">
      <div className="mb-1.5 flex items-baseline justify-between gap-3 text-xs text-[oklch(0.86_0.03_80)]">
        <span className="truncate">{label}</span>
        <span className="shrink-0 tabular-nums text-[oklch(0.78_0.03_290)]">{Math.round(pct)}%{eta ? ` · ${eta}` : ""}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
        <div className="h-full rounded-full bg-[var(--studio-gold)] transition-[width] duration-500 ease-out" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Steps({ m, live }: { m: ThreadMessage; live: boolean }) {
  const [open, setOpen] = useState(false);
  const current = live ? (m.phaseLabel ?? PHASE_LABEL[m.phase ?? "thinking"] ?? "Ozzy is working") : null;
  if (!live && m.steps.length === 0) return null;
  const last = m.steps[m.steps.length - 1];
  return (
    <div className="text-sm">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-2 rounded-full py-1 pr-2 text-[oklch(0.84_0.04_290)] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-gold)]"
        aria-expanded={open}
        disabled={m.steps.length === 0}
      >
        {live ? <PhaseOrb phase={m.phase} label={last && m.phase === "building" ? last.label : current} /> : <Check className="size-4 text-[var(--studio-gold)]" aria-hidden />}
        <span className={live ? "studio-shimmer font-medium" : ""}>{live ? (last && m.phase === "building" ? last.label : current) : `${m.steps.length} step${m.steps.length === 1 ? "" : "s"}`}</span>
        {m.steps.length > 0 && <ChevronDown className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />}
      </button>
      {open && (
        <ol className="mt-1 ml-[7px] space-y-1.5 border-l border-white/12 pl-4">
          {m.steps.map((s, i) => (
            <li key={i} className="relative text-[oklch(0.86_0.03_80)]">
              <span className="absolute -left-[21px] top-2 size-2 rounded-full bg-[var(--studio-gold)]/80" aria-hidden />
              {s.label}
              {s.detail && <span className="block text-xs text-[oklch(0.74_0.04_290)]">{s.detail}</span>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

interface AssistantProps {
  m: ThreadMessage;
  sessionId: string;
  renders: RenderView[];
  isLast: boolean;
  busy: boolean;
  onSend: (text: string) => void;
  onPrefill: (text: string) => void;
  onRegenerate: () => void;
}

export const AssistantMessage = memo(function AssistantMessage({ m, sessionId, renders, isLast, busy, onSend, onPrefill, onRegenerate }: AssistantProps) {
  const live = m.status === "queued" || m.status === "streaming";
  const text = useSmoothText(m.content, live);
  const [copied, setCopied] = useState(false);
  const mine = renders.filter((r) => m.renderIds.includes(r.id) || r.messageId === m.id);
  return (
    <div className="flex flex-col gap-3" aria-busy={live}>
      <Steps m={m} live={live} />
      {live && m.progress && <RenderProgress pct={m.progress.pct} label={m.progress.label} etaSec={m.progress.etaSec} />}
      {m.previews.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {m.previews.map((p) => (
            <figure key={p.key} className="w-40 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-black/30">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url ?? mediaUrl({ key: p.key })} alt={p.caption ?? "Preview frame"} className="aspect-video w-full object-cover" loading="lazy" />
              {p.caption && <figcaption className="truncate px-2 py-1 text-[11px] text-[oklch(0.82_0.03_80)]">{p.caption}</figcaption>}
            </figure>
          ))}
        </div>
      )}
      {(text || (live && m.steps.length === 0 && !m.phase)) && <Markdown text={text} caret={live} />}
      {(m.questions?.length || m.question) && (
        <QuestionCard questions={m.questions?.length ? m.questions : [m.question!]} disabled={!isLast || busy} onSend={onSend} onPrefill={onPrefill} />
      )}
      {m.live && mine.length === 0 && m.status !== "cancelled" && <LiveCard key={m.live.version} sessionId={sessionId} live={m.live} finishing={live} />}
      {mine.map((r) => <RenderCard key={r.id} render={r} disabled={busy} onSend={onSend} onRemix={onPrefill} />)}
      {(m.status === "error" || m.status === "cancelled") && (
        <div className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm ${m.status === "error" ? "bg-[oklch(0.35_0.12_25/0.35)] text-[oklch(0.92_0.06_40)]" : "text-[oklch(0.78_0.03_290)]"}`} role={m.status === "error" ? "alert" : undefined}>
          {m.status === "error" && <AlertTriangle className="size-4 shrink-0" aria-hidden />}
          {m.status === "cancelled" ? "Stopped." : (m.error ?? "Something went wrong.")}
        </div>
      )}
      {!live && (
        <div className="flex gap-1 text-[oklch(0.78_0.03_290)]">
          {m.content && (
            <button
              type="button"
              className="studio-icon-btn"
              aria-label="Copy reply"
              onClick={() => {
                void navigator.clipboard.writeText(m.content);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            </button>
          )}
          {isLast && (
            <button type="button" className="studio-icon-btn" aria-label="Regenerate" disabled={busy} onClick={onRegenerate}>
              <RotateCcw className="size-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
});

/** Ozzy's questions (ask_user can carry several): pick one option per question, then send all answers in one message. */
function QuestionCard({ questions, disabled, onSend, onPrefill }: { questions: StudioQuestion[]; disabled: boolean; onSend: (t: string) => void; onPrefill: (t: string) => void }) {
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const single = questions.length === 1;
  const answered = questions.filter((_, i) => answers[i]).length;
  const pick = (i: number, label: string) => {
    if (single) return onSend(label);
    setAnswers((a) => ({ ...a, [i]: label }));
  };
  return (
    <div className="studio-rise flex flex-col gap-3 rounded-2xl border border-white/12 bg-[oklch(0.2_0.07_295/0.8)] p-3">
      {!single && <p className="px-1 text-xs uppercase tracking-[0.18em] text-[var(--studio-gold)]">Ozzy has {questions.length} quick questions</p>}
      {questions.map((q, i) => (
        <fieldset key={q.question} className="rounded-xl">
          <legend className="px-1 font-display text-lg text-[oklch(0.97_0.03_80)]">
            {!single && <span className="mr-2 text-sm text-[oklch(0.78_0.03_290)]">{i + 1}.</span>}
            {q.question}
          </legend>
          <div className="mt-1 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label={q.question}>
            {q.options.map((o) => {
              const chosen = answers[i] === o.label;
              return (
                <button
                  key={o.value}
                  type="button"
                  role={single ? undefined : "radio"}
                  aria-checked={single ? undefined : chosen}
                  disabled={disabled}
                  onClick={() => pick(i, o.label)}
                  className={`rounded-xl border px-3 py-2.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-gold)] disabled:opacity-50 ${chosen ? "border-[var(--studio-gold)] bg-[oklch(0.33_0.1_295/0.95)] ring-1 ring-[var(--studio-gold)]" : o.recommended ? "border-[var(--studio-gold)]/70 bg-[oklch(0.27_0.09_295/0.9)]" : "border-white/10 bg-black/20 hover:border-white/25 hover:bg-white/5"}`}
                >
                  <span className="font-medium text-[oklch(0.97_0.03_80)]">{o.label}</span>
                  {o.recommended && <span className="ml-2 rounded-full bg-[var(--studio-gold)] px-1.5 py-0.5 text-[10px] font-bold uppercase text-[#2a0f10]">Ozzy&apos;s pick</span>}
                  {o.hint && <span className="mt-0.5 block text-xs text-[oklch(0.78_0.03_290)]">{o.hint}</span>}
                </button>
              );
            })}
            {q.allowOther && (
              single ? (
                <button type="button" disabled={disabled} onClick={() => onPrefill("")} className="rounded-xl border border-dashed border-white/15 px-3 py-2.5 text-left text-sm text-[oklch(0.86_0.03_80)] hover:bg-white/5 disabled:opacity-50">
                  Something else… <span className="block text-xs text-[oklch(0.74_0.03_290)]">Type your own answer below</span>
                </button>
              ) : (
                <input
                  type="text"
                  disabled={disabled}
                  placeholder="Something else…"
                  aria-label={`Your own answer: ${q.question}`}
                  value={q.options.some((o) => o.label === answers[i]) ? "" : (answers[i] ?? "")}
                  onChange={(e) => setAnswers((a) => ({ ...a, [i]: e.target.value }))}
                  className="rounded-xl border border-dashed border-white/15 bg-transparent px-3 py-2.5 text-sm text-[oklch(0.95_0.03_80)] placeholder:text-[oklch(0.74_0.03_290)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-gold)] disabled:opacity-50"
                />
              )
            )}
          </div>
        </fieldset>
      ))}
      {!single && (
        <div className="flex items-center justify-between gap-3 px-1">
          <span className="text-xs text-[oklch(0.78_0.03_290)]">{answered} of {questions.length} answered{answered < questions.length ? " · Ozzy picks the rest" : ""}</span>
          <button
            type="button"
            disabled={disabled || answered === 0}
            onClick={() => {
              const filled = Object.fromEntries(questions.map((q, i) => [i, answers[i] || q.options.find((o) => o.recommended)?.label || ""]));
              onSend(composeAnswers(questions, filled));
            }}
            className="spellbar__cta rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            Send answers
          </button>
        </div>
      )}
    </div>
  );
}
