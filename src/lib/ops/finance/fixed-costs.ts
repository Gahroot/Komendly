// Fixed monthly costs from docs/ops/fixed-costs.json (null = unknown, never guessed). Pure.
export type FixedItem = { id: string; name: string; category: string; monthlyCents: number | null; renewsOn?: string | null; usedBy?: string; note?: string };
export type FixedCosts = { monthlyCents: number; unknown: FixedItem[]; known: FixedItem[]; infraFromEnv: boolean };

export function parseFixedItems(raw: unknown): FixedItem[] {
  const items = (raw && typeof raw === "object" ? (raw as { items?: unknown }).items : null) as unknown;
  if (!Array.isArray(items)) return [];
  return items.flatMap((i) => {
    if (!i || typeof i !== "object" || typeof (i as FixedItem).id !== "string") return [];
    const m = (i as FixedItem).monthlyCents;
    return [{ ...(i as FixedItem), monthlyCents: typeof m === "number" && Number.isFinite(m) && m >= 0 ? Math.round(m) : null }];
  });
}

export function summarizeFixed(items: readonly FixedItem[], env: Record<string, string | undefined> = process.env): FixedCosts {
  const infraEnv = Number(env.INFRA_MONTHLY_CENTS);
  const infraFromEnv = Number.isFinite(infraEnv) && infraEnv > 0;
  const considered = infraFromEnv ? items.filter((i) => i.category !== "infra") : items;
  const known = considered.filter((i) => i.monthlyCents !== null);
  return {
    monthlyCents: known.reduce((t, i) => t + (i.monthlyCents ?? 0), 0) + (infraFromEnv ? infraEnv : 0),
    unknown: considered.filter((i) => i.monthlyCents === null),
    known,
    infraFromEnv,
  };
}
