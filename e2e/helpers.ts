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
 */
export async function waitForSignInFormHydration(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Show password" }).click();
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("type", "text");
}
