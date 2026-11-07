export const OZZY_FORMS = [
  "classic",
  "joyful",
  "explorer",
  "creator",
  "adventurer",
  "developer",
  "chill",
  "ascended",
] as const;
export type OzzyForm = (typeof OZZY_FORMS)[number];

export const OZZY_EXPRESSIONS = [
  "neutral",
  "happy",
  "excited",
  "surprised",
  "cool",
  "confused",
  "love",
  "sleepy",
  "focused",
] as const;
export type OzzyExpression = (typeof OZZY_EXPRESSIONS)[number];

/** Motion = a short choreographed action layered on top of the idle loop. */
export type OzzyMotion =
  | "idle"
  | "wave"
  | "hop"
  | "summon"
  | "scan"
  | "type"
  | "celebrate"
  | "think"
  | "sleep"
  | "nod";

export type OzzyErrorKind = "network" | "validation" | "generation" | "auth" | "unknown";

export type OzzyEvent =
  | { type: "page:landing" }
  | { type: "cta:hover" }
  | { type: "url:focus" }
  | { type: "url:typing"; length?: number }
  | { type: "url:valid" }
  | { type: "url:invalid" }
  | { type: "url:submit" }
  | { type: "goal:select" }
  | { type: "auth:signup-gate" }
  | { type: "analysis:start" }
  | { type: "review:shown" }
  | { type: "review:editing" }
  | { type: "review:confirmed" }
  | { type: "generation:start"; total?: number }
  | { type: "generation:ad-ready"; ready: number; total: number }
  | { type: "generation:ad-failed" }
  | { type: "generation:done" }
  | { type: "run:partial" }
  | { type: "edit:start" }
  | { type: "error"; kind: OzzyErrorKind }
  | { type: "recovery:retry" }
  | { type: "upsell:shown" }
  | { type: "idle" }
  | { type: "user:return" }
  | { type: "poke" };

export type OzzyEventType = OzzyEvent["type"];

export interface OzzyState {
  form: OzzyForm;
  expression: OzzyExpression;
  motion: OzzyMotion;
  line?: string;
  /** 0..1 orb brightness for the explorer form, driven by typing length. */
  orb: number;
  /** Generation progress, only from passed-in values. */
  progress?: { ready: number; total: number };
  /** Increments on every event so the renderer can kick springs. */
  beat: number;
  /** Real (non-idle) state to restore when waking up. */
  resume?: { form: OzzyForm; expression: OzzyExpression };
}
