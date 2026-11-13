// Per-phase wall-clock timing for one Studio turn (restore, brief, agent incl. its tool calls, render, deliver, pack).
// Pure: the clock is injected; the turn puts the summary in its job result and one log line.

export type ToolKind = "snapshot" | "contact_sheet" | "preview" | "render" | "shell" | "edit" | "read" | "other";

/** What an agent tool call was, from its name and (truncated) argument. */
export function toolKind(name: string, arg: string): ToolKind {
  const a = arg.toLowerCase();
  if (/contact-sheet|contact_sheet|tile=/.test(a)) return "contact_sheet";
  if (name === "screenshot" || /\b(hf|hyperframes)\s+snapshot\b/.test(a)) return "snapshot";
  if (/\b(hf|hyperframes)\s+(preview|lint|validate|inspect)\b/.test(a)) return "preview";
  if (/\b(hf|hyperframes)\s+render\b|motion-blur\.mjs|reveal\.mjs|\bffmpeg\b/.test(a)) return "render";
  if (/^(write|edit|multi_?edit|apply_patch)$/i.test(name)) return "edit";
  if (/^(read|ls|find|grep|glob|view_image)$/i.test(name)) return "read";
  if (/^(bash|shell|exec)$/i.test(name)) return "shell";
  return "other";
}

export interface ToolTotals { n: number; ms: number }

export interface TurnTimer {
  /** Close the running phase (if any) and start `phase`. */
  phase(phase: string): void;
  toolStart(name: string, arg: string): void;
  toolEnd(): void;
  summary(): { totalMs: number; phases: Record<string, number>; tools: Record<string, ToolTotals>; toolMs: number; thinkMs: number };
}

export function turnTimer(now: () => number): TurnTimer {
  const t0 = now();
  const phases: Record<string, number> = {};
  const tools: Record<string, ToolTotals> = {};
  let cur: { name: string; at: number } | null = null;
  let tool: { kind: ToolKind; at: number } | null = null;
  const close = (at: number) => { if (cur) phases[cur.name] = (phases[cur.name] ?? 0) + (at - cur.at); };
  const endTool = (at: number) => {
    if (!tool) return;
    const t = (tools[tool.kind] ??= { n: 0, ms: 0 });
    t.n++; t.ms += at - tool.at;
    tool = null;
  };
  return {
    phase(name) { const at = now(); close(at); cur = { name, at }; },
    toolStart(name, arg) { const at = now(); endTool(at); tool = { kind: toolKind(name, arg), at }; },
    toolEnd() { endTool(now()); },
    summary() {
      const at = now();
      const p = { ...phases };
      if (cur) p[cur.name] = (p[cur.name] ?? 0) + (at - cur.at);
      const sorted = Object.fromEntries(Object.keys(tools).sort().map((k) => [k, { ...(tools[k] as ToolTotals) }]));
      const toolMs = Object.values(tools).reduce((s, t) => s + t.ms, 0);
      return { totalMs: at - t0, phases: p, tools: sorted, toolMs, thinkMs: Math.max(0, (p.agent ?? 0) - toolMs) };
    },
  };
}
