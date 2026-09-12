import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST } from "@/pages/api/patterns/index.ts";
import { PATCH, DELETE } from "@/pages/api/patterns/[id].ts";
import { getPatternForOwner } from "@/lib/patternQueries";
import { buildAuthenticatedContext, signInTestUser } from "./helpers/api-context";
import { cleanupTestUser, createTestUser, type TestUser } from "./helpers/test-user";

const BASE_URL = "http://localhost/api/patterns";

let userA: TestUser;
let userB: TestUser;

beforeEach(async () => {
  userA = await createTestUser();
  userB = await createTestUser();
});

afterEach(async () => {
  await cleanupTestUser(userA.id);
  await cleanupTestUser(userB.id);
});

/** Creates a pattern via the real POST route as `owner`, returning its id from the redirect Location. */
async function createPattern(owner: TestUser, width = 20, height = 20): Promise<string> {
  const form = new FormData();
  form.set("width", String(width));
  form.set("height", String(height));

  const context = await buildAuthenticatedContext(owner, { method: "POST", url: BASE_URL, body: form });
  const response = await POST(context);

  expect(response.status).toBe(302);
  const location = response.headers.get("Location");
  if (!location) throw new Error("POST /api/patterns did not redirect with a Location header");

  const match = /^\/patterns\/([^/?]+)$/.exec(location);
  if (!match) throw new Error(`Unexpected create redirect: ${location}`);
  return match[1];
}

describe("cross-user pattern access", () => {
  it("PATCH as a non-owner 404s and leaves the pattern unchanged", async () => {
    const patternId = await createPattern(userA);

    const context = await buildAuthenticatedContext(
      userB,
      {
        method: "PATCH",
        url: `${BASE_URL}/${patternId}`,
        body: JSON.stringify({ palette: ["#ff0000"], grid: [] }),
        headers: { "Content-Type": "application/json" },
      },
      { id: patternId },
    );
    const response = await PATCH(context);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Pattern not found" });

    const { client: clientA } = await signInTestUser(userA);
    const stillOwned = await getPatternForOwner(clientA, patternId);
    expect(stillOwned).not.toBeNull();
    expect(stillOwned?.palette).toEqual([]);
  });

  it("DELETE as a non-owner 404s and leaves the pattern live", async () => {
    const patternId = await createPattern(userA);

    const context = await buildAuthenticatedContext(
      userB,
      { method: "DELETE", url: `${BASE_URL}/${patternId}` },
      {
        id: patternId,
      },
    );
    const response = await DELETE(context);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Pattern not found" });

    const { client: clientA } = await signInTestUser(userA);
    const stillLive = await getPatternForOwner(clientA, patternId);
    expect(stillLive).not.toBeNull();
  });

  it("getPatternForOwner returns null for a non-owner", async () => {
    const patternId = await createPattern(userA);

    const { client: clientB } = await signInTestUser(userB);
    const result = await getPatternForOwner(clientB, patternId);

    expect(result).toBeNull();
  });
});
