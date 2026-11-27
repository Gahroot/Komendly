// Web-side wiring of the contact guard (canContact + ledger). Fails OPEN on ledger errors (a broken ledger must not stop
// mail the owner already approved); `allowed:false` only when the pure rules say the person/business was just contacted.
// Kly/engine are NOT wired yet: kly Dockerfile would need `COPY src/lib/ops/control/contact.ts` (pure TS, no imports).
import { prisma } from "@/lib/prisma";
import { canContact, loadContacts, recordContact, type Channel } from "./contact";

export async function guardContact(target: string, channel: Channel, source: string): Promise<{ allowed: boolean; reason?: string }> {
  try {
    const verdict = canContact(target, channel, await loadContacts(prisma as never, target));
    if (!verdict.ok) return { allowed: false, reason: verdict.reason };
    await recordContact(prisma as never, target, channel, source);
  } catch { /* fail open */ }
  return { allowed: true };
}
