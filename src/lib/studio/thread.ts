// Ozzy Studio chat thread: client-safe view types + the pure fold of StudioEvent rows into messages.
import type { OzzyEvent } from "@/components/ozzy/types";
import type { StudioPhase } from "./contracts";

export type MessageStatus = "queued" | "streaming" | "done" | "error" | "cancelled";

export interface QuestionOption { label: string; value: string; hint?: string; recommended?: boolean }
export interface StudioQuestion { question: string; options: QuestionOption[]; allowOther?: boolean }
export interface ThreadStep { label: string; detail?: string }
export interface ThreadProgress { pct: number; label: string; etaSec?: number }
/** A playable live preview of the work in progress (StudioEvent `live`). */
export interface ThreadLive { version: string; ratio: string; width: number; height: number }
export interface ThreadPreview { key: string; url?: string; caption?: string }

export interface UploadView {
  id: string;
  filename: string;
  mime: string;
  bytes: number;
  status: string;
  key: string;
  posterKey: string | null;
  durationSec: number | null;
}

export interface RenderView {
  id: string;
  version: number;
  ratio: string;
  seconds: number;
  watermarked: boolean;
  free: boolean;
  messageId: string | null;
  posterKey: string | null;
  shareToken: string | null;
  createdAt: string;
}

export interface ThreadMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  status: MessageStatus;
  createdAt: string;
  uploadIds: string[];
  steps: ThreadStep[];
  previews: ThreadPreview[];
  question: StudioQuestion | null;
  /** Every question of the current ask (ask_user can carry several); `question` = the last one (legacy). */
  questions?: StudioQuestion[];
  renderIds: string[];
  /** Newest live preview of this turn (replaced by the final video once it lands). */
  live?: ThreadLive | null;
  phase: StudioPhase | null;
  phaseLabel: string | null;
  /** Latest honest render/encode progress (cleared when the turn ends or a render lands). */
  progress?: ThreadProgress | null;
  error: string | null;
  /** Content came from the DB final write: text deltas must not be appended again. */
  final: boolean;
}

export interface ThreadEvent {
  id: string;
  messageId: string | null;
  type: string;
  data: Record<string, unknown>;
}

export interface StudioAccountView {
  balance: number;
  paid: boolean;
  plan: string;
  freeVideosLeft: number;
  offer: { open: boolean; endsAt: string | null };
  /** Launch Quarter window open: shown INSTEAD of the Studio launch offer (one offer at a time). */
  launchQuarter?: { open: boolean; endsAt: string | null };
}

const PHASES: readonly string[] = ["thinking", "looking", "building", "rendering", "reviewing", "done", "error"];

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

export function parseQuestion(d: Record<string, unknown>): StudioQuestion | null {
  const question = str(d.question);
  if (!question) return null;
  const raw = Array.isArray(d.options) ? d.options : [];
  const options: QuestionOption[] = [];
  for (const o of raw) {
    if (!o || typeof o !== "object") continue;
    const r = o as Record<string, unknown>;
    const label = str(r.label);
    if (!label) continue;
    options.push({ label, value: str(r.value) ?? label, hint: str(r.hint), recommended: r.recommended === true });
  }
  return { question, options, allowOther: d.allowOther === true };
}

/** Which message an event belongs to: its messageId, else the latest assistant message. */
function targetIndex(messages: readonly ThreadMessage[], e: ThreadEvent): number {
  if (e.messageId) return messages.findIndex((m) => m.id === e.messageId);
  for (let i = messages.length - 1; i >= 0; i--) if (messages[i]?.role === "assistant") return i;
  return -1;
}

/** Pure: apply one stream event. Returns the same array when nothing changed. */
export function applyEvent(messages: readonly ThreadMessage[], e: ThreadEvent): ThreadMessage[] {
  const i = targetIndex(messages, e);
  const m = messages[i];
  if (!m) return messages as ThreadMessage[];
  const d = e.data;
  let next: ThreadMessage = m;
  const live: MessageStatus = m.status === "queued" ? "streaming" : m.status;
  switch (e.type) {
    case "status": {
      const phase = str(d.phase);
      next = { ...m, status: live, phase: phase && PHASES.includes(phase) ? (phase as StudioPhase) : m.phase, phaseLabel: str(d.label) ?? m.phaseLabel };
      break;
    }
    case "text_delta":
      if (m.final) return messages as ThreadMessage[];
      next = { ...m, status: live, content: m.content + (str(d.text) ?? "") };
      break;
    case "tool": {
      const label = str(d.label);
      if (!label) return messages as ThreadMessage[];
      next = { ...m, status: live, steps: [...m.steps, { label, detail: str(d.detail) }] };
      break;
    }
    case "preview": {
      const key = str(d.key);
      if (!key) return messages as ThreadMessage[];
      next = { ...m, status: live, previews: [...m.previews.filter((p) => p.key !== key), { key, url: str(d.url), caption: str(d.caption) }] };
      break;
    }
    case "progress": {
      const pct = typeof d.pct === "number" && Number.isFinite(d.pct) ? Math.max(0, Math.min(100, d.pct)) : null;
      if (pct === null) return messages as ThreadMessage[];
      const eta = typeof d.etaSec === "number" && Number.isFinite(d.etaSec) && d.etaSec >= 0 ? Math.round(d.etaSec) : undefined;
      next = { ...m, status: live, phase: "rendering", progress: { pct, label: str(d.label) ?? m.progress?.label ?? "Rendering", etaSec: eta } };
      break;
    }
    case "question": {
      const q = parseQuestion(d);
      if (!q) return messages as ThreadMessage[];
      const prev = m.questions ?? (m.question ? [m.question] : []);
      // Replays (reconnect) must not duplicate a question.
      if (prev.some((x) => x.question === q.question)) return messages as ThreadMessage[];
      next = { ...m, question: q, questions: [...prev, q] };
      break;
    }
    case "live": {
      const version = str(d.version);
      const num = (v: unknown, dflt: number) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : dflt);
      if (!version || !/^[A-Za-z0-9_-]{1,80}$/.test(version)) return messages as ThreadMessage[];
      next = { ...m, live: { version, ratio: str(d.ratio) ?? "9:16", width: num(d.width, 1080), height: num(d.height, 1920) } };
      break;
    }
    case "render": {
      const id = str(d.renderId);
      if (!id || m.renderIds.includes(id)) return messages as ThreadMessage[];
      next = { ...m, renderIds: [...m.renderIds, id], progress: null };
      break;
    }
    case "error":
      next = { ...m, status: str(d.code) === "cancelled" ? "cancelled" : "error", error: str(d.message) ?? "Something went wrong.", phase: "error", progress: null };
      break;
    case "done":
      next = { ...m, status: m.status === "error" || m.status === "cancelled" ? m.status : "done", phase: "done", progress: null };
      break;
    default:
      return messages as ThreadMessage[];
  }
  const out = messages.slice();
  out[i] = next;
  return out;
}

export function applyEvents(messages: readonly ThreadMessage[], events: readonly ThreadEvent[]): ThreadMessage[] {
  let out = messages as ThreadMessage[];
  for (const e of events) out = applyEvent(out, e);
  return out;
}

export function isActiveStatus(s: MessageStatus): boolean {
  return s === "queued" || s === "streaming";
}

/** Map a stream event to the Ozzy mascot event (his pose follows real events only) + his Studio line. */
export function ozzyEventFor(e: ThreadEvent): { event: OzzyEvent; line?: string } | null {
  if (e.type === "status") {
    const phase = str(e.data.phase);
    const label = str(e.data.label);
    if (phase === "thinking") return { event: { type: "analysis:start" }, line: label ?? "Having a think…" };
    if (phase === "looking") return { event: { type: "url:focus" }, line: label ?? "Taking a look…" };
    if (phase === "building") return { event: { type: "generation:start" }, line: label ?? "Building your scenes…" };
    if (phase === "rendering") return { event: { type: "edit:start" }, line: label ?? "Rendering…" };
    if (phase === "reviewing") return { event: { type: "review:editing" }, line: label ?? "Checking every frame…" };
    if (phase === "done") return { event: { type: "review:confirmed" } };
    if (phase === "error") return { event: { type: "error", kind: "generation" } };
    return null;
  }
  if (e.type === "progress") return { event: { type: "edit:start" } };
  if (e.type === "render") return { event: { type: "generation:done" }, line: "Ta-da! Your video's ready." };
  if (e.type === "live") return { event: { type: "generation:done" }, line: "Here's a live preview!" };
  if (e.type === "question") return { event: { type: "goal:select" }, line: "Quick question for you." };
  if (e.type === "error") return str(e.data.code) === "cancelled" ? null : { event: { type: "error", kind: "generation" }, line: "Hmm, that one tripped me up." };
  if (e.type === "done") return { event: { type: "review:confirmed" } };
  return null;
}

/** Short user-facing label for a render ratio's quick action. */
export const RATIO_ACTIONS = [
  { ratio: "9:16", label: "Make a 9:16 version", prompt: "Make a 9:16 vertical version of this video for Reels, TikTok and Stories." },
  { ratio: "1:1", label: "Make a 1:1 version", prompt: "Make a 1:1 square version of this video for the feed." },
  { ratio: "16:9", label: "Make a 16:9 version", prompt: "Make a 16:9 widescreen version of this video for YouTube." },
] as const;

/** One chat message answering every question of an ask: "Q1 → A1\nQ2 → A2" (a single question sends the bare answer). */
export function composeAnswers(questions: readonly StudioQuestion[], answers: Readonly<Record<number, string>>): string {
  if (questions.length === 1) return (answers[0] ?? "").trim();
  return questions
    .map((q, i) => ({ q: q.question, a: (answers[i] ?? "").trim() }))
    .filter((x) => x.a)
    .map((x) => `${x.q} → ${x.a}`)
    .join("\n");
}
