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
  const asideRef = useRef<HTMLElement>(null);
  const colorInputRef = useRef<HTMLInputElement>(null);
  const [pendingColor, setPendingColor] = useState<string | null>(null);

  // Written directly to the DOM (not React state) so the position is in place
  // before .click() opens the native picker in this same synchronous call.
  const openPicker = (anchor: HTMLElement) => {
    const aside = asideRef.current;
    const input = colorInputRef.current;
    if (aside && input) {
      const anchorCenterY = anchor.getBoundingClientRect().top + anchor.offsetHeight / 2;
      input.style.top = `${anchorCenterY - aside.getBoundingClientRect().top}px`;
    }
    input?.click();
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
    <aside
      ref={asideRef}
      className="border-kratka-border bg-kratka-paper relative flex h-full w-fit shrink-0 flex-col rounded-lg border p-1.5"
    >
      {/* Kept mounted regardless of pendingColor/atCap state — unmounting mid-interaction
          closes the still-open native picker, since it fires onChange live while dragging. */}
      <input
        ref={colorInputRef}
        type="color"
        aria-hidden="true"
        tabIndex={-1}
        onChange={(event) => {
          setPendingColor(event.target.value);
        }}
        className="absolute top-0 right-0 size-px translate-x-full -translate-y-1/2 opacity-0"
      />

      <div className="mb-3 shrink-0">
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

      <hr className="border-kratka-border mb-3 shrink-0" />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mb-2 flex items-baseline justify-end">
          <span className="text-kratka-muted text-[11px]">
            {palette.length}/{MAX_PALETTE_COLORS}
          </span>
        </div>
        <div className="grid grid-cols-[repeat(4,2rem)] gap-1.5">
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
            <>
              <div className="flex flex-col items-center gap-1">
                <div
                  aria-hidden="true"
                  style={{ backgroundColor: pendingColor }}
                  className="border-kratka-border size-8 rounded-full border-2"
                />
                <span aria-hidden="true" className="invisible text-xs tabular-nums">
                  0
                </span>
              </div>
              <div className="col-span-4 flex items-center justify-center gap-2">
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
                  className="bg-kratka-border text-kratka-ink flex size-6 items-center justify-center rounded-full"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            </>
          ) : (
            !atCap && (
              <div className="flex flex-col items-center gap-1">
                <button
                  type="button"
                  aria-label="Add a color"
                  onClick={(event) => {
                    openPicker(event.currentTarget);
                  }}
                  className="text-kratka-muted hover:border-kratka-muted border-kratka-border flex size-8 items-center justify-center rounded-full border-2 border-dashed text-lg leading-none"
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
      </div>
    </aside>
  );
}
