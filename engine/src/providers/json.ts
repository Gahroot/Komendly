// Parse the model's JSON answer (tolerates ```json fences / leading prose).
export function parseModelJson(text: string): unknown {
  const t = text.trim();
  try {
    return JSON.parse(t);
  } catch {
    /* fall through */
  }
  const fence = /```(?:json)?\s*([\s\S]*?)```/.exec(t);
  if (fence?.[1]) {
    try {
      return JSON.parse(fence[1]);
    } catch {
      /* fall through */
    }
  }
  const start = t.search(/[[{]/);
  const end = Math.max(t.lastIndexOf("}"), t.lastIndexOf("]"));
  if (start >= 0 && end > start) return JSON.parse(t.slice(start, end + 1));
  throw new Error("model did not return JSON");
}

export function jsonInstruction(schema: Record<string, unknown>): string {
  return `\n\nRespond with ONLY a JSON value (no prose, no code fences) that validates against this JSON Schema:\n${JSON.stringify(schema)}`;
}
