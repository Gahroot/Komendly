// ImapFlow emits an 'error' event on a socket timeout / reset AFTER connect() resolved. With no listener Node throws it as
// an uncaught exception and the whole kly worker exits (seen on Railway 27 Nov 2026: restarts at ~07:08 and ~11:14 UTC,
// "Unhandled 'error' event ... Error: Socket timeout"). With a listener the failing call just rejects and the per-mailbox
// try/catch (imap.ts pollDue, warmup.ts) records it. Attach this to every ImapFlow instance.
import { errMsg, log } from "./log";

export interface ErrorEmitter {
  on(event: "error", listener: (e: unknown) => void): unknown;
}

export function guardImap<T extends ErrorEmitter>(client: T, address: string): T {
  client.on("error", (e) => log("warn", "kly imap connection error", { mailbox: address, error: errMsg(e).slice(0, 200) }));
  return client;
}
