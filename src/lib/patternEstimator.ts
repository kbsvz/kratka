import type { PatternGrid, PatternPalette } from "@/types";

/** Business Logic constants (fixed defaults, not user-configurable). */
const MM_PER_STITCH = 7;
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
    if (value === 0 || value > palette.length) continue;
    cellCounts[value - 1] = (cellCounts[value - 1] ?? 0) + 1;
  }

  const colors = palette
    .map((hex, i) => {
      const cellCount = cellCounts[i] ?? 0;
      const threadMm = MM_PER_STITCH * cellCount;
      return { hex, cellCount, threadCm: threadMm / 10 };
    })
    .filter((color) => color.cellCount > 0);

  const totalFilledCells = cellCounts.reduce((sum: number, count: number) => sum + count, 0);
  const totalHours = totalFilledCells / STITCHES_PER_HOUR;

  return { colors, totalFilledCells, totalHours };
}

/** Formats a decimal hours value as a human-readable duration, e.g. `1h 15min`. */
export function formatDuration(hours: number): string {
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}min`;
}
