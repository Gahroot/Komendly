// STATIC_MODE=composed|template (default composed).
export type StaticMode = "composed" | "template";
export function staticMode(env: NodeJS.ProcessEnv = process.env): StaticMode {
  return env.STATIC_MODE === "template" ? "template" : "composed";
}
