# Owner dependencies and the plan to remove each

Source: MEMORY.md (to 26 Nov 2026). Rule: before asking the owner, try doing it with the browser/desktop agent; only captcha/passkey/2FA, payments and real decisions remain human-only.

| Dependency | Why only the owner | Plan to remove / reduce | Status |
|---|---|---|---|
| Meta app review for one-click publishing (~9 Dec) | Meta's review, owner's business account | Prepare screencasts + steps in `docs/meta-permissions-results-leads.md`; Meta ads are OFF anyway until proof, so not on the critical path | waiting |
| Spamhaus DBL delisting for joinkomendly.com / hellokomendly.com (100 Maildoso boxes paused) | Domain registrar / delist form | Stop depending on them: 200 other mailboxes warming across 4 clean domains; spread sends so no domain carries >40% (getkomendly carries 185/358 now) | mitigated, concentration risk open |
| Google passkey 2FA for ozzy@getkomendly.com (Reddit/Quora accounts) | Passkey on owner's device | Park Reddit/Quora; do not retry automation (ban risk); use Pinterest/FB/IG via kly social which need no 2FA | parked |
| Chrome Web Store $5 fee + screenshot retake | Payment | Single payment, then set `CHROME_EXTENSION_URL` in `src/lib/growth/chrome-extension.ts` | waiting |
| Jobber marketplace listing (2FA + review call) | Phone 2FA, call | Draft app works for 5 accounts; defer listing until demand shows | deferred |
| Zapier publish (needs 3 real users, komendly.com team member, dev ToS) | Real users | Defer; not constraint-relevant pre-revenue | deferred |
| ChatGPT plugin submission (under-18 vs our under-16 privacy wording) | Legal wording decision | Owner picks one age policy; then submit | decision needed |
| Claude connector/plugin review | Anthropic review | Submitted; nothing to do | waiting |
| HF_TOKEN for Foursquare lead import | Account token | Adlib leads (2,832, ~520 unused) suffice pre-revenue; skip fsq | not needed now |
| Always-on machine for Media Master desktop | Hardware | Move any posting that matters to kly social (server-side); treat MM as best-effort | partially removed |
| First-time flag enablement and deploys | Authority matrix | Coordinator deploys after review; flag-on follows the run order in the operating manual | by design |
| Replies reaching the owner | Policy | Auto-responder live (fce7106); replies forwarded to REPLY_FORWARD_TO; only billing/legal escalate | mostly removed |
| Reading digests | Attention | One combined owner brief, max 12 lines, silent when nothing needs a decision | built (flag off) |
