import { expect, test } from "@playwright/test";

// Seed exemplar for this project's E2E levers (test-plan.md §4/§7's narrow
// e2e exception). Every generated test is modeled on this file -- what it
// shows is what it gets: role-based locators, one self-contained
// setup/action/assert/cleanup block, waiting for real state (not time),
// and a name tied to the risk it demonstrates (see e2e/CLAUDE.md).
//
// Auth: uses the "chromium" project's storageState (signed in once by
// e2e/auth.setup.ts), per this project's E2E rules -- don't re-drive the
// sign-in UI in ordinary tests.
test("created pattern persists after reloading its editor page", async ({ page }) => {
  await page.goto("/patterns");
  // Each pattern row's own name-link has its accessible name computed from
  // content (unlike the <tr> itself, which doesn't) -- the row's "Print"
  // link always has the literal name "Print", so excluding that isolates
  // the name-links, one per pattern, without knowing any name in advance.
  const nameLinks = page
    .getByRole("table")
    .getByRole("link")
    .filter({ hasNotText: /^Print$/ });
  const namesBefore = await nameLinks.allTextContents();

  await page.getByLabel("Width (20-100)").fill("20");
  await page.getByLabel("Height (20-100)").fill("20");
  await page.getByRole("button", { name: "Create" }).click();

  // POST /api/patterns redirects straight into the new pattern's editor.
  await page.waitForURL(/\/patterns\/[0-9a-f-]{36}$/);
  const editorUrl = page.url();

  // Reload the exact editor URL: print.astro/[id].astro both redirect to
  // /patterns if the pattern can't be found, so staying on this URL after a
  // hard reload is itself proof the row survived.
  await page.reload();
  await expect(page).toHaveURL(editorUrl);

  // Identify the new pattern generically (no hardcoded name assumption) --
  // it's whichever name-link wasn't there before creation.
  await page.goto("/patterns");
  const namesAfter = await nameLinks.allTextContents();
  const newName = namesAfter.find((name) => !namesBefore.includes(name));
  if (!newName) {
    throw new Error("expected exactly one new pattern after creation, found none");
  }

  // Cleanup: delete the pattern this test created. <tr> has no accessible
  // name of its own, so scope the row via the name-link it contains.
  const newRow = page.getByRole("row").filter({ has: page.getByRole("link", { name: newName, exact: true }) });
  await newRow.getByRole("button", { name: "Delete" }).click();
  // The delete is optimistic (row disappears from state before the DELETE
  // request resolves) -- wait for the real response, not just the UI, or
  // the test can finish (and the page/context close) before the server-side
  // delete actually completes, leaving the pattern behind.
  await Promise.all([
    page.waitForResponse((res) => res.request().method() === "DELETE" && res.url().includes("/api/patterns/")),
    page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click(),
  ]);
  await expect(newRow).toBeHidden();
});
