import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";
import { savePatternSchema } from "@/lib/patterns";
import type { PatternEditorData, PatternGrid, PatternPalette } from "@/types";

export const prerender = false;

export const GET: APIRoute = async (context) => {
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

  const { data, error } = await supabase
    .from("patterns")
    .select("id, name, width, height, palette, grid")
    .eq("id", id)
    .single();

  // RLS hides rows the caller doesn't own, so "not found" and "not owned"
  // are indistinguishable here by design — same as soft_delete_pattern's RPC.
  // .single() never resolves {data: null, error: null}, so checking error
  // alone is enough for TS to narrow `data` to non-null below.
  if (error) {
    return new Response(JSON.stringify({ error: "Pattern not found" }), { status: 404 });
  }

  const pattern: PatternEditorData = {
    ...data,
    palette: data.palette as unknown as PatternPalette,
    grid: data.grid as unknown as PatternGrid,
  };

  return new Response(JSON.stringify(pattern), { status: 200 });
};

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
    return new Response(JSON.stringify({ error: z.treeifyError(parsed.error) }), { status: 400 });
  }

  const { error } = await supabase
    .from("patterns")
    .update({ palette: parsed.data.palette, grid: parsed.data.grid })
    .eq("id", id)
    .select("id")
    .single();

  if (error) {
    return new Response(JSON.stringify({ error: "Pattern not found" }), { status: 404 });
  }

  return new Response(null, { status: 204 });
};
