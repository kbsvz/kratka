import { useCallback, useState, useRef } from "react";
import type { PatternEditorData } from "@/types";

/** FR-007: palette is capped at 30 entries — also enforced by a DB CHECK constraint. */
export const MAX_PALETTE_COLORS = 30;

const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i;

export type Tool = { type: "paint"; colorIndex: number } | { type: "erase" };

export interface GridCell {
  row: number;
  col: number;
}

/**
 * Bresenham line between two grid cells, inclusive of both endpoints.
 *
 * Fills the straight-line path a fast drag would otherwise skip cells along
 * — browsers coalesce `pointermove` below input sampling rate, so painting
 * only the discrete event points leaves gaps (plan.md Phase 2, #2).
 */
export function lineCells(from: GridCell, to: GridCell): GridCell[] {
  const cells: GridCell[] = [];
  let col = from.col;
  let row = from.row;
  const dx = Math.abs(to.col - from.col);
  const dy = -Math.abs(to.row - from.row);
  const sx = from.col < to.col ? 1 : -1;
  const sy = from.row < to.row ? 1 : -1;
  let err = dx + dy;

  for (;;) {
    cells.push({ row, col });
    if (col === to.col && row === to.row) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      col += sx;
    }
    if (e2 <= dx) {
      err += dx;
      row += sy;
    }
  }
  return cells;
}

function countsFromGrid(grid: Uint8Array): Map<number, number> {
  const counts = new Map<number, number>();
  for (const value of grid) {
    if (value === 0) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

/**
 * Owns the grid/palette buffers and the save round-trip for the editor.
 *
 * The grid lives in a ref, not `useState`: painting must never trigger a
 * React re-render of the whole editor, only a targeted canvas redraw (see
 * plan.md's "Critical Implementation Details" / State sequencing). Palette
 * and the live per-color count are React state since they need to drive
 * re-renders of the palette panel / count panel, and change far less often
 * than the grid does.
 */
export function usePatternGrid(pattern: PatternEditorData) {
  const initialGrid =
    pattern.grid.length > 0 ? Uint8Array.from(pattern.grid) : new Uint8Array(pattern.width * pattern.height);
  const gridRef = useRef<Uint8Array>(initialGrid);
  const [palette, setPalette] = useState<string[]>(pattern.palette.length > 0 ? [...pattern.palette] : []);
  const [tool, setTool] = useState<Tool>(
    pattern.palette.length > 0 ? { type: "paint", colorIndex: 1 } : { type: "erase" },
  );
  const [counts, setCounts] = useState<Map<number, number>>(() => countsFromGrid(initialGrid));
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const atCap = palette.length >= MAX_PALETTE_COLORS;

  const addColor = useCallback(
    (hex: string) => {
      if (!HEX_COLOR_RE.test(hex)) return false;
      if (palette.length >= MAX_PALETTE_COLORS) return false;
      const addedIndex = palette.length + 1;
      setPalette((prev) => [...prev, hex.toLowerCase()]);
      setTool({ type: "paint", colorIndex: addedIndex });
      return true;
    },
    [palette],
  );

  const selectColor = useCallback((colorIndex: number) => {
    setTool({ type: "paint", colorIndex });
  }, []);

  const selectErase = useCallback(() => {
    setTool({ type: "erase" });
  }, []);

  /**
   * Writes `cells` with the active tool's value, calling `onCellChanged` for
   * every cell whose value actually changed (the caller uses this to redraw
   * just that cell rather than the whole canvas). Count deltas are batched
   * into a single `setCounts` call per invocation — one state update per
   * pointer event, not one per cell.
   */
  const paintCells = useCallback(
    (cells: GridCell[], onCellChanged: (row: number, col: number) => void) => {
      const value = tool.type === "paint" ? tool.colorIndex : 0;
      const delta = new Map<number, number>();
      let changed = false;

      for (const { row, col } of cells) {
        if (row < 0 || row >= pattern.height || col < 0 || col >= pattern.width) continue;
        const index = row * pattern.width + col;
        const previous = gridRef.current[index];
        if (previous === value) continue;

        gridRef.current[index] = value;
        changed = true;
        if (previous !== 0) delta.set(previous, (delta.get(previous) ?? 0) - 1);
        if (value !== 0) delta.set(value, (delta.get(value) ?? 0) + 1);
        onCellChanged(row, col);
      }

      if (!changed) return;
      setIsDirty(true);
      setCounts((prev) => {
        const next = new Map(prev);
        for (const [colorIndex, change] of delta) {
          const updated = (next.get(colorIndex) ?? 0) + change;
          if (updated <= 0) next.delete(colorIndex);
          else next.set(colorIndex, updated);
        }
        return next;
      });
    },
    [tool, pattern.width, pattern.height],
  );

  const save = useCallback(async () => {
    setIsSaving(true);
    setSaveError(null);
    try {
      const response = await fetch(`/api/patterns/${pattern.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          palette,
          grid: Array.from(gridRef.current),
        }),
      });
      if (!response.ok) {
        throw new Error("Save failed");
      }
      setIsDirty(false);
    } catch {
      setSaveError("Couldn't save. Check your connection and try again.");
    } finally {
      setIsSaving(false);
    }
  }, [pattern.id, palette]);

  return {
    gridRef,
    palette,
    tool,
    counts,
    atCap,
    isDirty,
    isSaving,
    saveError,
    addColor,
    selectColor,
    selectErase,
    paintCells,
    save,
  };
}
