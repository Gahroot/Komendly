// Ozzy voice (pure): what the voice should say about the chat, and the status line for its get_status tool.
import type { ThreadMessage } from "./thread";

export interface VoiceNews { key: string; note: string }

function lastAssistant(messages: readonly ThreadMessage[]): ThreadMessage | undefined {
  for (let i = messages.length - 1; i >= 0; i--) if (messages[i]?.role === "assistant") return messages[i];
  return undefined;
}

/** News items for the latest assistant message (stable keys, so each is said once). */
export function voiceNews(messages: readonly ThreadMessage[]): VoiceNews[] {
  const m = lastAssistant(messages);
  if (!m) return [];
  const out: VoiceNews[] = [];
  if (m.live) out.push({ key: `${m.id}:live`, note: "A live preview of the change is now playing in the chat; the final video is still being finished." });
  for (const q of m.questions ?? (m.question ? [m.question] : [])) {
    const opts = q.options.map((o) => o.label).slice(0, 4).join(", ");
    out.push({ key: `${m.id}:q:${q.question}`, note: `Ozzy needs an answer: "${q.question}"${opts ? ` Options: ${opts}.` : ""} Read it out and wait for the user's choice, then send it to the studio.` });
  }
  if (m.renderIds.length) out.push({ key: `${m.id}:render`, note: "The final video is ready in the chat. Say so in one short, happy sentence." });
  if (m.status === "done" && m.content.trim()) out.push({ key: `${m.id}:done`, note: `Ozzy's written reply: "${m.content.trim().slice(0, 600)}" Sum it up in one short sentence.` });
  if (m.status === "error" && m.error) out.push({ key: `${m.id}:error`, note: `That didn't work out: "${m.error.slice(0, 200)}" Say it kindly in one sentence.` });
  return out;
}

export function voiceStatus(messages: readonly ThreadMessage[]): string {
  const m = lastAssistant(messages);
  if (!m) return "Nothing has been made yet in this chat.";
  const parts: string[] = [];
  const busy = m.status === "queued" || m.status === "streaming";
  parts.push(busy ? `Working: ${m.phaseLabel ?? m.phase ?? "thinking"}.` : "Idle, waiting for the user.");
  if (busy && m.progress) parts.push(`Finishing the video: ${Math.round(m.progress.pct)}%.`);
  if (m.live && !m.renderIds.length) parts.push("A live preview is playing in the chat.");
  if (m.renderIds.length) parts.push("The final video is ready in the chat.");
  const q = m.questions?.[m.questions.length - 1] ?? m.question;
  if (q && !busy) parts.push(`Open question: ${q.question}`);
  return parts.join(" ");
}
