import type { OzzyEvent, OzzyExpression, OzzyForm, OzzyMotion, OzzyState } from "./types";

export const INITIAL_OZZY: OzzyState = {
  form: "classic",
  expression: "neutral",
  motion: "idle",
  orb: 0.3,
  beat: 0,
};

type Patch = { form: OzzyForm; expression: OzzyExpression; motion: OzzyMotion; line?: string };

const ERROR_LINES: Record<string, string> = {
  network: "Hmm, the connection wobbled. Let's try that again.",
  validation: "Something needs a tweak. You've got this!",
  generation: "That run fizzled. Any reserved credits were refunded.",
  auth: "Let's get you signed in, then we're back on track.",
  unknown: "Oops, a hiccup on my side. Let's try that again.",
};

function patch(form: OzzyForm, expression: OzzyExpression, motion: OzzyMotion, line?: string): Patch {
  return line === undefined ? { form, expression, motion } : { form, expression, motion, line };
}

/** Pure reducer: event -> next Ozzy state. Real events always override idle trips. */
export function ozzyReducer(state: OzzyState, event: OzzyEvent): OzzyState {
  const beat = state.beat + 1;
  const base = { ...state, beat, line: undefined };

  if (event.type === "idle") {
    if (state.form === "chill") return state;
    return {
      ...base,
      ...patch("chill", "sleepy", "sleep"),
      resume: { form: state.form, expression: state.expression },
    };
  }
  if (event.type === "user:return") {
    const r = state.resume ?? { form: "classic" as const, expression: "happy" as const };
    return { ...base, form: r.form, expression: "happy", motion: "hop", resume: undefined, line: "Welcome back!" };
  }

  const next = step(state, event);
  return { ...base, ...next.p, ...next.extra, resume: undefined };
}

function step(state: OzzyState, event: Exclude<OzzyEvent, { type: "idle" } | { type: "user:return" }>): {
  p: Patch;
  extra?: Partial<OzzyState>;
} {
  switch (event.type) {
    case "page:landing":
      return { p: patch("classic", "happy", "wave", "G'day! Paste your website and I'll get to work.") };
    case "cta:hover":
      return { p: patch(state.form === "chill" ? "classic" : state.form, "excited", "hop") };
    case "url:focus":
      return { p: patch("explorer", "focused", "think"), extra: { orb: 0.35 } };
    case "url:typing":
      return {
        p: patch("explorer", "focused", "think"),
        extra: { orb: Math.min(1, 0.35 + (event.length ?? 0) / 40) },
      };
    case "url:valid":
      return { p: patch("joyful", "happy", "nod", "Ooh, I can work with that."), extra: { orb: 1 } };
    case "url:invalid":
      return { p: patch("classic", "confused", "think", "Hmm, try something like yourbrand.com") };
    case "url:submit":
      return { p: patch("classic", "excited", "summon") };
    case "goal:select":
      return { p: patch("classic", "happy", "nod") };
    case "auth:signup-gate":
      return { p: patch("classic", "love", "wave", "One quick free account and I'll start on your ads.") };
    case "analysis:start":
      return { p: patch("explorer", "focused", "scan", "Reading your site like a strategist…"), extra: { orb: 1 } };
    case "review:shown":
    case "review:editing":
      return { p: patch("classic", "focused", "nod") };
    case "review:confirmed":
      return { p: patch("joyful", "happy", "hop") };
    case "generation:start":
      return {
        p: patch("creator", "focused", "type", "Building your ads…"),
        extra: { progress: { ready: 0, total: Math.max(0, event.total ?? 0) } },
      };
    case "generation:ad-ready": {
      const total = Math.max(1, event.total);
      const ready = Math.max(0, Math.min(total, event.ready));
      return {
        p: patch("developer", "excited", "celebrate", `Ad ${ready} of ${total} is ready!`),
        extra: { progress: { ready, total } },
      };
    }
    case "generation:ad-failed":
      return { p: patch("creator", "confused", "type", "One ad slipped. I'll keep going.") };
    case "generation:done":
      return { p: patch("ascended", "excited", "celebrate", "Ta-da! Your ads are ready."), extra: { progress: undefined } };
    case "run:partial":
      return { p: patch("joyful", "happy", "nod", "Most made it. The ones that didn't were refunded.") };
    case "edit:start":
      return { p: patch("creator", "focused", "type") };
    case "error":
      return { p: patch("classic", "confused", "think", ERROR_LINES[event.kind] ?? ERROR_LINES.unknown) };
    case "recovery:retry":
      return { p: patch("classic", "focused", "nod", "Taking another look…") };
    case "upsell:shown":
      return { p: patch("adventurer", "cool", "nod", "Want every size and more ads? Plans are right here.") };
    case "poke":
      return { p: patch(state.form === "chill" ? "classic" : state.form, "love", "hop") };
  }
}

/** Applied by the store once a motion has played out: back to the idle loop. */
export function ozzySettle(state: OzzyState): OzzyState {
  if (state.motion === "sleep") return state;
  const encouraging = state.expression === "confused" && state.form === "classic";
  return {
    ...state,
    motion: "idle",
    expression: encouraging ? "happy" : state.expression === "love" ? "happy" : state.expression,
  };
}
