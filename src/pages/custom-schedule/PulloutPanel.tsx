import { useEffect, useState, type ReactNode } from "react";

interface PulloutPanelProps {
  id: string;
  side: "left" | "right";
  /** Panel name used on the buttons, e.g. "Course picker". */
  label: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}

/**
 * A side panel that can be hidden to give the schedule more room. When hidden it
 * collapses to a thin rail with a button to bring it back. The content stays
 * mounted, so search text and loaded data survive hiding.
 */
export function PulloutPanel({ id, side, label, open, onToggle, children }: PulloutPanelProps) {
  const hideArrow = side === "left" ? "‹" : "›";
  const showArrow = side === "left" ? "›" : "‹";

  return (
    <div className={`pullout pullout-${side}${open ? "" : " is-closed"}`}>
      {open ? (
        <button
          type="button"
          className="pullout-hide"
          aria-expanded="true"
          aria-controls={id}
          onClick={onToggle}
          title={`Hide ${label.toLowerCase()}`}
        >
          <span aria-hidden="true">{hideArrow}</span> Hide
          <span className="visually-hidden"> {label.toLowerCase()}</span>
        </button>
      ) : (
        <button
          type="button"
          className="pullout-rail"
          aria-expanded="false"
          aria-controls={id}
          onClick={onToggle}
          title={`Show ${label.toLowerCase()}`}
        >
          <span aria-hidden="true">{showArrow}</span>
          <span className="pullout-rail-label">{label}</span>
        </button>
      )}
      <div id={id} className="pullout-body" hidden={!open}>
        {children}
      </div>
    </div>
  );
}

/** Open/closed state for a pull-out panel, remembered in this browser. */
export function usePulloutState(storageKey: string, initiallyOpen = true): [boolean, () => void] {
  const [open, setOpen] = useState(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      return stored === null ? initiallyOpen : stored === "open";
    } catch {
      return initiallyOpen;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, open ? "open" : "closed");
    } catch {
      // private browsing / storage blocked
    }
  }, [storageKey, open]);

  return [open, () => setOpen((current) => !current)];
}
