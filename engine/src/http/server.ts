// Minimal HTTP: /healthz (process up), /readyz (DB reachable). HMAC helper for internal endpoints.
import { createHmac, timingSafeEqual } from "node:crypto";
import http from "node:http";
import type { Db } from "../db";

export function sign(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

export function verifySignature(secret: string | undefined, body: string, header: string | undefined): boolean {
  if (!secret || !header) return false;
  const want = Buffer.from(sign(secret, body));
  const got = Buffer.from(header.replace(/^sha256=/, ""));
  return want.length === got.length && timingSafeEqual(want, got);
}

export function startHttp(port: number, db: Db, status: () => Record<string, unknown>): http.Server {
  const server = http.createServer((req, res) => {
    const send = (code: number, body: unknown) => {
      res.writeHead(code, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    if (req.url === "/healthz") return send(200, { ok: true, ...status() });
    if (req.url === "/readyz") {
      db.$queryRaw`SELECT 1`
        .then(() => send(200, { ok: true, db: true }))
        .catch((e: unknown) => send(503, { ok: false, db: false, error: e instanceof Error ? e.message : String(e) }));
      return;
    }
    send(404, { error: "not found" });
  });
  server.listen(port);
  return server;
}
