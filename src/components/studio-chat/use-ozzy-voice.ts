"use client";
// Ozzy's voice: a real-time voice call (WebRTC, started via /api/studio/voice/call) where Ozzy talks back, passes
// requests to the studio as chat messages and reads out studio news. Falls back to the browser's own speech
// recognition (dictation into the composer, auto-send on a pause) when the call can't connect.
import { useCallback, useEffect, useRef, useState } from "react";
import { parseVoiceToolCall } from "@/lib/studio/voice";

export type VoiceMode = "off" | "connecting" | "call" | "dictation";

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type SpeechCtor = new () => SpeechRecognitionLike;

function speechCtor(): SpeechCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function realtimeSupported(): boolean {
  return typeof window !== "undefined" && typeof RTCPeerConnection === "function" && typeof navigator.mediaDevices?.getUserMedia === "function";
}

/** Pause after the last words before dictation sends the message. */
const DICTATION_PAUSE_MS = 1_400;

interface Options {
  sessionId: string;
  /** Post a Studio chat message (the same path as typing). */
  send: (text: string) => Promise<boolean>;
  /** One-line status for get_status. */
  status: () => string;
  /** Dictation fallback: show interim words in the composer. */
  setDraft: (text: string) => void;
}

export function useOzzyVoice(o: Options) {
  const [supported, setSupported] = useState(false);
  const [mode, setMode] = useState<VoiceMode>("off");
  const [handsFree, setHandsFree] = useState(true);
  const [talking, setTalking] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [level, setLevel] = useState(0);
  const opts = useRef(o);
  const pc = useRef<RTCPeerConnection | null>(null);
  const dc = useRef<RTCDataChannel | null>(null);
  const mic = useRef<MediaStream | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const ctx = useRef<AudioContext | null>(null);
  const raf = useRef<number | null>(null);
  const rec = useRef<SpeechRecognitionLike | null>(null);
  const pauseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dictation = useRef({ text: "", on: false });
  const handsFreeRef = useRef(handsFree);
  useEffect(() => {
    opts.current = o;
    handsFreeRef.current = handsFree;
  });
  useEffect(() => setSupported(realtimeSupported() || speechCtor() !== null), []);

  const sendEvent = useCallback((e: Record<string, unknown>) => {
    if (dc.current?.readyState === "open") dc.current.send(JSON.stringify(e));
  }, []);

  const stopAll = useCallback(() => {
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = null;
    dc.current?.close();
    pc.current?.close();
    mic.current?.getTracks().forEach((t) => t.stop());
    void ctx.current?.close().catch(() => undefined);
    if (audio.current) audio.current.srcObject = null;
    dc.current = null;
    pc.current = null;
    mic.current = null;
    ctx.current = null;
    dictation.current.on = false;
    if (pauseTimer.current) clearTimeout(pauseTimer.current);
    rec.current?.abort();
    rec.current = null;
    setSpeaking(false);
    setTalking(false);
    setLevel(0);
    setMode("off");
  }, []);
  useEffect(() => stopAll, [stopAll]);

  // ---- Dictation fallback (browser speech recognition, free) ----
  const startDictation = useCallback((): boolean => {
    const Ctor = speechCtor();
    if (!Ctor) return false;
    const r = new Ctor();
    r.continuous = true;
    r.interimResults = true;
    r.lang = navigator.language || "en-US";
    dictation.current = { text: "", on: true };
    const flush = () => {
      const text = dictation.current.text.trim();
      dictation.current.text = "";
      if (!text) return;
      opts.current.setDraft("");
      void opts.current.send(text).then((ok) => { if (!ok) opts.current.setDraft(text); });
      if (!handsFreeRef.current) {
        dictation.current.on = false;
        r.stop();
      }
    };
    r.onresult = (e) => {
      let finalText = "";
      let interim = "";
      for (let i = 0; i < e.results.length; i++) {
        const res = e.results[i];
        if (!res) continue;
        const t = res[0]?.transcript ?? "";
        if (res.isFinal) finalText += t;
        else interim += t;
      }
      dictation.current.text = `${finalText}${interim}`;
      opts.current.setDraft(dictation.current.text);
      if (pauseTimer.current) clearTimeout(pauseTimer.current);
      pauseTimer.current = setTimeout(flush, DICTATION_PAUSE_MS);
    };
    r.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") dictation.current.on = false;
    };
    // Chrome ends recognition after silence: keep listening while dictation is on.
    r.onend = () => {
      if (dictation.current.on) {
        try { r.start(); } catch { stopAll(); }
      } else {
        rec.current = null;
        setMode("off");
      }
    };
    rec.current = r;
    try {
      r.start();
    } catch {
      return false;
    }
    setMode("dictation");
    return true;
  }, [stopAll]);

  /** Dictation: send what was heard right now (tap). */
  const sendNow = useCallback(() => {
    if (pauseTimer.current) clearTimeout(pauseTimer.current);
    const text = dictation.current.text.trim();
    dictation.current.text = "";
    if (text) {
      opts.current.setDraft("");
      void opts.current.send(text);
    }
    dictation.current.on = false;
    rec.current?.stop();
  }, []);

  // ---- Realtime call ----
  const meter = useCallback((streams: MediaStream[]) => {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ac = new AC();
    ctx.current = ac;
    const an = ac.createAnalyser();
    an.fftSize = 256;
    for (const s of streams) ac.createMediaStreamSource(s).connect(an);
    const buf = new Uint8Array(an.frequencyBinCount);
    const loop = () => {
      an.getByteTimeDomainData(buf);
      let peak = 0;
      for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
      setLevel(Math.min(1, peak / 64));
      raf.current = requestAnimationFrame(loop);
    };
    loop();
  }, []);

  const onServerEvent = useCallback(async (raw: string) => {
    let e: Record<string, unknown>;
    try {
      e = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return;
    }
    if (e.type === "output_audio_buffer.started") setSpeaking(true);
    else if (e.type === "output_audio_buffer.stopped" || e.type === "output_audio_buffer.cleared") setSpeaking(false);
    else if (e.type === "response.function_call_arguments.done") {
      const call = parseVoiceToolCall(e.name, e.arguments);
      let output: string;
      if (call.name === "send_to_studio") output = (await opts.current.send(call.message)) ? "Sent. The studio is working on it." : "It couldn't be sent right now (for example the studio is still busy). Tell the user briefly.";
      else if (call.name === "get_status") output = opts.current.status();
      else output = "Unknown request.";
      sendEvent({ type: "conversation.item.create", item: { type: "function_call_output", call_id: e.call_id, output } });
      sendEvent({ type: "response.create" });
    }
  }, [sendEvent]);

  const startCall = useCallback(async (): Promise<boolean> => {
    if (!realtimeSupported()) return false;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      return false;
    }
    const conn = new RTCPeerConnection();
    pc.current = conn;
    mic.current = stream;
    const el = audio.current ?? new Audio();
    el.autoplay = true;
    audio.current = el;
    conn.ontrack = (ev) => {
      const remote = ev.streams[0];
      if (!remote) return;
      el.srcObject = remote;
      void el.play().catch(() => undefined);
      meter([remote, stream]);
    };
    for (const t of stream.getAudioTracks()) {
      t.enabled = handsFreeRef.current;
      conn.addTrack(t, stream);
    }
    const ch = conn.createDataChannel("oai-events");
    dc.current = ch;
    ch.onmessage = (m) => void onServerEvent(String(m.data));
    ch.onopen = () => sendEvent({ type: "response.create", response: { instructions: "Greet the user in one short sentence and ask what they'd like to change or make." } });
    conn.onconnectionstatechange = () => {
      if (conn.connectionState === "failed" || conn.connectionState === "closed") stopAll();
    };
    try {
      const offer = await conn.createOffer();
      await conn.setLocalDescription(offer);
      const res = await fetch("/api/studio/voice/call", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: opts.current.sessionId, sdp: offer.sdp }), cache: "no-store" });
      const body = (await res.json().catch(() => ({}))) as { sdp?: string };
      if (!res.ok || !body.sdp) throw new Error("voice unavailable");
      await conn.setRemoteDescription({ type: "answer", sdp: body.sdp });
    } catch {
      conn.close();
      stream.getTracks().forEach((t) => t.stop());
      pc.current = null;
      mic.current = null;
      dc.current = null;
      return false;
    }
    setMode("call");
    return true;
  }, [meter, onServerEvent, sendEvent, stopAll]);

  const start = useCallback(async () => {
    if (mode !== "off") return;
    setMode("connecting");
    if (await startCall()) return;
    if (!startDictation()) setMode("off");
  }, [mode, startCall, startDictation]);

  /** Push-to-talk (hands-free off): the mic is live only while held. */
  const setPushing = useCallback((on: boolean) => {
    setTalking(on);
    if (!handsFreeRef.current) mic.current?.getAudioTracks().forEach((t) => (t.enabled = on));
  }, []);

  const toggleHandsFree = useCallback(() => {
    setHandsFree((h) => {
      const next = !h;
      handsFreeRef.current = next;
      mic.current?.getAudioTracks().forEach((t) => (t.enabled = next));
      return next;
    });
  }, []);

  /** Studio news for Ozzy to say out loud (call mode only). */
  const announce = useCallback((note: string) => {
    if (!dc.current || dc.current.readyState !== "open") return;
    sendEvent({ type: "conversation.item.create", item: { type: "message", role: "system", content: [{ type: "input_text", text: `Studio update: ${note}` }] } });
    sendEvent({ type: "response.create" });
  }, [sendEvent]);

  return { supported, mode, handsFree, toggleHandsFree, talking, setPushing, speaking, level, start, stop: stopAll, sendNow, announce };
}

export type OzzyVoice = ReturnType<typeof useOzzyVoice>;
