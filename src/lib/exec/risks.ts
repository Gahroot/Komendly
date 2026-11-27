// Strategic risk register (pure). Severity x likelihood (1-5 each), mitigation + owner. Facts in -> risks out; never invents a fact:
// a risk appears only when its input says so. Unknown inputs are surfaced as "unknown" items, not assumed fine.
export type RiskCategory = "concentration" | "dependency" | "economics" | "security" | "reputation" | "continuity";
export interface Risk { id: string; category: RiskCategory; title: string; evidence: string; severity: number; likelihood: number; score: number; mitigation: string; owner: string }

export interface RiskFacts {
  coldSendsByDomain?: Record<string, number>;
  paymentProcessors?: number; aiProviders?: number; googleAccounts?: number;
  metaApprovalPending?: boolean; spamhausListedDomains?: string[]; platformPolicyDependency?: boolean;
  cacCents?: number | null; paybackMonths?: number | null; refundRate?: { n: number; refunds: number } | null;
  securityOpenHigh?: number | null; complaints30d?: number; bounceRate7d?: number | null; sends7d?: number;
  singleReplicaServices?: string[]; backupVerified?: boolean | null;
  ownerDependencies?: number;
}

const mk = (id: string, category: RiskCategory, title: string, evidence: string, severity: number, likelihood: number, mitigation: string, owner: string): Risk =>
  ({ id, category, title, evidence, severity, likelihood, score: severity * likelihood, mitigation, owner });

export function buildRiskRegister(f: RiskFacts): Risk[] {
  const r: Risk[] = [];
  const sends = Object.entries(f.coldSendsByDomain ?? {});
  const total = sends.reduce((a, [, n]) => a + n, 0);
  if (total >= 50) {
    const [dom, n] = sends.sort((a, b) => b[1] - a[1])[0]!;
    if (n / total > 0.5) r.push(mk("conc:send-domain", "concentration", `${dom} carries ${Math.round((n / total) * 100)}% of cold sends`, `${n}/${total} recent sends`, 4, 3, "Spread sends across healthy domains as warm-up completes; keep within governor limits.", "kly governor / owner"));
  }
  if ((f.paymentProcessors ?? 1) <= 1) r.push(mk("conc:payments", "concentration", "Single payment processor (Stripe)", "one processor integrated", 4, 2, "Keep account in good standing (low refunds/disputes); document a manual-invoice fallback.", "owner"));
  if ((f.aiProviders ?? 1) <= 1) r.push(mk("conc:ai", "concentration", "Single AI provider (one Codex login)", "all generation uses one subscription login", 5, 3, "Engine monitor alerts on login expiry; owner keeps the login renewed. No second provider is added without owner approval.", "engine monitor / owner"));
  if ((f.googleAccounts ?? 1) <= 1) r.push(mk("conc:google", "concentration", "One Google account holds accounts (passkey 2FA on the owner's device)", "single account recovery path", 3, 2, "Owner records recovery codes offline.", "owner"));
  if (f.metaApprovalPending) r.push(mk("dep:meta", "dependency", "Meta app approval pending", "one-click publishing and results reports wait on review", 3, 4, "Keep the guided manual upload path; no plan depends on approval date.", "owner"));
  if (f.spamhausListedDomains?.length) r.push(mk("dep:spamhaus", "dependency", `Spamhaus listings on ${f.spamhausListedDomains.length} domain(s)`, f.spamhausListedDomains.join(", "), 4, 5, "Do not send from listed domains; delist or replace (owner/domain provider).", "owner"));
  if (f.platformPolicyDependency) r.push(mk("dep:policy", "dependency", "Distribution depends on third-party platform policy", "Meta/Google/Shopify rules can change", 3, 2, "Diversify channels only after validation; monitor policy notices.", "exec-strategy-engine"));
  if (f.cacCents != null && f.paybackMonths != null && f.paybackMonths > 12) r.push(mk("eco:payback", "economics", "CAC payback longer than 12 months", `CAC ${f.cacCents}c, payback ${f.paybackMonths} months`, 4, 4, "No spend scaling; fix conversion first.", "exec-allocation"));
  if (f.refundRate && f.refundRate.n >= 10 && f.refundRate.refunds / f.refundRate.n > 0.1) r.push(mk("eco:refunds", "economics", "Refund rate above 10%", `${f.refundRate.refunds}/${f.refundRate.n}`, 4, 4, "Review delivery outcomes before more acquisition.", "support / owner"));
  if (f.securityOpenHigh && f.securityOpenHigh > 0) r.push(mk("sec:open-high", "security", `${f.securityOpenHigh} open high-severity security finding(s)`, "docs/ops/security-audit.md", 5, 3, "Fix before any scale-up or new public surface.", "owner / build_request"));
  if ((f.complaints30d ?? 0) > 0) r.push(mk("rep:complaints", "reputation", `${f.complaints30d} spam complaint(s) in 30 days`, "the Kly governor stops all sending on any complaint", 5, 4, "Governor pause stays; review the copy and list before resuming.", "kly governor / owner"));
  if (f.bounceRate7d != null && (f.sends7d ?? 0) >= 50 && f.bounceRate7d > 0.02) r.push(mk("rep:bounce", "reputation", "Bounce rate above 2%", `${(f.bounceRate7d * 100).toFixed(1)}% over 7 days`, 4, 4, "Tighten verification; the governor pauses above 2%.", "kly governor"));
  if (f.singleReplicaServices?.length) r.push(mk("cont:single-replica", "continuity", "Engine and Kly are single replica by design", f.singleReplicaServices.join(", "), 3, 2, "Health checks and restart alerts; accept the risk until revenue justifies redundancy.", "engine monitor"));
  if (f.backupVerified === null || f.backupVerified === false) r.push(mk("cont:backup", "continuity", f.backupVerified === null ? "Database backup restore never verified (unknown)" : "Database backup restore failed", "no verified restore on record", 5, 2, "Owner confirms provider backups and runs one restore test.", "owner"));
  if ((f.ownerDependencies ?? 0) >= 5) r.push(mk("cont:owner", "continuity", `${f.ownerDependencies} open items wait only on the owner`, "docs/ops/owner-dependencies.md", 3, 4, "Batch owner decisions in one weekly pass.", "exec-brief"));
  return r.sort((a, b) => b.score - a.score || b.severity - a.severity || a.id.localeCompare(b.id));
}
export const topRisks = (r: readonly Risk[], n = 5) => r.slice(0, n);
