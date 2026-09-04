import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Guards unsaved work on both exit paths (FR-010): a native `beforeunload`
 * prompt for tab close/refresh, and an in-app confirm dialog for navigation
 * triggered by the editor's own controls.
 */
export function useUnsavedChangesGuard(isDirty: boolean) {
  const [pendingConfirm, setPendingConfirm] = useState(false);
  const pendingActionRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!isDirty) return;

    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => {
      window.removeEventListener("beforeunload", handler);
    };
  }, [isDirty]);

  const attemptNavigate = useCallback(
    (to: () => void) => {
      if (!isDirty) {
        to();
        return;
      }
      pendingActionRef.current = to;
      setPendingConfirm(true);
    },
    [isDirty],
  );

  const confirmNavigate = useCallback(() => {
    setPendingConfirm(false);
    pendingActionRef.current?.();
    pendingActionRef.current = null;
  }, []);

  const cancelNavigate = useCallback(() => {
    setPendingConfirm(false);
    pendingActionRef.current = null;
  }, []);

  return { attemptNavigate, pendingConfirm, confirmNavigate, cancelNavigate };
}
