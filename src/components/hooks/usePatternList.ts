import { useCallback, useRef, useState } from "react";
import type { PatternListItem } from "@/types";

/**
 * Owns the client-side pattern list and the delete confirmation flow.
 *
 * Mirrors `useUnsavedChangesGuard`'s request→pending→confirm/cancel
 * state-machine shape and `usePatternGrid.save()`'s 401-handling idiom (FR-013).
 */
export function usePatternList(initialPatterns: PatternListItem[]) {
  const [patterns, setPatterns] = useState<PatternListItem[]>(initialPatterns);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const inFlightIdRef = useRef<string | null>(null);

  const requestDelete = useCallback((id: string) => {
    setPendingDeleteId(id);
  }, []);

  const cancelDelete = useCallback(() => {
    setPendingDeleteId(null);
  }, []);

  const confirmDelete = useCallback(async () => {
    const id = pendingDeleteId;
    if (!id || inFlightIdRef.current === id) return;
    inFlightIdRef.current = id;
    setPendingDeleteId(null);
    setDeleteError(null);
    setSessionExpired(false);

    const removed = patterns.find((pattern) => pattern.id === id);
    setPatterns((prev) => prev.filter((pattern) => pattern.id !== id));

    const rollback = () => {
      if (!removed) return;
      setPatterns((prev) =>
        [...prev, removed].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()),
      );
    };

    try {
      const response = await fetch(`/api/patterns/${id}`, { method: "DELETE" });
      if (response.status === 401) {
        // Distinct from the generic network-error message below — same
        // rationale as usePatternGrid.save()'s session-expired branch.
        rollback();
        setDeleteError("Your session expired. Sign in again to delete this pattern.");
        setSessionExpired(true);
        return;
      }
      if (response.status === 404) {
        // Already gone (raced with another tab, or never owned) — the
        // optimistic removal already reflects reality, so this is success,
        // not a failure to surface.
        return;
      }
      if (!response.ok) {
        throw new Error("Delete failed");
      }
    } catch {
      rollback();
      setDeleteError("Couldn't delete. Check your connection and try again.");
    } finally {
      inFlightIdRef.current = null;
    }
  }, [pendingDeleteId, patterns]);

  return { patterns, pendingDeleteId, deleteError, sessionExpired, requestDelete, confirmDelete, cancelDelete };
}
