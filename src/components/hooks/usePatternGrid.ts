import { useCallback, useRef, useState } from "react";
import type { PatternEditorData } from "@/types";

/** Phase 1's single hardcoded paint color — Phase 2 replaces this with a real palette. */
const DEFAULT_PALETTE = ["#1e293b"];
const FIXED_COLOR_INDEX = 1;

/**
 * Owns the grid/palette buffers and the save round-trip for the editor.
 *
 * The grid lives in a ref, not `useState`: painting must never trigger a
 * React re-render of the whole editor, only a targeted canvas redraw (see
 * plan.md's "Critical Implementation Details" / State sequencing).
 */
export function usePatternGrid(pattern: PatternEditorData) {
  const gridRef = useRef<Uint8Array>(
    pattern.grid.length > 0 ? Uint8Array.from(pattern.grid) : new Uint8Array(pattern.width * pattern.height),
  );
  const paletteRef = useRef<string[]>(pattern.palette.length > 0 ? pattern.palette : DEFAULT_PALETTE);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const toggleCell = useCallback(
    (row: number, col: number) => {
      const index = row * pattern.width + col;
      gridRef.current[index] = gridRef.current[index] === 0 ? FIXED_COLOR_INDEX : 0;
      setIsDirty(true);
    },
    [pattern.width],
  );

  const save = useCallback(async () => {
    setIsSaving(true);
    setSaveError(null);
    try {
      const response = await fetch(`/api/patterns/${pattern.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          palette: paletteRef.current,
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
  }, [pattern.id]);

  return { gridRef, paletteRef, isDirty, isSaving, saveError, toggleCell, save };
}
