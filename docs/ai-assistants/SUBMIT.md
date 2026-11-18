# Founder steps (only you can do these: they need your OpenAI and Claude accounts)

Do these **after** the coordinator says the deploy is live and `sys_ai_assistant` is ON (otherwise new connections are refused).

## 0. Reviewer test account (once, ~3 min)
Reviewers need a login that works without email codes or MFA.
1. In a private browser window open https://www.komendly.com/ads/signup.
2. Sign up with `review+ai@komendly.com` (or any inbox you own) and a new strong password. Save both in your password manager.
3. Open https://www.komendly.com/admin, find that user and give the workspace ~100 credits so reviewers can run every test case.
4. Never put this password in any file; you paste it only into the portals' private "reviewer credentials" fields.

## 1. Test it yourself (5 min, both portals ask you to confirm this)
1. Claude: claude.ai → Settings → Connectors → **Add custom connector** → URL `https://www.komendly.com/api/mcp` → Add → **Connect** → sign in with the test account → **Allow**. Ask "Make Facebook ads for https://www.komendly.com" and check the ads come back.
2. ChatGPT: chatgpt.com → Settings → Apps → Advanced → turn on **Developer mode** → back to Apps → **Create** → name `Komendly`, URL `https://www.komendly.com/api/mcp`, Authentication **OAuth** → Create → sign in → Allow. Ask the same prompt.
3. Record a 1–2 minute screen video of the ChatGPT run (prompt → ads). Upload it to YouTube as **Unlisted** and copy the link.

## 2. Claude Connectors Directory (needs any paid Claude plan)
1. Open https://claude.ai/directory/manage → **Submit new** → **MCP connector**.
2. **Connection:** paste `https://www.komendly.com/api/mcp` (one URL for everyone) → Next.
3. **Tools:** wait for the sync; all 16 tools should show with no warnings → Next.
4. **Listing:** copy from `docs/ai-assistants/listing.md` (name, one-liner, description, categories Design + Marketing, docs URL, privacy URL, support `nolan@komendly.com`), upload `docs/ai-assistants/icon-256.png`, slug `komendly` → Next.
5. **Use cases:** copy the use cases / needs / "reads and writes" lines from `listing.md`.
6. **Company:** Komendly, https://www.komendly.com, contact nolan@komendly.com.
7. **Authentication:** requirement **Required**, method **OAuth (dynamic client registration)**; leave client ID/secret empty.
8. **Data handling:** "our own API"; no health data; no sponsored content.
9. **Test & launch:** confirm you ran every tool (step 1). Don't enter credentials; if a reviewer emails asking for access, reply with the test account.
10. **Compliance:** tick all seven → **Review** → **Submit**. Status: https://claude.ai/directory/manage.

## 3. ChatGPT plugin directory (OpenAI)
1. https://platform.openai.com/settings/organization/general → finish **individual or business verification** (needed to publish under "Komendly").
2. Replace `REPLACE_WITH_VIDEO_URL` in `docs/ai-assistants/chatgpt-plugin/plugin.json` with your video link, then zip the folder: in Terminal run
   `cd /Users/groot/Komendly/docs/ai-assistants/chatgpt-plugin && zip -r ~/Desktop/komendly-plugin.zip plugin.json mcp.json assets`
3. Open https://platform.openai.com/plugins → **Upload new or existing plugin** → pick your verified developer identity → **Upload plugin** → `~/Desktop/komendly-plugin.zip`.
4. On the draft: **MCPs** → `komendly` → **Connect**. The portal shows a domain-verification token: send it to the coordinator (or set Vercel env `OPENAI_APPS_CHALLENGE=<token>` and redeploy). When https://www.komendly.com/.well-known/openai-apps-challenge shows the token, click **Verify**, then **Connect**, sign in with the test account and click **Allow**.
5. Wait for the tool scan; if **Issues** shows anything, click **Copy issues** and send it to the coordinator.
6. **Metadata & Skills** → **Review information → Review details** → enter the test account: login URL `https://www.komendly.com/login`, email + password from step 0, notes "No MFA. The account has credits for every test case." → **Save details**.
7. **Submit for review** → tick the attestations → Submit. Feedback arrives by email; after approval come back and click **Publish**.

## 4. Optional free directories (2 min each, GitHub sign-in in the browser)
- https://mcp.so/submit → name Komendly, URL `https://www.komendly.com/api/mcp`, description from `listing.md`.
- https://glama.ai/mcp/servers → **Add server** → same details.
(PulseMCP and the GitHub MCP Registry copy the official registry entry the coordinator publishes; nothing to do.)
