# Komendly (Testimoni)

AI-powered platform that converts customer reviews into professional video testimonials using AI avatars - no cameras required.

## Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── api/                # Backend API routes
│   │   ├── auth/           # Authentication (login, register, logout, me)
│   │   ├── videos/         # Video CRUD operations
│   │   ├── generate/       # Video generation endpoints
│   │   ├── stripe/         # Payment (checkout, credits, portal, webhooks)
│   │   ├── mirage/         # Mirage AI integration
│   │   └── webhooks/       # External service webhooks
│   ├── dashboard/          # Authenticated user pages
│   │   ├── create/         # Video creation flow (generate, preview, style)
│   │   ├── videos/         # User video library
│   │   └── billing/        # Subscription management
│   ├── login/              # Login page
│   ├── register/           # Registration page
│   ├── pricing/            # Pricing page
│   └── checkout/           # Payment flow
├── components/             # React components
│   ├── ui/                 # shadcn/ui base components
│   └── *.tsx               # Feature components (avatar-selector, video-card, etc.)
├── hooks/                  # Custom React hooks
│   ├── useVideoGeneration.ts
│   ├── useMirageGeneration.ts
│   └── useVideos.ts
└── lib/                    # Utilities and integrations
    ├── auth.ts             # Authentication utilities
    ├── prisma.ts           # Database client
    ├── stripe.ts           # Stripe integration
    ├── fal/                # FAL AI video generation
    ├── mirage/             # Mirage AI integration
    └── *.ts                # Other utilities

prisma/
└── schema.prisma           # Database schema
```

## Organization Rules

**Keep code organized and modularized:**
- API routes → `src/app/api/`, one folder per resource
- Pages → `src/app/`, one folder per route
- Components → `src/components/`, one component per file
- UI primitives → `src/components/ui/` (shadcn components)
- Hooks → `src/hooks/`, one hook per file
- Utilities → `src/lib/`, grouped by service/functionality
- Types → Co-located with usage or in service folders

**Modularity principles:**
- Single responsibility per file
- Clear, descriptive file names
- Group related functionality together
- Avoid monolithic files

## Code Quality - Zero Tolerance

After editing ANY file, run:

```bash
npm run lint
npm run build
```

Fix ALL errors/warnings before continuing.

If changes require server restart:
1. Restart server: `npm run dev`
2. Read server output/logs
3. Fix ALL warnings/errors before continuing

## Tech Stack

- **Framework**: Next.js 16, React 19, TypeScript 5
- **Database**: Prisma with PostgreSQL
- **Styling**: Tailwind CSS 4, shadcn/ui, Framer Motion
- **Payments**: Stripe
- **AI Services**: FAL AI, Mirage AI, OpenAI
- **State**: Zustand, SWR
