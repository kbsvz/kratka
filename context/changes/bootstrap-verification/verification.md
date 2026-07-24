---
bootstrapped_at: 2026-06-17T09:47:00Z
starter_id: 10x-astro-starter
starter_name: 10x Astro Starter (Astro + Supabase + Cloudflare)
project_name: kratka
language_family: js
package_manager: npm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: npm audit --json
---

## Hand-off

Verbatim copy of `context/foundation/tech-stack.md`.

```yaml
starter_id: 10x-astro-starter
package_manager: npm
project_name: kratka
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: false
  has_background_jobs: false
```

### Why this stack

A solo crafter shipping kratka — a browser-based cross-stitch grid editor — in a
~3-week after-hours MVP needs a battle-tested, agent-friendly starter that hands
auth and per-user data isolation off to a service rather than building them by
hand. The 10x Astro Starter (Astro + React + TypeScript + Tailwind + Supabase +
Cloudflare) is the recommended default for `(web, js)` and clears all four
agent-friendly gates. Supabase covers email/password auth (FR-001–FR-003) and
owner-scoped data via Row-Level Security (the ownership guardrail); React islands
carry the interactive 100×100 grid editor while Astro's static pages give a clean,
chrome-free print view (FR-015–FR-017). The auth feature flag is set; payments,
realtime, AI, and background jobs are out of scope per the PRD non-goals.
Deployment is Cloudflare Pages — what the starter ships pre-configured for, the
lowest-friction path to a first deploy for a developer new to web. CI runs on
GitHub Actions with auto-deploy-on-merge, the starter's standard shape.

## Pre-scaffold verification

| Signal      | Value                                              | Severity | Notes                                              |
| ----------- | -------------------------------------------------- | -------- | -------------------------------------------------- |
| npm package | not run                                            | n/a      | cmd_template starts with `git clone` — no npm CLI to inspect |
| GitHub repo | przeprogramowani/10x-astro-starter last pushed 2026-05-17 | fresh    | from card.docs_url; `gh` unavailable, fetched via GitHub REST API |

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && npm install`
**Strategy**: git-clone (clone starter, strip upstream `.git/` history, move files up into cwd)
**Exit code**: 0
**Files moved**: 19 top-level entries (12 non-dot: `README.md`, `astro.config.mjs`, `components.json`, `eslint.config.js`, `node_modules/`, `package-lock.json`, `package.json`, `public/`, `src/`, `supabase/`, `tsconfig.json`, `wrangler.jsonc`; 7 dot: `.env.example`, `.github/`, `.gitignore`, `.husky/`, `.nvmrc`, `.prettierrc.json`, `.vscode/`)
**Conflicts (.scaffold siblings)**: `CLAUDE.md.scaffold` (existing cwd `CLAUDE.md` won; starter's copy sidelined for diffing)
**.gitignore handling**: moved silently (cwd had no pre-existing `.gitignore`)
**.bootstrap-scaffold cleanup**: deleted
**Note**: the initial move-up used a non-dotfile glob under zsh and the seven dotfiles were re-fetched via a second shallow clone before cleanup; all 19 entries are present in cwd. No data loss; `context/` preserved verbatim throughout.

## Post-scaffold audit

**Tool**: `npm audit --json`
**Summary**: 0 CRITICAL, 8 HIGH, 9 MODERATE, 1 LOW (18 total advisories)
**Direct vs transitive**: 0/3/2/0 direct of total 0/8/9/1 (CRITICAL/HIGH/MODERATE/LOW)

#### CRITICAL findings

None.

#### HIGH findings

- **astro** (direct) — affected range `<=7.0.0-alpha.1`
- **@astrojs/cloudflare** (direct) — affected range `<=0.0.0-cf-no-prerender-chunks-20240412140922 || >=10.0.0`
- **wrangler** (direct) — affected range `<=0.0.0-kickoff-demo || >=3.7.0`
- **@cloudflare/vite-plugin** (transitive) — affected range `*`
- **devalue** (transitive) — affected range `5.6.3 - 5.8.0`
- **esbuild** (transitive) — affected range `0.17.0 - 0.28.0`
- **vite** (transitive) — affected range `4.2.0-beta.0 - 8.0.3`
- **ws** (transitive) — affected range `8.0.0 - 8.20.1`

#### MODERATE findings

- **@astrojs/check** (direct) — affected range `>=0.9.3`
- **supabase** (direct) — affected range `1.1.6 - 2.98.2`
- **@astrojs/language-server** (transitive) — affected range `>=2.14.0`
- **js-yaml** (transitive) — affected range `<=4.1.1`
- **miniflare** (transitive) — affected range `<=0.0.0-fff677e35 || 3.20250204.0 - 4.20260518.0`
- **tar** (transitive) — affected range `<=7.5.15`
- **volar-service-yaml** (transitive) — affected range `<=0.0.70`
- **yaml** (transitive) — affected range `2.0.0 - 2.8.2`
- **yaml-language-server** (transitive) — affected range `1.11.1-08d5f7b.0 - 1.21.1-f1f5a94.0 || 1.22.1-0ae5603.0 - 1.22.1-fc5f874.0`

#### LOW / INFO findings

- **@babel/core** (transitive) — affected range `<=7.29.0`

Bootstrapper does not auto-patch. Review `npm audit` output and decide per your project's risk tolerance; `npm audit fix` addresses non-breaking issues, `npm audit fix --force` includes breaking changes.

## Hints recorded but not acted on

| Hint                    | Value                  |
| ----------------------- | ---------------------- |
| bootstrapper_confidence | first-class            |
| quality_override        | false                  |
| path_taken              | standard               |
| self_check_answers      | null                   |
| team_size               | solo                   |
| deployment_target       | cloudflare-pages       |
| ci_provider             | github-actions         |
| ci_default_flow         | auto-deploy-on-merge   |
| has_auth                | true                   |
| has_payments            | false                  |
| has_realtime            | false                  |
| has_ai                  | false                  |
| has_background_jobs     | false                  |

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:
- `git init` (if you have not already) to start your own repo history.
- Review the `CLAUDE.md.scaffold` sibling the conflict policy created and decide which version to keep (your existing `CLAUDE.md` was preserved). `diff CLAUDE.md CLAUDE.md.scaffold` to compare.
- Copy `.env.example` to `.env` and fill in your Supabase + Cloudflare credentials before running the app.
- Address audit findings per your project's risk tolerance — the full breakdown is in this log.
