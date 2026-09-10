import type { APIRoute } from "astro";
import type { Database } from "@/lib/database.types";
import { createClient } from "@/lib/supabase";
import { createPatternSchema } from "@/lib/patterns";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) {
    return context.redirect("/auth/signin");
  }

  const form = await context.request.formData();
  const parsed = createPatternSchema.safeParse({
    width: form.get("width"),
    height: form.get("height"),
  });
  if (!parsed.success) {
    return context.redirect(`/patterns?error=${encodeURIComponent("Width and height must be between 20 and 100.")}`);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/patterns?error=${encodeURIComponent("Supabase is not configured")}`);
  }

  // name/seq/slot are required by the generated Insert type but are always
  // overwritten by the patterns_before_insert trigger (see src/types.ts's
  // PatternCreate comment) — supplying them here would be discarded anyway.
  const { data, error } = await supabase
    .from("patterns")
    .insert({
      user_id: user.id,
      width: parsed.data.width,
      height: parsed.data.height,
    } as Database["public"]["Tables"]["patterns"]["Insert"])
    .select("id")
    .single();

  if (error) {
    // KR001 is the patterns_before_insert trigger's 3-pattern-cap exception
    // (migration 20260830140641, patterns_before_insert) — matching on the
    // stable error code rather than the message text so a wording change to
    // the trigger's RAISE EXCEPTION can't silently break cap detection.
    const message =
      error.code === "KR001" ? "You already have 3 patterns. Delete one to create another." : error.message;
    return context.redirect(`/patterns?error=${encodeURIComponent(message)}`);
  }

  return context.redirect(`/editor/${data.id}`);
};
