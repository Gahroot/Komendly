"use client";
// The chat engine of Ozzy Studio: optimistic sends, SSE tail with Last-Event-ID resume, stop, regenerate.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ozzy } from "@/components/ozzy";
import { applyEvent, applyEvents, isActiveStatus, ozzyEventFor, type RenderView, type ThreadEvent, type ThreadMessage, type UploadView } from "@/lib/studio/thread";
import { api } from "./api";
import type { Paywall, SessionSummary, ThreadData } from "./types";

function blankMessage(id: string, role: "user" | "assistant", content: string, uploadIds: string[] = []): ThreadMessage {
  return {
    id, role, content, status: role === "user" ? "done" : "queued", createdAt: new Date().toISOString(), uploadIds, steps: [], previews: [],
    question: null, renderIds: [], phase: role === "assistant" ? "thinking" : null, phaseLabel: null, error: null, final: role === "user",
  };
}

function renderFromEvent(e: ThreadEvent): RenderView | null {
  const d = e.data;
  if (typeof d.renderId !== "string") return null;
  return {
    id: d.renderId,
    version: typeof d.version === "number" ? d.version : 1,
    ratio: typeof d.ratio === "string" ? d.ratio : "9:16",
    seconds: typeof d.seconds === "number" ? d.seconds : 0,
    watermarked: d.watermarked === true,
    free: d.free === true || d.watermarked === true,
    messageId: e.messageId,
    posterKey: typeof d.posterKey === "string" ? d.posterKey : null,
    shareToken: null,
    createdAt: new Date().toISOString(),
  };
}

export function useStudioThread(initial: ThreadData, opts: { onLine?: (line: string | null) => void } = {}) {
  const sessionId = initial.session.id;
  const [session, setSession] = useState<SessionSummary>(initial.session);
  const [messages, setMessages] = useState<ThreadMessage[]>(() => applyEvents(initial.messages, initial.events));
  const [renders, setRenders] = useState<RenderView[]>(initial.renders);
  const [uploads, setUploads] = useState<Record<string, UploadView>>(() => Object.fromEntries(initial.uploads.map((u) => [u.id, u])));
  const [account, setAccount] = useState(initial.account);
  const [paywall, setPaywall] = useState<Paywall | null>(null);
  const [connection, setConnection] = useState<"idle" | "live" | "reconnecting">("idle");
  const lastEventId = useRef(initial.lastEventId);
  const [streamGen, setStreamGen] = useState(0);
  const es = useRef<EventSource | null>(null);
  const retry = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attempts = useRef(0);
  // The reconnect timer calls the latest `connect` through this ref (connect can't reference itself while being declared).
  const connectRef = useRef<() => void>(() => undefined);
  const knownIds = useRef(new Set<string>());
  const resyncing = useRef(false);
  const onLine = useRef(opts.onLine);
  // Latest values for the stream handlers, synced after each commit (not during render).
  useLayoutEffect(() => {
    knownIds.current = new Set(messages.map((m) => m.id));
    onLine.current = opts.onLine;
  });

  const refresh = useCallback(async () => {
    const r = await api<ThreadData>(`/api/studio/sessions/${sessionId}`);
    if (!r.ok) return;
    lastEventId.current = r.data.lastEventId;
    setSession(r.data.session);
    setMessages(applyEvents(r.data.messages, r.data.events));
    setRenders(r.data.renders);
    setUploads(Object.fromEntries(r.data.uploads.map((u) => [u.id, u])));
    setAccount(r.data.account);
  }, [sessionId]);

  const close = useCallback(() => {
    es.current?.close();
    es.current = null;
    if (retry.current) clearTimeout(retry.current);
    retry.current = null;
    setConnection("idle");
  }, []);

  const connect = useCallback(() => {
    if (es.current) return;
    const source = new EventSource(`/api/studio/sessions/${sessionId}/stream?after=${encodeURIComponent(lastEventId.current)}`);
    es.current = source;
    source.onopen = () => {
      attempts.current = 0;
      setConnection("live");
    };
    source.onmessage = (msg) => {
      let e: ThreadEvent;
      try {
        e = JSON.parse(msg.data) as ThreadEvent;
      } catch {
        return;
      }
      // An event for a message we don't have (e.g. the chat mounted from a snapshot taken before the handoff send
      // landed): re-sync from the server, then resume the tail from the snapshot's cursor (no double-applied deltas).
      if (e.messageId && !knownIds.current.has(e.messageId)) {
        if (!resyncing.current) {
          resyncing.current = true;
          close();
          void refresh().finally(() => {
            resyncing.current = false;
            setStreamGen((g) => g + 1);
          });
        }
        return;
      }
      if (msg.lastEventId) lastEventId.current = msg.lastEventId;
      setMessages((prev) => applyEvent(prev, e));
      if (e.type === "render") {
        const r = renderFromEvent(e);
        if (r) setRenders((prev) => (prev.some((x) => x.id === r.id) ? prev : [...prev, r].sort((a, b) => a.version - b.version)));
      }
      if (e.type === "charge") {
        const d = e.data;
        setAccount((a) => ({ ...a, balance: typeof d.balanceAfter === "number" ? d.balanceAfter : a.balance, freeVideosLeft: typeof d.freeVideosLeft === "number" ? d.freeVideosLeft : a.freeVideosLeft }));
      }
      const oz = ozzyEventFor(e);
      if (oz) {
        ozzy.emit(oz.event);
        onLine.current?.(oz.line ?? null);
      }
      if (e.type === "status" && (e.data.phase === "thinking" || e.data.phase === "building")) setSession((s) => ({ ...s, status: "working" }));
    };
    source.addEventListener("end", () => {
      close();
      // The stream can end before our own send lands (session still idle): re-sync, then the tail effect reconnects if needed.
      void refresh().then(() => setTimeout(() => setStreamGen((g) => g + 1), 400));
    });
    source.onerror = () => {
      // Browser auto-reconnects (with Last-Event-ID) while CONNECTING; if it gave up, back off and retry ourselves.
      setConnection("reconnecting");
      if (source.readyState === EventSource.CLOSED) {
        es.current = null;
        const wait = Math.min(15_000, 1000 * 2 ** attempts.current++);
        retry.current = setTimeout(() => connectRef.current(), wait);
      }
    };
  }, [sessionId, close, refresh]);
  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  const active = messages.some((m) => m.role === "assistant" && isActiveStatus(m.status)) || session.status === "queued" || session.status === "working";

  // Tail while a turn is in flight (also after a reload mid-turn).
  useEffect(() => {
    if (active) connect();
  }, [active, connect, streamGen]);
  useEffect(() => close, [close]);

  // Back on the tab or network: re-sync.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && !es.current) void refresh();
    };
    window.addEventListener("online", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  const send = useCallback(
    async (content: string, uploadIds: string[] = []): Promise<{ ok: true } | { ok: false; error: string; paywall?: boolean }> => {
      const text = content.trim();
      if (!text) return { ok: false, error: "Type a message first." };
      const tmpUser = `tmp-u-${Date.now()}`;
      const tmpAsst = `tmp-a-${Date.now()}`;
      setPaywall(null);
      setMessages((prev) => [...prev, blankMessage(tmpUser, "user", text, uploadIds), blankMessage(tmpAsst, "assistant", "")]);
      ozzy.emit({ type: "url:submit" });
      onLine.current?.("On it!");
      const r = await api<{ userMessage: ThreadMessage; assistantMessage: ThreadMessage; session: SessionSummary }>(`/api/studio/sessions/${sessionId}/messages`, {
        body: { content: text, uploadIds },
      });
      if (!r.ok) {
        setMessages((prev) => prev.filter((m) => m.id !== tmpUser && m.id !== tmpAsst));
        if (r.status === 402) {
          setPaywall({ code: r.code, neededCredits: typeof r.body.neededCredits === "number" ? r.body.neededCredits : 5 });
          ozzy.emit({ type: "upsell:shown" });
          onLine.current?.("We'll need a few credits for that one.");
          return { ok: false, error: r.error, paywall: true };
        }
        ozzy.emit({ type: "error", kind: r.code === "network" ? "network" : "validation" });
        onLine.current?.(null);
        return { ok: false, error: r.error };
      }
      setMessages((prev) => prev.map((m) => (m.id === tmpUser ? r.data.userMessage : m.id === tmpAsst ? { ...r.data.assistantMessage, phase: "thinking" } : m)));
      setSession(r.data.session);
      return { ok: true };
    },
    [sessionId],
  );

  const stop = useCallback(async () => {
    setMessages((prev) => prev.map((m) => (m.role === "assistant" && isActiveStatus(m.status) ? { ...m, status: "cancelled", phase: null } : m)));
    onLine.current?.("No worries, stopped.");
    ozzy.emit({ type: "review:confirmed" });
    await api(`/api/studio/sessions/${sessionId}/cancel`, { body: {} });
    close();
    await refresh();
  }, [sessionId, close, refresh]);

  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const regenerate = useCallback(async () => {
    if (lastUser) return send(lastUser.content, lastUser.uploadIds);
    return { ok: false as const, error: "Nothing to regenerate." };
  }, [lastUser, send]);

  const addUploads = useCallback((list: UploadView[]) => setUploads((prev) => ({ ...prev, ...Object.fromEntries(list.map((u) => [u.id, u])) })), []);

  return { session, setSession, messages, renders, uploads, addUploads, account, paywall, setPaywall, connection, active, send, stop, regenerate, refresh, lastUser };
}
