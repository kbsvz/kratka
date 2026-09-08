---
change_id: editor-draw-save
title: "Grid editor: create pattern, paint palette, live count, save, reopen"
status: archived
created: 2026-08-31
updated: 2026-09-08
archived_at: 2026-09-08T18:31:14Z
roadmap_ref: S-01
prd_refs:
  - FR-003
  - FR-004
  - FR-005
  - FR-006
  - FR-007
  - FR-008
  - FR-009
  - FR-010
  - FR-012
  - FR-014
  - FR-019
---

# Change: Grid editor — draw, save, reopen

North-star slice `S-01` from `context/foundation/roadmap.md`.

## Why

The core product hypothesis — that a cross-stitch designer can draw, save, and reopen a pattern
with responsive paint feedback — depends on this slice. Everything else (pattern list, print view)
reads data this slice produces.

## Scope

Grid editor UI, pattern create/save/load, palette management, paint/erase interaction, live
per-color cell counts, unsaved-changes guardrail. Does not include pattern list UI (S-02) or
print view (S-03).

## Artifacts

- `research.md` — grid rendering approach and competitor size survey (2026-08-31)
- `frame.md` — verified scope bundling and Canvas 2D pick; surfaced DPR scaling, drag interpolation, and canvas/React state-boundary gaps to close before `/10x-plan` (2026-09-02)

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->

- **2026-09-04 — cleanup needed on the remote Supabase project.** `.dev.vars`
  was pointing `SUPABASE_URL`/`SUPABASE_KEY` at the linked remote project
  (`https://htxbolpzbhzjbakllkyl.supabase.co`) instead of the local Docker
  stack, contrary to README's setup instructions — discovered while
  browser-testing Phase 1. A manual smoke test against the running dev server
  therefore created real rows there: user `smoketest@example.com` and 3 test
  patterns (one named "My Very First Pattern", ~20×20, a few cells painted;
  two more created empty while probing the 3-pattern cap). **Confirmed a
  config mistake** (not intentional) and fixed the same day: `.dev.vars` now
  points at `http://127.0.0.1:54321` with the local stack's publishable key.
  The remote test data itself is still there — left in place per user
  decision (2026-09-04), clean up by deleting the `smoketest@example.com`
  auth user (cascades to its patterns) before this project has real users.
  Restarting `npm run dev` is required to pick up the corrected `.dev.vars`.

- **2026-09-04 — future improvement: replace the native color picker.**
  `PalettePanel.tsx`'s "+" swatch opens the browser/OS-native `<input
  type="color">` dialog, which can't be customized (no injectable Save/Cancel
  buttons, and close behavior varies by browser — Chromium closes on
  click-outside with no explicit OK, Firefox/Safari delegate to the OS color
  panel). The app-level checkmark/× confirm-discard pair around the pending
  swatch was added specifically to compensate for that missing affordance.
  Accepted as-is for MVP (2026-09-04 user decision). A custom in-app color
  picker (spectrum/wheel + hex entry, fully within our own UI) would remove
  this inconsistency and is worth considering for a future slice.
