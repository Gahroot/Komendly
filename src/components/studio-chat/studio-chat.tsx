"use client";
import { ArrowDown } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ozzy } from "@/components/ozzy";
import { Composer } from "./composer";
import { AssistantMessage, UserMessage } from "./message";
import { LaunchOfferCard, PaywallCard } from "./offer-card";
import { OzzyPerch } from "./ozzy-perch";
import { StudioShell } from "./shell";
import { pendingKey } from "./studio-home";
import type { SessionSummary, ThreadData } from "./types";
import { useStickToBottom } from "./use-stick-to-bottom";
import { useStudioThread } from "./use-studio-thread";
import { useUploads } from "./use-uploads";
import { useOzzyVoice } from "./use-ozzy-voice";
import { voiceNews, voiceStatus } from "@/lib/studio/voice-news";

export function StudioChat({ initial, sessions }: { initial: ThreadData; sessions: SessionSummary[] }) {
  const [line, setLine] = useState<string | null>(null);
  const t = useStudioThread(initial, { onLine: setLine });
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const uploads = useUploads({ sessionId: initial.session.id, onUploaded: (u) => t.addUploads([u]), onError: (m) => toast.error(m) });
  const { scrollRef, contentRef, atBottom, scrollToBottom } = useStickToBottom();
  const sentPending = useRef(false);
  const messagesRef = useRef(t.messages);
  useEffect(() => {
    messagesRef.current = t.messages;
  });

  const submit = useCallback(
    async (text: string, ids: string[] = []) => {
      scrollToBottom();
      const r = await t.send(text, ids);
      if (!r.ok && !r.paywall) toast.error(r.error);
      return r.ok;
    },
    [t, scrollToBottom],
  );

  const voice = useOzzyVoice({
    sessionId: initial.session.id,
    send: (text) => submit(text),
    status: () => voiceStatus(messagesRef.current),
    setDraft: setValue,
  });
  // Studio news (live preview, final video, Ozzy's questions, his reply) read out during a voice call.
  const announced = useRef<Set<string> | null>(null);
  const { announce, mode: voiceMode } = voice;
  useEffect(() => {
    const news = voiceNews(t.messages);
    // First run: everything already on screen counts as said.
    if (!announced.current) {
      announced.current = new Set(news.map((n) => n.key));
      return;
    }
    for (const n of news) {
      if (announced.current.has(n.key)) continue;
      announced.current.add(n.key);
      if (voiceMode === "call") announce(n.note);
    }
  }, [t.messages, announce, voiceMode]);

  // Handoff from /studio (hero composer or ?prompt=): send once.
  useEffect(() => {
    if (sentPending.current) return;
    sentPending.current = true;
    const raw = sessionStorage.getItem(pendingKey(initial.session.id));
    if (!raw) return;
    sessionStorage.removeItem(pendingKey(initial.session.id));
    try {
      const p = JSON.parse(raw) as { content?: string; uploadIds?: string[] };
      const content = p.content;
      if (content) void submit(content, p.uploadIds ?? []).then((ok) => { if (!ok) setValue(content); });
    } catch {
      /* ignore */
    }
  }, [initial.session.id, submit]);

  useEffect(() => {
    if (initial.messages.length === 0) ozzy.emit({ type: "page:landing" });
  }, [initial.messages.length]);

  const send = async () => {
    const text = value;
    const ids = uploads.readyIds;
    setValue("");
    uploads.clear();
    if (!(await submit(text, ids))) setValue(text);
  };
  const prefill = (text: string) => {
    setValue(text);
    // Focus inside the click itself: iOS only opens the keyboard for a synchronous focus in a user gesture.
    textareaRef.current?.focus();
  };

  const lastIdx = t.messages.length - 1;
  const lastUserIdx = t.messages.map((m) => m.role).lastIndexOf("user");
  const watermarkedDelivered = t.renders.some((r) => r.free || r.watermarked);

  return (
    <StudioShell sessions={sessions} activeId={t.session.id} activeSession={t.session} title={t.session.title} account={t.account}>
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div ref={scrollRef} className="studio-scroll flex-1 overflow-y-auto" role="log" aria-label="Conversation with Ozzy" aria-live="off">
          <div ref={contentRef} className="mx-auto w-full max-w-3xl space-y-8 px-4 pb-8 pt-6">
            {t.renders.length > 0 && (
              <nav aria-label="Versions" className="flex gap-2 overflow-x-auto pb-1">
                {t.renders.map((r) => (
                  <a key={r.id} href={`#render-${r.id}`} className="studio-chip shrink-0 font-mono">v{r.version} · {r.ratio}</a>
                ))}
              </nav>
            )}
            {t.messages.length === 0 && (
              <p className="pt-16 text-center font-display text-2xl text-[oklch(0.9_0.03_80)]">Tell Ozzy what to make.</p>
            )}
            {t.messages.map((m, i) => (
              <div key={m.id} className="studio-msg-in">
                {m.role === "user" ? (
                  <UserMessage m={m} uploads={t.uploads} canEdit={i === lastUserIdx && !t.active} onEdit={() => prefill(m.content)} />
                ) : (
                  <AssistantMessage m={m} sessionId={t.session.id} renders={t.renders} isLast={i === lastIdx} busy={t.active} onSend={(x) => void submit(x)} onPrefill={prefill} onRegenerate={() => void t.regenerate()} />
                )}
              </div>
            ))}
            {watermarkedDelivered && !t.active && !t.paywall && <LaunchOfferCard account={t.account} placement="studio_chat" />}
            {t.paywall && <PaywallCard account={t.account} neededCredits={t.paywall.neededCredits} onClose={() => t.setPaywall(null)} />}
          </div>
        </div>
        {!atBottom && (
          <button type="button" onClick={() => scrollToBottom()} className="absolute bottom-40 left-1/2 z-10 grid size-10 -translate-x-1/2 place-items-center rounded-full border border-white/15 bg-[oklch(0.22_0.08_295/0.95)] text-white shadow-lg hover:bg-[oklch(0.28_0.1_295)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-gold)]" aria-label="Scroll to latest">
            <ArrowDown className="size-4" />
          </button>
        )}
        <div className="mx-auto w-full max-w-3xl shrink-0 px-3 pb-[max(12px,env(safe-area-inset-bottom))] sm:px-4">
          <OzzyPerch line={line} size={56} />
          <Composer
            value={value}
            onChange={setValue}
            onSubmit={() => void send()}
            onStop={() => void t.stop()}
            streaming={t.active}
            chips={uploads.chips}
            onFiles={uploads.add}
            onRemoveChip={uploads.remove}
            uploading={uploads.busy}
            textareaRef={textareaRef}
            voice={voice}
            placeholder={t.messages.length ? "Ask for changes, or a new version…" : undefined}
          />
          <p className="mt-1.5 text-center text-[11px] text-[oklch(0.7_0.03_290)]">
            {t.connection === "reconnecting" ? "Reconnecting to Ozzy…" : "New video 5 credits (8 over 30s) · 3 revisions included · Enter to send, Shift+Enter for a new line"}
          </p>
        </div>
      </div>
    </StudioShell>
  );
}
