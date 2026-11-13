// Ozzy voice (server): the owner's Codex (ChatGPT) login -> a short-lived realtime key -> a WebRTC call.
// The Codex access token never leaves the server; the browser only gets the answer SDP. Read-only on the shared
// CodexCredential row (the engine owns refresh/rotation); a token near expiry means "voice unavailable" for now.
import { readFile } from "node:fs/promises";
import { prisma } from "@/lib/prisma";
import { decryptToken, tokenKey } from "@/lib/ads/meta/core/crypto";
import { studioVoiceSession } from "./voice";

const REALTIME = "https://api.openai.com/v1/realtime";

type Access = { accessToken: string; accountId: string | null };
export type VoiceCallResult = { ok: true; sdp: string } | { ok: false; code: "no_login" | "refused" | "network"; status?: number; detail?: string };

async function codexAccess(now: number): Promise<Access | null> {
  // Dev only: an existing local ezcoder login file (never in production).
  const devFile = process.env.NODE_ENV !== "production" ? process.env.STUDIO_VOICE_AUTH_FILE : undefined;
  if (devFile) {
    try {
      const raw = JSON.parse(await readFile(devFile, "utf8")) as { openai?: { accessToken?: string; expiresAt?: number; accountId?: string } };
      const o = raw.openai;
      if (o?.accessToken && (o.expiresAt ?? 0) > now + 60_000) return { accessToken: o.accessToken, accountId: o.accountId ?? null };
    } catch {
      /* fall back to the DB row */
    }
  }
  const rows = await prisma.$queryRaw<{ accessToken: string; expiresAt: bigint | number; accountId: string | null }[]>`SELECT "accessToken", "expiresAt", "accountId" FROM "CodexCredential" WHERE id = 'codex'`;
  const r = rows[0];
  if (!r || Number(r.expiresAt) <= now + 60_000) return null;
  return { accessToken: decryptToken(r.accessToken, tokenKey(process.env.ADS_TOKEN_KEY)), accountId: r.accountId };
}

/** No secrets in what we keep from an error body. */
function scrub(text: string): string {
  return text.replace(/(ek_|sk-|eyJ)[A-Za-z0-9._-]+/g, "<redacted>").slice(0, 300);
}

export async function startVoiceCall(sdp: string, o: { title?: string | null; signal?: AbortSignal; now?: number }): Promise<VoiceCallResult> {
  const access = await codexAccess(o.now ?? Date.now()).catch(() => null);
  if (!access) return { ok: false, code: "no_login" };
  try {
    const headers: Record<string, string> = { Authorization: `Bearer ${access.accessToken}`, "Content-Type": "application/json" };
    if (access.accountId) headers["ChatGPT-Account-ID"] = access.accountId;
    const mint = await fetch(`${REALTIME}/client_secrets`, { method: "POST", headers, body: JSON.stringify({ expires_after: { anchor: "created_at", seconds: 60 }, session: studioVoiceSession({ title: o.title }) }), signal: o.signal });
    if (!mint.ok) return { ok: false, code: "refused", status: mint.status, detail: scrub(await mint.text()) };
    const key = ((await mint.json()) as { value?: unknown }).value;
    if (typeof key !== "string") return { ok: false, code: "refused", status: mint.status, detail: "no key in response" };
    const call = await fetch(`${REALTIME}/calls`, { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/sdp" }, body: sdp, signal: o.signal });
    const answer = await call.text();
    if (!call.ok) return { ok: false, code: "refused", status: call.status, detail: scrub(answer) };
    return { ok: true, sdp: answer };
  } catch (e) {
    return { ok: false, code: "network", detail: scrub(e instanceof Error ? e.message : String(e)) };
  }
}
