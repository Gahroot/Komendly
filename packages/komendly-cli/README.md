# komendly: Ozzy for your terminal and your AI agent

Make Ozzy Studio videos and Ad Packs from the command line, from scripts, or from any AI agent
(Claude Code, Claude Desktop, Cursor, ChatGPT…). Same account, plan and credits as
[komendly.com](https://www.komendly.com): the free Studio video and free ad pack work here too.

Two binaries, same thing: `komendly` and `ozzy`.

## 1. Get a key

Sign in and create a personal API key at <https://www.komendly.com/dashboard/api>. It starts with `kmd_` and is
shown once. Then either:

```bash
npx komendly login --key kmd_your_key      # verified, then saved to ~/.config/komendly/cli.json (mode 600)
# or
export KOMENDLY_API_KEY=kmd_your_key
```

`KOMENDLY_BASE_URL` points the CLI somewhere else (for example `http://localhost:3000`). Requires Node 20+.

## 2. Use it

```bash
komendly whoami                                        # plan, credits, free video / free pack left
komendly video "15s 9:16 teaser for our summer sale, bold captions" --wait --out ./videos
komendly video "turn this into a 20s demo with captions" --file demo.mp4 --file logo.png --out .
komendly say <session_id> "make it 1:1 and slow down the intro" --out ./videos
komendly sessions                                      # list Studio sessions
komendly session <session_id>                          # status, Ozzy's last reply, every render
komendly upload footage.mov                            # prints an upload_id
komendly pack https://your-site.com --animated --out ./ad-pack   # static + animated ads, ZIP saved
komendly runs                                          # list Ad Packs
komendly run <run_id>                                  # ads, status and asset ids
komendly download <render_id|asset_id|run_id> --out ./downloads
```

- `--wait` polls with backoff until Ozzy is done (`--timeout <seconds>` to cap it). `--out` implies `--wait`.
- Progress goes to **stderr**; results go to **stdout**.
- `--json` on every command prints machine-readable JSON (errors too: `{ "error", "status", "code", "upgrade_url"? }`).
- Exit codes: `0` ok, `1` error, `2` usage, `3` missing/invalid key, `4` needs credits or a plan.
- Out of credits? The message includes the upgrade link (`/pricing`). Nothing is ever charged without you.
- Uploads: MP4, MOV, WebM, PNG, JPG, WebP, MP3, WAV, M4A; up to 200 MB on free, 500 MB on paid plans; up to 6 per message.

## 3. Use it from an AI agent

### MCP (recommended)

The hosted Ozzy MCP server lives at `https://www.komendly.com/api/mcp`.

Claude Code:

```bash
claude mcp add --transport http ozzy https://www.komendly.com/api/mcp --header "Authorization: Bearer kmd_your_key"
```

Claude Desktop, Cursor and other stdio-only clients (`mcp.json` / `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "ozzy": {
      "command": "npx",
      "args": ["-y", "komendly", "mcp"],
      "env": { "KOMENDLY_API_KEY": "kmd_your_key" }
    }
  }
}
```

`komendly mcp` is a thin stdio bridge: each newline-delimited JSON-RPC message on stdin is POSTed to `/api/mcp` with
your key, and the JSON or SSE response is written back to stdout, one message per line.

ChatGPT and clients that can't set headers: use the URL `https://www.komendly.com/api/mcp/k/kmd_your_key` (treat it
like a password).

### CLI in an agent's shell

Tell your agent things like:

- "Use the komendly CLI to make a 15 second 9:16 video ad for my bakery's sourdough subscription and save it to ./ads."
- "Run `npx komendly upload ./footage/demo.mp4`, then make a 30s product demo with captions from it using `komendly video --file`."
- "Use `npx komendly pack https://example.com --animated --out ./ad-pack --json` and tell me which ads came out."
- "Check `komendly whoami --json` and tell me how many credits I have left."

## Notes for agents

- Always pass `--json` and read stdout; stderr is human progress only.
- `video`/`say` results: `{ session_id, status, reply, error, video: { render_id, url, poster_url, seconds, ratio, watermarked } | null, renders[], view_url, files? }`.
- `pack`/`run` results: `{ run_id, status, progress: { ready, total }, ads: [{ ad_id, kind, headline, status, locked, assets: [{ asset_id, ratio, mime, url }] }], view_url, files? }`.
- Send follow-up edits with `say <session_id> "..."`; Ozzy works on one message per session at a time (409 = still busy: wait, then retry).
- Asset and render `url`s need the API key; use `komendly download <id>` to save files.
- If a command exits with code `4`, show the human the `upgrade_url` from the JSON. Don't retry.
- On a free account, Studio videos are watermarked and one free video / one free ad pack are included.

## Develop

```bash
npm install && npm test && npm run build    # dist/cli.js
node dist/cli.js --help
```
