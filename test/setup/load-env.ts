// Vitest setup file (see vitest.config.ts's test.setupFiles). Runs once before
// each test file is imported, so process.env is populated before any module
// (in particular the astro:env/server mock, see astro-env-server.mock.ts)
// reads from it at import time.
//
// .dev.vars already points SUPABASE_URL/SUPABASE_KEY at the local Supabase
// instance for this project (verified: 127.0.0.1) — reused as-is so the app's
// route handlers connect exactly the way they would in `npm run dev`.
// .env.test carries the local-only SUPABASE_SERVICE_ROLE_KEY used solely by
// test/integration/helpers/test-user.ts's admin client; never read by app code.
process.loadEnvFile(new URL("../../.dev.vars", import.meta.url));
process.loadEnvFile(new URL("../../.env.test", import.meta.url));
