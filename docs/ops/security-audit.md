# Security audit (static review, 26 Nov 2026)

Scope: `src/app/api/**` (195 routes), middleware, next.config.ts, deps. Static reading + local tests only; production was not probed. Not legal advice.

## Fixed in this pass
| ID | Sev | What | Fix |
|---|---|---|---|
| S-01 | **High** | `src/app/api/download/route.ts` was an open SSRF/proxy: any `https://` URL, no session (middleware only checks a cookie exists), redirects followed, filename injected into a header. | Requires a real session (`getCookieUser`), `assertPublicHttpsUrl` (private/metadata/CGNAT/IPv6 blocked, DNS-checked), `redirect: "manual"`, sanitised filename. `src/lib/ops/security/url-guard.ts` + tests. |
| S-02 | Med | `/api/auth/login` had no brute-force limit. | Per-IP (20/15 min) and per-email (10/15 min) via `rateLimit`. Fail-open if the limiter errors. |
| S-03 | Med | `/api/facebook-capi` accepted any caller with any cookie and forwarded Purchase/Lead events to Meta (pollutes the PURCHASE optimisation signal). | 10 events/hour/IP. See S-08 for the remaining gap. |
| S-04 | High | `npm audit fix` (safe, non-breaking) applied to root, engine, kly lockfiles (axios, form-data, js-yaml, lodash, nanoid, zod, source-map-js ...). sharp stays 0.35.5. | Lockfile only. Tests below. |

## Left open (recommended fix)
| ID | Sev | Evidence | Recommended fix |
|---|---|---|---|
| S-05 | **Critical (dep)** | `next` 16.1.1 flagged by npm audit (RSC request deserialisation DoS, image-optimizer DoS); fix is `next@16.4.6`, a minor jump that also bumps postcss. Not applied: framework upgrade needs a full build + manual smoke. | Upgrade to 16.4.6 on a branch, `next build`, run funnel-smoke, deploy. sharp pin already compatible (`^0.35.5`). |
| S-06 | High (dep) | `nodemailer` ^6.10 (root, engine, kly): SMTP command injection via `envelope.size`, misrouting. Fix is major 10.x. | Upgrade after checking the `createTransport` / `sendMail` calls (`src/lib/ads/mailer.ts`, `kly/src/mailboxes.ts`); we never pass user-controlled `envelope`, so exposure is low. `undici` (engine, kly) needs `@prestyj/ai@5.32` (not ours to bump). |
| S-07 | Med | `/api/webhooks/fal` and `/api/webhooks/video-status` are not in `publicPrefixes` (`src/middleware.ts`) so vendor callbacks get a 401/redirect, and both **skip signature verification when the secret is unset** (`webhooks/fal/route.ts:70`). | Decide if these webhooks are still used (testimonials). If yes add the prefix AND fail closed when the secret is missing; if no, delete. |
| S-08 | Med | `/api/facebook-capi` is still unauthenticated and trusts client `value`/`email`. | Move Purchase/Subscribe sending server-side from the Stripe webhook only; keep the route for Lead with a signed event id. |
| S-09 | Med | `src/lib/studio/invite-server.ts:39` emails a third party (referral invite) with no unsubscribe link or suppression check (CAN-SPAM/GDPR). Marked `known_gap` in `src/lib/ops/__tests__/email-guard.test.ts`. | Add the unsubscribe footer and an `OutboundSuppression` lookup, cap invites/day per user. |
| S-10 | Med | No Content-Security-Policy, X-Frame-Options, HSTS or Referrer-Policy in `next.config.ts` (only `nosniff`; `/embed/*` sets `frame-ancestors *` on purpose). Vercel adds HSTS on its domains, but clickjacking of the app is possible. | Add `X-Frame-Options: SAMEORIGIN` + `frame-ancestors 'self'` for everything except `/embed/*`, `Referrer-Policy: strict-origin-when-cross-origin`. CSP script-src needs Meta Pixel/Stripe allowlisting: roll out report-only first. |
| S-11 | Low | Cron routes compare the bearer with `!==` (`api/cron/*/route.ts`) not a timing-safe compare; secrets are long random so practical risk is low. | Shared `timingSafeBearer()` helper. |
| S-12 | Low | CSRF: cookie is `SameSite=lax` (`src/lib/auth.ts:109`), which blocks cross-site POSTs; no CSRF tokens elsewhere. JSON-only POSTs need `content-type: application/json` (preflight) except routes using `request.json()` without checking content type, which still accept `text/plain` form posts from other origins in older browsers. | Acceptable today; add an Origin check helper for state-changing cookie routes (checkout, portal, keys). |
| S-13 | Low | `src/lib/oauth/http.ts` sets `Access-Control-Allow-Origin: *` on OAuth endpoints (token/register/discovery). Appropriate for public-client OAuth; no cookies are used there. | None; documented. |
| S-14 | Low | `api/mcp/k/[key]` legacy: API key in the URL path (ends up in access logs). Marked "remove once unused". | Remove after confirming no traffic. |
| S-15 | Info | Public rate-limited routes verified by grep: ads signup, trial-check, pricing-event, ad-check, free-tools, studio, oauth/register, api-keys, hub/ad-watch (via lib). Not rate limited in the route file: `api/experiments`, `api/ads/landed`, `api/proof/consent` (signed token), `api/ads/device`. Event-spam on `experiments`/`landed` pollutes analytics, not data. | Add `rateLimit` per IP to experiments (cheap). |
| S-16 | Info | Admin: all 20 `/api/admin/**` routes call `checkAdmin()` (verified by grep). `/admin/*` pages are guarded client-side in `admin/layout.tsx` (fetch + redirect); the data comes from the admin APIs, which are checked. Server-rendered admin pages that query Prisma directly (e.g. `admin/ads/ops/page.tsx`) rely on the layout only: a non-admin gets the HTML of a client layout, but server components in children still render server-side. **Verify** each server-component admin page calls an admin check; the layout is a client component. | Add `requireAdminPage()` to a server `admin/layout` wrapper. Treat as High until verified. |

## Checked, no issue found
- Webhooks: Stripe (both), Shopify, Jobber, Meta leadgen, Resend inbound (svix) all call `request.text()` first and verify HMAC; guarded by `invariants.test.ts`. FAL/video-status verify only when the secret is set (S-07).
- IDOR: `/api/videos/[id]` scopes by `userId`; `/api/ads/runs/[id]` uses `requireWorkspaceMember({runId})`; brand/asset routes go through workspace helpers. Not every route was traced; spot checks only.
- Presigned URLs: all `presignGet` call sites use 300-600 s. The one exception is the documented `presignShareable` (up to 7 days, only for the user's own agent/MCP output).
- Tokens: `randomBytes(32|24|16)` base64url for lifecycle, ad-check, invite tokens; HMAC-signed expiring tokens for approve/proof/winback/unsubscribe.
- Open redirects: `email-click` only follows app-relative paths from a signed token.
- Session cookie: httpOnly, secure in production, sameSite lax.
- Secrets: regex scan for `sk_live_`, `whsec_`, `AKIA`, `ghp_`, `xox*`, `AIza` found no hard-coded secrets; no `.env*` or key files tracked by git. Not scanned: git history.
- XSS: `proof/consent` escapes output; React escapes elsewhere. Not exhaustively reviewed: `dangerouslySetInnerHTML` users, embeds, makeover/showcase pages (**todo**).
- SSRF in website scraping: the engine uses `engine/src/net/ssrf.ts` (private ranges, metadata, DNS resolution, per-hop redirect checks, port and scheme limits). Good.

## Dependency audit (`npm audit --omit=dev`)
Before: root 1 critical + 10 high; engine and kly 2 high each; CLI 0. After safe fix: see the report; remaining are next, nodemailer, undici (S-05/S-06).
