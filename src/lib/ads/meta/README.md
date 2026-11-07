# Meta publishing (Website2ads)

Paid-only module (gate: `isPaidWorkspace` via `canPublishToMeta` + `AdsFeatureFlag` `meta_publish`).
Everything is created **PAUSED**; the user turns it on in Ads Manager.

## Research: can a SaaS act as an MCP client to `mcp.facebook.com/ads`? (probed 2026-11-06)

| Check | Result |
|---|---|
| `POST https://mcp.facebook.com/ads` without a token | `401`, `WWW-Authenticate: Bearer resource_metadata="https://mcp.facebook.com/.well-known/oauth-protected-resource/ads"` |
| Protected-resource metadata (`/.well-known/oauth-protected-resource/ads`) | `authorization_servers: ["https://www.facebook.com/ads"]`, scopes `ads_management ads_read catalog_management business_management pages_show_list pages_manage_ads facebook_branded_content_ads_brand instagram_basic instagram_branded_content_ads_brand ads_mcp_management`. (The root and `/ads/.well-known/...` paths return 404.) |
| AS metadata (`https://www.facebook.com/.well-known/oauth-authorization-server/ads`) | authorize `https://www.facebook.com/v27.0/dialog/oauth`, token `https://graph.facebook.com/v27.0/oauth/access_token`, `code` + `authorization_code`/`refresh_token`, PKCE `S256` only, `token_endpoint_auth_methods_supported: ["none"]` (public client), `registration_endpoint: https://mcp.facebook.com/.well-known/register/ads` |
| Dynamic client registration with our redirect (`https://www.komendly.com/api/ads/meta/callback`, also localhost) | `400 invalid_client_metadata: "Dynamic registration is not available for this client."` DCR is allowlisted for Meta's supported clients (a `client_name: Claude` + `claude.ai` callback registers fine). |
| Tool list | Needs auth (no anonymous `tools/list`). From docs: campaign tools `ads_create_campaign`, `ads_create_ad_set`, `ads_create_ad`, `ads_update_entity`, `ads_activate_entity`; creative `ads_create_creative` (single-image link ad), `ads_get_ad_images`, `ads_get_ad_videos`; plus accounts/pages, insights, catalog, dataset tools (~29 in the June docs, ~90 per later counts). Every create lands paused. **No media-upload tool**, no documented video path. |

**Conclusion.** Yes, but only through *our own* Meta developer app: since 2026-07-16 Meta supports
"bring your own developer app" MCP clients: add the *Create & manage ads with ads MCP server* use case,
register our callback, and use `client_id = META_APP_ID` (no DCR). For a SaaS acting for *other*
businesses, Meta requires **App Review + Advanced Access for `ads_mcp_management`**. The server also
can't take uploads, so even in MCP mode media must go through the Marketing API (`/adimages`, `/advideos`).
Tool names/argument schemas are beta and vary per account, so `McpMetaPublisher` resolves tools from the
live `tools/list` and sends Graph-shaped arguments; validate against a real account before enabling it.

**Default: `META_PUBLISH_MODE=graph`** (Marketing API v25 with Facebook Login for Business): stable,
documented upload for images *and* video, standard App Review (`ads_management` etc.). `mcp` is opt-in.

## Layout
- `core/` framework-free (no next/prisma), shared with the engine: `mapping.ts` (objectives, placements,
  PAUSED payloads, Ads Manager link), `graph-publisher.ts`, `mcp-publisher.ts` (MCP SDK `Client` +
  `StreamableHTTPClientTransport`), `publish.ts` (orchestration via `PublishStore`), `crypto.ts`
  (AES-256-GCM, `ADS_TOKEN_KEY`), `oauth.ts` (PKCE, FB Login URL/code exchange, MCP refresh).
- Next side: `config.ts`, `access.ts` (flag + paid), `connection.ts` (encrypted `MetaConnection`),
  `oauth-flow.ts` (state + PKCE in `MetaOAuthState`; MCP mode uses the SDK `auth()` with a provider
  pinned to `META_APP_ID`), `publish-request.ts` (validation, ready+QC-passed only, enqueue `publish_meta`).
- Routes: `src/app/api/ads/meta/{connect,callback,disconnect,status,selection,publish}`.
- Engine job: `engine/src/jobs/publish-meta.ts` (`handlePublishMeta`).

## Structure created on Meta
One campaign per publish (objective from run goal), one ad set per placement group
(4:5/1:1 → Feed, 9:16 → Stories & Reels; FB + IG), one ad per (ad × ratio). Daily budget defaults to
500 minor units when not given, targeting defaults to `US`; both are placeholders the user reviews while paused.

## Env
`META_APP_ID`, `META_APP_SECRET`, `META_REDIRECT_URI` (= `https://<host>/api/ads/meta/callback`),
`META_GRAPH_VERSION` (default `v25.0`), `META_PUBLISH_MODE` (`graph`|`mcp`), optional
`META_LOGIN_CONFIG_ID` (Facebook Login for Business configuration id), `ADS_TOKEN_KEY` (32 bytes base64;
also needed by the engine).
