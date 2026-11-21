# ChatGPT App Directory: submission package (v1.1.0, ad gallery)

Status: **package ready, not submitted.** Portal: https://platform.openai.com/plugins (docs: https://developers.openai.com/plugins/deploy/submission).

## What gets uploaded
- ZIP of `chatgpt-plugin/` (`plugin.json` with listing + review info + 5/3 test cases + release notes, `mcp.json` = hosted server with OAuth DCR, `assets/logo.png` 512px). Built: `komendly-chatgpt-1.1.0.zip` (rebuild: `cd chatgpt-plugin && rm -f ../komendly-chatgpt-1.1.0.zip && zip -rX ../komendly-chatgpt-1.1.0.zip . -x '.*'`).
- MCP server: `https://www.komendly.com/api/mcp` (OAuth 2.1, PKCE S256, dynamic client registration). Every tool has `title` + explicit `readOnlyHint`/`destructiveHint`/`openWorldHint`.
- UI: `ads_create_pack` and `ads_get_run` carry `_meta.ui.resourceUri` (+ alias `openai/outputTemplate`) = `ui://komendly/ad-gallery` (`text/html;profile=mcp-app`, `src/lib/agent-keys/ad-gallery.ts`). Tools still return text + `structuredContent`.

## Review information
| Field | Value |
|---|---|
| Website / support / privacy / terms | https://www.komendly.com · https://www.komendly.com/agents (support email nolan@komendly.com) · https://www.komendly.com/privacy · https://www.komendly.com/terms (all 200 on 21 Nov 2026) |
| Test cases | 5 positive + 3 negative in `plugin.json` → `review.test_cases` (imported with the ZIP) |
| CSP justification | `connectDomains: []` (the widget makes no network requests; tool calls go through the host bridge). `resourceDomains`: exactly one origin, the ads bucket's own host (`https://<S3_BUCKET>.<S3_ENDPOINT host>`, no wildcard), where the ad images the user generated are stored; links are presigned and expire. No iframes (`frameDomains` unset), no external scripts/styles/fonts. |
| Widget domain | `openai/widgetDomain` = `https://www.komendly.com` |
| Links the widget opens (`ui/open-link`) | Download → the presigned ad image URL; Publish to Meta → `https://www.komendly.com/ads/runs/<id>` (the user connects Meta and approves budget there; nothing is published from chat); Upgrade → `https://www.komendly.com/pricing` (informational plans page) |
| Commerce | None in ChatGPT. Per guideline 5.1 the widget does **not** show an Upgrade button to ChatGPT users unless a feature is unavailable (free pack used / ad locked), and then links to the plans page only (`upgradePromptAllowed()` in `src/lib/agent-keys/assistant.ts`). The listing text has no pricing or free-trial claims. |
| Screenshots (optional for ChatGPT; useful in the walkthrough) | `screenshots/ad-gallery-*.png` |

## Steps left (coordinator / founder)
1. **Deploy** the web app (the widget is served by the live MCP server; the portal scans production).
2. Create a **reviewer account**: email + password sign-in (no email codes/MFA), email verified, enough credits for 2+ Ad Packs (admin grant), one finished Ad Pack and one Ozzy video already in it.
3. **Record a new demo video** (the current `demo_recording_url` predates the gallery): connect in ChatGPT, run the 5 positive cases, show the gallery, Download and Publish to Meta. Put the URL in `plugin.json` → `review.demo_recording_url`, bump nothing else, rebuild the ZIP.
4. Portal → **Upload new or existing plugin** → developer identity → upload the ZIP → fix any metadata findings.
5. **MCPs** → connect `https://www.komendly.com/api/mcp` with OAuth (DCR) → domain verification: put the token from the portal in Vercel env `OPENAI_APPS_CHALLENGE`, redeploy, verify (`/.well-known/openai-apps-challenge`).
6. Turn on AdsFeatureFlag `sys_ai_assistant` if it is off (otherwise new connections, including the reviewer's, are refused).
7. **Review details** → enter reviewer credentials; check imported test cases → **Submit for review** → attestations.
8. After approval: **Publish plugin**; update `README.md` status table.
