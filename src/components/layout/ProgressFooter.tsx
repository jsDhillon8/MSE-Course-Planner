import type { ChangeEvent, KeyboardEvent } from "react";
import "./ProgressFooter.css";

interface ProgressFooterProps {
  completedCredits: number;
  transferCredits: number;
  totalCompleted: number;
  totalCurriculumCredits: number;
  completionPercent: number;
  /** Planned credits that don't count toward graduation (custom schedule). */
  extraCredits?: number;
  onTransferCreditsChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onTransferCreditsKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onResetProgress: () => void;
}

export function ProgressFooter({
  completedCredits,
  transferCredits,
  totalCompleted,
  totalCurriculumCredits,
  completionPercent,
  extraCredits = 0,
  onTransferCreditsChange,
  onTransferCreditsKeyDown,
  onResetProgress,
}: ProgressFooterProps) {
  return (
    <footer className="status-rail">
      <div className="credits-counter">
        <span>Completed Credits: {completedCredits}</span>
        <span className="transfer-credits-field">
          Transfer Credits:{" "}
          <input
            type="number"
            className="transfer-credits-input"
            min={0}
            step={1}
            inputMode="numeric"
            value={transferCredits}
            onChange={onTransferCreditsChange}
            onKeyDown={onTransferCreditsKeyDown}
            aria-label="Transfer credits"
          />
        </span>
        <span>
          Progress: {totalCompleted} / {totalCurriculumCredits} Credits ({completionPercent}%)
        </span>
        {extraCredits > 0 && (
          <span
            className="extra-credits"
            title="Courses in your plan that are outside your curriculum, or equivalent to a course that already counts. They're left out of Progress."
          >
            +{extraCredits} credits not toward graduation
          </span>
        )}
        <button type="button" className="reset-progress-btn" onClick={onResetProgress}>
          Reset Progress
        </button>
      </div>
    </footer>
  );
}
