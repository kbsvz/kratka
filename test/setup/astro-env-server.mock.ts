// Stands in for the "astro:env/server" virtual module, which only exists
// inside Astro's own Vite pipeline and can't be resolved by plain Vitest
// (confirmed: Vitest can't use astro/config's getViteConfig here because the
// @astrojs/cloudflare adapter's config pulls in the Workers runtime, see
// vitest.config.ts's comment). Aliased in vitest.config.ts's resolve.alias so
// src/lib/supabase.ts's `import { SUPABASE_URL, SUPABASE_KEY } from
// "astro:env/server"` resolves here instead, reading the same values from
// process.env that test/setup/load-env.ts populated from .dev.vars.
export const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
export const SUPABASE_KEY = process.env.SUPABASE_KEY ?? "";
