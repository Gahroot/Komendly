"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ozzy } from "@/components/ozzy";
import { STUDIO_STARTERS } from "@/lib/studio/contracts";
import type { StudioAccountView } from "@/lib/studio/thread";
import { api } from "./api";
import { Composer } from "./composer";
import { OzzyPerch } from "./ozzy-perch";
import { StudioShell } from "./shell";
import type { SessionSummary } from "./types";
import { useUploads } from "./use-uploads";

/** sessionStorage handoff: the new chat page sends this once on mount. */
export const pendingKey = (id: string) => `studio-send:${id}`;

export function StudioHome({ sessions, account, initialPrompt }: { sessions: SessionSummary[]; account: StudioAccountView; initialPrompt: string | null }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [starterId, setStarterId] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const uploads = useUploads({ onError: (m) => toast.error(m) });
  const once = useRef(false);

  const start = async (content: string, uploadIds: string[], starter?: string) => {
    setBusy(true);
    ozzy.emit({ type: "url:submit" });
    const r = await api<{ session: SessionSummary }>("/api/studio/sessions", { body: { prompt: content, starterId: starter } });
    if (!r.ok) {
      setBusy(false);
      ozzy.emit({ type: "error", kind: "network" });
      return toast.error(r.error);
    }
    sessionStorage.setItem(pendingKey(r.data.session.id), JSON.stringify({ content, uploadIds }));
    router.replace(`/studio/${r.data.session.id}`);
  };

  useEffect(() => {
    ozzy.emit({ type: "page:landing" });
    if (initialPrompt?.trim() && !once.current) {
      once.current = true;
      void start(initialPrompt.trim(), []);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <StudioShell sessions={sessions} account={account} title="New video">
      <main className="studio-scroll flex flex-1 flex-col overflow-y-auto">
        <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-4 py-10">
          <p className="studio-rise text-center font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--studio-gold)]">Ozzy Studio</p>
          <h2 className="studio-rise mt-3 text-balance text-center font-display text-4xl text-[oklch(0.97_0.03_80)] sm:text-5xl">What shall we make <em>today</em>?</h2>
          <p className="studio-rise mx-auto mt-3 max-w-md text-center text-[15px] text-[oklch(0.84_0.03_80)]">
            Promos, launch videos, motion graphics, or your own footage cut into an ad. Just tell Ozzy.
            {!account.paid && account.freeVideosLeft > 0 && <> Your first {account.freeVideosLeft === 1 ? "video is" : `${account.freeVideosLeft} videos are`} free.</>}
          </p>
          <div className="mt-8">
            <OzzyPerch line={busy ? "Opening a fresh scroll…" : "G'day! Describe it, or drop in your clips."} size={72} />
            <Composer
              hero
              value={value}
              onChange={setValue}
              onSubmit={() => void start(value, uploads.readyIds, starterId)}
              streaming={false}
              disabled={busy}
              chips={uploads.chips}
              onFiles={uploads.add}
              onRemoveChip={uploads.remove}
              uploading={uploads.busy}
              textareaRef={textareaRef}
            />
          </div>
          <ul className="mt-4 flex flex-wrap justify-center gap-1.5 opacity-90" aria-label="Ideas to start with (fills the box)">
            {STUDIO_STARTERS.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  className="studio-chip !min-h-8 !px-3 !py-1 !text-xs"
                  onClick={() => {
                    setValue(s.prompt);
                    setStarterId(s.id);
                    ozzy.emit({ type: "goal:select" });
                    requestAnimationFrame(() => {
                      const el = textareaRef.current;
                      el?.focus();
                      el?.setSelectionRange(s.prompt.length, s.prompt.length);
                    });
                  }}
                >
                  {s.title}
                </button>
              </li>
            ))}
          </ul>
          {sessions.length > 0 && (
            <section className="mt-10 md:hidden" aria-label="Recent chats">
              <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[oklch(0.72_0.04_290)]">Recent</p>
              <ul className="space-y-1">
                {sessions.slice(0, 5).map((s) => (
                  <li key={s.id}><a href={`/studio/${s.id}`} className="block truncate rounded-lg bg-white/5 px-3 py-2.5 text-sm text-[oklch(0.92_0.03_80)]">{s.title}</a></li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </main>
    </StudioShell>
  );
}
