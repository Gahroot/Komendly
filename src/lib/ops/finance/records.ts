// Accountant records: CSV + Markdown builders (pure). Used by scripts/ops-export-records.ts. Figures only; no tax advice.
export function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? "" : v instanceof Date ? v.toISOString() : String(v);
  if (/^[=+\-@]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`; // spreadsheet formula injection guard
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export function toCsv(headers: readonly string[], rows: readonly (readonly unknown[])[]): string {
  return [headers.map(csvCell).join(","), ...rows.map((r) => r.map(csvCell).join(","))].join("\n") + "\n";
}
export const dollars = (c: number | null) => (c === null ? "" : (c / 100).toFixed(2));

export type RecordsSummary = { month: string; grossCents: number; refundsCents: number; netCents: number; costOfRevenueCents: number; metaSpendCents: number | null; fixedCents: number; partnerPayoutsCents: number; unknown: string[] };
export function recordsMarkdown(s: RecordsSummary): string {
  const usd = (c: number | null) => (c === null ? "unknown" : `$${(c / 100).toFixed(2)}`);
  return `# Records for ${s.month}

Prepared for the accountant. Figures come from Komendly's own ledgers (Stripe-recorded payments, refunds, engine cost counters, Meta Insights spend); they are not bank statements. No tax advice.

| Item | Amount |
| --- | --- |
| Gross revenue | ${usd(s.grossCents)} |
| Refunds | ${usd(s.refundsCents)} |
| Net revenue | ${usd(s.netCents)} |
| Cost of revenue (AI/media/email, measured part) | ${usd(s.costOfRevenueCents)} |
| Meta ad spend | ${usd(s.metaSpendCents)} |
| Fixed costs (prorated, known items only) | ${usd(s.fixedCents)} |
| Partner payouts recorded | ${usd(s.partnerPayoutsCents)} |

## Unknown / needs owner input
${s.unknown.length ? s.unknown.map((u) => `- ${u}`).join("\n") : "- nothing"}

Files: revenue.csv, refunds.csv, ad-spend.csv, partner-payouts.csv, costs.csv
`;
}
