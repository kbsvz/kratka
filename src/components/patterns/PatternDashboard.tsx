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
import { formatRelativeTime } from "@/lib/utils";
import type { PatternListItem } from "@/types";

const fieldClass =
  "border-stone-300 bg-white text-stone-800 placeholder:text-stone-400 focus-visible:ring-kratka-green";
const labelClass = "mb-1 text-stone-700";

const CAP = 3;

/**
 * Owns everything dashboard.astro renders below the welcome block: the
 * pattern table, the cap-boundary section (create form vs. cap message), and
 * the sign-out button. The cap boundary is driven by the live `patterns`
 * list from `usePatternList`, so a delete immediately un-hides the create
 * form without a page reload (see plan.md's Critical Implementation
 * Details). Sign-out lives here (not in dashboard.astro) so it can be hidden
 * once `sessionExpired` is true — showing "Sign out" for a session that's
 * already gone is misleading.
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
            <Button type="submit" className="bg-kratka-green hover:bg-kratka-green-dark text-white">
              Create pattern
            </Button>
          </div>
          {createError && <p className="text-sm text-red-700">{createError}</p>}
        </form>
      )}

      <h2 className="mb-2 text-lg font-semibold text-stone-800">My Patterns</h2>
      {patterns.length === 0 ? (
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
            {patterns.map((pattern) => (
              <TableRow key={pattern.id}>
                <TableCell>
                  <a href={`/editor/${pattern.id}`} className="text-kratka-green hover:underline">
                    {pattern.name}
                  </a>
                </TableCell>
                <TableCell>
                  {pattern.width}×{pattern.height}
                </TableCell>
                <TableCell>{formatRelativeTime(pattern.updated_at)}</TableCell>
                <TableCell>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={sessionExpired}
                    onClick={() => {
                      requestDelete(pattern.id);
                    }}
                  >
                    Delete
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
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

      {!sessionExpired && (
        <form method="POST" action="/api/auth/signout" className="mt-6">
          <Button
            type="submit"
            variant="outline"
            className="border-stone-300 bg-white text-stone-800 hover:bg-stone-100"
          >
            Sign out
          </Button>
        </form>
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
