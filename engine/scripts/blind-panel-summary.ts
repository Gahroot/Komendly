// Aggregate blind-panel judgements: majority gates (2/3), median scores, READY rule from QUALITY_STANDARD.md,
// then unblind with key.json ({ id: { source: "komendly"|<competitor>, set?: "heldout"|"known", site?, kind } }).
// Usage: npx tsx scripts/blind-panel-summary.ts --pool <dir>   -> writes <dir>/summary.json + summary.md
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
type J = { id: string; judge: string; kind: string; gates: Record<string, { pass: boolean; why: string }>; scores: Record<string, number>; S6_hook_pacing: number | null; would_run_as_is: boolean; one_line: string };
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2; };

export function aggregate(js: J[]) {
  const gateNames = Object.keys(js[0]!.gates);
  const gates = Object.fromEntries(gateNames.map((g) => [g, js.filter((j) => j.gates[g]?.pass).length * 2 > js.length]));
  const scoreNames = Object.keys(js[0]!.scores);
  const scores: Record<string, number> = Object.fromEntries(scoreNames.map((s) => [s, median(js.map((j) => j.scores[s]!))]));
  if (js[0]!.kind === "video") { const v = js.map((j) => j.S6_hook_pacing).filter((x): x is number => typeof x === "number"); if (v.length) scores.S6_hook_pacing = median(v); }
  const vals = Object.values(scores);
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  const allGates = Object.values(gates).every(Boolean);
  const ready = allGates && avg >= 3.5 && Math.min(...vals) >= 3;
  const failedGates = gateNames.filter((g) => !gates[g]);
  return { gates, scores, avg: Math.round(avg * 100) / 100, ready, failedGates, judges: js.length, wouldRunVotes: js.filter((j) => j.would_run_as_is).length };
}

if (process.argv[1]?.endsWith("blind-panel-summary.ts")) {
  const pool = arg("pool");
  if (!pool) throw new Error("--pool required");
  const lines = (await readFile(path.join(pool, "judgements.jsonl"), "utf8")).split("\n").filter(Boolean).map((l) => JSON.parse(l) as J);
  const key = JSON.parse(await readFile(path.join(pool, "key.json"), "utf8").catch(() => "{}")) as Record<string, { source: string; set?: string; site?: string; kind?: string }>;
  const byId = new Map<string, J[]>();
  for (const j of lines) byId.set(j.id, [...(byId.get(j.id) ?? []), j]);
  const rows = [...byId.entries()].filter(([, js]) => js.length >= 2).map(([id, js]) => ({ id, ...key[id], kind: js[0]!.kind, ...aggregate(js), reasons: js.flatMap((j) => Object.entries(j.gates).filter(([, g]) => !g.pass).map(([g, x]) => `${j.judge}:${g}: ${x.why}`)), notes: js.map((j) => `${j.judge}: ${j.one_line}`) }));
  const groupKey = (r: (typeof rows)[number]) => `${r.source ?? "?"}${r.source === "komendly" ? `/${r.set ?? "?"}` : ""}/${r.kind}`;
  const groups = new Map<string, typeof rows>();
  for (const r of rows) groups.set(groupKey(r), [...(groups.get(groupKey(r)) ?? []), r]);
  const table = [...groups.entries()].sort().map(([g, rs]) => {
    const gateFails: Record<string, number> = {};
    for (const r of rs) for (const f of r.failedGates) gateFails[f] = (gateFails[f] ?? 0) + 1;
    return { group: g, n: rs.length, ready: rs.filter((r) => r.ready).length, readyPct: Math.round((rs.filter((r) => r.ready).length / rs.length) * 100), meanAvg: Math.round((rs.reduce((a, r) => a + r.avg, 0) / rs.length) * 100) / 100, gateFails };
  });
  await writeFile(path.join(pool, "summary.json"), JSON.stringify({ table, rows }, null, 2));
  const md = ["| group | n | ready | ready % | mean score | gate fails |", "|---|---|---|---|---|---|", ...table.map((t) => `| ${t.group} | ${t.n} | ${t.ready} | ${t.readyPct}% | ${t.meanAvg} | ${Object.entries(t.gateFails).sort((a, b) => b[1] - a[1]).map(([g, n]) => `${g} ${n}`).join(", ")} |`)].join("\n");
  await writeFile(path.join(pool, "summary.md"), md + "\n");
  console.log(md);
}
