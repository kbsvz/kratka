import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST } from "@/pages/api/patterns/index.ts";
import { PATCH } from "@/pages/api/patterns/[id].ts";
import { buildAuthenticatedContext, signInTestUser } from "./helpers/api-context";
import { cleanupTestUser, countPatternsForUser, createTestUser, type TestUser } from "./helpers/test-user";

const BASE_URL = "http://localhost/api/patterns";

let user: TestUser;

beforeEach(async () => {
  user = await createTestUser();
});

afterEach(async () => {
  await cleanupTestUser(user.id);
  // Proves cleanup actually removed the user's patterns, not just the user row.
  expect(await countPatternsForUser(user.id)).toBe(0);
});

/** Creates a pattern via the real POST route, returning its id from the redirect Location. */
async function createPattern(width: number, height: number): Promise<string> {
  const form = new FormData();
  form.set("width", String(width));
  form.set("height", String(height));

  const context = await buildAuthenticatedContext(user, { method: "POST", url: BASE_URL, body: form });
  const response = await POST(context);

  expect(response.status).toBe(302);
  const location = response.headers.get("Location");
  if (!location) throw new Error("POST /api/patterns did not redirect with a Location header");

  // Location is "/patterns/<id>" on success, "/patterns?error=..." on failure.
  const match = /^\/patterns\/([^/?]+)$/.exec(location);
  if (!match) throw new Error(`Unexpected create redirect: ${location}`);
  return match[1];
}

async function savePattern(id: string, palette: string[], grid: number[]): Promise<Response> {
  const context = await buildAuthenticatedContext(
    user,
    {
      method: "PATCH",
      url: `${BASE_URL}/${id}`,
      body: JSON.stringify({ palette, grid }),
      headers: { "Content-Type": "application/json" },
    },
    { id },
  );
  return PATCH(context);
}

describe("pattern save/reload round-trip", () => {
  it("reopens with the exact grid, palette, and dimensions that were saved", async () => {
    const width = 20;
    const height = 20;
    const id = await createPattern(width, height);

    // Independently-constructed input — deterministic, not derived from any
    // save/estimator output. Palette has 3 colors; grid uses values 0-3,
    // where 3 === palette.length is the highest legal boundary value.
    const palette = ["#ff0000", "#00ff00", "#0000ff"];
    const grid = Array.from({ length: width * height }, (_, i) => i % 4);

    const saveResponse = await savePattern(id, palette, grid);
    expect(saveResponse.status).toBe(204);

    // Same query src/pages/patterns/[id].astro:20-26 uses on reload.
    const { client } = await signInTestUser(user);
    const { data, error } = await client
      .from("patterns")
      .select("id, name, width, height, palette, grid")
      .eq("id", id)
      .single();

    expect(error).toBeNull();
    expect(data?.palette).toEqual(palette);
    expect(data?.grid).toEqual(grid);
    expect(data?.width).toBe(width);
    expect(data?.height).toBe(height);
  });

  it("keeps dimensions unchanged after a save, since save only sends palette/grid", async () => {
    const width = 25;
    const height = 30;
    const id = await createPattern(width, height);

    const palette = ["#123456"];
    const grid = Array.from({ length: width * height }, () => 1);
    const saveResponse = await savePattern(id, palette, grid);
    expect(saveResponse.status).toBe(204);

    const { client } = await signInTestUser(user);
    const { data } = await client.from("patterns").select("width, height").eq("id", id).single();

    expect(data?.width).toBe(width);
    expect(data?.height).toBe(height);
  });
});
