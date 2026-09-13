import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { PatternEditorData, PatternGrid, PatternListItem, PatternPalette } from "@/types";

/**
 * Fetches a single pattern for the editor/print views. RLS scopes this to
 * the caller's own live rows, so a cross-owner id and a nonexistent id are
 * indistinguishable — both resolve to `null` (FR-012's reopen contract).
 */
export async function getPatternForOwner(
  supabase: SupabaseClient<Database>,
  id: string,
): Promise<PatternEditorData | null> {
  const { data } = await supabase
    .from("patterns")
    .select("id, name, width, height, palette, grid")
    .eq("id", id)
    .single();

  return data
    ? {
        ...data,
        palette: data.palette as unknown as PatternPalette,
        grid: data.grid as unknown as PatternGrid,
      }
    : null;
}

/** Fetches the caller's pattern list (FR-011). RLS scopes this to the caller's own live rows. */
export async function getPatternListForOwner(supabase: SupabaseClient<Database>): Promise<PatternListItem[]> {
  const { data } = await supabase
    .from("patterns")
    .select("id, name, width, height, updated_at")
    .order("updated_at", { ascending: false });

  return data ?? [];
}
