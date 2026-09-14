import { expect, type Page } from "@playwright/test";

/**
 * SignInForm is a `client:load` React island: the SSR HTML renders
 * immediately, but its inputs aren't "controlled" until React hydrates and
 * attaches. Filling a field before that happens gets silently overwritten
 * once hydration mounts with the component's initial (empty) state --
 * observed as an intermittent flake where the email field goes empty, timed
 * exactly around the second field being filled. Toggling password
 * visibility and confirming the input's `type` attribute actually changed
 * is a functional proof a real onClick handler is attached, i.e. hydration
 * is done -- not an arbitrary wait.
 *
 * The click itself races the same hydration gap it's proving: Playwright's
 * actionability checks (visible/enabled/stable) pass on the SSR-rendered
 * button before React attaches its handler, so a click that lands too early
 * is silently swallowed. `toPass` retries the click+assert as one unit so a
 * swallowed click gets clicked again, instead of leaking a "flaky" (fail
 * then pass) result out to the whole test's retry.
 */
export async function waitForSignInFormHydration(page: Page): Promise<void> {
  const passwordInput = page.getByLabel("Password", { exact: true });
  const showPasswordButton = page.getByRole("button", { name: "Show password" });
  await expect(async () => {
    await showPasswordButton.click();
    await expect(passwordInput).toHaveAttribute("type", "text", { timeout: 500 });
  }).toPass({ timeout: 10_000 });
}
