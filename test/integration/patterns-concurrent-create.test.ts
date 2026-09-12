import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST } from "@/pages/api/patterns/index.ts";
import { buildAuthenticatedContext } from "./helpers/api-context";
import { cleanupTestUser, createTestUser, countPatternsForUser, type TestUser } from "./helpers/test-user";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

const BASE_URL = "http://localhost/api/patterns";

const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const adminClient = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let user: TestUser;

beforeEach(async () => {
  user = await createTestUser();
});

afterEach(async () => {
  await cleanupTestUser(user.id);
});

/** Issues a real POST /api/patterns for `user`, returning the raw response (no assertions). */
async function post(): Promise<Response> {
  const form = new FormData();
  form.set("width", "20");
  form.set("height", "20");
  const context = await buildAuthenticatedContext(user, { method: "POST", url: BASE_URL, body: form });
  return POST(context);
}

/** Seeds `count` existing live patterns for `user` via the real route (sequential, no race). */
async function seedPatterns(count: number): Promise<void> {
  for (let i = 0; i < count; i++) {
    const response = await post();
    expect(response.status).toBe(302);
  }
}

describe("concurrent pattern creation", () => {
  it("below the cap: both concurrent creates succeed with distinct slots", async () => {
    await seedPatterns(1); // two free slots left

    const [responseA, responseB] = await Promise.all([post(), post()]);

    for (const response of [responseA, responseB]) {
      const location = response.headers.get("Location");
      expect(location).toMatch(/^\/patterns\/[^/?]+$/);
    }

    const { data, error } = await adminClient
      .from("patterns")
      .select("slot, seq, name")
      .eq("user_id", user.id)
      .is("deleted_at", null);
    expect(error).toBeNull();
    expect(data).toHaveLength(3);

    const slots = data?.map((p) => p.slot);
    const seqs = data?.map((p) => p.seq);
    const names = data?.map((p) => p.name);
    expect(new Set(slots).size).toBe(3);
    expect(new Set(seqs).size).toBe(3);
    expect(new Set(names).size).toBe(3);
  });

  it("at the cap: exactly one of two concurrent creates succeeds", async () => {
    await seedPatterns(2); // one free slot left

    const [responseA, responseB] = await Promise.all([post(), post()]);

    const locations = [responseA, responseB].map((r) => r.headers.get("Location") ?? "");
    const succeeded = locations.filter((l) => /^\/patterns\/[^/?]+$/.test(l));
    const failed = locations.filter((l) => l.startsWith("/patterns?error="));

    expect(succeeded).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect(decodeURIComponent(failed[0])).toContain("You already have 3 patterns");

    expect(await countPatternsForUser(user.id)).toBe(3);
  });
});
