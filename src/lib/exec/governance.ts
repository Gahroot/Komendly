// Executive governance as code: authority matrix, owner overrides, immutable audit chain, fail-closed self-check.
// The executive layer can NEVER raise its own authority: nothing here is writable by an agent (exec_override is owner-only;
// assertAgentMayWrite throws for it), and the matrix is fingerprinted so an unexpected edit stops every cycle until a human re-pins it.
import { FNV, asObj } from "./types";

export const AUTHORITY_MATRIX = {
  autonomous: [
    "read any AdsEvent / snapshot", "build the business_context snapshot", "rank constraints and name the primary one",
    "propose objectives and decisions (status proposed)", "auto-approve reversible zero-spend hold_and_measure / evidence_gathering / experiment objectives inside optimiser allow-listed actions",
    "record exec_* events", "review past decisions and record lessons", "hold_and_measure (keep operating, gather evidence)",
  ],
  needsApproval: [
    "any spend above 0 (new paid service, Meta budget increase)", "build objectives", "operate objectives that change a live surface", "product changes", "partnerships and outreach commitments",
    "access / credential changes", "data-sensitivity changes (new PII use)", "production-risk or irreversible actions", "expanding the executive layer's own autonomy",
  ],
  forbidden: [
    "change Stripe prices or billing configuration", "change spend caps or SPEND_AUTHORITY", "legal, contract, privacy-policy or compliance text",
    "edit this authority matrix or governance config", "write exec_override events", "delete or edit audit records", "send customer messages directly", "disable the emergency stop",
  ],
} as const;

/** FNV fingerprint of the canonical matrix. Changing the matrix requires a human to re-pin this constant (and update tests). */
export const MATRIX_FINGERPRINT = FNV(JSON.stringify(AUTHORITY_MATRIX));
export const EXPECTED_MATRIX_FINGERPRINT = "f8dbfe8e12694fec"; // pinned by a human; see governance.test.ts

export const EXEC_EVENTS = {
  context: "exec_context", objective: "exec_objective", objectiveStatus: "exec_objective_status", decision: "exec_decision", review: "exec_decision_review",
  cycle: "exec_cycle", override: "exec_override", runRequest: "exec_run_request", audit: "exec_audit", paused: "exec_paused",
} as const;

/** Event names an executive agent may write. exec_override is deliberately absent. */
const AGENT_WRITABLE = new Set<string>(Object.values(EXEC_EVENTS).filter((n) => n !== EXEC_EVENTS.override && n !== EXEC_EVENTS.runRequest));
export function assertAgentMayWrite(name: string): void {
  if (!AGENT_WRITABLE.has(name)) throw new Error(`governance: executive agents may not write AdsEvent "${name}"`);
}
/** Governance is never editable by exec actors. */
export const canChangeGovernance = (actor: string): boolean => actor === "owner";

// ---------- overrides ----------
export type OverrideKind = "pause_all" | "resume_all" | "pause_objective" | "resume_objective" | "redirect" | "veto";
export interface OverrideState { pausedAll: boolean; pausedObjectives: Set<string>; vetoed: Set<string>; redirect: string | null }
/** Fold owner exec_override events (oldest first) into the current state. Unknown kinds are ignored (fail closed would pause on garbage; we ignore, never widen). */
export function foldOverrides(events: ReadonlyArray<{ props: unknown }>): OverrideState {
  const s: OverrideState = { pausedAll: false, pausedObjectives: new Set(), vetoed: new Set(), redirect: null };
  for (const e of events) {
    const p = asObj(e.props), kind = p.kind as OverrideKind, id = typeof p.objectiveId === "string" ? p.objectiveId : null;
    if (kind === "pause_all") s.pausedAll = true;
    else if (kind === "resume_all") s.pausedAll = false;
    else if (kind === "pause_objective" && id) s.pausedObjectives.add(id);
    else if (kind === "resume_objective" && id) s.pausedObjectives.delete(id);
    else if (kind === "veto" && id) s.vetoed.add(id);
    else if (kind === "redirect" && typeof p.priority === "string" && p.priority.trim()) s.redirect = p.priority.trim().slice(0, 300);
  }
  return s;
}
export const isBlockedByOverride = (s: OverrideState, objectiveId: string) => s.pausedAll || s.pausedObjectives.has(objectiveId) || s.vetoed.has(objectiveId);

// ---------- immutable audit (hash chain) ----------
export interface AuditRecord { seq: number; at: string; kind: string; payload: unknown; prevHash: string; hash: string }
export const GENESIS = "genesis";
export function nextAudit(prev: AuditRecord | null, kind: string, payload: unknown, at: Date): AuditRecord {
  const seq = prev ? prev.seq + 1 : 1, prevHash = prev ? prev.hash : GENESIS, atIso = at.toISOString();
  return { seq, at: atIso, kind, payload, prevHash, hash: FNV(`${seq}|${atIso}|${kind}|${JSON.stringify(payload)}|${prevHash}`) };
}
/** Returns the index of the first broken record, or -1 when the chain is intact. */
export function verifyAuditChain(records: readonly AuditRecord[]): number {
  let prev = GENESIS;
  for (let i = 0; i < records.length; i++) {
    const r = records[i]!;
    if (r.prevHash !== prev || r.hash !== FNV(`${r.seq}|${r.at}|${r.kind}|${JSON.stringify(r.payload)}|${r.prevHash}`) || (i > 0 && r.seq !== records[i - 1]!.seq + 1)) return i;
    prev = r.hash;
  }
  return -1;
}

// ---------- self-check (fails closed) ----------
export interface GovernanceCheck { ok: boolean; problems: string[] }
export function governanceSelfCheck(opts: { matrix?: unknown; expectedFingerprint?: string; auditRecords?: readonly AuditRecord[]; emergencyStopActive?: boolean } = {}): GovernanceCheck {
  const problems: string[] = [];
  const matrix = "matrix" in opts ? opts.matrix : AUTHORITY_MATRIX;
  const m = asObj(matrix);
  if (!matrix || !Array.isArray(m.autonomous) || !Array.isArray(m.needsApproval) || !Array.isArray(m.forbidden) || !m.forbidden.length) problems.push("authority matrix missing or malformed");
  else if (FNV(JSON.stringify(matrix)) !== (opts.expectedFingerprint ?? EXPECTED_MATRIX_FINGERPRINT)) problems.push("authority matrix changed unexpectedly (fingerprint mismatch)");
  if (opts.auditRecords && verifyAuditChain(opts.auditRecords) !== -1) problems.push("audit chain broken");
  if (opts.emergencyStopActive) problems.push("ops emergency stop is active");
  return { ok: problems.length === 0, problems };
}
