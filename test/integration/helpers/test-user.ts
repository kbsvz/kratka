import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing — is .env.test present and is local Supabase running (npx supabase start)?",
  );
}

// Service-role client: bypasses RLS, used only to create/delete throwaway
// test users. Never used to read/write pattern data directly — that always
// goes through the route handlers under test, via a real user session.
const adminClient = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export interface TestUser {
  id: string;
  email: string;
  password: string;
}

/** Creates a throwaway, pre-confirmed user for one test. Unique per call. */
export async function createTestUser(): Promise<TestUser> {
  const email = `test-${randomUUID()}@example.test`;
  const password = randomUUID();

  const { data, error } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) {
    throw new Error(`Failed to create test user: ${error.message}`);
  }

  return { id: data.user.id, email, password };
}

/** Deletes the test user; `patterns.user_id` cascades (see migration FK). */
export async function cleanupTestUser(userId: string): Promise<void> {
  const { error } = await adminClient.auth.admin.deleteUser(userId);
  if (error) {
    throw new Error(`Failed to clean up test user ${userId}: ${error.message}`);
  }
}

/** Counts live (non-deleted) patterns owned by a user — used to prove cleanup actually ran. */
export async function countPatternsForUser(userId: string): Promise<number> {
  const { count, error } = await adminClient
    .from("patterns")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("deleted_at", null);
  if (error) {
    throw new Error(`Failed to count patterns for ${userId}: ${error.message}`);
  }
  return count ?? 0;
}
