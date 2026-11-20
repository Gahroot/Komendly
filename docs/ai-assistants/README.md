# AI assistants (growth system `ai_assistant`)

People asking ChatGPT or Claude to make ads use Komendly from inside the assistant through the hosted MCP server
`https://www.komendly.com/api/mcp` (OAuth 2.1 + dynamic client registration). Kill switch: AdsFeatureFlag `sys_ai_assistant`
(missing = OFF, which means **new** app connections are refused until it is turned on; API keys / CLI and already connected apps keep working).

## Requirements checked (Nov 2026)
| Requirement | Source | Status |
|---|---|---|
| Remote HTTPS streamable-http MCP endpoint | Claude: https://claude.com/docs/connectors/building/submission · OpenAI: https://developers.openai.com/plugins/deploy/submission | `/api/mcp` |
| OAuth 2.0/2.1 for account tools; discovery via RFC 9728 + RFC 8414; DCR (OpenAI `client.mode: "dcr"`) | https://developers.openai.com/plugins/build/plugins (mcp.json auth) · https://claude.com/docs/connectors/building/authentication | `/.well-known/oauth-protected-resource/api/mcp`, `/.well-known/oauth-authorization-server`, `/api/oauth/register`, PKCE S256 |
| Every tool: `title` + explicit `readOnlyHint`/`destructiveHint`/`openWorldHint` (missing hints block OpenAI submission) | https://developers.openai.com/apps-sdk/app-submission-guidelines · https://github.com/openai/plugins/blob/main/plugins/openai-developers/skills/chatgpt-app-submission/SKILL.md | `src/lib/agent-keys/assistant.ts` `TOOL_HINTS` (test asserts it) |
| Listing: name ≤30, subtitle ≤30, description ≤4000, website/support/privacy/terms URLs, square icon ≥48px; 5 positive + 3 negative test cases, demo video, reviewer account without email codes/MFA | https://developers.openai.com/plugins/deploy/submission | `chatgpt-plugin/plugin.json` |
| Domain verification: token at `/.well-known/openai-apps-challenge` | same | route reads env `OPENAI_APPS_CHALLENGE` |
| Claude listing: name ≤100, one-liner ≤200, description ≤2000, docs + privacy URL, support contact, icon; paid Claude plan; no credentials in portal | https://claude.com/docs/connectors/building/submission | `listing.md` |
| MCP Registry: `server.json` (schema 2025-12-11, description ≤100 chars, `remotes`), `mcp-publisher`, GitHub namespace `io.github.<user>/*` | https://modelcontextprotocol.io/registry/quickstart · https://modelcontextprotocol.io/registry/authentication | `server.json` |
| UI widgets | optional for both (only MCP Apps need screenshots) | not used |

Other free directories: the official registry feeds the GitHub MCP Registry and PulseMCP automatically
(https://github.blog/ai-and-ml/generative-ai/how-to-find-install-and-manage-mcp-servers-with-the-github-mcp-registry/).
mcp.so and Glama take a free form submission (see the founder's guide ~/Documents/Komendly-ChatGPT-Claude-Directory-Guide.md, optional).

## How it works
- **Sign-up inside OAuth:** a signed-out visitor on `/oauth/authorize` is sent to `/ads/signup?next=<authorize URL>&utm_source=ai_assistant&utm_campaign=<client>` (it links to sign-in for existing users). Middleware also records the consent-page visit itself as an `ai_assistant` first touch, so `/api/ads/auth/signup` writes `signed_up` with `props.firstTouch.utm_source = "ai_assistant"`. Allowing a new app writes `assistant_connected` (props.system, client, newUser).
- **Free tier:** every tool goes through the same routes as the web app (one free Ad Pack, free video, trial/abuse checks, per-connection limits). Payment errors return `upgrade_url` = pricing tagged `utm_source=ai_assistant`.
- **Links back:** `view_url`s and upgrade links on OAuth connections go through `withSystemUtm(..., "ai_assistant")` (campaign = client slug, e.g. `chatgpt`, `claude`). CLI / API-key links are unchanged.
- **Usage:** each tool call over an OAuth connection writes `AdsEvent assistant_tool_called` (props.system, tool, client, grantId).
- **Health:** engine loop `engine/src/growth/ai-assistant.ts` (hourly, only while the flag is on) checks production: both metadata documents, the 401 + `resource_metadata` challenge, then `initialize` + `tools/list` with header `X-Komendly-Client: probe` (anonymous discovery only, `tools/call` stays 401). Heartbeat `system:ai_assistant`; outputs = assistant sign-ups + tool calls since the last cycle; fails if the endpoint, metadata, a listed tool or any annotation breaks. `MCP_PROBE_URL` (optional) overrides `NEXT_PUBLIC_APP_URL`.

## Publish to the MCP Registry (coordinator, after deploy; uses the logged-in `gh`, nothing installed globally)
```bash
cd /tmp && curl -sL "https://github.com/modelcontextprotocol/registry/releases/latest/download/mcp-publisher_darwin_arm64.tar.gz" | tar xz mcp-publisher
cd /Users/groot/Komendly/docs/ai-assistants
/tmp/mcp-publisher validate
/tmp/mcp-publisher login github --token "$(gh auth token)"
/tmp/mcp-publisher publish
curl -s "https://registry.modelcontextprotocol.io/v0/servers?search=io.github.Gahroot/komendly"
```
Bump `version` in `server.json` for every later publish.

## Directory status (19 Nov 2026, ~20:00 ET)
| Directory | Status | Next step |
|---|---|---|
| Official MCP Registry (`io.github.Gahroot/komendly`) | Live, v1.0.0 | Bump `version` on changes |
| Glama connector `io.github.Gahroot/komendly` | **Claimed (ownership verified via GitHub @Gahroot), Healthy.** Test profile sends header `X-Komendly-Client: probe` (public probe: initialize + tools/list only) | Nothing; uptime climbs with hourly checks |
| Glama server (repo `Gahroot/Komendly`) | Submitted "Add Server > Runs from source" (reviewed; then an email asks for a Dockerfile) | Answer Glama's email; then PR to punkpeye/awesome-mcp-servers (its CI needs this listing) |
| punkpeye/awesome-remote-mcp-servers | PR #5297 open (endpoint-ok, has-connector; repo starred) | Wait for merge |
| jaw9c/awesome-remote-mcp-servers | PR #2564 open | Wait for merge |
| mcpservers.org | Submitted (free queue, review within 2 weeks), Marketing, remote + OAuth | Approval email to nolan@komendly.com |
| mcp.directory | Submitted (free, "published within 24 hours"), repo Gahroot/Komendly, npm `komendly` | Email to nolan@komendly.com |
| MCP Market | Repo already in their free queue (form said "already in our queue"); free queue is GitHub-repo only, Remote MCP needs paid $29/$69 | Wait (4-6 weeks) |
| Cursor directory | Plugin created at cursor.directory/plugins/komendly-ozzy (MCP config = hosted URL). **Hidden pending manual review**: their scanner can't clone the repo (archive >100 MB); repo field is locked | Wait for manual review |
| Smithery | Closed: stopped accepting accounts/submissions on 31 Oct 2026 (now a curated Arcade.dev directory) | Nothing |
| LobeHub MCP marketplace | Market CLI logged in as Gahroot, but its GitHub connect asks **read+write on all repos incl. private**; declined | Founder decision (scoped token or separate org/repo) |
| mcp.so | Paid only ($39) | Skipped |
| AI Agents Directory | Needs an account login | Later |
| AI Agents List | Paid ($29+) | Skipped |
| PulseMCP, GitHub MCP Registry | Copy the official registry automatically | Nothing |

Review status (checked 19 Nov 2026 ~20:00 ET in the dashboards): Meta App Review "Review in progress" (submitted ~15:05 ET; the
"not approved" entry below it is the old Nov 2025 submission). Shopify App Store "Submitted, assigning a reviewer" (~18:45 ET).
Issues are emailed to nolan@prestyj.com.

Server card (SEP-1649): `/.well-known/mcp/server-card.json` and `/.well-known/mcp.json`, built from the live probe (`src/lib/agent-keys/server-card.ts`).
