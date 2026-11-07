// Minimal structured JSON logger (Railway parses one JSON object per line).
type Level = "debug" | "info" | "warn" | "error";

export function log(level: Level, msg: string, fields: Record<string, unknown> = {}): void {
  if (level === "debug" && !process.env.ENGINE_DEBUG) return;
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...fields });
  if (level === "error" || level === "warn") process.stderr.write(line + "\n");
  else process.stdout.write(line + "\n");
}

export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
