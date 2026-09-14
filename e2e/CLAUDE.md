# E2E Testing Rules

Read before generating or editing any file in this directory. Modeled after
`seed.spec.ts` — that file is the canonical example; these rules are why it
looks the way it does.

- Use `getByRole`, `getByLabel`, `getByText` as primary locators. Fall back to
  `getByTestId` only when accessibility attributes are ambiguous.
- Never use CSS selectors, XPath, or DOM structure for locating elements.
- Each test must be independently runnable — no shared state between tests.
- Never use `page.waitForTimeout()`. Wait for specific conditions:
  `toBeVisible()`, `waitForURL()`, `waitForResponse()`.
- Assert the business outcome, not implementation details.
- Use unique identifiers (e.g., timestamp suffix) for test data to avoid
  collisions across runs. Clean up what you create.
- Use `storageState` for authentication — never log in through the UI in an
  individual test — **except** a test whose own risk is the sign-in flow
  itself (e.g. `critical-path.spec.ts`), where driving the sign-in UI is the
  thing under test, not a precondition to skip.

## Project-specific

- All specs share one local Supabase instance and one seeded test user
  (`test@example.com`) — this is why `playwright.config.ts` sets
  `fullyParallel: false` / `workers: 1`. Don't re-enable parallelism without
  also solving per-test data isolation (e.g. per-test users, mirroring
  `test/integration/helpers/test-user.ts`'s approach for the vitest suite).
- The 3-pattern cap (FR-005/FR-006) means any test that creates a pattern
  must delete it before finishing, or a re-run will eventually hit the cap.
- `supabase/seed.sql` seeds exactly one fixture pattern
  ("My Very First Pattern", slot 1) for the critical-path smoke test to open —
  don't delete it in other tests.
- Any React `client:load` island (the sign-in form, the pattern list/editor)
  hydrates asynchronously after SSR HTML loads. Filling/clicking a field
  before hydration attaches can be silently overwritten once React mounts
  with its initial state (observed as an intermittent flake on the sign-in
  form). Call `waitForSignInFormHydration(page)` from `./helpers` right after
  `page.goto("/auth/signin")`, before touching any field on that page.
  `<tr>` rows also have no accessible name of their own (unlike `link`/
  `button`) — scope a row via `.filter({ has: ... })` on something inside it
  that does, not `getByRole('row', { name })` directly (see `seed.spec.ts`).

## Why these rules (source authority)

Every rule traces to Playwright's official Best Practices and Test Assertions
docs: `getByRole` is the recommended default locator strategy; each test must
be completely isolated with its own storage, data, cookies; web-first
assertions wait until conditions are met (`waitForTimeout` is an official
anti-pattern); `storageState` is the standard pattern for authenticated tests.
