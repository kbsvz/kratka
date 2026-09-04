import type { Database } from "@/lib/database.types";

/** A hex colour in a pattern's palette, e.g. `#ff00aa`. */
export type PaletteColor = string;

/** A pattern's palette, capped at 30 entries by a CHECK constraint (FR-007). */
export type PatternPalette = PaletteColor[];

/**
 * Cell values, row-major, one palette index per cell (0 = empty).
 *
 * Either empty or exactly `width * height` long — a CHECK constraint makes any
 * other length unstorable. An empty array means "created but never saved", so
 * readers must treat it as an all-empty grid rather than indexing into it.
 */
export type PatternGrid = number[];

/** A stored pattern, exactly as the database holds it. */
export type Pattern = Database["public"]["Tables"]["patterns"]["Row"];

/**
 * What a caller supplies to create a pattern.
 *
 * Deliberately narrower than the generated insert shape, which marks `name`,
 * `seq` and `slot` as required because they are NOT NULL with no column default
 * — the generator cannot see that a BEFORE INSERT trigger derives all three.
 * Supplying them is not merely unnecessary: the trigger discards them (FR-006).
 */
export type PatternCreate = Pick<Pattern, "user_id" | "width" | "height">;

/**
 * What a caller may change on an existing pattern.
 *
 * Far narrower than the columns suggest: `name`, `seq`, `slot`, `user_id` and
 * `created_at` are all pinned by a BEFORE UPDATE trigger, and `deleted_at` is
 * unreachable from the client entirely — deletion goes through the
 * `soft_delete_pattern` RPC (FR-013).
 */
export type PatternUpdate = Partial<Pick<Pattern, "palette" | "grid">>;

/** The columns FR-011's pattern list renders. */
export type PatternListItem = Pick<Pattern, "id" | "name" | "width" | "height" | "updated_at">;

/**
 * The columns the editor loads on reopen and writes back on Save (FR-012).
 *
 * `palette`/`grid` are narrowed from `Pattern`'s generated `Json` columns to
 * their domain types — the generated `Row` shape can't express the
 * CHECK-constrained structure those columns actually hold.
 */
export type PatternEditorData = Pick<Pattern, "id" | "name" | "width" | "height"> & {
  palette: PatternPalette;
  grid: PatternGrid;
};
