import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST } from "@/pages/api/patterns/index.ts";
import { PATCH } from "@/pages/api/patterns/[id].ts";
import { getPatternForOwner } from "@/lib/patternQueries";
import { buildAuthenticatedContext, signInTestUser, PATTERNS_API_BASE_URL as BASE_URL } from "./helpers/api-context";
import { cleanupTestUser, countPatternsForUser, createTestUser, type TestUser } from "./helpers/test-user";

const WIDTH = 20;
const HEIGHT = 20;

let user: TestUser;

beforeEach(async () => {
  user = await createTestUser();
});

afterEach(async () => {
  await cleanupTestUser(user.id);
});

async function createPatternRequest(width: number, height: number): Promise<Response> {
  const form = new FormData();
  form.set("width", String(width));
  form.set("height", String(height));
  const context = await buildAuthenticatedContext(user, { method: "POST", url: BASE_URL, body: form });
  return POST(context);
}

/** Creates a valid pattern via the real POST route, returning its id from the redirect Location. */
async function createPattern(): Promise<string> {
  const response = await createPatternRequest(WIDTH, HEIGHT);
  expect(response.status).toBe(302);
  const location = response.headers.get("Location");
  const match = location ? /^\/patterns\/([^/?]+)$/.exec(location) : null;
  if (!match) throw new Error(`Unexpected create redirect: ${location}`);
  return match[1];
}

async function savePattern(id: string, body: unknown): Promise<Response> {
  const context = await buildAuthenticatedContext(
    user,
    {
      method: "PATCH",
      url: `${BASE_URL}/${id}`,
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    },
    { id },
  );
  return PATCH(context);
}

describe("input-bounds rejection at the HTTP layer", () => {
  it("rejects width below the minimum, creating no pattern", async () => {
    const response = await createPatternRequest(19, HEIGHT);

    expect(response.status).toBe(302);
    const location = response.headers.get("Location") ?? "";
    expect(location).toMatch(/^\/patterns\?error=/);
    expect(decodeURIComponent(location)).toContain("Width and height must be between 20 and 100.");
    expect(await countPatternsForUser(user.id)).toBe(0);
  });

  it("rejects height above the maximum, creating no pattern", async () => {
    const response = await createPatternRequest(WIDTH, 101);

    expect(response.status).toBe(302);
    const location = response.headers.get("Location") ?? "";
    expect(location).toMatch(/^\/patterns\?error=/);
    expect(decodeURIComponent(location)).toContain("Width and height must be between 20 and 100.");
    expect(await countPatternsForUser(user.id)).toBe(0);
  });

  it("rejects a palette over 30 entries, leaving the stored palette unchanged", async () => {
    const id = await createPattern();
    const validPalette = ["#ff0000"];
    const validGrid = Array.from({ length: WIDTH * HEIGHT }, () => 1);
    const firstSave = await savePattern(id, { palette: validPalette, grid: validGrid });
    expect(firstSave.status).toBe(204);

    const oversizedPalette = Array.from({ length: 31 }, (_, i) => `#${i.toString(16).padStart(6, "0")}`);
    const response = await savePattern(id, { palette: oversizedPalette, grid: validGrid });

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBeTruthy();

    const { client } = await signInTestUser(user);
    const stored = await getPatternForOwner(client, id);
    expect(stored?.palette).toEqual(validPalette);
  });

  it("rejects a grid value indexing past the palette length", async () => {
    const id = await createPattern();
    const palette = ["#ff0000", "#00ff00"];
    const grid = Array.from({ length: WIDTH * HEIGHT }, () => 5); // 5 > palette.length (2)

    const response = await savePattern(id, { palette, grid });

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBeTruthy();
  });

  it("rejects a grid whose length doesn't equal width * height, via the DB CHECK-constraint fallback", async () => {
    const id = await createPattern();
    const palette = ["#ff0000"];
    const wrongLengthGrid = Array.from({ length: WIDTH * HEIGHT - 1 }, () => 1);

    const response = await savePattern(id, { palette, grid: wrongLengthGrid });

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBeTruthy();
  });
});
