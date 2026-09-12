import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST } from "@/pages/api/patterns/index.ts";
import { PATCH, DELETE } from "@/pages/api/patterns/[id].ts";
import { getPatternForOwner, getPatternListForOwner } from "@/lib/patternQueries";
import { buildAuthenticatedContext, signInTestUser } from "./helpers/api-context";
import { cleanupTestUser, createTestUser, type TestUser } from "./helpers/test-user";

const BASE_URL = "http://localhost/api/patterns";

let user: TestUser;

beforeEach(async () => {
  user = await createTestUser();
});

afterEach(async () => {
  await cleanupTestUser(user.id);
});

/** Creates a pattern via the real POST route, returning its id from the redirect Location. */
async function createPattern(width = 20, height = 20): Promise<string> {
  const form = new FormData();
  form.set("width", String(width));
  form.set("height", String(height));

  const context = await buildAuthenticatedContext(user, { method: "POST", url: BASE_URL, body: form });
  const response = await POST(context);

  expect(response.status).toBe(302);
  const location = response.headers.get("Location");
  if (!location) throw new Error("POST /api/patterns did not redirect with a Location header");

  const match = /^\/patterns\/([^/?]+)$/.exec(location);
  if (!match) throw new Error(`Unexpected create redirect: ${location}`);
  return match[1];
}

async function deletePattern(id: string): Promise<Response> {
  const context = await buildAuthenticatedContext(user, { method: "DELETE", url: `${BASE_URL}/${id}` }, { id });
  return DELETE(context);
}

describe("soft-deleted pattern reachability", () => {
  it("is unreachable via every read/mutation path after delete", async () => {
    // Seed a second live pattern first, so an empty list can't be mistaken for correct filtering.
    const liveId = await createPattern();
    const deletedId = await createPattern();

    const deleteResponse = await deletePattern(deletedId);
    expect(deleteResponse.status).toBe(204);

    const { client } = await signInTestUser(user);

    const viaGetById = await getPatternForOwner(client, deletedId);
    expect(viaGetById).toBeNull();

    const list = await getPatternListForOwner(client);
    expect(list.map((p) => p.id)).not.toContain(deletedId);
    expect(list.map((p) => p.id)).toContain(liveId);

    const patchContext = await buildAuthenticatedContext(
      user,
      {
        method: "PATCH",
        url: `${BASE_URL}/${deletedId}`,
        body: JSON.stringify({ palette: ["#ff0000"], grid: [] }),
        headers: { "Content-Type": "application/json" },
      },
      { id: deletedId },
    );
    const patchResponse = await PATCH(patchContext);
    expect(patchResponse.status).toBe(404);
    await expect(patchResponse.json()).resolves.toEqual({ error: "Pattern not found" });

    // Double-delete: KR002's "already deleted" case, same response as a genuinely missing id.
    const secondDeleteResponse = await deletePattern(deletedId);
    expect(secondDeleteResponse.status).toBe(404);
    await expect(secondDeleteResponse.json()).resolves.toEqual({ error: "Pattern not found" });
  });
});
