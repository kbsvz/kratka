# Cloudflare Workers Deployment Plan — kratka

## Context

`context/foundation/infrastructure.md` already picked Cloudflare Workers and documented the risk register. This plan turns that research into an executable, checkbox-tracked runbook for actually wiring up and shipping the first deploy, using the **current state of the repo** (verified by reading the actual files, not assumed) and **current Cloudflare/Astro platform behavior** (verified via docs/GitHub, since infra.md is ~lightly stale on a few points — noted below where it matters).

Four corrections to infra.md's assumptions, found during verification, that change what this plan recommends:

1. **The Worker is already named `kratka`.** `wrangler.jsonc` already has `"name": "kratka"` — infra.md's Risk Register item about renaming from `"10x-astro-starter"` is stale (only `package.json`'s `"name"` field is still `10x-astro-starter`, which is cosmetic and doesn't affect the deployed subdomain). No action needed there.
2. **`wrangler deploy --env preview` will not work.** Astro v6's `@astrojs/cloudflare` adapter [doesn't support wrangler environments](https://github.com/withastro/astro/issues/15917) — it drops all `[env.*]`-specific settings when building. Instead of infra.md's `[env.preview]` stanza approach, this plan uses **Cloudflare Workers Builds git integration** (GA, native branch preview URLs posted as PR comments, no adapter workaround needed) — see Phase 5.
3. **Production deploys are owned by Cloudflare Workers Builds, not GitHub Actions.** Per your answer, Cloudflare's git integration (Phase 5) is the single source of truth for both preview AND production deploys — it deploys automatically on push to `main`/`master` and posts preview URLs on PRs from other branches. GitHub Actions (`.github/workflows/ci.yml`) stays lint + build verification only; it does **not** get a deploy job, and no `CLOUDFLARE_API_TOKEN` needs to be added as a repo secret. This avoids the double-deploy-on-merge problem that having both systems fire on `main` would cause.
4. **CVE-2025-65019 is already patched in this project.** The advisory's fixed version is `astro >= 5.15.9` and `@astrojs/cloudflare > 12.6.10`. This repo is on `astro ^6.3.1` and `@astrojs/cloudflare ^13.5.0` — both well past the patched versions. No upgrade needed; just confirm with `npm ls astro @astrojs/cloudflare` and keep `npm audit` in CI going forward (Phase 7).

Everything below is scoped to what's needed to get `kratka` live on Cloudflare Workers safely, with edge-case handling folded into each phase rather than bolted on at the end.

---

## Tools, Accounts & Packages Checklist

Set these up before Phase 1. Check off as you go.

**Accounts**

- [ ] Cloudflare account (free to create) — [dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up)
- [ ] Supabase account + project — see Phase 0 below (hosted required for production; local Docker optional for dev)
- [ ] GitHub repository for `kratka` pushed remotely (required for Phase 5 git integration and Phase 7 CI secrets) — confirm `git remote -v` shows a GitHub origin

**Local CLI tools**

- [ ] Node.js `22.14.0` (already pinned in `.nvmrc` — run `nvm use` if using nvm)
- [ ] `wrangler` — already a devDependency (`^4.90.0`); no separate global install needed, use `npx wrangler`
- [ ] `gh` CLI (GitHub CLI) — for setting repo secrets in Phase 7 without leaving the terminal; optional if you prefer the GitHub web UI

**Browser-only steps (cannot be done from CLI/agent)**

- [ ] Cloudflare dashboard access for: API token creation (Phase 2), Workers Builds git integration (Phase 5), viewing Logs (Phase 8)
- [ ] GitHub repo Settings access for: Actions secrets (Phase 7)

**No new npm packages are required.** `@astrojs/cloudflare` and `wrangler` are already installed and pinned. Do not run `npm update` on either without reading the changelog first (this is the exact failure mode in infra.md's pre-mortem — a silent image-service default change broke production).

---

## Phase 0 — Supabase project setup

Not Cloudflare-specific, but everything downstream (`.dev.vars`, Worker Secrets, Workers Builds env vars, CI secrets) depends on having real `SUPABASE_URL` / `SUPABASE_KEY` values in hand first. This repo currently has neither `supabase/migrations/` nor a `supabase init` run yet — `supabase/` only contains `.gitignore` and `config.toml`.

**You need a hosted project for production regardless of what you use for local dev** — a Worker running on Cloudflare's edge cannot reach a Docker container on your laptop. Pick one (or both — hosted for prod, local for offline dev):

### Option A — Hosted Supabase project (required for production)

- [x] Create a project at [supabase.com/dashboard](https://supabase.com/dashboard) (free tier is fine for MVP) <!-- done: project `kratka`, ref htxbolpzbhzjbakllkyl, West EU -->
- [x] Dashboard → Settings → API → copy **Project URL** and **`anon` public** key <!-- done: both present in .dev.vars -->
- [x] Dashboard → Authentication → Email → decide on "Confirm email" <!-- DECIDED 2026-08-30: turned OFF on the hosted project for MVP, so sign-up -> sign-in works without a confirmation click. Local already had enable_confirmations = false in config.toml. Trade-off accepted: addresses are unverified, so typo/fake emails can register and password reset would go to an unproven address. Revisit before any real launch. NOTE: do NOT use `supabase config push` to sync this -- config.toml still has site_url = "http://127.0.0.1:3000", which would break production auth redirects. -->
- [ ] These two values become `SUPABASE_URL` / `SUPABASE_KEY` in: `.dev.vars` (Phase 1, if you want prod-like local dev), Worker Secrets via `wrangler secret put` (Phase 3), Cloudflare Workers Builds build-time env vars (Phase 5), and the existing GitHub Actions build step (`.github/workflows/ci.yml` already reads these as repo secrets — confirm they're set: Settings → Secrets and variables → Actions)
- [ ] **Edge case — preview environments sharing the production database:** if Phase 5's PR preview deploys point at the same hosted Supabase project as production, preview testing can create/pollute real user data. Recommended: create a second, free hosted Supabase project scoped to preview/staging only, with its own `SUPABASE_URL`/`SUPABASE_KEY` set as Cloudflare Workers Builds' _preview_ (not production) environment variables. Skip this only if preview will never be shared beyond you.

### Option B — Local Supabase via Docker (optional, dev-only)

- [x] Confirm Docker Desktop (or equivalent) is installed and running, with ~7GB RAM available <!-- done during F-01 patterns-schema-rls -->
- [ ] `cp .env.example .env`
- [x] ~~`npx supabase init`~~ **Not needed.** `supabase/config.toml` ships with the starter, so `init` was never run and must not be — it would overwrite the existing config. Go straight to `npx supabase start`.
- [x] `npx supabase start` (downloads Docker images on first run; can take several minutes the first time) <!-- done during F-01 patterns-schema-rls -->
- [ ] Copy the `API URL` (typically `http://127.0.0.1:54321`) and `anon key` the CLI prints into `.env` **and** `.dev.vars` (Phase 1) as `SUPABASE_URL` / `SUPABASE_KEY`
- [x] Local Studio UI available at `http://localhost:54323` for inspecting `auth.users` during dev <!-- done during F-01 patterns-schema-rls -->
- [x] ~~No migrations required yet~~ **Stale.** F-01 added `supabase/migrations/20260830140641_create_patterns_and_names.sql` (patterns + pattern_names). Run `npx supabase db reset` after `start` to apply it locally.
- [ ] `npx supabase stop` when done with a session
- [ ] **Edge case:** local Supabase's `SUPABASE_URL` (`127.0.0.1:54321`) only works from `npm run dev` on this machine — never put the local URL in Worker Secrets, Workers Builds env vars, or CI secrets; those must always point at the Option A hosted project.

---

## Phase 1 — Local secrets file

- [x] Create `.dev.vars` from `.env.example` (confirmed not to exist yet): <!-- done: .dev.vars exists -->
  ```bash
  cp .env.example .dev.vars
  ```
- [x] Fill in real `SUPABASE_URL` / `SUPABASE_KEY` values in `.dev.vars` <!-- done, but note: .dev.vars currently points at the HOSTED project, not the local stack. A local stack now exists (Option B was completed on 2026-08-30 as part of F-01), so switch these to the local URL/key when you want offline dev. --> (not `.env` — the Cloudflare/`workerd` dev runtime reads `.dev.vars`, not `.env`; using the wrong file is exactly the failure mode infra.md's Devil's Advocate #2 warns about)
- [x] Confirm `.dev.vars` is gitignored (already verified: yes, alongside `.env`/`.env.production`/`.wrangler/`) — do not skip this check after any future `.gitignore` edit <!-- re-verified 2026-08-30 -->
- [ ] Sanity check: `npm run dev` starts and `/auth/signin` loads without an "missing environment variable" error

**Edge case:** if `npm run dev` throws `ERR_UNIMPLEMENTED` from a dependency, that's a `workerd`/`nodejs_compat` gap, not a broken install — flag the specific package rather than debugging your own code first.

---

## Phase 2 — Cloudflare account login

- [ ] `npx wrangler login` — opens a browser OAuth flow, authorizes wrangler against your Cloudflare account (one-time per machine)
- [ ] Verify: `npx wrangler whoami`

Since production deploys are owned by Cloudflare Workers Builds (Phase 5) rather than GitHub Actions, **no scoped `CLOUDFLARE_API_TOKEN` is needed for CI.** `wrangler login`'s OAuth session is sufficient for all the manual CLI operations in this plan (deploy, secrets, rollback, tail) run from this laptop. If you later want scripted/headless wrangler access (e.g. a local cron job, or a future CI job that isn't the production deploy), create a scoped API token then — Dashboard → My Profile → API Tokens → Create Token → "Edit Cloudflare Workers" template, restricted to the `kratka` project, no DNS/billing scope, never pasted into chat or a committed file.

---

## Phase 3 — Production secrets (Worker Secrets)

- [ ] Push each secret interactively (values typed at the prompt, never as a CLI arg, never in shell history):
  ```bash
  npx wrangler secret put SUPABASE_URL
  npx wrangler secret put SUPABASE_KEY
  ```
- [ ] Confirm they're set: `npx wrangler secret list`
- [ ] **Rotation procedure** (write this down for future you): re-run `wrangler secret put <NAME>` with the new value; takes effect on the Worker's next cold start, not instantly on every in-flight request

**Edge case — confusing this with `.dev.vars`:** `.dev.vars` is local-only and never reaches production. `wrangler.jsonc`'s `vars` block (currently empty, and should stay empty for secrets) would commit plaintext to git if ever used for these. Worker Secrets via `wrangler secret put` is the only path for `SUPABASE_URL`/`SUPABASE_KEY` in production.

---

## Phase 4 — First manual deploy

- [ ] Build locally first to catch errors before they touch Cloudflare:
  ```bash
  npm run build
  ```
- [ ] Deploy:
  ```bash
  npx wrangler deploy
  ```
- [ ] Wrangler prints the live URL (`kratka.<your-subdomain>.workers.dev`) — open it and confirm the homepage renders
- [ ] Confirm auth flow works end-to-end against production Supabase: sign up / sign in / hit `/patterns`
- [ ] **Smoke test** (mitigates infra.md's finding that `wrangler deploy` exits 0 on upload, not on first successful request):
  ```bash
  curl -sf https://kratka.<your-subdomain>.workers.dev/ > /dev/null && echo OK
  ```

**Edge case — blank page with no error:** if this happens on the _free_ Workers plan, it's very likely the 10ms CPU cap (Devil's Advocate #1) — SSR + Supabase session resolution + a React island routinely exceeds it. Upgrade to the $5/month paid plan (Dashboard → Workers & Pages → Plans) before treating this as a code bug.

---

## Phase 5 — Cloudflare Workers Builds: production + preview deploys

Superseding infra.md's `--env preview` approach (confirmed non-functional with this adapter, see Context above) **and** its "CI triggers production deploy" assumption (per your decision, Cloudflare owns this end-to-end, not GitHub Actions):

- [ ] In the Cloudflare dashboard: Workers & Pages → `kratka` → Settings → Builds → connect the GitHub repository (installs the Cloudflare GitHub App, dashboard-driven, cannot be scripted)
- [ ] Set build command to `npm run build`, deploy command to `npx wrangler deploy` (confirm exact fields in the connection wizard — Cloudflare auto-detects Astro in most cases, but a Workers project's build config differs from Pages, so verify it doesn't fall back to a Pages-style build)
- [ ] Set the **production branch** to `main` (or `master` — match whatever this repo's default branch actually is) — this is what makes push-to-main auto-deploy to production
- [ ] Add `SUPABASE_URL` / `SUPABASE_KEY` as **build-time** environment variables in the Builds settings if the build step needs them (distinct from the runtime Worker Secrets from Phase 3 — Builds env vars and Worker Secrets are two different stores)
- [ ] Push a branch / open a PR (not against the production branch) and confirm: a Branch Preview URL and Commit Preview URL both appear as a PR comment, and the _production_ Worker is untouched
- [ ] Push/merge to the production branch and confirm the live `kratka.<subdomain>.workers.dev` URL updates — this is now your **only** production deploy path; the manual `wrangler deploy` from Phase 4 was for first-deploy verification only, don't rely on it going forward for routine changes
- [ ] Decide whether preview needs Cloudflare Access (shared password gate) — recommended only if preview will ever show real user data; skip for MVP if preview always uses a separate/seeded Supabase project

**Edge case:** if the auto-detected build config produces a Pages-style output instead of a Workers deploy, the PR comment will show a `*.pages.dev` URL instead of a Workers preview URL — that's the tell that the integration picked the wrong project type; delete and reconnect explicitly as a Workers project.

**Edge case — merge-race with manual deploys:** once this is live, do not also run `npx wrangler deploy` by hand from `main` out of habit — Cloudflare's build-triggered deploy and a manual deploy racing each other can leave the dashboard's "last deployment" pointing at whichever finished last, which may not match what's in git. Reserve manual `wrangler deploy` for the Phase 4 bootstrap and genuine emergencies (paired with `wrangler rollback` awareness from Phase 6).

---

## Phase 6 — Rollback drill (do this once, before you need it)

- [ ] `npx wrangler deployments list` — confirm at least two deployments exist (deploy a trivial change if needed)
- [ ] `npx wrangler rollback` — reverts to previous deployment, confirm the site reflects the rollback within seconds
- [ ] Note for the team: rollback reverts Worker code only. Supabase schema migrations do **not** roll back automatically — the first migration (`20260830140641_create_patterns_and_names.sql`, applied to hosted 2026-08-30) is additive-only — new tables, no alterations to existing objects — so a Worker rollback stays safe without a database rollback. Keep that property for every future migration

---

## Phase 7 — CI stays verification-only; add a smoke test after Cloudflare's own deploy

Per your decision, GitHub Actions does **not** get a deploy job — Cloudflare Workers Builds (Phase 5) owns push-to-`main` production deploys directly from the git integration, not from a workflow run. `.github/workflows/ci.yml` keeps its existing scope (lint + build on push/PR) with two additions:

- [ ] Add `npm audit --audit-level=high` as a CI step (addresses infra.md's CVE-2025-65019 mitigation item — not urgent given current pinned versions, but this closes the "one-time action" gap the pre-mortem calls out)
- [ ] Optional: add a separate, lightweight `workflow_dispatch` or scheduled job that just runs the Phase 4 smoke-test curl against production — since Cloudflare's own build dashboard shows deploy success/failure, this is a nice-to-have double-check, not a required gate. Skip it if the Cloudflare Builds dashboard notifications (email/Slack, configurable per-project) already cover this.
- [ ] No `CLOUDFLARE_API_TOKEN` repo secret is needed — CI never talks to Cloudflare. `SUPABASE_URL`/`SUPABASE_KEY` repo secrets already exist and stay as-is for the build-check step.

**Edge case — old tutorials say `wrangler pages deploy`:** this project has no Pages target (removed in adapter v13+); the only correct command is `wrangler deploy`. Document this explicitly in the workflow file's comments so a future contributor following an old guide doesn't `pages deploy` into a separate, wrong project.

---

## Phase 8 — Observability

- [ ] `npx wrangler tail` for live debugging sessions (confirm `observability.enabled: true` already present in `wrangler.jsonc` — verified yes)
- [ ] Bookmark Dashboard → Workers & Pages → `kratka` → Logs for persistent history (3 days, 200k events/day on paid plan) — this is the fallback once `wrangler tail`'s 24h session silently drops
- [ ] Do not rely on `wrangler tail` for unattended overnight monitoring — it will not reconnect on its own

---

## Phase 9 — Security/caching guardrails (pre-launch check)

- [ ] Confirm no global Cloudflare cache rule is applied to the account/zone that would cache authenticated SSR routes (Dashboard → Caching → Configuration) — Workers don't cache dynamic routes by default, so this is a check for _accidental_ misconfiguration, not a setup step
- [ ] Confirm `src/middleware.ts`'s protected routes (currently `/patterns`) send `Cache-Control: private, no-store` — not currently set anywhere in `middleware.ts`; add this header for protected routes before launch to close the gap infra.md's Unknown Unknowns flags
- [ ] `npm ls astro @astrojs/cloudflare` — confirm versions stay ≥ the CVE-2025-65019 patched versions (`astro` ≥ 5.15.9, `@astrojs/cloudflare` > 12.6.10 — currently 6.3.1 / 13.5.0, well clear)

---

## Phase 10 — Launch readiness

- [ ] Upgrade to the $5/month Workers paid plan before any public announcement (10ms CPU cap on free tier is incompatible with SSR; 100k req/day free cap is a daily hard-stop, not metered)
- [ ] Re-run the Phase 4 smoke test against the production URL one final time
- [ ] Update this file (`context/deployment/deploy-plan.md`, per CLAUDE.md's infra chain) marking this plan as executed, so future milestone-planning skills know what's already deployed

---

## Verification summary

End-to-end check once all phases are done: 0. Hosted Supabase project exists with real credentials; `.dev.vars` populated (Phase 0 + 1)

1. `npm run dev` — local dev boots against `.dev.vars`, auth works
2. `npm run build && npx wrangler deploy` — first manual deploy succeeds, smoke test passes (bootstrap only, Phase 4)
3. Open a PR — GitHub Actions lint/build passes, and Workers Builds preview URL appears in a PR comment
4. Merge to `main` — Cloudflare Workers Builds auto-deploys production (GitHub Actions does not deploy); confirm the live URL updated and smoke test passes
5. `npx wrangler rollback` — reverts cleanly
6. `npx wrangler tail` — streams live logs from a real request
