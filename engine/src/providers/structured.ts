// Structured LLM call: JSON schema from zod, validate, one repair attempt on mismatch.
import { z } from "zod";
import type { AIProvider, TextRequest, UsageMeter } from "./types";

export async function structured<S extends z.ZodType>(
  provider: AIProvider,
  schema: S,
  req: Omit<TextRequest, "jsonSchema">,
  usage: UsageMeter[],
): Promise<z.infer<S>> {
  const jsonSchema = z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }) as Record<string, unknown>;
  let prompt = req.prompt;
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await provider.text({ ...req, prompt, jsonSchema });
    usage.push(r.usage);
    const parsed = parseLenient(schema, r.json);
    if (parsed.success) return parsed.data;
    prompt = `${req.prompt}\n\nYour previous answer did not match the schema: ${parsed.error.message.slice(0, 1500)}\nReturn corrected JSON only.`;
  }
  // MiMo text with a Codex fallback (providers/mimo.ts): one last try on Codex before failing the call.
  const fallback = (provider as { fallbackText?: AIProvider["text"] }).fallbackText;
  if (fallback) {
    const r = await fallback({ ...req, prompt: req.prompt, jsonSchema });
    usage.push(r.usage);
    const parsed = parseLenient(schema, r.json);
    if (parsed.success) return parsed.data;
  }
  throw new Error("model output did not match schema after repair");
}

/** Validate; when the only problems are strings/arrays over their max length, trim them and validate again. */
export function parseLenient<S extends z.ZodType>(schema: S, value: unknown): z.ZodSafeParseResult<z.infer<S>> {
  const first = schema.safeParse(value) as z.ZodSafeParseResult<z.infer<S>>;
  if (first.success || !value || typeof value !== "object") return first;
  const issues = first.error.issues;
  if (!issues.every((i) => i.code === "too_big" && (i.origin === "string" || i.origin === "array") && typeof i.maximum === "number")) return first;
  const copy = structuredClone(value) as Record<string | number, unknown>;
  for (const i of issues) {
    if (i.code !== "too_big") continue;
    let parent: Record<string | number, unknown> | undefined = copy;
    for (const k of i.path.slice(0, -1)) parent = parent?.[k as string] as Record<string | number, unknown> | undefined;
    const key = i.path[i.path.length - 1] as string | number | undefined;
    if (!parent || key === undefined) return first;
    const v = parent[key];
    const max = Number(i.maximum);
    if (typeof v === "string") parent[key] = v.slice(0, Math.max(0, max - 1)).trimEnd() + (max > 0 ? "…" : "");
    else if (Array.isArray(v)) parent[key] = v.slice(0, max);
  }
  return schema.safeParse(copy) as z.ZodSafeParseResult<z.infer<S>>;
}
