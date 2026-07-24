---
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
---

## Why this stack

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
