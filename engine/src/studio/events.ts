// Ozzy Studio: maps the agent child's raw JSON lines to friendly StudioEvent rows.
// Never forwards file system paths, prompts or secrets: tool events carry fixed labels only.
import type { StudioEventType, StudioPhase } from "../../../src/lib/studio/contracts";

export interface StudioEventRow {
  type: StudioEventType;
  data: Record<string, unknown>;
}

export interface FriendlyTool {
  label: string;
  phase: StudioPhase;
}

/** A raw tool call (name + its main argument: command or path) -> a friendly step, or null to stay quiet. */
export function friendlyTool(name: string, arg: string): FriendlyTool | null {
  const a = arg.toLowerCase();
  const touchesUploads = /(^|[\s/'"])\.?\/?uploads\//.test(a) || a.startsWith("uploads");
  switch (name) {
    case "bash": {
      if (/contact-sheet/.test(a)) return { label: "Checking the frames", phase: "reviewing" };
      if (/motion-blur\.mjs|\bhf\b|hyperframes|\brender\b/.test(a) && /render|motion-blur/.test(a)) return { label: "Rendering your video", phase: "rendering" };
      if (/ffprobe/.test(a)) return { label: "Watching your footage", phase: "looking" };
      if (/ffmpeg/.test(a)) return touchesUploads ? { label: "Cutting your footage", phase: "building" } : { label: "Editing the video", phase: "building" };
      if (/fonts\.mjs/.test(a)) return { label: "Picking the fonts", phase: "building" };
      if (/music|sfx|beats/.test(a)) return { label: "Choosing the music", phase: "building" };
      if (touchesUploads) return { label: "Watching your footage", phase: "looking" };
      return { label: "Working on it", phase: "building" };
    }
    case "read":
    case "ls":
    case "find":
    case "grep":
      if (touchesUploads) return { label: "Watching your footage", phase: "looking" };
      if (/studio\.md|brand\//.test(a)) return { label: "Reading your brief", phase: "thinking" };
      return { label: "Looking things over", phase: "looking" };
    case "write":
      return /index\.html$/.test(a) ? { label: "Building the scenes", phase: "building" } : { label: "Writing the plan", phase: "building" };
    case "edit":
      return /index\.html$/.test(a) ? { label: "Tweaking the scenes", phase: "building" } : { label: "Making changes", phase: "building" };
    case "screenshot":
      return { label: "Checking the frames", phase: "reviewing" };
    case "web_fetch":
      return { label: "Reading your website", phase: "looking" };
    case "web_search":
      return { label: "Researching", phase: "looking" };
    case "generate_image":
      return { label: "Painting an image", phase: "building" };
    case "skill":
      return { label: "Planning the video", phase: "thinking" };
    case "task_output":
    case "task_send":
    case "task_stop":
      return null;
    case "ask_user":
      return null;
    default:
      return { label: "Working on it", phase: "building" };
  }
}

/** One raw line from run-studio-agent.mjs. */
export type ChildLine =
  | { type: "text_delta"; text: string }
  | { type: "tool"; name: string; arg: string }
  | { type: "tool_end"; name: string }
  | { type: "question"; question: string; options: Array<{ label: string; value?: string; hint?: string; recommended?: boolean }>; allowOther?: boolean }
  | { type: "session"; path: string }
  | { type: "usage"; inputTokens: number; outputTokens: number; cacheRead: number }
  | { type: "qa"; checked?: boolean; blank?: number[]; sparse?: number[]; layout?: number; musicMissing?: boolean; fix?: boolean }
  | { type: "done"; ok: boolean; message?: string; error?: string };

export function parseChildLine(line: string): ChildLine | null {
  const s = line.trim();
  if (!s.startsWith("{")) return null;
  try {
    const j = JSON.parse(s) as { type?: unknown };
    return typeof j.type === "string" ? (j as ChildLine) : null;
  } catch {
    return null;
  }
}

/** Strips absolute paths and anything that looks like a credential from text shown to the user. */
export function scrub(text: string): string {
  return text
    .replace(/(?:\/(?:Users|home|tmp|var|private|app|root|opt)\/)[^\s'"`)]*/g, (m) => {
      const i = m.lastIndexOf("/project/");
      return i >= 0 ? `./${m.slice(i + 9)}` : "[file]";
    })
    .replace(/\b(sk-[A-Za-z0-9_-]{16,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9._-]+)/g, "[hidden]");
}

/**
 * Turns child lines into StudioEvent rows: text deltas batched (flush every `batchMs`), tool steps deduped,
 * a `status` row whenever the phase changes. Clock and sink injected (deterministic tests).
 */
export class StudioEventMapper {
  private buf = "";
  private bufSince = 0;
  private phase: StudioPhase | null = null;
  private lastLabel = "";
  /** Full streamed text; `segment` is the text after the last tool call (the final message). */
  text = "";
  segment = "";
  questions: Array<Extract<ChildLine, { type: "question" }>> = [];
  constructor(
    private readonly emit: (rows: StudioEventRow[]) => void,
    private readonly now: () => number,
    private readonly batchMs = 150,
  ) {}

  setPhase(phase: StudioPhase, label: string): void {
    if (phase === this.phase) return;
    this.flush();
    this.phase = phase;
    this.emit([{ type: "status", data: { phase, label } }]);
  }

  handle(line: ChildLine): void {
    switch (line.type) {
      case "text_delta": {
        if (!this.buf) this.bufSince = this.now();
        this.buf += line.text;
        this.text += line.text;
        this.segment += line.text;
        if (this.now() - this.bufSince >= this.batchMs) this.flush();
        return;
      }
      case "tool": {
        this.segment = "";
        if (this.text && !this.text.endsWith("\n")) {
          this.buf += "\n\n";
          this.text += "\n\n";
        }
        const f = friendlyTool(line.name, line.arg);
        if (!f) return;
        this.flush();
        const rows: StudioEventRow[] = [];
        if (f.phase !== this.phase) {
          this.phase = f.phase;
          rows.push({ type: "status", data: { phase: f.phase, label: f.label } });
        }
        if (f.label !== this.lastLabel) rows.push({ type: "tool", data: { label: f.label } });
        this.lastLabel = f.label;
        if (rows.length) this.emit(rows);
        return;
      }
      case "question": {
        this.flush();
        this.questions.push(line);
        this.emit([{ type: "question", data: { question: scrub(line.question), options: line.options.map((o) => ({ ...o, label: scrub(o.label) })), allowOther: line.allowOther ?? true } }]);
        return;
      }
      default:
        return;
    }
  }

  /** Call on a timer (and at the end) so a quiet stream still flushes within ~batchMs. */
  tick(): void {
    if (this.buf && this.now() - this.bufSince >= this.batchMs) this.flush();
  }

  flush(): void {
    if (!this.buf) return;
    const text = scrub(this.buf);
    this.buf = "";
    if (text) this.emit([{ type: "text_delta", data: { text } }]);
  }

  /** The assistant message's final content. */
  finalText(): string {
    const s = this.segment.trim() || this.text.trim();
    return scrub(s);
  }
}

// Ozzy talks to business owners: no machinery in replies (servers, capacity, processes, files...). Sentences that
// describe the machinery are dropped from the final reply; creative sentences stay.
const TECH_SENTENCE = /\b((earlier|stopped|previous|background|stalled) (task|attempt|run|job|step)s?|tasks?\b.{0,40}\b(resolved|stopped|cancell?ed|killed|finished)|capacity|stalled|setup attempts?|preview (servers?|sessions?)|servers?|process(es)?|install(ing|ed|s)?|permissions?|stderr|stdout|exit code|headless|chrom(e|ium)|ffmpeg|hyperframes|snapshots?|index\.html|node_modules|npm|background (tasks?|jobs?)|visual checks?|blocked by|timed? ?out|timeouts?|crash(ed|es)?|sandbox|terminal|tool (call|error)s?|error codes?|stack trace|disk|memory|ports?|cache|(scene|transition|key|frame|preview) stills?|stills? (were |are )?checked|for the studio to finish|ready for (the )?(studio|render(er|ing)?)|render(ed|ing|er)?|compositions?|checked (key )?(frames|stills))\b/i;

/** Drops technical sentences from a reply shown to the user; keeps paragraph breaks. */
export function userFacingText(text: string): string {
  return text
    .split(/\n/)
    .map((line) => {
      const parts = line.match(/[^.!?]+(?:[.!?]+|$)\s*/g) ?? [line];
      return parts.filter((p) => !TECH_SENTENCE.test(p)).join("").trimEnd();
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Said when a turn ends with no video and no question: never claim a video that isn't there. */
export const NO_VIDEO_REPLY = "I couldn't finish a video this time, and nothing was charged. Tell me what you'd like (or just say \"try again\") and I'll make it now.";
const CLAIMS_VIDEO = /\b(is ready|are ready|ready to (watch|go|post)|here'?s your|here is your|your (new |\d+-second |short )?(video|ad|animation|clip) is|i (made|built|finished|rendered|created)|finished|all done)\b/i;

/** Final reply for a turn: technical sentences out; without a video, any "it's ready" claim becomes an honest line. */
export function finalReply(text: string, o: { delivered: boolean; asked: boolean }): string {
  const clean = userFacingText(text);
  if (o.delivered || o.asked) return clean || (o.delivered ? "Here's your video." : clean);
  if (!clean || CLAIMS_VIDEO.test(clean)) return NO_VIDEO_REPLY;
  return clean;
}
