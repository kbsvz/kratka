import path from "node:path";
import { defineConfig } from "vitest/config";

// NOTE: astro/config's getViteConfig() was tried first (matching the plan's primary
// approach) but fails at collection time — the @astrojs/cloudflare adapter's
// getViteConfig pulls in the Workers runtime (workerd), which throws
// "ReferenceError: exports is not defined" outside an actual Worker context.
// This is the fallback the plan's Open Risks anticipated: a plain config with a
// manual alias, matching tsconfig.json's "@/*" -> "./src/*" mapping.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // See test/setup/astro-env-server.mock.ts for why this is aliased rather
      // than resolved for real.
      "astro:env/server": path.resolve(__dirname, "./test/setup/astro-env-server.mock.ts"),
    },
  },
  test: {
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    setupFiles: ["./test/setup/load-env.ts"],
    // All integration files share one local Postgres, and some tests race
    // concurrent requests by construction — cross-file parallelism would
    // make those runs collide with unrelated tests' data.
    fileParallelism: false,
  },
});
