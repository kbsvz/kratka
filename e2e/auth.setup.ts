import { expect, test as setup } from "@playwright/test";
import { waitForSignInFormHydration } from "./helpers";

// Playwright's recommended auth pattern: sign in once via the real UI, save
// the resulting cookies, and let ordinary specs reuse that storageState
// instead of re-driving the sign-in form every test (Playwright docs:
// "Use storageState for authentication"). The one exception is the
// critical-path smoke test itself (e2e/critical-path.spec.ts), which
// deliberately does NOT use this project's storageState -- signing in is
// literally the first step of the risk it protects.
const authFile = "playwright/.auth/user.json";

setup("authenticate as the seeded test user", async ({ page }) => {
  await setup.step("load sign-in form", async () => {
    await page.goto("/auth/signin");
    await waitForSignInFormHydration(page);
  });

  await setup.step("submit credentials", async () => {
    // exact: true -- the password field's "Show password" toggle button has
    // an aria-label containing "password" as a substring, which a
    // non-exact getByLabel("Password") also matches (strict-mode violation).
    await page.getByLabel("Email", { exact: true }).fill("test@example.com");
    await page.getByLabel("Password", { exact: true }).fill("password123");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("**/patterns");
    await expect(page.getByRole("link", { name: "Print" }).first()).toBeVisible();
  });

  await setup.step("save storage state", async () => {
    await page.context().storageState({ path: authFile });
  });
});
