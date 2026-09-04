import { z } from "zod";

/** FR-004: grid dimensions, 20-100 per side. */
export const createPatternSchema = z.object({
  width: z.coerce.number().int().min(20).max(100),
  height: z.coerce.number().int().min(20).max(100),
});

const hexColor = z.string().regex(/^#[0-9a-f]{6}$/i, "must be a 6-digit hex color");

/**
 * FR-007/FR-008/FR-009: palette + grid, as saved on every Save.
 *
 * The grid-length-matches-width×height invariant is enforced by the DB CHECK
 * constraint (patterns_grid_length), not here — this schema validates shape
 * and range, which is what a non-conforming client can get wrong.
 */
export const savePatternSchema = z
  .object({
    palette: z.array(hexColor).max(30),
    grid: z.array(z.number().int().min(0)),
  })
  .refine((data) => data.grid.every((value) => value <= data.palette.length), {
    message: "grid contains a palette index with no matching palette color",
    path: ["grid"],
  });
