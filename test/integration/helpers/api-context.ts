import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { APIContext } from "astro";
import type { Database } from "@/lib/database.types";
import type { TestUser } from "./test-user";

const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SUPABASE_KEY = process.env.SUPABASE_KEY ?? "";

/**
 * Signs in as `user` through the same @supabase/ssr cookie-writing mechanism
 * the app uses (src/lib/supabase.ts's createClient), capturing the resulting
 * session into an in-memory cookie jar. This is what lets a Supabase client
 * built from the replayed Cookie header (either the route handler's own, or
 * this function's returned `client`, used to mirror [id].astro's reload
 * query) resolve `auth.uid()` as this real user under RLS — a plain
 * `locals.user` object would satisfy a route's `if (!user)` guard but NOT
 * real RLS policies, since those depend on the Postgres session's JWT, not a
 * test's in-memory object.
 */
export async function signInTestUser(
  user: TestUser,
): Promise<{ client: SupabaseClient<Database>; cookieHeader: string }> {
  const jar = new Map<string, string>();

  const client = createServerClient<Database>(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll: () => Array.from(jar, ([name, value]) => ({ name, value })),
      setAll: (cookies) => {
        cookies.forEach(({ name, value }) => jar.set(name, value));
      },
    },
  });

  const { error } = await client.auth.signInWithPassword({ email: user.email, password: user.password });
  if (error) {
    throw new Error(`Test sign-in failed for ${user.email}: ${error.message}`);
  }

  const cookieHeader = Array.from(jar, ([name, value]) => `${name}=${value}`).join("; ");
  return { client, cookieHeader };
}

interface BuildRequestInit {
  method: string;
  url: string;
  body?: BodyInit;
  headers?: Record<string, string>;
}

/**
 * Builds a real Request carrying the signed-in user's session cookie, plus a
 * minimal APIContext wrapping it — enough for the route handlers under test
 * (src/pages/api/patterns/index.ts, [id].ts), which only read
 * context.request / context.locals.user / context.params / context.cookies /
 * context.redirect.
 */
export async function buildAuthenticatedContext(
  user: TestUser,
  init: BuildRequestInit,
  params: Record<string, string> = {},
): Promise<APIContext> {
  const { cookieHeader } = await signInTestUser(user);

  const request = new Request(init.url, {
    method: init.method,
    body: init.body,
    headers: { ...init.headers, Cookie: cookieHeader },
  });

  const context = {
    request,
    params,
    locals: { user: { id: user.id, email: user.email } },
    cookies: {
      // Only `.set()` is ever called (by src/lib/supabase.ts's createClient,
      // when Supabase refreshes the session) — the other AstroCookies methods
      // are unused by the routes under test.
      set: () => undefined,
      get: () => undefined,
      has: () => false,
      delete: () => undefined,
      merge: () => undefined,
      headers: () => [],
    },
    redirect: (path: string, status = 302) => new Response(null, { status, headers: { Location: path } }),
  };

  return context as unknown as APIContext;
}
