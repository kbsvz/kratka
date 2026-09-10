# My Patterns + Pattern Editor Redesign — Plan Brief

> Full plan: `context/changes/patterns-page-ui-improvements/plan.md`
> Frame brief: `context/changes/patterns-page-ui-improvements/frame.md`

## What & Why

Restyle the Dashboard (renamed "My Patterns") and Pattern editor pages to a new warm,
craft-oriented visual language, per a redesign doc + two HTML mockups the user provided — with
no functional changes. The frame brief found this isn't one uniform CSS pass: within the editor
page specifically, "chrome + workspace + palette + canvas" mixes low-risk restyling with small
but real structural/code changes (breadcrumb replacing absolute-positioned nav, canvas draw-color
constants), and the plan phases accordingly.

## Starting Point

Neither page shares header markup today; each hand-rolls its own "KRATKA + account controls."
The editor is single-column with the palette as a horizontal wrapping row above the canvas, and
its header nav is two absolutely-positioned corner blocks. The canvas already draws heavy
gridlines and edge numbers — only their colors need updating. The brand green is a hardcoded
literal repeated 17 times app-wide.

## Desired End State

Both pages match their mockups: a compact shared header (logo, email, sign-out) on both pages;
"My Patterns" with a slot indicator, compact create form, and a renamed/restyled table; the
editor with a breadcrumb, an action row (unsaved-changes text + Save), a two-column tools/palette
sidebar + grid layout, a vertical palette list, and recolored gridlines. The route moves from
`/dashboard` to `/patterns`.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Change split | One change, 4 phases (not split by page into separate changes) | User chose to plan it as a single change after reviewing the frame brief's risk breakdown | Plan |
| Editor phase split | Structural (Phase 3) separated from canvas/visual polish (Phase 4) | Frame brief found canvas recoloring and header→breadcrumb are code-level changes, not CSS swaps | Frame |
| Canvas rendering | Stays Canvas 2D/TypeScript, recolor constants only | User explicitly confirmed the HTML mockup's grid markup was a visual reference, not a migration target | Frame |
| Palette layout | Restructure to vertical sidebar list with title + N/30 counter | User confirmed this after initially saying "don't change the layout" — a real reframe | Frame |
| Header architecture | One static, server-rendered `AppHeader` (no client JS) | Redesign doc says page-specific nav doesn't belong in the global header; avoids cross-island state sharing | Plan |
| Sign-out visibility | Always visible, drop "hide when session expired" | User chose simplicity over preserving a minor edge-case behavior | Plan |
| Route rename | `/dashboard` → `/patterns`, old path 404s (no redirect) | User wants URL/label consistency; simplicity preferred over redirect-safety | Plan |
| Token scope | Add CSS variables globally, swap all 17 literal occurrences repo-wide | User chose one consistent color system over scoping color changes to just 2 pages | Plan |
| Verification | Lint + typecheck + build + manual QA against mockups | No frontend test framework exists in this repo; adding one wasn't justified for a "no new functionality" change | Plan |

## Scope

**In scope:**
- My Patterns page: rename, slot indicator, compact create form, table restyle
- Editor page: breadcrumb, action row, two-column layout, palette restructure, canvas recoloring
- Shared `AppHeader` component
- Route rename `/dashboard` → `/patterns` and all its call sites
- Repo-wide brand-color token replacement (color only, not layout, outside the 2 target pages)

**Out of scope:**
- Any functional change (validation, ownership, cap, save behavior, print behavior)
- Migrating the grid off Canvas 2D
- A redirect from the old `/dashboard` URL
- New test tooling (e.g. Playwright)
- Print preview styling (not yet built)

## Architecture / Approach

A new static Astro `AppHeader` component is shared by both pages' `.astro` files, rendered
above their respective `client:load` React islands. The editor's guarded back-navigation moves
out of the header into a breadcrumb inside the editor's own React component, per the redesign
doc's instruction to keep page-specific navigation out of the global header.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Foundation | Color tokens repo-wide, shared `AppHeader`, `/dashboard` → `/patterns` rename | Missing a `/dashboard` call site; breaks a route |
| 2. My Patterns page | Full page redesign per mockup | Low — mostly Tailwind/copy, matches existing structure |
| 3. Editor structural | Breadcrumb, action row, two-column layout, palette restructure | JSX changes sit near paint/save/guard logic — regression risk if guard wiring is dropped |
| 4. Editor visual polish | Canvas recoloring, remove card wrapper, remaining token application | Editing canvas draw code — must preserve incremental-redraw behavior exactly |

**Prerequisites:** None — no external dependencies or access needed.
**Estimated effort:** ~4 focused sessions, one per phase, each with a manual-verification checkpoint before proceeding.

## Open Risks & Assumptions

- Dropping "hide sign-out on session expiry" is a deliberate, small behavior change — acceptable per user decision, but worth a mental note during Phase 1 manual QA.
- The Tools (Paint/Erase) control shown in the mockup doesn't map 1:1 to today's implicit "select a color = paint" model; Phase 3 adds an explicit Paint control without changing the underlying `tool` state shape — worth double-checking during manual QA that this doesn't feel like a new capability.

## Success Criteria (Summary)

- Both pages visually match their mockups end-to-end
- Zero functional regressions: create, delete, paint, erase, save, unsaved-changes guard, and the 3-pattern cap all behave exactly as before
- `npm run lint`, `npx astro check`, and `npm run build` all pass at the end of every phase
