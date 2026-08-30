# Lessons — kratka

Recurring rules and failure patterns surfaced during implementation. Each entry is a specific rule, not a post-mortem summary.

---

## L-01: Never use `npm audit fix --force` — it breaks the build

**Rule:** Do not run `npm audit fix --force` on this project. Use targeted version bumps instead.

**Why:** `--force` ignores semver ranges and installs the latest major version of any transitive dep it touches. 
On 2026-08-30 this bumped `astro` from `6.3.1` → `7.2.9` and `@astrojs/cloudflare` from `13.5.0` → `14.2.5`. 
The adapter v14 auto-enabled Cloudflare `IMAGES` and `SESSION` bindings that don't exist in `wrangler.jsonc`; 
Astro v7 hit a "Could not find the prerender entry point" build error. Build was broken until both packages were pinned back.

**How to apply:** When `npm audit` reports vulnerabilities, check whether the advisory has a patched version in 
the current major branch first. For Astro: the security patch for CVEs in 6.x was `6.4.8`, not `7.x`. 
For the cloudflare adapter: stay on `13.5.0` until the adapter changelog is reviewed for breaking changes. 
The correct pinned versions are `astro: "6.4.8"` and `"@astrojs/cloudflare": "13.5.0"` in `package.json`.
