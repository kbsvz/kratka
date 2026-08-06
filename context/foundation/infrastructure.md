---
project: kratka
researched_at: 2026-08-06T00:00:00Z
recommended_platform: Cloudflare Workers
runner_up: Netlify
context_type: mvp
tech_stack:
  language: TypeScript / JavaScript
  framework: Astro 6 + React 19
  runtime: Cloudflare Workers (workerd)
  database: Supabase (external, cloud-hosted)
  adapter: "@astrojs/cloudflare v13.5.0"
  deployer: "wrangler v4.90.0"
---

## Recommendation

**Deploy on Cloudflare Workers.**

The starter (`10x-astro-starter`) ships pre-configured for Workers — `wrangler.jsonc`, the `@astrojs/cloudflare` v13.5 adapter, and `nodejs_compat` are all in place. No code changes are required to deploy; `npx wrangler deploy` is the entire deploy operation. The Workers free tier covers ~3 million requests per day, which is well above MVP traffic, though the 10ms CPU cap on the free tier makes the $5/month paid plan effectively mandatory for SSR (see Risk Register). All five agent-friendly criteria score Pass: CLI-first (`wrangler`), managed/serverless, llms.txt + GitHub markdown docs, stable one-command deploy API, and a GA MCP server with documented Claude Code integration.

## Platform Comparison

| Platform | CLI-first | Managed/Serverless | Agent Docs | Stable Deploy API | MCP Integration | Adapter Swap? | Est. MVP Cost |
|---|---|---|---|---|---|---|---|
| **Cloudflare Workers** | ✅ Pass | ✅ Pass | ✅ Pass | ✅ Pass | ✅ Pass (GA) | ❌ None | $0–$5/mo |
| Vercel | ✅ Pass | ✅ Pass | ✅ Pass | ✅ Pass | ✅ Pass (GA) | ✅ Required | $20/mo (commercial) |
| Netlify | ⚠️ Partial¹ | ✅ Pass | ✅ Pass | ✅ Pass | ✅ Pass (GA) | ✅ Required | $0–$9/mo |
| Render | ⚠️ Partial¹ | ✅ Pass | ✅ Pass | ✅ Pass | ✅ Pass (GA) | ✅ Required | $7/mo |
| Railway | ⚠️ Partial¹ | ✅ Pass | ✅ Pass | ✅ Pass | ⚠️ Partial² | ✅ Required | $5/mo |
| Fly.io | ✅ Pass | ✅ Pass | ✅ Pass | ✅ Pass | ⚠️ Partial³ | ✅ Required | $3–10/mo |

¹ Rollback is UI-only; no CLI rollback command.  
² Remote MCP in public testing since April 2026 — not GA. Checked 2026-08-06.  
³ FlyMCP (superfly/flymcp) is early-stage/experimental — no GA declaration. Checked 2026-08-06.

### Why platforms were scored this way

**Cloudflare Workers** — wrangler CLI covers deploy (`wrangler deploy`), rollback (`wrangler rollback [id]`), and log tailing (`wrangler tail`) entirely without a browser. Docs live at developers.cloudflare.com with per-product `llms.txt` endpoints and a GitHub source repo. Deployment is a single command with structured exit codes. The official MCP server suite covers Workers, KV, D1, DNS, and observability and is GA with documented Claude Code setup at `developers.cloudflare.com/agent-setup/claude-code/`. The adapter and wrangler are already installed in this project.

**Vercel** — CLI is strong and GA; MCP is GA at `mcp.vercel.com` with OAuth. Penalised heavily on cost: the Hobby (free) plan prohibits commercial use; Pro is $20/month — the most expensive option in the shortlist. Additionally, an unresolved esbuild parse error (GitHub issue #16258) affects Astro 6 SSR + `@astrojs/vercel` at build time for component `<script>` blocks with dynamic imports. Requires full adapter swap from the Cloudflare adapter. Not shortlisted.

**Netlify** — the `@astrojs/netlify` v8.2.0 adapter is GA and actively maintained. MCP server is GA with an explicit Claude Code setup guide. The credit-based free tier (300 credits/month, introduced September 2025) hard-stops the site when credits hit zero, with no overage billing or warning email — a reliability risk in production. Rollback has no CLI command; it requires clicking in the dashboard. Personal plan ($9/month) avoids the credit cliff. Runner-up.

**Render** — straightforward Node.js Web Service deployment; MCP is GA with structured tools (deploy, logs, metrics). Requires adapter swap to `@astrojs/node`. The free tier spins down after 15 minutes of inactivity, producing ~1-minute cold starts — unacceptable for a UX-facing app. Starter ($7/month) avoids this. Third place.

**Railway** — Hobby ($5/month) is practical; Railway's remote MCP server and `railway agent` CLI command are in public testing as of April 2026 (not GA). No official Astro 6 validation documented. Rollback is UI-only. Fourth place.

**Fly.io** — full persistent process support and strong CLI (`flyctl`). No free tier (removed in 2024). FlyMCP is experimental (early-stage GitHub repo, no GA declaration). Requires adapter swap + Dockerfile. Higher operational surface for a solo MVP developer. Fifth place.

### Shortlisted Platforms

#### 1. Cloudflare Workers (Recommended)

Zero migration cost — the project is already wired for Workers. `@astrojs/cloudflare` v13.5 targets Workers directly (the Pages target was removed in v13; this project is already on the correct target). Free tier supports ~3 million requests/day; the $5/month paid plan is the effective price floor for SSR due to the 10ms free-tier CPU cap. All five agent-friendly criteria pass. GA MCP with Claude Code setup documented by Cloudflare. Every Supabase Auth cookie pattern and `astro:env/server` env injection pattern already works with wrangler's secret management.

#### 2. Netlify

Strong adapter (`@astrojs/netlify` v8.2.0), GA MCP server with Claude Code guide, and a working `llms.txt`. The principal operational gap is UI-only rollback — an agent cannot roll back a deployment via CLI or MCP. The free-tier credit hard-stop (zero credits = site down until next billing cycle, no grace period) makes the $9/month Personal plan the safe baseline. An acceptable swap target if Cloudflare's Workers runtime proves incompatible with a future npm dependency.

#### 3. Render

Clean "just run Node.js" story with the `@astrojs/node` adapter. GA MCP that exposes deploy, logs, metrics, and environment variable management. The Starter plan ($7/month) removes the 1-minute free-tier cold start. If the project ever needs to escape the Workers sandbox (e.g., a dependency that uses `fs` or native modules that `nodejs_compat` can't polyfill), Render is the lowest-friction fallback.

---

## Anti-Bias Cross-Check: Cloudflare Workers

### Devil's Advocate — Weaknesses

1. **The free-tier 10ms CPU cap will silently fail SSR renders.** A request that runs Astro middleware (session resolution via Supabase SSR client), renders a React island, and returns an HTML response consistently exceeds 10ms of CPU time. Workers on the free tier returns a 1102 CPU exceeded error with no user-visible message — just a blank page. The $5/month paid plan (30-second CPU limit) is effectively mandatory for SSR; the "free tier" headline is misleading.

2. **`astro:env/server` and Cloudflare Worker Secrets are two different mechanisms that look identical.** `SUPABASE_URL` and `SUPABASE_KEY` are typed through Astro's env schema but injected at runtime via `wrangler secret put`. Confusing this with `.dev.vars` (local-only) or `wrangler.jsonc vars` (committed plaintext) produces either a secret-in-source-control exposure or a production build that passes CI and fails at the first real request with an opaque "missing environment variable" error.

3. **CVE-2025-65019 affects `output: "server"` with `@astrojs/cloudflare`.** The `/_image` endpoint allowed `data:` URL injection that could execute JavaScript via a 302 redirect. This project uses `output: "server"`. The adapter version must be verified as patched before launch, and Astro security advisories must become a recurring check — not a one-time action.

4. **`wrangler pages deploy` vs. `wrangler deploy` are not interchangeable.** The `tech-stack.md` lists `deployment_target: cloudflare-pages`, but `@astrojs/cloudflare` v13+ removed the Pages target. Workers is the only supported mode. Many tutorials still reference `wrangler pages deploy`, producing opaque errors for developers following older guides. The correct command is `wrangler deploy`.

5. **The free-tier 100k-requests/day limit is a daily hard cap, not monthly.** A shared link in a crafting community can exhaust the daily free allocation in hours, taking the site offline until midnight UTC with no warning and no graceful degradation. On the $5/month paid plan this risk disappears (10 million requests/month included, with metered overage rather than a hard stop).

### Pre-Mortem — How This Could Fail

The team deployed kratka on Cloudflare Workers on the $5/month paid plan. Deployment went smoothly; `wrangler deploy` shipped a working app in under two minutes.

During week five, a routine `npm update` pulled in `@astrojs/cloudflare` v13.4, which changed the default image service from `'compile'` to `'cloudflare-binding'`. Nobody noticed the changelog entry. The pattern print view — the app's most important page — started returning 500s in production. The `/_image` endpoint was crashing with `Error: No such binding: IMAGES` because the new default expected a Cloudflare Images binding that had never been configured. The error reproduced only in production; the local `workerd` dev server used a different binding resolution path and showed nothing.

Debugging took two full weekend sessions. The developer, new to Cloudflare, initially suspected a Supabase connection problem. Meanwhile, a post in a Polish cross-stitch Facebook group sent 600 new users to the print view; they all hit the 500 and left. The CVE-2025-65019 advisory had been sitting in `npm audit` output since week one, unactioned because the project felt "too small to worry about." When the bug was finally traced to the adapter upgrade, trust in automated updates was broken — the developer stopped `npm update`-ing entirely, introducing a different long-term vulnerability accumulation risk.

### Unknown Unknowns

- **Supabase `sb-*` auth cookies can conflict with Cloudflare caching rules.** If any caching rule is applied globally — even via a WAF preset or a tutorial's "performance tip" — authenticated SSR pages may be cached and served to a different user, directly violating the PRD's primary security guardrail. Workers deployments do not cache dynamic routes by default, but any explicit cache configuration must exclude authenticated routes.

- **`wrangler tail` silently drops after 24 hours.** The session times out and doesn't reconnect automatically. For an after-hours developer monitoring a weekend launch, the log stream can stop mid-session with no alert. Workers Logs (the persistent store) retains up to 200k events/day for 3 days on the paid plan — a high-traffic burst that exceeds 200k events/day starts silently dropping log lines.

- **`astro dev` already uses the workerd runtime (a v13 adapter improvement), meaning some npm packages that work in a Node.js dev server will fail locally.** `nodejs_compat` is set in `wrangler.jsonc` and covers most Node.js built-ins, but not every package. Failures look like a dependency bug, not a platform-compatibility issue, which makes them harder to diagnose.

- **`wrangler deploy` exits with code 0 as soon as the build is uploaded — not when the first request succeeds.** A bad deploy (missing binding, cold-start crash) reports success in CI and only surfaces when a real user hits the new revision. Adding a post-deploy smoke test to CI is the fix; it is not in the default starter setup.

- **The wrangler.jsonc `"name"` field is currently `"10x-astro-starter"`, not `"kratka"`.** This determines the Worker's subdomain at `<name>.workers.dev`. Deploying without renaming will publish under the starter's name, not the project's name. Rename it before the first `wrangler deploy`.

---

## Operational Story

- **Preview deploys**: For branch/PR previews, deploy to a separate Worker using `wrangler deploy --env preview` with a `[env.preview]` stanza in `wrangler.jsonc`. The preview Worker gets its own URL (`kratka-preview.workers.dev`). No automatic PR preview URLs ship with the default Workers setup (that was a Pages feature); CI must explicitly deploy to the preview env on pull requests. Workers preview deployments do not require Cloudflare Access protection (they live on the `workers.dev` subdomain), but adding a shared password via Cloudflare Access is recommended if the preview shows real user data.

- **Secrets**: `SUPABASE_URL` and `SUPABASE_KEY` are injected at runtime as Worker Secrets via `wrangler secret put SUPABASE_URL` and `wrangler secret put SUPABASE_KEY`. Secrets are encrypted server-side and never appear in `wrangler.jsonc` or source control. For GitHub Actions CI, use repository secrets (`CLOUDFLARE_API_TOKEN`, `SUPABASE_URL`, `SUPABASE_KEY`) and pass them to wrangler via env vars. Rotation: `wrangler secret put <NAME>` again with the new value; the Worker picks it up on the next cold start.

- **Rollback**: `wrangler rollback` (no deployment ID) reverts to the previous production deployment instantly. `wrangler rollback <deployment-id>` targets a specific version from `wrangler deployments list`. Rollback takes effect within seconds. Database migrations do not roll back automatically — if a deploy included a Supabase migration, the rollback reverts the Worker code but leaves the schema migrated. Plan rollback-safe migrations (additive-only) for MVP.

- **Approval**: Deployment to production is triggered by `wrangler deploy` — there is no built-in approval gate. The human gate is the CI merge requirement: `wrangler deploy` only runs on merge to `main` (via GitHub Actions). Destructive actions (delete a Worker, rotate the primary Supabase key, modify DNS) are human-only via the Cloudflare dashboard or Supabase dashboard. An agent may perform: `wrangler deploy`, `wrangler rollback`, `wrangler tail`, `wrangler secret put` (with an existing known secret name).

- **Logs**: `wrangler tail` streams live request/response logs and uncaught exceptions to the terminal — no setup required. `wrangler tail --format json` produces structured JSON Lines output suitable for piping to a local filter or an AI agent. Historical logs (up to 3 days, 200k events/day) are queryable in the Cloudflare dashboard under Workers → Logs, or via the Cloudflare Logs MCP tool. Observability is already enabled in `wrangler.jsonc` (`"observability": { "enabled": true }`).

---

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| Free-tier 10ms CPU cap silently fails SSR renders (blank page, no user-visible error) | Devil's advocate | H | H | Upgrade to the $5/month paid Workers plan before first real user. The 10ms cap on free tier is incompatible with SSR. |
| `wrangler.jsonc` has `"name": "10x-astro-starter"` — deploying without renaming publishes under the wrong subdomain | Unknown unknowns | H | M | Change `"name"` to `"kratka"` in `wrangler.jsonc` before running `wrangler deploy`. |
| CVE-2025-65019: XSS in `/_image` endpoint on `output: "server"` + `@astrojs/cloudflare` | Devil's advocate | M | H | Verify the installed adapter version is patched. Run `npm audit` before launch and add it to the CI step. Subscribe to Astro security advisories. |
| `npm update` of `@astrojs/cloudflare` silently changes image service default and breaks the print view | Pre-mortem | M | H | Pin minor/patch versions in `package.json` (`"@astrojs/cloudflare": "13.5.0"`). Review changelogs on every adapter upgrade. |
| Supabase auth cookies cached by a Cloudflare rule — one user sees another's patterns | Unknown unknowns | L | H | Do not add any global caching rules. Confirm `Cache-Control: private, no-store` headers on all authenticated SSR responses before launch. |
| Confusing Worker Secrets with `.dev.vars` — secrets leak into source control or break production builds | Devil's advocate | M | M | Use `wrangler secret put` exclusively for production secrets. `.dev.vars` is local-only. Add `.dev.vars` to `.gitignore` (verify it is already there). |
| `wrangler pages deploy` vs. `wrangler deploy` confusion from older tutorials | Devil's advocate | M | M | Document the correct command (`wrangler deploy`) in the project README and CI config. `wrangler pages deploy` targets the deprecated Pages product. |
| Free-tier daily cap (100k req/day) — a viral share exhausts the daily limit and takes the site offline | Devil's advocate | L | H | Upgrade to paid plan before any public announcement. Paid plan switches from hard-stop to metered billing. |
| `wrangler deploy` exits 0 on upload, not on first successful request — bad deploys go undetected in CI | Unknown unknowns | M | M | Add a smoke-test step to CI: `curl -sf https://kratka.workers.dev/ > /dev/null` after deploy, with a 30-second retry. |
| `wrangler tail` session silently drops after 24 hours — log monitoring stops without notice | Unknown unknowns | M | L | Use `wrangler tail` for short-lived debugging sessions only. For persistent monitoring, rely on the Cloudflare dashboard Logs UI or a future log drain. |
| npm package incompatible with workerd sandbox — `nodejs_compat` doesn't cover every Node.js API | Unknown unknowns | L | M | Test each new npm package addition with `npm run dev` (already uses workerd). Flag any `ERR_UNIMPLEMENTED` errors as a platform compat issue, not a package bug. |

---

## Getting Started

These commands are specific to this project's installed versions (`@astrojs/cloudflare` v13.5.0, wrangler v4.90.0):

1. **Rename the worker** — in `wrangler.jsonc`, change `"name": "10x-astro-starter"` to `"name": "kratka"`. This sets your production URL to `kratka.<your-account>.workers.dev`.

2. **Authenticate wrangler** (once per machine):
   ```bash
   npx wrangler login
   ```

3. **Push production secrets** (do this before the first deploy):
   ```bash
   npx wrangler secret put SUPABASE_URL
   npx wrangler secret put SUPABASE_KEY
   ```
   Wrangler prompts for the value interactively — no value appears in shell history.

4. **Build and deploy**:
   ```bash
   npm run build
   npx wrangler deploy
   ```
   `wrangler deploy` reads `wrangler.jsonc`, uploads the `dist/` output, and prints the live URL. The `npm run build` step is implicit in `wrangler deploy` when a `build` script is present, but running it explicitly first catches build errors before they touch Cloudflare.

5. **Tail live logs**:
   ```bash
   npx wrangler tail
   ```
   Streams console output and uncaught exceptions for every incoming request. Add `--format json` for structured output. Add a smoke test immediately after deploy: `curl -sf https://kratka.<account>.workers.dev/ > /dev/null`.

---

## Out of Scope

The following were not evaluated in this research:
- Docker image configuration
- CI/CD pipeline setup (GitHub Actions workflows)
- Production-scale architecture (multi-region, HA, DR)
- Cost at >1M monthly active users
- Cloudflare Access configuration for preview environment protection
