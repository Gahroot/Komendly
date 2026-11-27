# QA canary customer

**Goal:** catch "a real customer cannot get from sign-up to paying" before a customer does. Account: `hello+funnel-test@getkomendly.com` (internal test account: excluded from lifecycle mail and funnel stats).

**Flow (`scripts/canary.ts`)** sign in (sign up if missing) -> optional pack (`--with-pack`, uses a real engine run) -> create the $9 unlock Checkout -> require a `cs_test_` session (a `cs_live_` id aborts: the target is not on test keys) -> read the session from Stripe's TEST API, compare the amount to `UNLOCK_PACK.priceCents` -> expire the session. Nothing is ever paid; live Stripe is never contacted.

**Safety:** dry by default; `--run` needs `CANARY_PASSWORD` and `STRIPE_TEST_SECRET_KEY` (`sk_test_`). Refuses any other account. Target must be a deployment on Stripe TEST keys (local `next start` with test env, or a Vercel preview with test env vars).

**Nightly on another network:** the trial IP guard blocks the dev network (403/429 on sign-in). Run it from a machine with a different egress IP (a small VPS or a GitHub-hosted runner is fine; a home line is not the dev network):
```
0 3 * * * cd /opt/komendly && CANARY_PASSWORD=... STRIPE_TEST_SECRET_KEY=... npx tsx scripts/canary.ts --run --base https://<test-mode-deployment> >> canary.log 2>&1 || curl -fsS -d "canary failed" https://ntfy.sh/<private-topic>
```
Store secrets in the machine's env file, not the repo. Add `--with-pack` weekly only. Exit code 1 = failure.
Complement: `scripts/funnel-smoke.ts` (no account, production GETs) already runs every 10 min via the funnel monitor and now covers the creative-hub and SEO pages.
