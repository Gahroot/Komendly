// Capacity model: when does each constraint bind as customers grow. Pure. All defaults are ASSUMPTIONS (flagged in the output),
// to be replaced by measured values from the ledger/delivery_econ; scaling stays demand-led (don't build capacity before it binds).
export interface CapacityAssumptions {
  packsPerCustomerPerMonth: number; genSecondsPerPack: number; engineConcurrency: number; engineHoursPerDay: number;
  aiCallsPerCustomerPerWeek: number; aiCallsFixedPerWeek: number; aiCallsBudgetPerWeek: number;
  klyDailyCap: number; mailboxes: number; sendsPerMailboxPerDay: number; coldSendsPerCustomerNeeded: number;
}
export const DEFAULT_ASSUMPTIONS: CapacityAssumptions = {
  packsPerCustomerPerMonth: 5, genSecondsPerPack: 600, engineConcurrency: 2, engineHoursPerDay: 20,
  aiCallsPerCustomerPerWeek: 30, aiCallsFixedPerWeek: 400, aiCallsBudgetPerWeek: 5000,
  klyDailyCap: 400, mailboxes: 56, sendsPerMailboxPerDay: 30, coldSendsPerCustomerNeeded: 1500,
};
export interface CapacityRow { constraint: string; unit: string; usedAt: Record<number, number>; capacity: number; bindsAtCustomers: number | null; assumption: string }

export function capacityModel(a: CapacityAssumptions = DEFAULT_ASSUMPTIONS, points = [10, 50, 200]): CapacityRow[] {
  const genCapacityPacksPerDay = (a.engineConcurrency * a.engineHoursPerDay * 3600) / a.genSecondsPerPack;
  const mailboxCap = Math.min(a.klyDailyCap, a.mailboxes * a.sendsPerMailboxPerDay);
  const mk = (constraint: string, unit: string, perCustomer: number, fixed: number, capacity: number, assumption: string): CapacityRow => ({
    constraint, unit, capacity: Math.round(capacity), assumption,
    usedAt: Object.fromEntries(points.map((c) => [c, Math.round((fixed + perCustomer * c) * 10) / 10])),
    bindsAtCustomers: perCustomer > 0 ? Math.max(0, Math.floor((capacity - fixed) / perCustomer)) : null,
  });
  return [
    mk("Pack generation (engine)", "packs/day", a.packsPerCustomerPerMonth / 30, 2, genCapacityPacksPerDay, `${a.genSecondsPerPack}s per pack, ${a.engineConcurrency} parallel, ${a.engineHoursPerDay}h/day`),
    mk("AI (Codex) calls", "calls/week", a.aiCallsPerCustomerPerWeek, a.aiCallsFixedPerWeek, a.aiCallsBudgetPerWeek, `budget ${a.aiCallsBudgetPerWeek}/week, ${a.aiCallsFixedPerWeek} fixed for loops`),
    // cold sends needed per day to keep acquiring: new customers/month ≈ 10% of base, each needing N sends
    mk("Cold-email sending (Kly)", "sends/day", (0.1 * a.coldSendsPerCustomerNeeded) / 30, 0, mailboxCap, `${a.mailboxes} mailboxes x ${a.sendsPerMailboxPerDay}/day capped at ${a.klyDailyCap}`),
  ];
}

/** The first constraint to bind (smallest customer count); null when none binds. */
export function firstBinding(rows: readonly CapacityRow[]): CapacityRow | null {
  return rows.filter((r) => r.bindsAtCustomers !== null).sort((x, y) => (x.bindsAtCustomers ?? 0) - (y.bindsAtCustomers ?? 0))[0] ?? null;
}
