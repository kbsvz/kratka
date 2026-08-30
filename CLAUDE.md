# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@README.md

## Commands

- `npm run dev` — start dev server (Cloudflare workerd runtime)
- `npm run build` — production build (SSR via `@astrojs/cloudflare`)
- `npm run preview` — preview production build
- `npm run lint` — ESLint with type-checked rules
- `npm run lint:fix` — auto-fix lint issues
- `npm run format` — Prettier (includes prettier-plugin-astro + prettier-plugin-tailwindcss)

Pre-commit hooks: husky + lint-staged runs `eslint --fix` on `*.{ts,tsx,astro}` and `prettier --write` on `*.{json,css,md}`.

## Architecture

**kratka** is a browser-based grid pattern editor for cross-stitch designers. The core is a craft-agnostic grid editor; craft-specific logic (thread-count estimator, etc.) is layered on top. Built as an Astro 6 SSR app with React 19 islands, Tailwind 4, Supabase Auth, and shadcn/ui. Deployed to Cloudflare Workers.

### Rendering mode

Full server-side rendering (`output: "server"` in `astro.config.mjs`). API routes must export `const prerender = false`.

### Auth flow

- `src/lib/supabase.ts` — Supabase SSR client (cookie-based sessions). `SUPABASE_URL` and `SUPABASE_KEY` are server-only secrets declared via `astro:env/server`.
- `src/middleware.ts` — resolves the current user on every request, attaches to `context.locals.user`. Add paths to `PROTECTED_ROUTES` to require authentication.
- API endpoints: `src/pages/api/auth/{signin,signup,signout}.ts`
- Auth pages: `src/pages/auth/{signin,signup,confirm-email}.astro`

### Key conventions

- **Astro components** for static content/layout; **React components** only when interactivity is needed.
- **Tailwind class merging**: use `cn()` from `@/lib/utils` (clsx + tailwind-merge). Do not concatenate class strings manually.
- **shadcn/ui**: components live in `src/components/ui/`, "new-york" style. Install new ones with `npx shadcn@latest add [name]`.
- **API routes**: uppercase `GET`/`POST` exports; validate input with zod.
- **Supabase migrations**: `supabase/migrations/` with naming `YYYYMMDDHHmmss_short_description.sql`. Always enable RLS on new tables with per-operation, per-role policies.
- **React**: no Next.js directives (`"use client"` etc.). Extract hooks to `src/components/hooks/`.
- **Services/helpers** in `src/lib/` (or `src/lib/services/` for extracted business logic).
- **Shared types** (entities, DTOs) in `src/types.ts`.

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs lint + build on every push and PR to `main`. Requires `SUPABASE_URL` and `SUPABASE_KEY` as repository secrets.

<!-- BEGIN @przeprogramowani/10x-cli -->

## 10xDevs AI Toolkit - Module 2, Lesson 3

Review AI-generated code before merge with the **implementation review chain**:

```
/10x-implement -> /10x-impl-review -> triage -> (/10x-lesson | fix | skip | disagree)
```

`/10x-impl-review` is the lesson focus. Review is a quality gate, not an instruction to fix every finding.

### Task Router - Where to start

| Skill | Use it when |
| --- | --- |
| **Code review (lesson focus)** | |
| `/10x-impl-review <change-id>` | You have implemented code and want a structured review before merge. The skill checks plan adherence, scope discipline, safety and quality, architecture, pattern consistency, and success criteria, then presents findings for triage. |
| **Recurring lesson outcome** | |
| `/10x-lesson` | A finding reveals a recurring project rule or agent failure pattern. Record it in `context/foundation/lessons.md` instead of treating it as a one-off note. |

### Triage discipline

- Severity says how bad the finding is. Impact says how much the decision matters now.
- Valid outcomes: fix now, fix differently, skip, accept as risk, record as recurring rule (`/10x-lesson`), disagree.
- Fix critical findings. Do not burn hours on low-impact observations just because the agent found them.
- Conscious skipping of low-impact findings is a valid review outcome, not negligence.
- If you disagree with a finding, record why. Wrong agent reasoning is also signal.

### Review boundaries

- This lesson reviews implemented code. It does not create the plan, execute new phases, or teach CI review.
- Testing strategy and quality gates are introduced in Module 3.
- Do not use `/10x-contract` as a triage outcome in this lesson.

### Paths used by this lesson

- `context/changes/<change-id>/plan.md` - expected implementation contract
- `context/changes/<change-id>/reviews/` - review output
- `context/foundation/lessons.md` - recurring lessons

Skills must not write to `context/archive/`. Archived changes are immutable; if a resolved target path starts with `context/archive/`, abort with: "This change is archived. Open a new change with `/10x-new` instead."

<!-- END @przeprogramowani/10x-cli -->
