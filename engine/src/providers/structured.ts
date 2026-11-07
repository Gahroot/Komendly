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
    const parsed = schema.safeParse(r.json);
    if (parsed.success) return parsed.data;
    prompt = `${req.prompt}\n\nYour previous answer did not match the schema: ${parsed.error.message.slice(0, 1500)}\nReturn corrected JSON only.`;
  }
  throw new Error("model output did not match schema after repair");
}
