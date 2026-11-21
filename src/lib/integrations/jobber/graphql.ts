// Jobber OAuth token endpoint + GraphQL client. fetch is injectable for tests. Field names follow Jobber's public schema
// (verify in the Developer Center GraphiQL with a tester account before review; see docs/integrations/jobber-listing.md).
import { JOBBER_GRAPHQL_URL, JOBBER_TOKEN_URL, tokenExpiry, type JobberEnv } from "./core";
import type { JobberJob } from "./mapping";

type Fetch = typeof fetch;
export interface JobberTokens { accessToken: string; refreshToken: string; expiresAt: Date }

export class JobberAuthError extends Error {}

async function tokenRequest(env: JobberEnv, params: Record<string, string>, f: Fetch, now: Date): Promise<JobberTokens> {
  const res = await f(JOBBER_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({ client_id: env.clientId, client_secret: env.clientSecret, ...params }).toString(),
  });
  const j = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; expires_in?: number; warning?: string; error?: string };
  if (!res.ok || !j.access_token || !j.refresh_token) throw new JobberAuthError(`jobber token ${res.status}: ${j.error ?? "no token"}`);
  if (j.warning) console.warn("[jobber] token warning:", j.warning);
  return { accessToken: j.access_token, refreshToken: j.refresh_token, expiresAt: tokenExpiry(j.access_token, j.expires_in, now) };
}

export function exchangeCode(env: JobberEnv, code: string, verifier: string | null, f: Fetch = fetch, now = new Date()) {
  return tokenRequest(env, { grant_type: "authorization_code", code, redirect_uri: env.redirectUri, ...(verifier ? { code_verifier: verifier } : {}) }, f, now);
}

/** Refresh token rotation is mandatory for Marketplace apps: the returned refresh token replaces the old one at once. */
export function refreshTokens(env: JobberEnv, refreshToken: string, f: Fetch = fetch, now = new Date()) {
  return tokenRequest(env, { grant_type: "refresh_token", refresh_token: refreshToken }, f, now);
}

export async function jobberGraphql<T>(env: JobberEnv, accessToken: string, query: string, variables: Record<string, unknown> = {}, f: Fetch = fetch): Promise<T> {
  const res = await f(JOBBER_GRAPHQL_URL, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json", "X-JOBBER-GRAPHQL-VERSION": env.apiVersion },
    body: JSON.stringify({ query, variables }),
  });
  if (res.status === 401) throw new JobberAuthError("jobber graphql 401");
  const j = (await res.json().catch(() => ({}))) as { data?: T; errors?: Array<{ message?: string }> };
  if (!res.ok || !j.data) throw new Error(`jobber graphql ${res.status}: ${j.errors?.map((e) => e.message).join("; ") ?? "no data"}`);
  return j.data;
}

export const ACCOUNT_QUERY = "query KomendlyAccount { account { id name } }";
const JOB_FIELDS = "id title jobStatus completedAt property { address { city province } } lineItems(first: 3) { nodes { name } }";
export const JOB_QUERY = `query KomendlyJob($id: EncodedId!) { job(id: $id) { ${JOB_FIELDS} } }`;
export const VISIT_QUERY = `query KomendlyVisit($id: EncodedId!) { visit(id: $id) { id job { ${JOB_FIELDS} } } }`;
export const DISCONNECT_MUTATION = "mutation KomendlyDisconnect { appDisconnect { app { name } userErrors { message } } }";

export async function fetchAccount(env: JobberEnv, token: string, f: Fetch = fetch): Promise<{ id: string; name: string | null }> {
  const d = await jobberGraphql<{ account?: { id?: string; name?: string | null } }>(env, token, ACCOUNT_QUERY, {}, f);
  if (!d.account?.id) throw new Error("jobber account missing");
  return { id: d.account.id, name: d.account.name ?? null };
}

/** The job behind a JOB_CLOSED (item = job) or VISIT_COMPLETE (item = visit) webhook. */
export async function fetchJobFor(env: JobberEnv, token: string, topic: string, itemId: string, f: Fetch = fetch): Promise<JobberJob | null> {
  if (topic === "VISIT_COMPLETE") {
    const d = await jobberGraphql<{ visit?: { job?: JobberJob | null } | null }>(env, token, VISIT_QUERY, { id: itemId }, f);
    return d.visit?.job ?? null;
  }
  const d = await jobberGraphql<{ job?: JobberJob | null }>(env, token, JOB_QUERY, { id: itemId }, f);
  return d.job ?? null;
}

export async function disconnectApp(env: JobberEnv, token: string, f: Fetch = fetch): Promise<void> {
  await jobberGraphql(env, token, DISCONNECT_MUTATION, {}, f);
}
