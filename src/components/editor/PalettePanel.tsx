import { useRef, useState } from "react";
import { Check, Eraser, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { MAX_PALETTE_COLORS, type Tool } from "@/components/hooks/usePatternGrid";

interface PalettePanelProps {
  palette: string[];
  tool: Tool;
  atCap: boolean;
  counts: Map<number, number>;
  onAddColor: (hex: string) => boolean;
  onSelectColor: (index: number) => void;
  onSelectErase: () => void;
}

const toolButtonClass = "flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-xs font-bold";

export default function PalettePanel({
  palette,
  tool,
  atCap,
  counts,
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
    <aside className="border-kratka-border bg-kratka-paper w-[166px] shrink-0 rounded-lg border p-3">
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

      <h2 className="text-kratka-ink mb-2 text-xs font-bold">Tools</h2>
      <div className="mb-3">
        <button
          type="button"
          aria-label="Erase"
          onClick={onSelectErase}
          className={cn(
            toolButtonClass,
            "w-full",
            tool.type === "erase"
              ? "bg-kratka-green/10 border-kratka-green text-kratka-green"
              : "border-kratka-border text-kratka-muted bg-white",
          )}
        >
          <Eraser className="size-3.5" /> Erase
        </button>
      </div>

      <hr className="border-kratka-border mb-3" />

      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-kratka-ink text-xs font-bold">Palette</h2>
        <span className="text-kratka-muted text-[11px]">
          {palette.length}/{MAX_PALETTE_COLORS}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {palette.map((hex, i) => {
          const colorIndex = i + 1;
          const selected = tool.type === "paint" && tool.colorIndex === colorIndex;
          return (
            <div key={colorIndex} className="flex flex-col items-center gap-1">
              <button
                type="button"
                aria-label={`Select color ${hex}`}
                onClick={() => {
                  onSelectColor(colorIndex);
                }}
                style={{ backgroundColor: hex }}
                className={cn(
                  "size-8 rounded-full border-2",
                  selected ? "border-kratka-green" : "border-kratka-border",
                )}
              />
              <span className="text-kratka-muted text-xs tabular-nums">{counts.get(colorIndex) ?? 0}</span>
            </div>
          );
        })}

        {pendingColor ? (
          <div className="col-span-3 flex items-center gap-1">
            <div
              aria-hidden="true"
              style={{ backgroundColor: pendingColor }}
              className="border-kratka-border size-8 rounded-full border-2"
            />
            <button
              type="button"
              aria-label="Confirm new color"
              onClick={confirmPendingColor}
              className="bg-kratka-green flex size-6 items-center justify-center rounded-full text-white"
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
            <div className="flex flex-col items-center gap-1">
              <button
                type="button"
                aria-label="Add a color"
                onClick={openPicker}
                className="text-kratka-muted flex size-8 items-center justify-center rounded-full border-2 border-dashed border-stone-300 text-lg leading-none hover:border-stone-400"
              >
                +
              </button>
              <span aria-hidden="true" className="invisible text-xs tabular-nums">
                0
              </span>
            </div>
          )
        )}
      </div>

      {atCap && <p className="text-kratka-muted mt-3 text-xs">Palette is full ({MAX_PALETTE_COLORS} colors).</p>}
    </aside>
  );
}
