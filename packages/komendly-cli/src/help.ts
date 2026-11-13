export const VERSION = "0.2.0";

const GLOBAL = `Global options:
  --json             Print machine-readable JSON on stdout (progress still goes to stderr)
  --key <kmd_...>    Use this API key (default: KOMENDLY_API_KEY, then ~/.config/komendly/cli.json)
  --base-url <url>   Override https://www.komendly.com (or set KOMENDLY_BASE_URL)
  -h, --help         Show help`;

export const COMMAND_HELP: Record<string, string> = {
  autopilot: `komendly autopilot [--on|--off] [--focus "..."]

Ozzy Autopilot: every week Ozzy makes fresh ads and a new short video for your brand by himself.
Without options it shows whether it's on, the next drop time, your focus and last week's drop.
--focus steers the next drop in one sentence (--focus "" clears it and lets Ozzy pick).
Included with Ozzy Ad Department; on other plans it prints the upgrade link.

Examples:
  komendly autopilot
  komendly autopilot --focus "push the Black Friday sale"
  komendly autopilot --off`,
  login: `komendly login [--key kmd_...]

Save your personal API key (create one at https://www.komendly.com/dashboard/api).
Without --key it asks for the key. The key is checked before it's saved to ~/.config/komendly/cli.json.`,
  whoami: `komendly whoami

Show the signed-in account: email, plan, credits, free Studio videos left and whether the free ad pack is still available.`,
  video: `komendly video "<prompt>" [--file clip.mp4 ...] [--wait] [--out dir] [--timeout seconds]

Start a new Ozzy Studio video from a prompt. --file uploads footage, images or audio first (repeatable, up to 6).
--wait waits for Ozzy to finish (polling with backoff); --out also downloads the finished video (implies --wait).

Examples:
  komendly video "15s 9:16 teaser for our summer sale, bold captions" --wait --out ./videos
  komendly video "cut this into a 20s product demo with captions" --file demo.mp4 --out .`,
  remix: `komendly remix <ad-url> [--notes "..."] [--aspect 9:16|1:1|4:5|16:9] [--wait] [--out dir] [--timeout seconds]
komendly remix --file recording.mp4 [...]

Show Ozzy any ad you like and get your own version: same hook, pacing, text style, transitions and music feel,
rebuilt for your brand (never the original's footage, logos or words). Works with YouTube/Shorts, TikTok, Instagram,
Facebook Ad Library and X links, direct video/image links, pages showing the ad, or a screen recording/screenshot via --file.
Counts like any Ozzy video (your free video first, credits after).

Examples:
  komendly remix https://www.youtube.com/shorts/abc123 --wait --out ./videos
  komendly remix https://www.tiktok.com/@brand/video/123 --notes "feature our 20% launch offer"
  komendly remix --file ad-recording.mov --aspect 9:16 --wait`,
  launch: `komendly launch <url> [--notes "..."] [--aspect 16:9|9:16] [--wait] [--out file.mp4|dir] [--timeout seconds]

Make a 20-40s launch video for what you just shipped. Ozzy records your real product (a cursor on your main
call to action, smooth scrolls, key pages, screenshots) and cuts it with captions and a call to action.
Public addresses are recorded by Ozzy. localhost, private and .local/.test addresses are recorded on this machine
with your installed Chrome (needs \`npm i -D playwright-core\` in your project), then uploaded.
Without --notes, the last 10 commit titles of the git repo you're in say what shipped.
Counts like any Ozzy video (your free video first, credits after).

Examples:
  komendly launch https://yourapp.com --notes "New: one-click CSV export" --wait --out launch.mp4
  komendly launch localhost:3000 --aspect 9:16 --wait`,
  say: `komendly say <session_id> "<message>" [--file clip.mp4 ...] [--wait] [--out dir] [--timeout seconds]

Send a follow-up to an Ozzy Studio session ("make it 9:16", "add captions", "shorter intro").`,
  sessions: `komendly sessions [--limit n]

List your Ozzy Studio sessions, newest first.`,
  session: `komendly session <session_id>

Show a session's status, Ozzy's last reply and every render with its download link.`,
  upload: `komendly upload <file> [--session <session_id>]

Upload a video, image or audio file for Ozzy. Prints the upload_id to pass to video/say (or MCP upload_ids).`,
  pack: `komendly pack <website> [--animated] [--wait] [--out dir] [--timeout seconds]

Make an Ad Pack (static ads, plus animated ads with --animated) from a website.
--wait accepts the detected brand details and waits for the ads; --out downloads the whole pack as a ZIP (implies --wait).`,
  runs: `komendly runs [--limit n]

List your recent Ad Packs.`,
  run: `komendly run <run_id>

Show an Ad Pack: status, progress and every ad with its asset download links.`,
  download: `komendly download <render_id|asset_id|run_id> [--out dir] [--type render|asset|run]

Download a Studio render (MP4), a single ad asset, or a whole Ad Pack (ZIP) into --out (default: current folder).`,
  mcp: `komendly mcp

Run a stdio MCP server that forwards every JSON-RPC message to the hosted Ozzy MCP server (/api/mcp) with your key.
For MCP clients that only speak stdio. Example mcp.json entry:
  { "mcpServers": { "ozzy": { "command": "npx", "args": ["-y", "komendly", "mcp"], "env": { "KOMENDLY_API_KEY": "kmd_..." } } } }`,
};

export function commandHelp(name: string): string {
  const body = COMMAND_HELP[name];
  return body ? `${body}\n\n${GLOBAL}\n` : mainHelp();
}

export function mainHelp(): string {
  return `komendly ${VERSION} (also available as \`ozzy\`): Ozzy by Komendly from your terminal or AI agent.

Usage: komendly <command> [options]

Commands:
  login                  Save and verify your API key
  whoami                 Plan, credits and free allowances
  autopilot              Ozzy Autopilot: weekly ads + video (--on, --off, --focus)
  video "<prompt>"       Start an Ozzy Studio video (--file, --wait, --out)
  remix <ad-url>         Show Ozzy any ad, get your own version (--notes, --wait, --out)
  launch <url>           Launch video recorded from your real product (--notes, --aspect, --out)
  say <session> "<msg>"  Ask Ozzy for an edit in an existing session
  sessions               List Studio sessions
  session <id>           Show one Studio session and its renders
  upload <file>          Upload footage, an image or audio for Ozzy
  pack <website>         Make an Ad Pack from a website (--animated, --wait, --out)
  runs                   List Ad Packs
  run <id>               Show one Ad Pack
  download <id>          Download a render, an ad asset or a whole pack
  mcp                    stdio bridge to the hosted Ozzy MCP server

${GLOBAL}

Get a key at https://www.komendly.com/dashboard/api. Run \`komendly <command> --help\` for details.
`;
}
