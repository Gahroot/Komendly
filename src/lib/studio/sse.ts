// Server-Sent Events framing (pure). BigInt never reaches JSON: ids are strings already.

/** One SSE frame. `id` sets Last-Event-ID for reconnects; `event` defaults to "message". */
export function sseEvent(id: string | null, data: unknown, event?: string): string {
  const lines: string[] = [];
  if (id) lines.push(`id: ${id}`);
  if (event) lines.push(`event: ${event}`);
  const json = JSON.stringify(data, (_k, v: unknown) => (typeof v === "bigint" ? v.toString() : v));
  for (const line of json.split("\n")) lines.push(`data: ${line}`);
  return `${lines.join("\n")}\n\n`;
}

export function sseComment(text: string): string {
  return `: ${text.replace(/\n/g, " ")}\n\n`;
}
