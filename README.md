# Komendly

Komendly turns a business website into ready-to-run Facebook and Instagram ads, makes promo and launch videos with
**Ozzy**, and turns customer reviews into AI-avatar video testimonials. Use it on [komendly.com](https://www.komendly.com),
inside your Shopify admin, or from any AI agent through the hosted MCP server.

## Ozzy MCP server (Claude, ChatGPT, Cursor, coding agents)

Remote, streamable HTTP, OAuth 2.1 sign-in (no API key needed):

```
https://www.komendly.com/api/mcp
```

- **Claude (claude.ai / Desktop):** Settings > Connectors > Add custom connector > paste the URL, then sign in.
- **ChatGPT:** Settings > Apps & Connectors > Create > paste the URL, OAuth.
- **Claude Code:** `claude mcp add --transport http ozzy https://www.komendly.com/api/mcp` then `/mcp` to sign in.
- **Cursor / other clients:** add `{ "mcpServers": { "ozzy": { "url": "https://www.komendly.com/api/mcp" } } }`.
- **Stdio-only clients:** `npx -y komendly mcp` with `KOMENDLY_API_KEY` (see [packages/komendly-cli](packages/komendly-cli/README.md)).

New accounts get one free Ad Pack and one free Ozzy video. Server card: `https://www.komendly.com/.well-known/mcp/server-card.json`.
Listed in the [official MCP Registry](https://registry.modelcontextprotocol.io/v0/servers?search=io.github.Gahroot/komendly) as `io.github.Gahroot/komendly`.

| Tool | What it does |
|---|---|
| `ads_create_pack` | Make an Ad Pack (static + animated Facebook/Instagram ads with copy) from any public website |
| `ads_get_run`, `ads_list_runs` | Ad Pack status, ads and fresh download links |
| `studio_create_video`, `studio_send_message` | Make any video with Ozzy (promo, explainer, motion graphics) and edit it in chat |
| `studio_launch_video` | Record your live product and cut a 20-40s launch video |
| `studio_remix` | Remix any ad you like (TikTok, Instagram, Ad Library link) for your brand |
| `studio_ad_copy`, `campaign_kit` | Meta ad copy and a hand-off kit of every ready creative |
| `autopilot_get`, `autopilot_set` | Weekly ads + video drop on autopilot |
| `upload_media`, `get_download_url`, `get_account` | Footage upload, download links, plan and credits |

Example prompts: "Make Facebook ads for https://example.com", "Make a 30s launch video for what we just shipped",
"Remix this ad for my brand: <link>". Docs: [komendly.com/agents](https://www.komendly.com/agents).

## Video testimonials

Turn customer reviews into professional video testimonials using AI avatars. No cameras, no actors, no hassle.

## What is this?

Komendly takes your text reviews and transforms them into engaging video testimonials featuring realistic AI-generated avatars. Perfect for businesses that want social proof without the logistical nightmare of coordinating video shoots with customers.

## How it works

1. **Paste a review** - Drop in any customer review or testimonial text
2. **Pick an AI creator** - Choose from our library of realistic AI avatars
3. **Generate** - Our AI writes a natural script and creates the video
4. **Download & share** - Get your video in 4K, ready for social media

## Tech stack

- **Next.js 16** with App Router
- **React 19** + TypeScript
- **Prisma** + PostgreSQL for data
- **Stripe** for subscriptions
- **FAL AI** & **Mirage AI** for video generation
- **Tailwind CSS** + shadcn/ui for the UI

## Getting started

```bash
# Install dependencies
npm install

# Set up your environment variables (see below)
cp .env.example .env.local

# Run database migrations
npx prisma migrate dev

# Start the dev server
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

## Environment variables

You'll need these in your `.env.local`:

```bash
# Database
DATABASE_URL="postgresql://..."

# Auth
SESSION_SECRET="generate-a-random-string"

# Stripe
STRIPE_SECRET_KEY="sk_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_..."

# AI Services
FAL_KEY="..."
MIRAGE_API_KEY="..."
OPENAI_API_KEY="..."

# App
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

## Project structure

```
src/
├── app/           # Pages and API routes
├── components/    # React components
├── hooks/         # Custom hooks
└── lib/           # Utilities and integrations
```

Check out `CLAUDE.md` for more detailed docs on the codebase structure.

## Scripts

```bash
npm run dev      # Start dev server
npm run build    # Production build
npm run lint     # Run ESLint
npm run start    # Start production server
```

## License

Private - all rights reserved.
