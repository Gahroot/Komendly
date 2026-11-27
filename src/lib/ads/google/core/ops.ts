// Account-level Google Ads operations (framework-free). Env is read inside each function (default process.env).
// Auth: "oauth" = the customer's refresh token; "manager" = Komendly's manager account (GOOGLE_ADS_MANAGER_REFRESH_TOKEN,
// login-customer-id GOOGLE_ADS_MANAGER_ID).
import { GoogleAdsClient, refreshTokenSource } from "./client";
import { revokeGoogleGrant } from "./oauth";
import { GoogleAdsApiError, normalizeCustomerId, type GeoPick, type PickableAccount, type Readiness } from "./types";

export type Env = Record<string, string | undefined>;
export type GoogleAuth = { kind: "oauth"; refreshToken: string } | { kind: "manager" };

function need(env: Env, k: string): string {
  const v = env[k];
  if (!v) throw new GoogleAdsApiError(`Google Ads isn't configured yet (${k} missing).`, 503, ["not_configured"]);
  return v;
}

export function managerId(env: Env = process.env): string {
  const id = normalizeCustomerId(need(env, "GOOGLE_ADS_MANAGER_ID"));
  if (!id) throw new GoogleAdsApiError("GOOGLE_ADS_MANAGER_ID must be 10 digits.", 503, ["not_configured"]);
  return id;
}

/** REST client for an auth. Manager auth defaults its login-customer-id to the manager; pass null to send none. */
export function googleAdsClient(auth: GoogleAuth, loginCustomerId?: string | null, env: Env = process.env): GoogleAdsClient {
  const refreshToken = auth.kind === "oauth" ? auth.refreshToken : need(env, "GOOGLE_ADS_MANAGER_REFRESH_TOKEN");
  const login = loginCustomerId === undefined ? (auth.kind === "manager" ? managerId(env) : null) : loginCustomerId;
  return new GoogleAdsClient({
    auth: refreshTokenSource({ clientId: need(env, "GOOGLE_ADS_CLIENT_ID"), clientSecret: need(env, "GOOGLE_ADS_CLIENT_SECRET"), refreshToken }),
    version: env.GOOGLE_ADS_API_VERSION || undefined,
    developerToken: env.GOOGLE_ADS_DEVELOPER_TOKEN || undefined,
    loginCustomerId: login,
  });
}

interface CustomerClientRow {
  customerClient?: { clientCustomer?: string; descriptiveName?: string; currencyCode?: string; timeZone?: string; manager?: boolean; status?: string; testAccount?: boolean; level?: string | number; id?: string };
}

const HIERARCHY_QUERY = `SELECT customer_client.client_customer, customer_client.descriptive_name, customer_client.currency_code,
  customer_client.time_zone, customer_client.manager, customer_client.status, customer_client.test_account, customer_client.level, customer_client.id
  FROM customer_client WHERE customer_client.level <= 3`;

/** Non-manager accounts reachable by this auth, including clients under the user's own manager accounts. */
export async function listAccounts(auth: GoogleAuth, env: Env = process.env): Promise<PickableAccount[]> {
  const base = googleAdsClient(auth, null, env);
  let roots: string[];
  if (auth.kind === "manager") roots = [managerId(env)];
  else {
    const r = await base.request<{ resourceNames?: string[] }>("GET", "customers:listAccessibleCustomers");
    roots = (r.resourceNames ?? []).map((n) => n.split("/")[1] ?? "").filter((x) => /^\d{10}$/.test(x)).slice(0, 25);
  }
  const out = new Map<string, PickableAccount>();
  for (const root of roots) {
    let rows: CustomerClientRow[];
    try {
      rows = await base.withLogin(root).search<CustomerClientRow>(root, HIERARCHY_QUERY);
    } catch {
      continue; // e.g. a canceled/unreachable account in the list
    }
    for (const row of rows) {
      const c = row.customerClient;
      const id = c?.clientCustomer?.split("/")[1] ?? c?.id;
      if (!c || !id || c.manager) continue;
      const acc: PickableAccount = {
        customerId: id, name: c.descriptiveName || `Account ${id}`, currency: c.currencyCode ?? "", timeZone: c.timeZone ?? "",
        manager: false, status: c.status ?? "UNKNOWN", test: !!c.testAccount, ...(id !== root ? { loginCustomerId: root } : {}),
      };
      const prev = out.get(id);
      // Prefer direct access (no login-customer-id) over access through a manager.
      if (!prev || (prev.loginCustomerId && !acc.loginCustomerId)) out.set(id, acc);
    }
  }
  return [...out.values()].sort((a, b) => Number(a.test) - Number(b.test) || a.name.localeCompare(b.name));
}

export function mapAccountStatus(s: string | undefined): Readiness["account"] {
  if (s === "ENABLED") return "ok";
  if (s === "SUSPENDED") return "suspended";
  if (s === "CANCELED" || s === "CLOSED") return "canceled";
  return "unknown";
}

export function mapBilling(statuses: string[] | null): Readiness["billing"] {
  if (statuses === null) return "unknown";
  return statuses.includes("APPROVED") ? "ok" : "missing";
}

export function mapLinkStatus(s: string | undefined): "none" | "pending" | "active" | "rejected" {
  if (s === "ACTIVE") return "active";
  if (s === "PENDING") return "pending";
  if (s === "REFUSED") return "rejected";
  return "none";
}

/** Pure: blockers in plain words + canPublish. */
export function readinessFrom(r: Omit<Readiness, "canPublish" | "blockers">, viaManager: boolean): Readiness {
  const blockers: string[] = [];
  if (viaManager && r.managerLink === "pending") blockers.push("Accept Komendly's invitation in Google Ads (Admin > Access and security > Managers).");
  if (viaManager && r.managerLink === "rejected") blockers.push("The invitation from Komendly was declined. Send a new one and accept it in Google Ads.");
  if (viaManager && r.managerLink === "none") blockers.push("Link your Google Ads account to Komendly first.");
  if (r.account === "suspended") blockers.push("Google has suspended this Google Ads account. Check the notice in Google Ads.");
  if (r.account === "canceled") blockers.push("This Google Ads account is canceled or closed. Pick another account.");
  if (r.account === "unknown" && !(viaManager && r.managerLink !== "active")) blockers.push("We couldn't read this account's status. Check that you have access to it.");
  if (r.billing === "missing") blockers.push("Add a payment method in Google Ads (Billing > Setup). Spend goes on your own card.");
  const linkOk = !viaManager || r.managerLink === "active";
  return { ...r, canPublish: linkOk && r.account === "ok" && r.billing === "ok", blockers };
}

export async function checkReadiness(auth: GoogleAuth, customerId: string, loginCustomerId?: string, env: Env = process.env): Promise<Readiness> {
  const cid = normalizeCustomerId(customerId);
  if (!cid) throw new GoogleAdsApiError("Customer ID must be 10 digits.", 400, ["invalid_customer_id"]);
  const viaManager = auth.kind === "manager";
  let managerLink: Readiness["managerLink"] = "none";
  if (viaManager) {
    managerLink = cid === managerId(env) ? "active" : await managerLinkStatus(cid, env).catch(() => "none" as const);
    if (managerLink !== "active") return readinessFrom({ billing: "unknown", account: "unknown", managerLink }, true);
  }
  const client = googleAdsClient(auth, viaManager ? undefined : (normalizeCustomerId(loginCustomerId) ?? null), env);
  let account: Readiness["account"] = "unknown";
  try {
    const rows = await client.search<{ customer?: { status?: string; testAccount?: boolean } }>(cid, "SELECT customer.status, customer.test_account FROM customer LIMIT 1");
    // Google reports every test account as CLOSED and test accounts never need billing (they never serve).
    if (rows[0]?.customer?.testAccount) return readinessFrom({ billing: "ok", account: "ok", managerLink }, viaManager);
    account = mapAccountStatus(rows[0]?.customer?.status);
  } catch {
    account = "unknown";
  }
  let billing: Readiness["billing"] = "unknown";
  try {
    const rows = await client.search<{ billingSetup?: { status?: string } }>(cid, "SELECT billing_setup.status FROM billing_setup");
    billing = mapBilling(rows.map((r) => r.billingSetup?.status ?? ""));
  } catch {
    billing = "unknown";
  }
  return readinessFrom({ billing, account, managerLink }, viaManager);
}

interface GeoSuggestion { geoTargetConstant?: { id?: string; name?: string; canonicalName?: string; targetType?: string; countryCode?: string; status?: string } }

export async function suggestGeo(auth: GoogleAuth, q: string, countryCode?: string, env: Env = process.env): Promise<GeoPick[]> {
  const query = q.trim().slice(0, 100);
  if (!query) return [];
  const r = await googleAdsClient(auth, null, env).request<{ geoTargetConstantSuggestions?: GeoSuggestion[] }>("POST", "geoTargetConstants:suggest", {
    locale: "en", ...(countryCode && /^[A-Z]{2}$/.test(countryCode) ? { countryCode } : {}), locationNames: { names: [query] },
  });
  const picks: GeoPick[] = [];
  for (const s of r.geoTargetConstantSuggestions ?? []) {
    const g = s.geoTargetConstant;
    if (!g?.id || (g.status && g.status !== "ENABLED")) continue;
    if (picks.some((p) => p.kind === "location" && p.id === String(g.id))) continue;
    picks.push({ kind: "location", id: String(g.id), name: g.canonicalName || g.name || String(g.id), type: g.targetType ?? "", countryCode: g.countryCode ?? "" });
  }
  return picks.slice(0, 10);
}

interface LinkRow { customerClientLink?: { resourceName?: string; status?: string; clientCustomer?: string } }

async function findLink(cid: string, env: Env): Promise<LinkRow["customerClientLink"] | null> {
  const mgr = managerId(env);
  const rows = await googleAdsClient({ kind: "manager" }, mgr, env).search<LinkRow>(mgr,
    `SELECT customer_client_link.resource_name, customer_client_link.status, customer_client_link.client_customer FROM customer_client_link WHERE customer_client_link.client_customer = 'customers/${cid}'`);
  const order = ["ACTIVE", "PENDING", "REFUSED", "CANCELED", "INACTIVE"];
  return rows.map((r) => r.customerClientLink).filter((l): l is NonNullable<typeof l> => !!l).sort((a, b) => order.indexOf(a.status ?? "") - order.indexOf(b.status ?? ""))[0] ?? null;
}

export async function managerLinkStatus(customerId: string, env: Env = process.env): Promise<"none" | "pending" | "active" | "rejected"> {
  const cid = normalizeCustomerId(customerId);
  if (!cid) throw new GoogleAdsApiError("Customer ID must be 10 digits.", 400, ["invalid_customer_id"]);
  return mapLinkStatus((await findLink(cid, env))?.status);
}

/** Link invitation from Komendly's manager (CustomerClientLinkService). Reuses an active/pending link. */
export async function sendManagerInvite(customerId: string, env: Env = process.env): Promise<{ status: "pending" | "active"; linkResource: string }> {
  const cid = normalizeCustomerId(customerId);
  if (!cid) throw new GoogleAdsApiError("Customer ID must be 10 digits.", 400, ["invalid_customer_id"]);
  const mgr = managerId(env);
  if (cid === mgr) throw new GoogleAdsApiError("That is Komendly's own account ID. Enter your Google Ads customer ID.", 400, ["invalid_customer_id"]);
  const existing = await findLink(cid, env);
  if (existing?.resourceName && (existing.status === "ACTIVE" || existing.status === "PENDING")) {
    return { status: existing.status === "ACTIVE" ? "active" : "pending", linkResource: existing.resourceName };
  }
  const r = await googleAdsClient({ kind: "manager" }, mgr, env).request<{ result?: { resourceName?: string } }>("POST", `customers/${mgr}/customerClientLinks:mutate`, {
    operation: { create: { clientCustomer: `customers/${cid}`, status: "PENDING" } },
  });
  const linkResource = r.result?.resourceName;
  if (!linkResource) throw new GoogleAdsApiError("Google didn't confirm the invitation. Please try again.", 502);
  return { status: "pending", linkResource };
}

/** New client account under Komendly's manager + admin invitation to the customer's email. */
export async function createClientAccount(input: { email: string; currency?: string; timeZone?: string; name?: string }, env: Env = process.env): Promise<{ customerId: string; inviteSent: boolean }> {
  const mgr = managerId(env);
  const client = googleAdsClient({ kind: "manager" }, mgr, env);
  const r = await client.request<{ resourceName?: string }>("POST", `customers/${mgr}:createCustomerClient`, {
    customerClient: {
      descriptiveName: (input.name?.trim() || `${input.email.split("@")[0]} (Komendly)`).slice(0, 80),
      currencyCode: (input.currency || "USD").toUpperCase(),
      timeZone: input.timeZone || "America/New_York",
    },
  });
  const customerId = r.resourceName?.split("/")[1];
  if (!customerId) throw new GoogleAdsApiError("Google didn't return the new account. Please try again.", 502);
  let inviteSent = false;
  try {
    await client.request("POST", `customers/${customerId}/customerUserAccessInvitations:mutate`, {
      operation: { create: { emailAddress: input.email, accessRole: "ADMIN" } },
    });
    inviteSent = true;
  } catch {
    inviteSent = false;
  }
  return { customerId, inviteSent };
}

export async function revokeGoogleToken(refreshToken: string): Promise<void> {
  await revokeGoogleGrant(refreshToken);
}

/** Deep links into Google Ads (the UI shows them). */
export function googleAdsUrl(customerId: string, campaignId?: string | null): string {
  return campaignId ? `https://ads.google.com/aw/adgroups?__e=${customerId}&campaignId=${campaignId}` : `https://ads.google.com/aw/overview?__e=${customerId}`;
}
export function billingUrl(customerId: string): string {
  return `https://ads.google.com/aw/billing/setup?__e=${customerId}`;
}
export function acceptInviteUrl(customerId: string): string {
  return `https://ads.google.com/aw/accountaccess/managers?__e=${customerId}`;
}
