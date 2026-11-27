# Emergency stop ("pause all outbound")

**Use when:** a complaint spike, wrong message sent, deliverability crisis, legal notice, or anything where the safest move is "stop talking to the outside world now".

**Do it:** `/admin/ads/ops` -> **Pause all outbound** -> confirm. API: `POST /api/admin/ops/emergency-stop {"action":"stop"}` (admin session).

**What it turns OFF** (`EMERGENCY_FLAGS` in `src/lib/ops/control/emergency.ts`): `outbound`, `lifecycle_email`, and the sending/posting/outreach systems (creative outreach/publish, reels, nurture, review gifts, ad watch, reactivation, expansion, winback, checkout recovery, AI assistant, activation, proof, cancel-save) and the three digests.

**What keeps running:** billing and Stripe webhooks, pack delivery, inbound replies/bounce/unsubscribe processing, monitoring and alerts, the ledger itself.

**Audit:** AdsEvent `ops_emergency_stop` (who, which flags) and an `ops_decision`.

**Undo:** **Resume** (`{"action":"resume"}`) turns back ON exactly the flags that stop turned off (stored in the event), nothing else. Flags you had already switched off stay off.

**Extra hard stops outside the app:** Kly `OUTBOUND_ENABLED=0` in Railway env; Kly governor auto-stop; Vercel env/cron removal; `railway down` for engine as last resort.

**Limits (honest):** reversible but not tested against a live DB yet; pure plan/resume logic is unit tested. It does not recall emails already sent.
