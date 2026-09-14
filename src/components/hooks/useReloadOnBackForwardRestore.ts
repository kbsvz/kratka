import { useEffect } from "react";

/**
 * Browser back/forward can restore this page from bfcache with the props it
 * was first rendered with, bypassing the server (and any list changes made
 * on an intermediate page). Reloading on a persisted `pageshow` makes back
 * navigation fetch fresh data, matching a normal link click.
 */
export function useReloadOnBackForwardRestore() {
  useEffect(() => {
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        window.location.reload();
      }
    };
    window.addEventListener("pageshow", handlePageShow);
    return () => {
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, []);
}
