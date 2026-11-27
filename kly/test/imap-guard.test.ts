import { ImapFlow } from "imapflow";
import { describe, expect, it } from "vitest";
import { guardImap } from "../src/imap-guard";

const make = () => new ImapFlow({ host: "127.0.0.1", port: 1, secure: true, auth: { user: "u", pass: "p" }, logger: false });

// Prod 27 Nov 2026: an ImapFlow "Socket timeout" 'error' event with no listener crashed the whole kly worker (twice).
describe("guardImap", () => {
  it("an unguarded ImapFlow throws on a runtime 'error' event, a guarded one does not", () => {
    expect(() => make().emit("error", new Error("Socket timeout"))).toThrow("Socket timeout");
    const guarded = guardImap(make(), "box@example.com");
    expect(() => guarded.emit("error", new Error("Socket timeout"))).not.toThrow();
  });
});
