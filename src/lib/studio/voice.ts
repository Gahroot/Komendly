// Ozzy voice (pure): the realtime session Ozzy's voice runs with, and the tool calls the browser executes.
// The realtime model is Ozzy's voice / front desk; the Studio turn (engine) still does the actual video work.

export const STUDIO_VOICE_MODEL = "gpt-realtime-2.1";
export const STUDIO_VOICE_VOICE = "marin";
/** WebRTC offers are a few KB; refuse anything absurd. */
export const STUDIO_VOICE_MAX_SDP = 30_000;

export const STUDIO_VOICE_TOOLS = [
  {
    type: "function",
    name: "send_to_studio",
    description: "Pass the user's request to the studio so the video gets made or changed. Use it for every request to make, change or fix the video, and to answer Ozzy's questions. Put the request in the user's own words, complete and specific.",
    parameters: { type: "object", properties: { message: { type: "string", description: "The request, written as the user would type it." } }, required: ["message"] },
  },
  {
    type: "function",
    name: "get_status",
    description: "What the studio is doing right now (working or idle, the current step, progress, whether a live preview or final video is showing, any open question).",
    parameters: { type: "object", properties: {} },
  },
] as const;

export function studioVoiceInstructions(o: { title?: string | null } = {}): string {
  return [
    "You are Ozzy, Komendly's friendly video maker, speaking out loud with a busy business owner who is making a video ad in Ozzy Studio.",
    "Speak English unless the user speaks another language; then use theirs.",
    "Keep every reply very short: one or two warm sentences, like a helpful creative partner on a call.",
    "When the user asks for a video or a change, call send_to_studio with the full request, then say something short like \"On it, making the logo bigger.\" Never claim a change is done before the studio says so.",
    "If they are unsure, ask one quick creative question (what to say, the look, the music, where it will be shown), then send it.",
    "Use get_status when they ask how it's going.",
    "Studio updates arrive as system notes: say them naturally and briefly (a live preview is playing, the final video is ready, or Ozzy's question with its options read out).",
    "Never talk about technical machinery: no servers, files, code, rendering, compositions, processes, models or errors. Say 'live preview' and 'final video'.",
    "Never mention prices or credits unless the user asks; then say the details are shown on screen.",
    o.title && o.title !== "New video" ? `The current project is called "${o.title.slice(0, 80)}".` : "",
  ].filter(Boolean).join("\n");
}

/** Session config sent when minting the short-lived realtime key. */
export function studioVoiceSession(o: { title?: string | null } = {}) {
  return {
    type: "realtime",
    model: STUDIO_VOICE_MODEL,
    instructions: studioVoiceInstructions(o),
    audio: { input: { turn_detection: { type: "semantic_vad" } }, output: { voice: STUDIO_VOICE_VOICE } },
    tools: STUDIO_VOICE_TOOLS,
    tool_choice: "auto",
  };
}

export type VoiceToolCall = { name: "send_to_studio"; message: string } | { name: "get_status" } | { name: "unknown" };

/** Parse a function call from the realtime data channel (arguments is a JSON string). */
export function parseVoiceToolCall(name: unknown, args: unknown): VoiceToolCall {
  if (name === "get_status") return { name: "get_status" };
  if (name === "send_to_studio" && typeof args === "string") {
    try {
      const a = JSON.parse(args) as { message?: unknown };
      const message = typeof a.message === "string" ? a.message.trim().slice(0, 4000) : "";
      if (message) return { name: "send_to_studio", message };
    } catch {
      /* fall through */
    }
  }
  return { name: "unknown" };
}

/** Pure: is this a plausible WebRTC SDP offer? */
export function isSdpOffer(sdp: unknown): sdp is string {
  return typeof sdp === "string" && sdp.length > 20 && sdp.length <= STUDIO_VOICE_MAX_SDP && sdp.startsWith("v=0") && /\bm=audio\b/.test(sdp);
}
