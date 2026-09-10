import type { PatternGrid, PatternPalette } from "@/types";

/** Business Logic constants (PRD, fixed defaults, not user-configurable). */
const CM_PER_STITCH = 45;
const STITCHES_PER_HOUR = 150;

export interface PatternColorEstimate {
  hex: string;
  cellCount: number;
  threadCm: number;
}

export interface PatternEstimate {
  colors: PatternColorEstimate[];
  totalFilledCells: number;
  totalHours: number;
}

/**
 * Computes per-color thread length and total completion time from a pattern's
 * grid and palette. An empty `grid` (never-painted sentinel) yields zero
 * counts for every color rather than throwing.
 */
export function estimatePattern(grid: PatternGrid, palette: PatternPalette): PatternEstimate {
  const cellCounts: number[] = Array.from({ length: palette.length }, () => 0);
  for (const value of grid) {
    if (value === 0) continue;
    cellCounts[value - 1] = (cellCounts[value - 1] ?? 0) + 1;
  }

  const colors = palette
    .map((hex, i) => ({
      hex,
      cellCount: cellCounts[i] ?? 0,
      threadCm: (cellCounts[i] ?? 0) * CM_PER_STITCH,
    }))
    .filter((color) => color.cellCount > 0);

  const totalFilledCells = cellCounts.reduce((sum: number, count: number) => sum + count, 0);
  const totalHours = totalFilledCells / STITCHES_PER_HOUR;

  return { colors, totalFilledCells, totalHours };
}
