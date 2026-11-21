# Claude directory: submission packages (connector + plugin bundle)

Status: **package ready, not submitted.** Portal: https://claude.ai/directory/manage (any paid Claude plan). Docs:
https://claude.com/docs/connectors/building/submission · https://claude.com/docs/plugins/submit · https://claude.com/docs/plugins/pre-submission-checklist

## A. MCP connector (MCP App)
| Portal step | Answer |
|---|---|
| 1. Connection | `https://www.komendly.com/api/mcp` (one URL for everyone) |
| 2. Tools | Sync from server: 16 tools, all with `title` + `readOnlyHint`/`destructiveHint`; resource `ui://komendly/ad-gallery` (`text/html;profile=mcp-app`, CSP: `connectDomains` none, `resourceDomains` = ads storage host) |
| 3. Listing | Name, one-liner, description, category: `listing.md`. Docs https://www.komendly.com/agents · Privacy https://www.komendly.com/privacy · Support nolan@komendly.com · Icon `icon-256.png` |
| Carousel screenshots (MCP App: PNG, ≥1000px wide, 3–5, app response only, prompt given separately) | see table below |
| Allowed link URIs | `https://www.komendly.com` (Publish to Meta, Upgrade). Download opens the ad file on the storage host (`t3.storageapi.dev`), which isn't ours, so Claude asks the user to confirm that link |
| 4. Use cases | Make Meta ads from a website · follow an Ad Pack · download ads / get a hand-off kit for Meta · make a promo video. Needs a free Komendly account (created during sign-in). Reads and writes (creates Ad Packs and videos; never deletes) |
| 5. Company | Komendly, https://www.komendly.com, contact nolan@komendly.com |
| 6. Authentication | Required; OAuth 2.1 with dynamic client registration (no client ID/secret to enter) |
| 7. Data handling | Own API; no personal health data; no sponsored content |
| 8. Test & launch | Run every tool as a custom connector in Claude after deploy (no credentials in the portal) |
| 9. Compliance | 7 acknowledgements (AI media generation applies: ads and videos are AI-generated) |

Screenshots (`screenshots/`, 1524px wide, rendered by `scripts/ad-gallery-harness.ts` from the real `resources/read` output in a local MCP Apps host; ad images are Komendly sample ads, not a live account):
| File | Paired prompt |
|---|---|
| `ad-gallery-ready.png` | Make Facebook ads for my exterior lighting business: maxteriors.example.com |
| `ad-gallery-in-progress.png` | Are my ads ready yet? |
| `ad-gallery-after-refresh.png` | Show me my finished ads |
| `ad-gallery-upgrade.png` | Make another Ad Pack for my second location |

## B. Plugin bundle (`claude-plugin/`)
Contents: `.claude-plugin/plugin.json` (+ `icon.png` 512px), `.mcp.json` (connector `komendly`, `type: http`), `skills/komendly-meta-ads/SKILL.md`, `README.md`, `LICENSE`. `claude plugin validate docs/ai-assistants/claude-plugin` → "Validation passed", no directory warnings (21 Nov 2026).

**Blocker for submitting from this repo:** the directory reads plugins from GitHub and stops on repositories over 50 MiB archived; `Gahroot/Komendly` is over 100 MB. Use a small public repo holding only the plugin.

## Steps left (coordinator / founder)
1. **Deploy** the web app (the widget is served by the live server; the portal syncs tools/resources from production). Make sure AdsFeatureFlag `sys_ai_assistant` is on.
2. Add the server as a custom connector in Claude, run each tool and check the gallery renders (optional: retake the 4 screenshots there, cropped to the widget).
3. Portal → **Submit new → MCP connector** → fill in section A → submit.
4. Create public repo (suggested `Gahroot/komendly-claude-plugin`), copy the *contents* of `docs/ai-assistants/claude-plugin/` to its root (keep `.claude-plugin/` and `.mcp.json`; no `.DS_Store`), push.
5. Portal → **Submit new → Plugin bundle** → repository `Gahroot/komendly-claude-plugin` (plugin path empty) → **Validate** → data handling (reads account data only through the connector; stores nothing; not for under-18s) → compliance (contact nolan@komendly.com) → **Submit for review** with GitHub push webhook. Pair it with the connector listing.
6. Update the status table in `README.md`.
