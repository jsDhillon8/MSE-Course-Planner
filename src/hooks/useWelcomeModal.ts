import { useCallback, useState } from "react";

// Bump this if the welcome content changes significantly and it should
// be shown again to returning users.
const STORAGE_KEY = "mse-planner-welcome-dismissed-v1";

function hasSeenWelcome(): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(STORAGE_KEY) === "true";
}

function markWelcomeSeen(): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, "true");
}

interface UseWelcomeModalResult {
  isOpen: boolean;
  open: () => void;
  dismiss: () => void;
}

/**
 * Single source of truth for the welcome modal's visibility.
 *
 * - Opens automatically on first visit (nothing in localStorage yet).
 * - `dismiss()` closes it and records that the user has seen it, so it
 *   won't auto-open again.
 * - `open()` lets any UI (e.g. a Help button) reopen the same modal on
 *   demand, without touching the first-time localStorage flag.
 */
export function useWelcomeModal(): UseWelcomeModalResult {
  const [isOpen, setIsOpen] = useState<boolean>(() => !hasSeenWelcome());

  const open = useCallback(() => {
    setIsOpen(true);
  }, []);

  const dismiss = useCallback(() => {
    markWelcomeSeen();
    setIsOpen(false);
  }, []);

  return { isOpen, open, dismiss };
}
