// End-to-end OAuth proof against a local dev server, acting like a real MCP client (Claude/ChatGPT).
// Usage: set -a; . ./.env.local; set +a; npx tsx scripts/oauth-e2e.ts http://localhost:3109
// Creates a temporary Session for dev@komendly.dev in the DEV database and deletes it (plus the test client) afterwards.
import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";

const BASE = process.argv[2] ?? "http://localhost:3109";
const prisma = new PrismaClient();
const log = (step: string, detail: unknown) => console.log(`\n== ${step}\n${typeof detail === "string" ? detail : JSON.stringify(detail, null, 2)}`);
const redact = (s: string) => s.replace(/(km[oracs]_)[0-9A-Za-z]{6,}/g, "$1…");
const must = (cond: unknown, msg: string) => {
  if (!cond) throw new Error(`FAILED: ${msg}`);
};

async function mcp(token: string, body: unknown) {
  const res = await fetch(`${BASE}/api/mcp`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18" }, body: JSON.stringify(body) });
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

async function main() {
  const sessionToken = crypto.randomBytes(32).toString("hex");
  let clientId = "";
  const user = await prisma.user.findUnique({ where: { email: "dev@komendly.dev" } });
  must(user, "dev@komendly.dev exists in the dev DB");
  if (!user) return;
  await prisma.session.create({ data: { token: sessionToken, userId: user.id, expiresAt: new Date(Date.now() + 3600_000) } });
  try {
    // 1. Unauthenticated MCP call -> 401 with resource_metadata
    const r401 = await fetch(`${BASE}/api/mcp`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "e2e", version: "1" } } }) });
    const challenge = r401.headers.get("www-authenticate") ?? "";
    log("1. POST /api/mcp without token", { status: r401.status, "www-authenticate": challenge });
    must(r401.status === 401, "401");
    const prmUrl = /resource_metadata="([^"]+)"/.exec(challenge)?.[1];
    must(prmUrl, "resource_metadata in challenge");

    // 2. Protected resource metadata -> 3. AS metadata
    const prm = (await (await fetch(prmUrl ?? "")).json()) as { resource: string; authorization_servers: string[] };
    log("2. GET " + prmUrl, prm);
    const asUrl = `${prm.authorization_servers[0]}/.well-known/oauth-authorization-server`;
    const as = (await (await fetch(asUrl)).json()) as Record<string, string>;
    log("3. GET " + asUrl, as);

    // 4. Dynamic client registration
    const redirectUri = "http://127.0.0.1:43123/callback";
    const regRes = await fetch(as.registration_endpoint ?? "", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ client_name: "Claude (e2e)", redirect_uris: [redirectUri], token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"] }) });
    const reg = (await regRes.json()) as Record<string, unknown>;
    clientId = String(reg.client_id);
    log("4. POST register", { status: regRes.status, ...reg, client_id: redact(clientId) });
    must(regRes.status === 201, "registered");

    // 5. Authorize (signed out -> login redirect; signed in -> consent page)
    const verifier = crypto.randomBytes(32).toString("base64url");
    const codeChallenge = crypto.createHash("sha256").update(verifier).digest("base64url");
    const state = crypto.randomBytes(8).toString("hex");
    const authUrl = new URL(as.authorization_endpoint ?? "");
    for (const [k, v] of Object.entries({ response_type: "code", client_id: clientId, redirect_uri: redirectUri, code_challenge: codeChallenge, code_challenge_method: "S256", state, scope: "ozzy", resource: prm.resource })) authUrl.searchParams.set(k, v);
    const signedOut = await fetch(authUrl, { redirect: "manual" });
    log("5a. GET authorize signed out", { status: signedOut.status, location: signedOut.headers.get("location")?.slice(0, 80) + "…" });
    must([302, 303, 307].includes(signedOut.status) && signedOut.headers.get("location")?.startsWith("/login?next=%2Foauth%2Fauthorize"), "redirect to login with next");
    const page = await fetch(authUrl, { headers: { cookie: `session_token=${sessionToken}` } });
    const html = await page.text();
    const consent = /name="consent" value="([^"]+)"/.exec(html)?.[1];
    log("5b. GET authorize signed in (consent page)", { status: page.status, mentionsApp: html.includes("Claude (e2e)"), hasAllow: html.includes(">Allow<"), consentToken: consent ? "present" : "missing" });
    must(page.status === 200 && consent, "consent page");

    // 6. Allow
    const allow = await fetch(`${BASE}/api/oauth/authorize`, { method: "POST", redirect: "manual", headers: { cookie: `session_token=${sessionToken}`, origin: BASE, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ consent: consent?.replace(/&amp;/g, "&") ?? "", decision: "allow" }) });
    const loc = new URL(allow.headers.get("location") ?? "http://x/");
    log("6. POST consent (Allow)", { status: allow.status, redirect: `${loc.origin}${loc.pathname}`, state_matches: loc.searchParams.get("state") === state, code: redact(loc.searchParams.get("code") ?? ""), iss: loc.searchParams.get("iss") });
    must(allow.status === 303 && loc.searchParams.get("code"), "code issued");
    const forged = await fetch(`${BASE}/api/oauth/authorize`, { method: "POST", redirect: "manual", headers: { cookie: `session_token=${sessionToken}`, origin: "https://evil.example", "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ consent: consent ?? "", decision: "allow" }) });
    log("6b. POST consent from another origin", { status: forged.status });
    must(forged.status === 403, "cross-origin consent refused");

    // 7. Token
    const tok = async (params: Record<string, string>) => {
      const res = await fetch(as.token_endpoint ?? "", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(params) });
      return { status: res.status, json: (await res.json()) as Record<string, string> };
    };
    const code = loc.searchParams.get("code") ?? "";
    const t1 = await tok({ grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: redirectUri, client_id: clientId, resource: prm.resource });
    log("7. POST token (authorization_code)", { status: t1.status, token_type: t1.json.token_type, expires_in: t1.json.expires_in, scope: t1.json.scope, access_token: redact(t1.json.access_token ?? ""), refresh_token: redact(t1.json.refresh_token ?? "") });
    must(t1.status === 200, "tokens");
    const replay = await tok({ grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: redirectUri, client_id: clientId });
    log("7b. replay the same code", replay);

    // 8. MCP with the access token (replay revoked the first grant's tokens per spec, so get fresh ones via a new code)
    const access1 = t1.json.access_token ?? "";
    const afterReplay = await mcp(access1, { jsonrpc: "2.0", id: 9, method: "tools/list" });
    log("7c. MCP with tokens from the replayed code", { status: afterReplay.status });
    // Fresh authorization (as a client would after the failure).
    const page2 = await (await fetch(authUrl, { headers: { cookie: `session_token=${sessionToken}` } })).text();
    const consent2 = /name="consent" value="([^"]+)"/.exec(page2)?.[1] ?? "";
    const allow2 = await fetch(`${BASE}/api/oauth/authorize`, { method: "POST", redirect: "manual", headers: { cookie: `session_token=${sessionToken}`, origin: BASE, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ consent: consent2, decision: "allow" }) });
    const code2 = new URL(allow2.headers.get("location") ?? "http://x/").searchParams.get("code") ?? "";
    const t2 = await tok({ grant_type: "authorization_code", code: code2, code_verifier: verifier, redirect_uri: redirectUri, client_id: clientId, resource: prm.resource });
    must(t2.status === 200, "second tokens");
    const access = t2.json.access_token ?? "";
    const init = await mcp(access, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "e2e", version: "1" } } });
    log("8a. MCP initialize", { status: init.status, serverInfo: (init.json.result as { serverInfo?: unknown } | undefined)?.serverInfo });
    const list = await mcp(access, { jsonrpc: "2.0", id: 2, method: "tools/list" });
    log("8b. MCP tools/list", { status: list.status, tools: ((list.json.result as { tools?: { name: string }[] } | undefined)?.tools ?? []).map((t) => t.name).sort() });
    const acct = await mcp(access, { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "get_account", arguments: {} } });
    log("8c. MCP get_account", { status: acct.status, result: (acct.json.result as { structuredContent?: unknown } | undefined)?.structuredContent });
    must(acct.status === 200, "get_account");

    // 9. Refresh with rotation, then reuse detection
    const r1 = await tok({ grant_type: "refresh_token", refresh_token: t2.json.refresh_token ?? "", client_id: clientId });
    log("9a. POST token (refresh_token)", { status: r1.status, rotated: r1.json.refresh_token !== t2.json.refresh_token, access_token: redact(r1.json.access_token ?? "") });
    const ok2 = await mcp(r1.json.access_token ?? "", { jsonrpc: "2.0", id: 4, method: "tools/list" });
    log("9b. MCP with refreshed access token", { status: ok2.status });
    const reuse = await tok({ grant_type: "refresh_token", refresh_token: t2.json.refresh_token ?? "", client_id: clientId });
    const dead = await mcp(r1.json.access_token ?? "", { jsonrpc: "2.0", id: 5, method: "tools/list" });
    log("9c. reuse old refresh token -> grant revoked", { reuse: reuse.json, mcpAfter: dead.status });
    must(reuse.status === 400 && dead.status === 401, "reuse detection");
    console.log("\nE2E OK");
  } finally {
    await prisma.session.deleteMany({ where: { token: sessionToken } });
    if (clientId) await prisma.oAuthClient.deleteMany({ where: { id: clientId } });
    await prisma.oAuthAuthCode.deleteMany({ where: { clientId } });
    await prisma.$disconnect();
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
