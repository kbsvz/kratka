import { defineConfig, devices } from "@playwright/test";

// One critical-path smoke test (sign-in -> open pattern -> print), per
// test-plan.md §4/§7's narrow exception to the no-broad-e2e stance
// (test-plan-refresh-2026-09-13). Runs against `astro dev` (Node/Vite +
// Cloudflare env shims), not the built wrangler/workerd runtime — sufficient
// to exercise real SSR routes and Supabase calls without the extra build +
// wrangler-secret complexity a single smoke test doesn't need.
export default defineConfig({
  testDir: "./e2e",
  // All specs share one local Supabase instance and one seeded test user
  // (test/setup/load-env.ts's SUPABASE_SERVICE_ROLE_KEY is out of scope here --
  // this is the browser-driven auth path). Running spec files in parallel
  // would race on that single account, the same reason vitest.config.ts sets
  // fileParallelism: false for the integration suite.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html"]],
  use: {
    baseURL: "http://localhost:4321",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "setup",
      testMatch: /.*\.setup\.ts/,
    },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: "playwright/.auth/user.json" },
      dependencies: ["setup"],
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:4321",
    reuseExistingServer: !process.env.CI,
  },
});
