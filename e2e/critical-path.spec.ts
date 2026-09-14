import { expect, test } from "@playwright/test";
import { waitForSignInFormHydration } from "./helpers";

// Critical-path smoke test -- test-plan.md §3 Phase 3 / §4 / §7's narrow,
// explicit exception to the no-broad-e2e stance (decided during the
// test-plan-refresh-2026-09-13 refresh): sign-in -> open pattern -> print.
// Deliberately does NOT use the "chromium" project's storageState --
// signing in via the real UI is the first step of the risk this test
// protects, not a precondition to skip (see e2e/CLAUDE.md).
test.use({ storageState: { cookies: [], origins: [] } });

test("signed-in user can open a pattern and reach a chrome-free print view", async ({ page }) => {
  await test.step("sign in", async () => {
    await page.goto("/auth/signin");
    await waitForSignInFormHydration(page);
    await page.getByLabel("Email", { exact: true }).fill("test@example.com");
    await page.getByLabel("Password", { exact: true }).fill("password123");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("**/patterns");
  });

  await test.step("open the fixture pattern", async () => {
    // Opens the fixture pattern seeded for this test (supabase/seed.sql).
    // The name is deterministic, not incidental: patterns_before_insert's
    // pick_pattern_name always assigns "My Very First Pattern" to a fresh
    // user's first pattern (seq=1) -- see the naming trigger in
    // supabase/migrations/20260830140641_create_patterns_and_names.sql.
    await page.getByRole("link", { name: "My Very First Pattern", exact: true }).click();
    await page.waitForURL(/\/patterns\/[0-9a-f-]{36}$/);
  });

  await test.step("reach the chrome-free print view", async () => {
    await page.getByRole("link", { name: "Print" }).click();
    await page.waitForURL(/\/patterns\/[0-9a-f-]{36}\/print$/);

    // Chrome-free: the grid/legend render, but no app nav/toolbar does (Risk
    // #7). "Sign out" only exists in AppHeader, which print.astro never
    // composes -- its absence here proves the structural exclusion actually
    // holds on a real rendered page, not just in print.astro's source text
    // (that's the separate deterministic check's job, print.test.ts).
    await expect(page.getByRole("heading", { name: "My Very First Pattern" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Print" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign out" })).not.toBeVisible();
  });
});
