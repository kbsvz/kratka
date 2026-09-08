import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { formatRelativeTime } from "@/lib/utils";
import type { PatternListItem } from "@/types";

const fieldClass =
  "border-stone-300 bg-white text-stone-800 placeholder:text-stone-400 focus-visible:ring-[oklch(0.5485_0.1061_160.41)]";
const labelClass = "mb-1 text-stone-700";

const CAP = 3;

/**
 * Owns everything dashboard.astro renders below the welcome/sign-out block:
 * the pattern table and the cap-boundary section (create form vs. cap
 * message). The cap boundary is decided from `initialPatterns.length` in this
 * phase; a later phase swaps that for live client state so it reacts to
 * deletes without a reload (see plan.md's Critical Implementation Details).
 */
export default function PatternDashboard({
  initialPatterns,
  createError,
}: {
  initialPatterns: PatternListItem[];
  createError?: string;
}) {
  const atCap = initialPatterns.length >= CAP;

  return (
    <div className="mt-6 w-full text-left">
      {atCap ? (
        <p className="mb-6 text-sm text-stone-500">
          You&apos;ve reached the 3-pattern limit. Delete a pattern to create another.
        </p>
      ) : (
        <form
          method="POST"
          action="/api/patterns"
          className="mb-6 w-fit space-y-4 rounded-lg border border-stone-200 bg-white/70 p-4"
        >
          <h2 className="text-lg font-semibold text-stone-800">New pattern</h2>
          <div className="flex items-end gap-4">
            <div className="w-[200px]">
              <Label htmlFor="width" className={labelClass}>
                Width (20-100)
              </Label>
              <Input
                id="width"
                name="width"
                type="number"
                min="20"
                max="100"
                step="1"
                required
                defaultValue="50"
                className={fieldClass}
              />
            </div>
            <div className="w-[200px]">
              <Label htmlFor="height" className={labelClass}>
                Height (20-100)
              </Label>
              <Input
                id="height"
                name="height"
                type="number"
                min="20"
                max="100"
                step="1"
                required
                defaultValue="50"
                className={fieldClass}
              />
            </div>
            <Button
              type="submit"
              className="bg-[oklch(0.5485_0.1061_160.41)] text-white hover:bg-[oklch(0.6085_0.1061_160.41)]"
            >
              Create pattern
            </Button>
          </div>
          {createError && <p className="text-sm text-red-700">{createError}</p>}
        </form>
      )}

      <h2 className="mb-2 text-lg font-semibold text-stone-800">My Patterns</h2>
      {initialPatterns.length === 0 ? (
        <p className="text-sm text-stone-500">No patterns yet — create your first one above.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Size</TableHead>
              <TableHead>Last updated</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {initialPatterns.map((pattern) => (
              <TableRow key={pattern.id}>
                <TableCell>
                  <a href={`/editor/${pattern.id}`} className="text-[oklch(0.5485_0.1061_160.41)] hover:underline">
                    {pattern.name}
                  </a>
                </TableCell>
                <TableCell>
                  {pattern.width}×{pattern.height}
                </TableCell>
                <TableCell>{formatRelativeTime(pattern.updated_at)}</TableCell>
                <TableCell />
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
