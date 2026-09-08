<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Grid editor: draw, save, reopen (S-01)

- **Plan**: context/changes/editor-draw-save/plan.md
- **Scope**: Phase 1 and Phase 2 (full plan review)
- **Date**: 2026-09-08
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 4 warnings, 4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | WARNING |

## Per-item verification

### Phase 1

1. **[MATCH]** `package.json` — `zod` present at `^4.5.4`.
2. **[MATCH]** `src/lib/patterns.ts` — `createPatternSchema` (width/height 20-100) and `savePatternSchema` (palette hex[] max 30, grid non-negative ints); types line up with `PatternCreate`/`PatternUpdate`. Extra `.refine()` cross-checking grid values against palette length — stricter than specified, harmless.
3. **[DRIFT]** `src/pages/api/patterns/index.ts` — always returns a 302 redirect (matches the form-POST convention `new.astro` actually uses), never the plan's specified 4xx-with-trigger-hint JSON response; cap-exception detection is via `error.message.includes("Pattern slot limit reached")` string-matching rather than checking `errcode === 'KR001'`. Functionally correct and consistent with the codebase's redirect convention, but diverges from the plan's literal contract (see F1).
4. **[MATCH]** `src/pages/api/patterns/[id].ts` — GET/PATCH both via `createClient`/RLS/zod, `const prerender = false` present on both.
5. **[MATCH]** `src/middleware.ts:4` — `PROTECTED_ROUTES = ["/dashboard", "/editor"]`.
6. **[MATCH]** `src/pages/dashboard.astro` — server-side live-pattern count (`head:true`, no N+1), enabled/disabled "New Pattern" entry at the 3-pattern cap.
7. **[MATCH]** `src/pages/editor/new.astro` — width/height inputs (min 20, max 100, step 1), form-POST-and-redirect like signup/signin.
8. **[MATCH]** `src/pages/editor/[id].astro` — server-side RLS-scoped load, redirect on not-found/not-owned, mounts `PatternEditor` island with `{id, width, height, palette, grid}`.
9. **[MATCH]** `src/components/editor/PatternEditor.tsx` + `usePatternGrid.ts` — DPR-aware canvas, StrictMode-guarded init (`canvasInitializedRef`), heavy gridlines/edge numbers every 10th row/col, dirty flag wired to guardrail, Save wired to PATCH. Grid buffer is a `Uint8Array` ref (not plain `number[]`) — a reasonable, more memory-efficient variant of the spec.
10. **[MATCH]** `src/components/hooks/useUnsavedChangesGuard.ts` — `beforeunload` listener gated on `isDirty`, `attemptNavigate(to)` shows AlertDialog when dirty, passes through when clean.
11. **[MATCH]** `src/components/ui/{input,alert-dialog,label}.tsx` — all present via shadcn install.

### Phase 2

1. **[DRIFT]** `src/components/editor/PalettePanel.tsx` — native color picker + pick/confirm/discard flow + 30-color cap present; the plan's "hex text input" entry method is **missing** (confirmed absent repo-wide). Disclosed and accepted: commit `72d80d5`'s message states "no hex text entry," and `change.md`'s 2026-09-04 entry records it as an accepted MVP tradeoff with a named future-improvement path. Progress item 2.3 ("Palette build (picker + hex)... enforced") is still checked `[x]` despite hex entry not existing — see F2.
2. **[MATCH]** `PatternEditor.tsx`/`usePatternGrid.ts` — `getCoalescedEvents()` (fallback `[nativeEvent]`), Bresenham line-fill (`lineCells()`) between previous/current cell, not just the endpoint; per-cell targeted redraw, one batched count-delta update per pointer event.
3. **[MATCH]** `ColorCounts.tsx` + `usePatternGrid.ts` — `Map<number,count>` in `useState`, updated incrementally (±1), not by rescanning.
4. **[MATCH]** `PatternEditor.tsx`/`PalettePanel.tsx` — dedicated eraser button; erase writes palette index `0` through the same drag/interpolation path as paint.

### Scope boundary check ("What We're NOT Doing")

No violations: no pattern-list/picker UI, no print view, no grid-size/virtualization/WebGL work beyond the 20-100 CHECK range, no auto-save (Save only fires from the explicit button), no undo/redo/layers/resize/rename/background-picker/thread-integration, no automated test suite, no throwaway rendering spike (one canvas implementation extended in place, confirmed via git history). Pointer Events incidentally handle touch, but no touch-specific UI/behavior was added — `touch-none` CSS only suppresses default browser touch-scroll/gesture handling.

Minor unplanned but benign additions layered into the same commits: a KRATKA logo/nav link on the dashboard and an `index.astro` `?home` bypass — cosmetic navigation, not scope creep into any excluded feature area, but absent from the plan's stated Phase 2 file list.

## Extra files (touched in the same git range, not in the plan)

All confirmed benign; none conflict with or undermine the planned Phase 1/2 work.

- `astro.config.mjs` — scoped exactly as claimed: `vite.resolve.dedupe: ["react","react-dom"]` + `vite.ssr.optimizeDeps.include` for react/jsx-runtime, fixing a duplicate-React-instance SSR crash. Nothing broader.
- `public/template.png` (deleted), `src/components/ui/LibBadge.astro` (deleted) — unused starter-template asset cleanup, no references remain.
- `src/components/Topbar.astro`, `Welcome.astro` — logo/link/color/spacing restyling; unrelated to editor.
- `src/components/auth/FormField.tsx`, `PasswordToggle.tsx`, `ServerError.tsx` — color-scheme edits only.
- `src/components/auth/SignInForm.tsx`, `SignUpForm.tsx`, `SubmitButton.tsx` — removed a broken `useFormStatus()` call that crashed SSR (these forms are plain navigations, not React 19 form actions). `editor/new.astro` builds its own form directly from shadcn `Input`/`Label`/`Button` and has no dependency on these components — no interaction with the editor.
- `src/components/ui/button.tsx` — modified beyond the stock shadcn install: swaps `@radix-ui/react-slot` for the `radix-ui` package's `Slot.Root`, adds `xs`/`icon-xs`/`icon-sm`/`icon-lg` size variants, default variant/size props, `data-variant`/`data-size` attrs. All additive/backward-compatible; the editor's `variant="outline"` default-size usage is unaffected.
- `src/layouts/Layout.astro` — default page title "10x Astro Starter" → "Kratka"; cosmetic only.
- `src/pages/api/auth/signin.ts`, `signup.ts` — `signup.ts` now auto-redirects to `/dashboard` when `signUp` returns a session immediately (email confirmation disabled); unrelated feature request, no interaction with pattern routes.
- `src/pages/auth/confirm-email.astro`, `signin.astro`, `signup.astro` — Topbar placement fix, link colors only.
- `src/pages/index.astro` — adds a signed-in → `/dashboard` redirect (via `Astro.response.status/headers`, not `Astro.redirect()`, to dodge an `astro-eslint-parser`/`no-misused-promises` lint crash — the same workaround is reused in `editor/[id].astro`), plus a `?home` escape hatch so the KRATKA logo always shows the landing page. Matches FR-003; does not affect the dashboard's FR-005 3-pattern-cap logic — the dashboard and editor both link to `/?home` for the "always show landing" behavior, independent of the cap check.
- `src/styles/global.css` — background color changed from a beige gradient to a flat oklch color; cosmetic only.
- `supabase/seed.sql` (new) — inserts one fixed test user into `auth.users`/`auth.identities` for local-dev `db reset` convenience. Does **not** touch `public.patterns` — no interaction with the 3-pattern-cap trigger, slot logic, or pgTAP tests.
- `package.json`/`package-lock.json` — zod addition plus incidental transitive updates; expected side effect.
- `README.md` — housekeeping, unrelated to this review's scope.

## Findings

### F1 — POST /api/patterns cap-exception handling diverges from plan contract

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: src/pages/api/patterns/index.ts (cap-exception branch), vs. plan.md Phase 1 item 3
- **Detail**: The plan's contract says the cap-exception (trigger errcode `KR001`) should return a 4xx surfacing the trigger's hint message. The actual implementation always returns a 302 redirect (matching the form-POST convention `editor/new.astro` and `signup.ts` already use for this route) with a hardcoded string ("You already have 3 patterns...") rather than the trigger's actual `hint` field, and detects the cap condition via `error.message.includes("Pattern slot limit reached")` string-matching instead of checking `error.code === 'KR001'`. It works today, but the plan itself is internally inconsistent (item 3 assumes a JSON API; item 6 specifies form-POST for the same route), and string-matching on an error message is fragile — a wording change in the trigger's raised exception silently breaks cap detection with no test coverage over that path.
- **Fix A ⭐ Recommended**: Keep the redirect-based UX (it's correct and consistent with the rest of the auth/form routes) but harden detection to check `error.code === 'KR001'` instead of message-string matching, and update the plan with a one-line addendum noting the redirect-vs-JSON resolution.
  - Strength: Matches the trigger's actual contract (errcode is stable; message text is not) and requires touching only the exception-handling branch.
  - Tradeoff: Still doesn't surface the trigger's literal hint text to the user — an intentional, disclosed simplification for the redirect UX.
  - Confidence: HIGH — the trigger already raises with a distinct SQLSTATE per the migration; matching on it is a standard Postgres error-handling pattern.
  - Blind spot: Haven't verified whether any other exception path in the same handler also relies on message-string matching.
- **Fix B**: Switch the route to return JSON (per the plan's literal contract) and have `editor/new.astro` submit via fetch instead of a native form-POST.
  - Strength: Makes the implementation match the plan's contract exactly, including the literal hint-message passthrough.
  - Tradeoff: Throws away the working, simpler form-POST-and-redirect pattern this route currently shares with `signup.ts`; larger, riskier change for a plan-wording gap rather than a real defect.
  - Confidence: MEDIUM — no evidence anything downstream needs a JSON response from this specific route.
  - Blind spot: Not verified whether any other consumer expects the redirect behavior.
- **Decision**: FIXED via Fix A — `src/pages/api/patterns/index.ts` now checks `error.code === "KR001"`; plan.md item 3 got a one-line addendum documenting the redirect-vs-JSON resolution.

### F2 — Progress checkbox 2.3 claims hex-input entry that doesn't exist

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/editor-draw-save/plan.md:508 (Progress item 2.3); src/components/editor/PalettePanel.tsx
- **Detail**: Progress item 2.3 reads "Palette build (picker + hex) and 30-color cap enforced — 72d80d5" and is checked `[x]`, but `PalettePanel.tsx` has no hex text input anywhere (confirmed by repo-wide search) — only the native color-picker swatch flow. This is an already-disclosed, accepted-for-MVP scope-down (`change.md`'s 2026-09-04 entry documents it explicitly with a named future-improvement path), so this is a documentation-accuracy gap, not a hidden defect — but the checkbox text itself is currently false and would mislead a future reader who doesn't cross-reference `change.md`.
- **Fix**: Edit Progress item 2.3's text to drop "+ hex" (or annotate it with a pointer to the change.md tradeoff note) so the plan's own checklist doesn't contradict the shipped feature.
- **Decision**: FIXED — plan.md item 2.3 now reads "picker only, no hex input — accepted MVP tradeoff, see change.md 2026-09-04".

### F3 — PATCH error response conflates three distinct failure modes into one generic message

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (reliability/UX)
- **Location**: src/pages/api/patterns/[id].ts (PATCH handler); supabase/migrations/20260830140641_create_patterns_and_names.sql:39-42 (grid CHECK constraint)
- **Detail**: `src/lib/patterns.ts`'s `savePatternSchema` deliberately does not check `grid.length === width*height`, per the plan's contract, deferring to the DB CHECK constraint. But when that CHECK constraint rejects a malformed PATCH body, the handler surfaces it as the same generic `{error: "Pattern not found"}` / 404 used for "not found" and "not yours" (both legitimate RLS-driven 404s by design). A real client bug (wrong grid length) is now indistinguishable from a permissions/existence issue, which will misdirect debugging effort.
- **Fix**: Catch the CHECK-constraint violation distinctly (e.g. by Postgres error code) and return a distinguishable 4xx/message from the RLS-driven not-found case.
- **Decision**: FIXED — PATCH now checks `error.code === "PGRST116"` (RLS-driven not-found, same as GET) vs. any other code (genuine save failure), returning `{error:"Save failed"}` (400) and logging the raw error server-side in the latter case.

### F4 — Unused GET /api/patterns/[id].ts duplicates editor/[id].astro's inline query

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency / Architecture
- **Location**: src/pages/api/patterns/[id].ts (GET handler); src/pages/editor/[id].astro
- **Detail**: No code path in the app calls the GET route — `editor/[id].astro` fetches the pattern server-side via its own inline `select("id,name,width,height,palette,grid")...` query instead. Two independent implementations of the same read path will silently drift if one changes (e.g. a new column) without the other.
- **Fix**: Either delete the unused GET handler, or have `editor/[id].astro` call it instead of duplicating the query.
- **Decision**: FIXED — deleted the unused `GET` handler and its now-unused type imports from `[id].ts`; only `PATCH` remains. `plan.md` item 3 got a one-line addendum recording the removal.

### F5 — Inconsistent error-response shape within [id].ts

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/patterns/[id].ts (validation-failure branch uses `z.treeifyError(...)` object; other branches use plain string messages)
- **Detail**: Not a functional bug — no other JSON API route yet establishes a convention this violates — but worth normalizing before a third JSON route is added to the codebase.
- **Fix**: Adopt one error-envelope shape (e.g. always `{error: string}`) across all branches in this handler.
- **Decision**: FIXED — switched `z.treeifyError(parsed.error)` to `z.prettifyError(parsed.error)`, so the validation branch now returns a plain string `error` like every other branch in the handler.

### F6 — Save failure conflates session expiry with a network blip

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality (reliability)
- **Location**: src/components/hooks/usePatternGrid.ts (`save`, catch block)
- **Detail**: `save()` catches every failed `fetch`/non-OK response identically and always shows "Couldn't save. Check your connection and try again." A 401 from an expired session mid-edit looks exactly like a network blip to the user — but the whole point of `useUnsavedChangesGuard` is protecting unsaved paint work, and a user who trusts the generic message and keeps retrying (or gives up and navigates away, having been reassured it's "just the network") risks losing work to a failure mode the guardrail was specifically built to prevent.
- **Fix**: Branch on `response.status` — on 401, prompt re-authentication (e.g. redirect to sign-in with the pattern id preserved) instead of the generic connectivity message.
- **Decision**: FIXED — `usePatternGrid.ts`'s `save()` now special-cases a 401 response with "Your session expired. Sign in again to save this pattern." before falling through to the generic connectivity message for other failures.

### F7 — `getCoalescedEvents()` called without feature detection

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (reliability)
- **Location**: src/components/editor/PatternEditor.tsx (`handlePointerMove`)
- **Detail**: `nativeEvent.getCoalescedEvents()` is called unconditionally. On a runtime where it's unsupported, this throws inside the pointermove handler, silently breaking painting for the rest of the session with nothing catching it.
- **Fix**: Guard with `typeof nativeEvent.getCoalescedEvents === "function"`, falling back to `[nativeEvent]`.
- **Decision**: FIXED — wrapped in try/catch instead of a `typeof` guard, since TS's DOM types claim the method always exists (a `typeof` check would trip this repo's `no-unnecessary-condition` lint rule); falls back to `[]`/`[nativeEvent]` if it throws.

### F8 — PalettePanel ignores `onAddColor`'s failure signal

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (reliability)
- **Location**: src/components/editor/PalettePanel.tsx (`confirmPendingColor`)
- **Detail**: `onAddColor(pendingColor)` returns `false` on a cap/invalid-hex rejection, but the return value is ignored and `setPendingColor(null)` always runs — so on a hypothetical `false` return, the pending swatch would silently vanish as if it had been added. Currently unreachable (the "+" button is hidden once `atCap` is true), but fragile if that guard ever drifts out of sync with `usePatternGrid`'s own cap check.
- **Fix**: Only clear `pendingColor` when `onAddColor` returns `true`; otherwise surface an error instead of silently discarding the pick.
- **Decision**: SKIPPED — currently unreachable (the "+" button hides at `atCap`); user decided not worth fixing now.

## Automated verification (re-run 2026-09-08)

- `npm run lint` — PASS (0 errors, 0 warnings)
- `npx astro check` — PASS (0 errors, 0 warnings, 4 hints)
- `npm run build` — PASS
- `npx supabase test db` — PASS (27/27 pgTAP assertions)

## Manual verification

All Phase 1 (1.5-1.12) and Phase 2 (2.3-2.8) manual checkboxes are marked `[x]` in the plan. Sub-agent code review found observable evidence in the diff for all of them (DPR guard, gridline/edge-number rendering, Bresenham drag-fill, incremental live counts, save/reopen round-trip, guardrail wiring) **except** item 2.3's "hex" clause, which is not evidenced in the code — see F2.
