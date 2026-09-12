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

---

## L-02: Docs asserting "X doesn't exist yet" go stale silently — grep before closing a change

**Rule:** When a change creates the _first_ instance of something — first migration, first test file,
first generated artifact, first config file — grep the docs for statements asserting its absence
before closing the change.

**Why:** On 2026-08-30, F-01 (`patterns-schema-rls`) added the project's first migration, first pgTAP
test, and first generated types file. Three prose claims became false the moment it landed:
`README.md` said "No database tables or migrations are required"; `context/deployment/deploy-plan.md`
said "this repo has no migrations yet (`supabase/migrations/` doesn't exist)" and "`.dev.vars`
(confirmed not to exist yet)". All three were accurate when written, none failed a build, and all
three were found by accident rather than by process. The claims most likely to rot are the carefully
verified ones — "X doesn't exist yet" gets written precisely _because_ someone checked at the time.

**How to apply:** Before the final phase commit, run:

```bash
grep -rniE "no migrations|does(n't| not) exist|not yet|none required|not required" README.md context/
```

Treat every hit as a claim to re-verify against the current repo, not prose to skim. Prefer deleting
or dating the claim over rewording it — a statement about repo state has no test, so the next change
will rot it again.

Scope the sweep to **living** documents: `README.md`, `context/foundation/*.md`,
`context/deployment/*.md`. Skip `context/changes/*/plan.md` and `reviews/*.md` — a plan's "Current
State Analysis" is a dated snapshot of what was true when it was written, and editing it to match
today falsifies the record the review was performed against.

---

## L-03: Bulk data duplicated between a plan and its migration will desync

**Rule:** Seed lists, fixtures and enum tables live in exactly one place — the migration. If a plan
shows the data for review, diff the two copies before applying, or reference the migration path
instead of pasting rows.

**Why:** On 2026-08-30 the `pattern_names` seed list (59 rows) was written into both
`context/changes/patterns-schema-rls/plan.md` and the migration. It desynced twice within a day:
first a duplicate value (`'Masterpiece'` at both id 27 and id 50) that would have aborted the entire
`INSERT` against the `unique (name)` constraint and failed `db reset`; then an entry present in one
copy and absent from the other. Neither was caught by reading the diff — both were caught by an
ad-hoc uniqueness check and a line-by-line comparison.

**How to apply:** Where a plan must carry the data, verify both invariants before `db reset`:

```bash
# duplicates within the seed block
grep -E "^\s+\([0-9]+," <migration> | grep -oE "'([^']|'')*'" | sort | uniq -d
# plan and migration in agreement
diff <(extract-rows plan.md) <(extract-rows migration.sql)
```

An empty result from both is the gate. A `unique` constraint on the seeded column is what turns a
silent duplicate into a loud migration failure — keep one.

---

## L-04: A stale non-functional doc value gets a plain replace, not a correction narrative

**Rule:** When a value in a doc (PRD, roadmap, plan, research) is wrong but purely descriptive —
never read by code, no schema or decision hinges on it — just replace it wherever it's wrong. Don't
narrate "corrected from X to Y", don't cite sources/dates for the fix, and don't treat it as a
cross-document sync project by chasing every doc that mentions the old value.

**Why:** On 2026-09-12, `roadmap.md` stated the thread-length constant as "45 cm/stitch" while the
PRD and code both correctly used "7 mm/stitch" — a stale figure from an early draft that was never
functionally wrong (code was always right). The correction got over-documented: `test-plan.md`,
`research.md`, and `plan.md` all grew "roadmap says X but PRD/code says Y, confirmed by research on
<date>" annotations for what was, in the end, a one-line typo.

**How to apply:** For a non-functional documentation error (wrong stated constant, stale wording),
do a plain find-and-replace in the place it's wrong and stop — no evidence trail, no backport to
sibling docs unless they're independently wrong too. Reserve the backport-with-evidence ritual
(e.g. `/10x-test-plan`'s post-research backport check) for corrections that change an actual
strategy or decision, not cosmetic doc accuracy.
