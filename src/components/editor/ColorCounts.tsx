interface ColorCountsProps {
  palette: string[];
  counts: Map<number, number>;
}

export default function ColorCounts({ palette, counts }: ColorCountsProps) {
  if (palette.length === 0) return null;

  return (
    <div className="flex w-full max-w-sm flex-wrap gap-x-4 gap-y-1 rounded-2xl border border-stone-200 bg-white/70 p-4 text-sm text-stone-700">
      {palette.map((hex, i) => {
        const colorIndex = i + 1;
        return (
          <span key={colorIndex} className="flex items-center gap-1.5">
            <span className="size-3 rounded-full border border-stone-300" style={{ backgroundColor: hex }} />
            {counts.get(colorIndex) ?? 0}
          </span>
        );
      })}
    </div>
  );
}
