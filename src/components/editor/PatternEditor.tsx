import { useCallback, useEffect, useRef } from "react";
import { usePatternGrid, lineCells, type GridCell } from "@/components/hooks/usePatternGrid";
import { useUnsavedChangesGuard } from "@/components/hooks/useUnsavedChangesGuard";
import { Button } from "@/components/ui/button";
import PalettePanel from "@/components/editor/PalettePanel";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { PatternEditorData } from "@/types";

const CELL_SIZE = 18; // CSS px per cell — fixed size with scroll for MVP (no zoom/pan).
const HEAVY_LINE_EVERY = 10; // FR-019
const EDGE_LABEL_SPACE = 24; // CSS px reserved for the edge-number gutter.

export default function PatternEditor({ pattern }: { pattern: PatternEditorData }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasInitializedRef = useRef(false);
  const isPaintingRef = useRef(false);
  const lastCellRef = useRef<GridCell | null>(null);
  const {
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
  } = usePatternGrid(pattern);
  const { attemptNavigate, pendingConfirm, confirmNavigate, cancelNavigate } = useUnsavedChangesGuard(isDirty);

  // Gutter on all four sides: the grid is translated in by EDGE_LABEL_SPACE
  // on the top/left, so an equal margin on the bottom/right keeps the last
  // row/column's edge number (e.g. "20") from being clipped at the canvas
  // boundary the way a single one-sided margin would.
  const cssWidth = pattern.width * CELL_SIZE + EDGE_LABEL_SPACE * 2;
  const cssHeight = pattern.height * CELL_SIZE + EDGE_LABEL_SPACE * 2;
  const gridWidthPx = pattern.width * CELL_SIZE;
  const gridHeightPx = pattern.height * CELL_SIZE;

  const isHeavyCol = useCallback(
    (col: number) => col % HEAVY_LINE_EVERY === 0 || col === pattern.width,
    [pattern.width],
  );
  const isHeavyRow = useCallback(
    (row: number) => row % HEAVY_LINE_EVERY === 0 || row === pattern.height,
    [pattern.height],
  );

  const strokeCol = useCallback(
    (ctx: CanvasRenderingContext2D, col: number) => {
      const heavy = isHeavyCol(col);
      // Opaque, not alpha-blended: drawCell() restrokes whole lines every
      // time a cell along them is painted, and a semi-transparent stroke
      // would compound darker with every overdraw (visible as lines
      // getting "bolder" the more you paint). Opaque colors make every
      // redraw idempotent regardless of how many times it happens.
      ctx.strokeStyle = heavy ? "#777777" : "#dddddd";
      // Odd widths (1px) need a half-pixel center to land crisply on the
      // pixel grid; even widths (2px) need a whole-pixel center instead.
      // Getting this wrong leaves the line at a fractional pixel offset,
      // forcing anti-aliasing — its edge pixels then blend with whatever's
      // behind them, so the same line reads bolder next to a saturated
      // fill and thinner next to white.
      ctx.lineWidth = heavy ? 2 : 1;
      const x = heavy ? Math.round(col * CELL_SIZE) : Math.round(col * CELL_SIZE) + 0.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, gridHeightPx);
      ctx.stroke();
    },
    [isHeavyCol, gridHeightPx],
  );

  const strokeRow = useCallback(
    (ctx: CanvasRenderingContext2D, row: number) => {
      const heavy = isHeavyRow(row);
      ctx.strokeStyle = heavy ? "#777777" : "#dddddd";
      ctx.lineWidth = heavy ? 2 : 1;
      const y = heavy ? Math.round(row * CELL_SIZE) : Math.round(row * CELL_SIZE) + 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(gridWidthPx, y);
      ctx.stroke();
    },
    [isHeavyRow, gridWidthPx],
  );

  const draw = useCallback(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;

    // The whole canvas (grid + edge-label gutter) is a white "paper" surface
    // — empty cells default to white (PRD Non-Goals: no background-color
    // picker), and it keeps the dark edge-number text legible regardless of
    // the page theme behind it.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, cssWidth, cssHeight);
    ctx.save();
    ctx.translate(EDGE_LABEL_SPACE, EDGE_LABEL_SPACE);

    for (let row = 0; row < pattern.height; row++) {
      for (let col = 0; col < pattern.width; col++) {
        const value = gridRef.current[row * pattern.width + col];
        if (value === 0) continue;
        ctx.fillStyle = palette[value - 1] ?? "#000000";
        ctx.fillRect(col * CELL_SIZE, row * CELL_SIZE, CELL_SIZE, CELL_SIZE);
      }
    }

    for (let col = 0; col <= pattern.width; col++) strokeCol(ctx, col);
    for (let row = 0; row <= pattern.height; row++) strokeRow(ctx, row);
    ctx.restore();

    ctx.fillStyle = "#000000cc";
    ctx.font = "10px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let col = HEAVY_LINE_EVERY; col <= pattern.width; col += HEAVY_LINE_EVERY) {
      ctx.fillText(String(col), EDGE_LABEL_SPACE + col * CELL_SIZE, EDGE_LABEL_SPACE / 2);
    }
    for (let row = HEAVY_LINE_EVERY; row <= pattern.height; row += HEAVY_LINE_EVERY) {
      ctx.fillText(String(row), EDGE_LABEL_SPACE / 2, EDGE_LABEL_SPACE + row * CELL_SIZE);
    }
  }, [pattern.width, pattern.height, gridRef, palette, cssWidth, cssHeight, strokeCol, strokeRow]);

  // Incremental redraw for a single painted cell: fills just that cell, then
  // redraws its four bordering gridlines so the fill doesn't clip them. Used
  // on every paint/erase so a drag never triggers a full-grid repaint (see
  // plan.md's Performance constraints).
  const drawCell = useCallback(
    (row: number, col: number) => {
      const ctx = canvasRef.current?.getContext("2d");
      if (!ctx) return;
      const value = gridRef.current[row * pattern.width + col];
      ctx.save();
      ctx.translate(EDGE_LABEL_SPACE, EDGE_LABEL_SPACE);
      ctx.fillStyle = value === 0 ? "#ffffff" : (palette[value - 1] ?? "#000000");
      ctx.fillRect(col * CELL_SIZE, row * CELL_SIZE, CELL_SIZE, CELL_SIZE);
      strokeCol(ctx, col);
      strokeCol(ctx, col + 1);
      strokeRow(ctx, row);
      strokeRow(ctx, row + 1);
      ctx.restore();
    },
    [gridRef, pattern.width, palette, strokeCol, strokeRow],
  );

  useEffect(() => {
    // React 19 StrictMode double-invokes this effect in dev; sizing/scaling
    // the canvas a second time would double-apply the DPR scale.
    if (canvasInitializedRef.current) return;
    canvasInitializedRef.current = true;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;

    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);
    canvas.getContext("2d")?.scale(dpr, dpr);

    draw();
  }, [draw, cssWidth, cssHeight]);

  const cellFromPoint = useCallback((clientX: number, clientY: number): GridCell | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left - EDGE_LABEL_SPACE;
    const y = clientY - rect.top - EDGE_LABEL_SPACE;
    return { col: Math.floor(x / CELL_SIZE), row: Math.floor(y / CELL_SIZE) };
  }, []);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const cell = cellFromPoint(event.clientX, event.clientY);
      if (!cell) return;
      canvasRef.current?.setPointerCapture(event.pointerId);
      isPaintingRef.current = true;
      lastCellRef.current = cell;
      paintCells([cell], drawCell);
    },
    [cellFromPoint, paintCells, drawCell],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (!isPaintingRef.current || !lastCellRef.current) return;
      const nativeEvent = event.nativeEvent;
      // TS's DOM lib types this as always present, but real-world support
      // varies — catch rather than let an unsupported runtime throw here
      // and silently kill painting for the rest of the session.
      let coalesced: PointerEvent[];
      try {
        coalesced = nativeEvent.getCoalescedEvents();
      } catch {
        coalesced = [];
      }
      const points = coalesced.length > 0 ? coalesced : [nativeEvent];

      for (const point of points) {
        const cell = cellFromPoint(point.clientX, point.clientY);
        if (!cell) continue;
        paintCells(lineCells(lastCellRef.current, cell), drawCell);
        lastCellRef.current = cell;
      }
    },
    [cellFromPoint, paintCells, drawCell],
  );

  const stopPainting = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    isPaintingRef.current = false;
    lastCellRef.current = null;
    const canvas = canvasRef.current;
    if (canvas?.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
  }, []);

  return (
    <div className="bg-cosmic relative flex min-h-screen flex-col items-center justify-center gap-6 p-4 text-stone-800">
      {/*
        shadcn's variant colors assume a light page background (this repo
        never toggles the `dark` class); override explicitly to match this
        page's own theme instead of the invisible-on-invisible result of
        e.g. variant="outline"'s default bg-background/inherited color.
      */}
      <div className="absolute top-4 left-4">
        <a
          href="/?home"
          onClick={(event) => {
            event.preventDefault();
            attemptNavigate(() => (window.location.href = "/?home"));
          }}
          className="text-xl font-bold text-stone-800 hover:opacity-80"
        >
          KRATKA
        </a>
      </div>

      <div className="absolute top-4 right-4 flex items-center gap-2">
        <Button
          variant="outline"
          onClick={() => {
            attemptNavigate(() => (window.location.href = "/dashboard"));
          }}
          className="border-stone-300 bg-white text-stone-800 hover:bg-stone-100"
        >
          Back to dashboard
        </Button>
        <Button
          onClick={save}
          disabled={!isDirty || isSaving}
          className="bg-[oklch(0.5485_0.1061_160.41)] text-white hover:bg-[oklch(0.6085_0.1061_160.41)] disabled:opacity-40"
        >
          {isSaving ? "Saving…" : "Save"}
        </Button>
      </div>

      <h1 className="text-center text-2xl font-bold text-stone-800">{pattern.name}</h1>

      {saveError && <span className="text-sm text-red-700">{saveError}</span>}

      <div className="flex w-full justify-center">
        <PalettePanel
          palette={palette}
          tool={tool}
          atCap={atCap}
          counts={counts}
          onAddColor={addColor}
          onSelectColor={selectColor}
          onSelectErase={selectErase}
        />
      </div>

      <div className="w-fit overflow-auto rounded border border-stone-300">
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={stopPainting}
          onPointerCancel={stopPainting}
          className="cursor-crosshair touch-none"
        />
      </div>

      <AlertDialog open={pendingConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>You have unsaved changes. Leaving now will lose them.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelNavigate}>Stay</AlertDialogCancel>
            <AlertDialogAction onClick={confirmNavigate}>Leave without saving</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
