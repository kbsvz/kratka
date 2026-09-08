import { useRef, useState } from "react";
import { Check, Eraser, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { MAX_PALETTE_COLORS, type Tool } from "@/components/hooks/usePatternGrid";

interface PalettePanelProps {
  palette: string[];
  tool: Tool;
  atCap: boolean;
  onAddColor: (hex: string) => boolean;
  onSelectColor: (index: number) => void;
  onSelectErase: () => void;
}

export default function PalettePanel({
  palette,
  tool,
  atCap,
  onAddColor,
  onSelectColor,
  onSelectErase,
}: PalettePanelProps) {
  const colorInputRef = useRef<HTMLInputElement>(null);
  const [pendingColor, setPendingColor] = useState<string | null>(null);

  const openPicker = () => {
    colorInputRef.current?.click();
  };

  const confirmPendingColor = () => {
    if (!pendingColor) return;
    onAddColor(pendingColor);
    setPendingColor(null);
  };

  const cancelPendingColor = () => {
    setPendingColor(null);
  };

  return (
    <div className="w-full max-w-sm rounded-2xl border border-stone-200 bg-white/70 p-4 text-stone-800">
      <input
        ref={colorInputRef}
        type="color"
        aria-hidden="true"
        tabIndex={-1}
        onChange={(event) => {
          setPendingColor(event.target.value);
        }}
        className="sr-only"
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-label="Erase"
          onClick={onSelectErase}
          className={cn(
            "flex size-8 items-center justify-center rounded-full border-2 bg-white text-stone-600",
            tool.type === "erase" ? "border-[oklch(0.5485_0.1061_160.41)]" : "border-stone-300",
          )}
        >
          <Eraser className="size-4" />
        </button>

        {palette.map((hex, i) => {
          const colorIndex = i + 1;
          const selected = tool.type === "paint" && tool.colorIndex === colorIndex;
          return (
            <button
              key={colorIndex}
              type="button"
              aria-label={`Select color ${hex}`}
              onClick={() => {
                onSelectColor(colorIndex);
              }}
              style={{ backgroundColor: hex }}
              className={cn(
                "size-8 rounded-full border-2",
                selected ? "border-[oklch(0.5485_0.1061_160.41)]" : "border-stone-300",
              )}
            />
          );
        })}

        {pendingColor ? (
          <div className="flex items-center gap-1">
            <div
              aria-hidden="true"
              style={{ backgroundColor: pendingColor }}
              className="size-8 rounded-full border-2 border-stone-300"
            />
            <button
              type="button"
              aria-label="Confirm new color"
              onClick={confirmPendingColor}
              className="flex size-6 items-center justify-center rounded-full bg-[oklch(0.5485_0.1061_160.41)] text-white"
            >
              <Check className="size-3.5" />
            </button>
            <button
              type="button"
              aria-label="Discard new color"
              onClick={cancelPendingColor}
              className="flex size-6 items-center justify-center rounded-full bg-stone-300 text-stone-700"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ) : (
          !atCap && (
            <button
              type="button"
              aria-label="Add a color"
              onClick={openPicker}
              className="flex size-8 items-center justify-center rounded-full border-2 border-dashed border-stone-300 text-lg leading-none text-stone-500 hover:border-stone-400"
            >
              +
            </button>
          )
        )}
      </div>

      {atCap && <p className="mt-3 text-xs text-stone-500">Palette is full ({MAX_PALETTE_COLORS} colors).</p>}
    </div>
  );
}
