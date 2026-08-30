# kratka

A friendly editor for designing patterns on a grid.

Cross-stitch charts, mosaics, carpets, beadwork, pixel art — anything built cell by cell.
Pick your colours, paint the grid, print the result. No photo conversion, no professional
CAD interface to learn: just a clean surface for drawing a pattern from scratch, which is
otherwise a job people improvise with spreadsheets or graph paper.

Free accounts keep up to three patterns. Every pattern prints as a clean chart — grid and
colour legend only, no app furniture on the page.

## Status

Early. Auth and the data layer are in place; the editor itself is not built yet.

| Area                                               | State       |
| -------------------------------------------------- | ----------- |
| Email/password auth, route protection              | working     |
| `patterns` schema, RLS, 3-pattern cap, soft delete | working     |
| Grid editor — draw, palette, save, reopen          | not started |
| Pattern list and delete                            | not started |
| Printable chart view                               | not started |

Product scope lives in `context/foundation/prd.md`; sequencing in `context/foundation/roadmap.md`.

## Tech Stack

- [Astro](https://astro.build/) 6 — server-first rendering, `output: "server"`
- [React](https://react.dev/) 19 — interactive islands only
- [TypeScript](https://www.typescriptlang.org/) 5
- [Tailwind CSS](https://tailwindcss.com/) 4 + [shadcn/ui](https://ui.shadcn.com/)
- [Supabase](https://supabase.com/) — Postgres, auth, row-level security
- [Cloudflare Workers](https://workers.cloudflare.com/) — edge deployment

## Prerequisites

- Node.js 22.14.0 (pinned in `.nvmrc` — `nvm use`)
- [Docker](https://www.docker.com/) with ~7 GB RAM, for the local Supabase stack
- A [Supabase](https://supabase.com/dashboard) project for deployed environments

## Getting Started

```bash
npm install
```

Start the local database (first run downloads several images):

```bash
npx supabase start
```

Copy the `API URL` and `anon key` it prints into a `.dev.vars` file:

```
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_KEY=<anon key from the CLI output>
```

`.dev.vars` is what the Cloudflare `workerd` dev runtime reads — **not** `.env`. It is gitignored.

Apply the schema, then run the app:

```bash
npx supabase db reset
```

```bash
npm run dev
```

The app is at `http://localhost:4321`, Supabase Studio at `http://localhost:54323`.

## Scripts

| Command                | Purpose                                          |
| ---------------------- | ------------------------------------------------ |
| `npm run dev`          | Dev server on the Cloudflare `workerd` runtime   |
| `npm run build`        | Production build (SSR via `@astrojs/cloudflare`) |
| `npm run preview`      | Preview the production build                     |
| `npm run lint`         | ESLint with type-checked rules                   |
| `npm run lint:fix`     | Auto-fix lint issues                             |
| `npm run format`       | Prettier                                         |
| `npx astro check`      | Type-check                                       |
| `npx supabase test db` | pgTAP database tests                             |

## Database

Schema lives in `supabase/migrations/`, named `YYYYMMDDHHmmss_short_description.sql`. Create one
with `npx supabase migration new <name>`; apply locally with `npx supabase db reset`, which
rebuilds from scratch and is the only way to be sure a migration works on a clean database.

Every table enables row-level security with per-operation, per-role policies. Grants start from
`revoke all ... from anon, authenticated` and grant back only what a role needs — Supabase's
default privileges are permissive on new `public` objects, so patching individual privileges
leaves the rest quietly granted.

Tests are pgTAP files under `supabase/tests/database/`, run with `npx supabase test db`. They
cover cross-user isolation, the 3-pattern cap, soft delete, and the CHECK constraints. RLS failures
are silent by nature, so schema changes should come with assertions.

TypeScript types are generated from the applied schema and committed:

```bash
npx supabase gen types typescript --local > src/lib/database.types.ts
```

Regenerate after every migration. That file is excluded from ESLint and Prettier — it arrives
unformatted, and formatting it would be undone on the next regeneration. Domain-level types
(`Pattern`, `PatternCreate`, `PatternUpdate`, `PatternListItem`) live in `src/types.ts` and are
deliberately narrower than the generated shapes, which describe columns but not the triggers and
policies wrapped around them.

## Project Structure

```md
.
├── src/
│ ├── layouts/ # Astro layouts
│ ├── pages/ # Astro pages
│ │ └── api/ # API endpoints
│ ├── components/ # UI components (Astro & React)
│ │ └── ui/ # shadcn/ui
│ ├── lib/ # Services, Supabase client, generated DB types
│ ├── middleware.ts # Auth resolution + route protection
│ └── types.ts # Shared entity and DTO types
├── supabase/
│ ├── migrations/ # Schema, applied in filename order
│ └── tests/database/ # pgTAP tests
├── context/ # Product docs: PRD, roadmap, change plans
└── wrangler.jsonc # Cloudflare Workers config
```

## Auth

Email/password via Supabase Auth, with cookie-based sessions handled by `@supabase/ssr`.

| Route                 | Purpose            |
| --------------------- | ------------------ |
| `/auth/signin`        | Sign-in form       |
| `/auth/signup`        | Sign-up form       |
| `/auth/confirm-email` | Post-signup notice |
| `/dashboard`          | Protected page     |

`src/middleware.ts` resolves the current user on every request onto `context.locals.user` and
guards anything listed in `PROTECTED_ROUTES`, adding `Cache-Control: private, no-store`. Add new
protected paths there.

Users are stored in `auth.users`, a Supabase-managed table in the same database as the `public`
schema. `patterns.user_id` references it with `on delete cascade`.

## Deployment

Deployed to Cloudflare Workers.

```bash
npm run build
```

```bash
npx wrangler deploy
```

Set `SUPABASE_URL` and `SUPABASE_KEY` as Worker secrets (`npx wrangler secret put <NAME>`) — never
in `wrangler.jsonc`, which is committed.

Migrations are applied separately and manually:

```bash
npx supabase link --project-ref <ref>
```

```bash
npx supabase db push
```

Nothing automates this, so a deploy can outrun its schema. Push migrations before shipping code
that depends on them. The full runbook is in `context/deployment/deploy-plan.md`.

## CI

GitHub Actions runs `astro sync`, lint, `npm audit`, and build on every push and PR to `main`.
`SUPABASE_URL` and `SUPABASE_KEY` must exist as repository secrets for the build step.

## License

MIT
