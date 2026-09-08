import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";
import { savePatternSchema } from "@/lib/patterns";

export const prerender = false;

export const PATCH: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) {
    return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401 });
  }

  const id = context.params.id;
  if (!id) {
    return new Response(JSON.stringify({ error: "Pattern not found" }), { status: 404 });
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return new Response(JSON.stringify({ error: "Supabase is not configured" }), { status: 500 });
  }

  const json: unknown = await context.request.json().catch(() => null);
  const parsed = savePatternSchema.safeParse(json);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: z.prettifyError(parsed.error) }), { status: 400 });
  }

  const { error } = await supabase
    .from("patterns")
    .update({ palette: parsed.data.palette, grid: parsed.data.grid })
    .eq("id", id)
    .select("id")
    .single();

  if (error) {
    // PGRST116 ("no rows returned") is RLS hiding a not-found/not-owned
    // pattern, by design — same as soft_delete_pattern's RPC. Any other code
    // (e.g. 23514 from the patterns_grid_length CHECK constraint) is a
    // genuine save failure, not a missing pattern — surface and log it
    // distinctly instead of returning a misleading 404.
    if (error.code === "PGRST116") {
      return new Response(JSON.stringify({ error: "Pattern not found" }), { status: 404 });
    }
    // eslint-disable-next-line no-console -- intentional server-side log for an unexpected save failure
    console.error("Failed to save pattern", { patternId: id, error });
    return new Response(JSON.stringify({ error: "Save failed" }), { status: 400 });
  }

  return new Response(null, { status: 204 });
};
