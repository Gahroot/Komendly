// Ozzy Studio: which ask_user questions reach the user. Users only ever see creative questions
// (what to say, the look, music, where it plays), at most one ask, and only before building starts.
// Anything technical (sessions, previews, renders, installs, permissions, errors, files) is answered
// by the engine itself so the agent carries on. Pure module (unit-tested in test/studio-ask-filter.test.ts).
const TECHNICAL = /\b(sessions?|previews?|servers?|process(es)?|install(ing|ed)?|permissions?|render(s|ing)?|export(ing)?|browser|chrom(e|ium)|ports?|errors?|retry|retrying|files?|folders?|director(y|ies)|disk|memory|timeouts?|crash(ed)?|close (them|those)|kill|restart|overwrite|delete|cache|ffmpeg|hyperframes|snapshot|background (tasks?|jobs?))\b/i;

export function isTechnicalQuestion(q) {
  const text = [q.question, q.detail, ...(q.options ?? []).map((o) => o.label)].filter(Boolean).join(" ");
  return TECHNICAL.test(text);
}

/** The engine's own answer for a question it won't forward: the recommended option, else the first, else "Yes, go ahead". */
export function autoAnswer(q) {
  const opts = q.options ?? [];
  const pick = opts.find((o) => o.recommended) ?? opts[0];
  if (q.kind === "multi") return pick ? [pick.value ?? pick.label] : [];
  if (q.kind === "confirm" && !opts.length) return "yes";
  return pick ? (pick.value ?? pick.label) : "Yes, go ahead. Decide the details yourself.";
}

/**
 * Decide an ask. state: { turnIndex: number (0 = first turn of the session), building: boolean (wrote/edited/ran anything this turn), askedBefore: boolean }.
 * Returns { forward: Question[], answers: Record<id, answer> } — forwarded ones go to the user (turn ends); the rest are auto-answered.
 */
export function decideAsk(questions, state) {
  const forward = [];
  const answers = {};
  const userMayBeAsked = state.turnIndex === 0 && !state.building && !state.askedBefore;
  for (const q of questions ?? []) {
    if (userMayBeAsked && !isTechnicalQuestion(q)) forward.push(q);
    else answers[q.id] = autoAnswer(q);
  }
  return { forward, answers };
}
