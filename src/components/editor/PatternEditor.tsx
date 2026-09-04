import { useCallback, useEffect, useRef } from "react";
import { usePatternGrid } from "@/components/hooks/usePatternGrid";
import { useUnsavedChangesGuard } from "@/components/hooks/useUnsavedChangesGuard";
import { Button } from "@/components/ui/button";
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
  const { gridRef, paletteRef, isDirty, isSaving, saveError, toggleCell, save } = usePatternGrid(pattern);
  const { attemptNavigate, pendingConfirm, confirmNavigate, cancelNavigate } = useUnsavedChangesGuard(isDirty);

  // Gutter on all four sides: the grid is translated in by EDGE_LABEL_SPACE
  // on the top/left, so an equal margin on the bottom/right keeps the last
  // row/column's edge number (e.g. "20") from being clipped at the canvas
  // boundary the way a single one-sided margin would.
  const cssWidth = pattern.width * CELL_SIZE + EDGE_LABEL_SPACE * 2;
  const cssHeight = pattern.height * CELL_SIZE + EDGE_LABEL_SPACE * 2;

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
        ctx.fillStyle = paletteRef.current[value - 1] ?? "#000000";
        ctx.fillRect(col * CELL_SIZE, row * CELL_SIZE, CELL_SIZE, CELL_SIZE);
      }
    }

    const gridWidthPx = pattern.width * CELL_SIZE;
    const gridHeightPx = pattern.height * CELL_SIZE;
    for (let col = 0; col <= pattern.width; col++) {
      const heavy = col % HEAVY_LINE_EVERY === 0 || col === pattern.width;
      ctx.strokeStyle = heavy ? "#00000088" : "#00000022";
      ctx.lineWidth = heavy ? 1.5 : 1;
      const x = Math.round(col * CELL_SIZE) + 0.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, gridHeightPx);
      ctx.stroke();
    }
    for (let row = 0; row <= pattern.height; row++) {
      const heavy = row % HEAVY_LINE_EVERY === 0 || row === pattern.height;
      ctx.strokeStyle = heavy ? "#00000088" : "#00000022";
      ctx.lineWidth = heavy ? 1.5 : 1;
      const y = Math.round(row * CELL_SIZE) + 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(gridWidthPx, y);
      ctx.stroke();
    }
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
  }, [pattern.width, pattern.height, gridRef, paletteRef, cssWidth, cssHeight]);

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

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left - EDGE_LABEL_SPACE;
      const y = event.clientY - rect.top - EDGE_LABEL_SPACE;
      const col = Math.floor(x / CELL_SIZE);
      const row = Math.floor(y / CELL_SIZE);
      if (col < 0 || col >= pattern.width || row < 0 || row >= pattern.height) return;
      toggleCell(row, col);
      draw();
    },
    [toggleCell, draw, pattern.width, pattern.height],
  );

  return (
    <div className="bg-cosmic relative flex min-h-screen flex-col items-center justify-center gap-6 p-4 text-stone-800">
      {/*
        shadcn's variant colors assume a light page background (this repo
        never toggles the `dark` class); override explicitly to match this
        page's own theme instead of the invisible-on-invisible result of
        e.g. variant="outline"'s default bg-background/inherited color.
      */}
      <div className="absolute top-4 left-4">
        <Button
          variant="outline"
          onClick={() => {
            attemptNavigate(() => (window.location.href = "/dashboard"));
          }}
          className="border-stone-300 bg-white text-stone-800 hover:bg-stone-100"
        >
          Back to dashboard
        </Button>
      </div>

      <div className="absolute top-4 right-4">
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

      <div className="w-fit overflow-auto rounded border border-stone-300">
        <canvas ref={canvasRef} onPointerDown={handlePointerDown} className="cursor-crosshair" />
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
