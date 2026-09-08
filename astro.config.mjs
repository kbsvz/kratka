// @ts-check
import { defineConfig, envField } from "astro/config";

import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import cloudflare from "@astrojs/cloudflare";

// https://astro.build/config
export default defineConfig({
  output: "server",
  integrations: [react(), sitemap()],
  vite: {
    plugins: [tailwindcss()],
    // Forces every entry point (SSR, client, and the Cloudflare Workers dev
    // module runner) to resolve react/react-dom to one shared instance.
    // Without this, Vite's dev-time dependency pre-bundling can produce two
    // separate copies of react across contexts — React's hooks dispatcher
    // lives in module-scoped state, so a component using one copy while
    // react-dom's internals use the other throws "Invalid hook call" /
    // "Cannot read properties of null (reading 'useState')".
    resolve: {
      dedupe: ["react", "react-dom"],
    },
    // Pre-bundle react/react-dom for SSR up front instead of letting Vite
    // discover them lazily on the first request that needs them. Lazy
    // discovery races the in-flight render against the dep-optimizer
    // swapping the module registry mid-request, which is what was crashing
    // the very first hit to /auth/signin after a cold server start.
    ssr: {
      optimizeDeps: {
        include: ["react", "react-dom", "react-dom/server", "react/jsx-runtime", "react/jsx-dev-runtime"],
      },
    },
  },
  adapter: cloudflare(),
  env: {
    schema: {
      SUPABASE_URL: envField.string({ context: "server", access: "secret", optional: true }),
      SUPABASE_KEY: envField.string({ context: "server", access: "secret", optional: true }),
    },
  },
});
