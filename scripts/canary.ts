// QA canary customer: sign in as the internal test account, (optionally) make a pack, create the $9 unlock Checkout and verify it is a
// Stripe TEST session. DRY by default (prints the plan, no network). Design + nightly setup: docs/ops/qa-canary.md
//   npx tsx scripts/canary.ts                                   # dry run
//   CANARY_PASSWORD=... STRIPE_TEST_SECRET_KEY=sk_test_... npx tsx scripts/canary.ts --run --base https://staging.example.com [--with-pack]
// The target server MUST be configured with Stripe TEST keys (staging/local). Against a live-keyed server the checkout step FAILS
// on the cs_live_ id and stops; it never pays anything. Never prints secrets.
import { UNLOCK_PACK } from "../src/lib/ads/billing-config";
import { CANARY_EMAIL, CANARY_STEPS, refusalReasons, stripeModeOf } from "../src/lib/ops/qa/canary";

const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i > -1 ? process.argv[i + 1] : undefined; };
const cfg = { baseUrl: (arg("base") ?? "http://localhost:3000").replace(/\/$/, ""), email: arg("email") ?? CANARY_EMAIL, password: process.env.CANARY_PASSWORD ?? null, testKey: process.env.STRIPE_TEST_SECRET_KEY ?? null, run: process.argv.includes("--run"), withPack: process.argv.includes("--with-pack") };

let cookie = "";
async function call(method: string, path: string, body?: unknown) {
  const r = await fetch(cfg.baseUrl + path, { method, headers: { "content-type": "application/json", cookie, "user-agent": "komendly-canary" }, body: body ? JSON.stringify(body) : undefined, redirect: "manual", signal: AbortSignal.timeout(30_000) });
  const set = r.headers.getSetCookie().map((c) => c.split(";")[0]).filter((c) => c?.startsWith("session_token="));
  if (set[0]) cookie = set[0];
  return { status: r.status, json: (await r.json().catch(() => ({}))) as Record<string, unknown> };
}
const fail = (m: string): never => { console.error(`FAIL  ${m}`); process.exit(1); };
const ok = (m: string) => console.log(`PASS  ${m}`);

async function main() {
  console.log(`canary ${cfg.run ? "RUN" : "DRY"} -> ${cfg.baseUrl} as ${cfg.email}`);
  for (const s of CANARY_STEPS(cfg.withPack)) console.log(`  - ${s.id}${s.optional ? " (skipped)" : ""}: ${s.what}`);
  const refusals = refusalReasons(cfg);
  if (refusals.length) fail(refusals.join("; "));
  if (!cfg.run) return console.log("\ndry run only. Pass --run to execute.");

  let r = await call("POST", "/api/ads/auth/login", { email: cfg.email, password: cfg.password });
  if (r.status === 401 || r.status === 404) r = await call("POST", "/api/ads/auth/signup", { email: cfg.email, password: cfg.password });
  if (r.status === 403 || r.status === 429) fail(`sign-in blocked (${r.status}): the trial/IP guard rejected this network. Run from a different network (docs/ops/qa-canary.md).`);
  if (!cookie) fail(`no session after login/signup (status ${r.status})`);
  ok("signed in");

  let runId: string | undefined;
  if (cfg.withPack) {
    r = await call("POST", "/api/ads/runs", { url: "https://example.com", count: 10 });
    runId = String((r.json as { id?: string; runId?: string }).id ?? (r.json as { runId?: string }).runId ?? "");
    if (!runId) fail(`pack not created (status ${r.status})`);
    let ready = false;
    for (let i = 0; i < 60 && !ready; i++) {
      const p = await call("GET", `/api/ads/runs/${runId}`);
      const status = String((p.json as { run?: { status?: string } }).run?.status ?? (p.json as { status?: string }).status ?? "");
      if (status === "ready" || status === "complete" || status === "completed") { ready = true; ok("pack ready"); break; }
      if (status === "failed") fail("pack failed");
      await new Promise((res) => setTimeout(res, 10_000));
    }
    if (!ready) fail("pack did not finish in 10 minutes");
  }

  r = await call("POST", "/api/ads-billing/checkout", { kind: "topup", key: UNLOCK_PACK.key });
  const url = String(r.json.url ?? "");
  if (!url) fail(`no checkout url (status ${r.status}, ${String(r.json.error ?? "")})`);
  const mode = stripeModeOf(url);
  if (mode !== "test") fail(`checkout is ${mode} mode: the target server is NOT on Stripe test keys. Nothing was paid; point --base at a test-mode deployment.`);
  ok("unlock checkout created in TEST mode");

  const sessionId = /cs_test_[A-Za-z0-9]+/.exec(url)?.[0];
  if (sessionId) {
    const s = await fetch(`https://api.stripe.com/v1/checkout/sessions/${sessionId}`, { headers: { authorization: `Bearer ${cfg.testKey}` } });
    const j = (await s.json()) as { amount_total?: number; error?: unknown };
    if (!s.ok) fail(`could not read the test session (${s.status})`);
    if (j.amount_total !== UNLOCK_PACK.priceCents) fail(`session amount ${j.amount_total} != unlock price ${UNLOCK_PACK.priceCents}`);
    ok(`session amount matches the unlock price (${UNLOCK_PACK.priceCents})`);
    await fetch(`https://api.stripe.com/v1/checkout/sessions/${sessionId}/expire`, { method: "POST", headers: { authorization: `Bearer ${cfg.testKey}` } });
  }
  void runId;
  console.log("\ncanary passed");
}
main().catch((e) => fail(String(e instanceof Error ? e.message : e)));
