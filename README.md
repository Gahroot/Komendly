# Komendly

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
