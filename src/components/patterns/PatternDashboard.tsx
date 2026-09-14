import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
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
import { usePatternList } from "@/components/hooks/usePatternList";
import { useReloadOnBackForwardRestore } from "@/components/hooks/useReloadOnBackForwardRestore";
import { formatRelativeTime, cn } from "@/lib/utils";
import type { PatternListItem } from "@/types";

const fieldClass =
  "border-kratka-border bg-white text-kratka-ink placeholder:text-kratka-muted focus-visible:ring-kratka-green";
const labelClass = "mb-1 text-kratka-muted";

const CAP = 3;

/**
 * Owns everything patterns.astro renders below the header: the heading and
 * pattern-slot indicator, the pattern table, and the cap-boundary section
 * (create form vs. cap message). The cap boundary and slot indicator are
 * both driven by the live `patterns` list from `usePatternList`, so a
 * delete immediately un-hides the create form and updates the slot count
 * without a page reload (see plan.md's Critical Implementation Details).
 */
export default function PatternDashboard({
  initialPatterns,
  createError,
}: {
  initialPatterns: PatternListItem[];
  createError?: string;
}) {
  const { patterns, pendingDeleteId, deleteError, sessionExpired, requestDelete, confirmDelete, cancelDelete } =
    usePatternList(initialPatterns);
  const atCap = patterns.length >= CAP;
  useReloadOnBackForwardRestore();

  return (
    <div className="w-full text-left">
      <h1 className="text-kratka-ink mb-8 text-3xl font-bold tracking-tight">My Patterns</h1>

      <div className="border-kratka-border bg-kratka-paper mb-8 rounded-lg border p-4">
        <div className="flex items-center justify-between gap-4">
          <span className="text-kratka-ink text-sm font-semibold">New pattern</span>
          <div
            className="text-kratka-muted flex items-center gap-2 text-sm"
            aria-label={`${patterns.length} of ${CAP} pattern slots used`}
          >
            <span className="flex gap-1">
              {Array.from({ length: CAP }, (_, i) => (
                <span
                  key={i}
                  className={cn("size-2 rounded-full", i < patterns.length ? "bg-kratka-green" : "bg-kratka-border")}
                />
              ))}
            </span>
            {patterns.length} of {CAP} patterns
          </div>
        </div>
        <div className="mt-4">
          {atCap ? (
            <p className="text-kratka-muted text-sm">
              You&apos;ve reached the 3-pattern limit. Delete a pattern to create another.
            </p>
          ) : (
            <form method="POST" action="/api/patterns" className="flex flex-wrap items-end gap-4">
              <div className="w-[140px]">
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
              <div className="w-[140px]">
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
              <Button type="submit" className="bg-kratka-green hover:bg-kratka-green-dark text-white">
                Create
              </Button>
              {createError && <p className="w-full text-sm text-red-700">{createError}</p>}
            </form>
          )}
        </div>
      </div>

      <div className="text-kratka-green mb-8 flex justify-center" aria-hidden="true">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="92"
          height="12"
          viewBox="0 0 92 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        >
          <path d="M2 2L10 10M10 2L2 10"></path>
          <path d="M12 2L20 10M20 2L12 10"></path>
          <path d="M22 2L30 10M30 2L22 10"></path>
          <path d="M32 2L40 10M40 2L32 10"></path>
          <path d="M42 2L50 10M50 2L42 10"></path>
          <path d="M52 2L60 10M60 2L52 10"></path>
          <path d="M62 2L70 10M70 2L62 10"></path>
          <path d="M72 2L80 10M80 2L72 10"></path>
          <path d="M82 2L90 10M90 2L82 10"></path>
        </svg>
      </div>

      {patterns.length === 0 ? (
        <p className="text-kratka-muted text-sm">No patterns yet — create your first one above.</p>
      ) : (
        <>
          <div className="border-kratka-border bg-kratka-paper overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Pattern</TableHead>
                  <TableHead>Grid size</TableHead>
                  <TableHead>Last updated</TableHead>
                  <TableHead aria-label="Delete" className="pr-4" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {patterns.map((pattern) => (
                  <TableRow key={pattern.id}>
                    <TableCell className="pl-4">
                      <a
                        href={`/patterns/${pattern.id}`}
                        title="Click to open"
                        aria-label={pattern.name}
                        className="text-kratka-green font-medium hover:underline"
                      >
                        {pattern.name}
                      </a>
                    </TableCell>
                    <TableCell className="text-kratka-muted">
                      {pattern.width}×{pattern.height}
                    </TableCell>
                    <TableCell className="text-kratka-muted">{formatRelativeTime(pattern.updated_at)}</TableCell>
                    <TableCell className="pr-4 text-right">
                      <a
                        href={`/patterns/${pattern.id}/print`}
                        className="text-kratka-green mr-6 text-sm font-normal hover:underline"
                      >
                        Print
                      </a>
                      <button
                        type="button"
                        disabled={sessionExpired}
                        onClick={() => {
                          requestDelete(pattern.id);
                        }}
                        className="text-kratka-red text-sm font-normal hover:underline disabled:opacity-40"
                      >
                        Delete
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
      {deleteError && (
        <div className="mt-2 flex items-center gap-3">
          <p className="text-sm text-red-700">{deleteError}</p>
          {sessionExpired && (
            <Button asChild variant="outline" size="sm">
              <a href="/auth/signin">Sign in</a>
            </Button>
          )}
        </div>
      )}

      <AlertDialog open={pendingDeleteId !== null}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this pattern?</AlertDialogTitle>
            <AlertDialogDescription>
              This frees up a slot, but the pattern won&apos;t be reachable or reopenable afterward.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelDelete}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
