import { useEffect, useState, type FormEvent } from "react";
import { useLocation } from "react-router-dom";
import { useTheme } from "../../theme/ThemeContext";
import { submitBugReport } from "../../api/bugReport";
import "./WelcomeModal.css";
import "./BugReportModal.css";

interface BugReportModalProps {
  isOpen: boolean;
  onDismiss: () => void;
}

type Status = "idle" | "sending" | "sent" | "error";

export function BugReportModal({ isOpen, onDismiss }: BugReportModalProps) {
  const location = useLocation();
  const { theme } = useTheme();
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [steps, setSteps] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDismiss();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onDismiss]);

  // Reset the success screen once the modal is closed, so it reopens on a fresh form.
  useEffect(() => {
    if (!isOpen && status === "sent") setStatus("idle");
  }, [isOpen, status]);

  if (!isOpen) return null;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setStatus("sending");
    setErrorMessage("");
    try {
      await submitBugReport({
        summary: summary.trim(),
        description: description.trim(),
        steps: steps.trim(),
        page: `${location.pathname}${location.search}`,
        theme,
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        userAgent: navigator.userAgent,
        website,
      });
      setSummary("");
      setDescription("");
      setSteps("");
      setStatus("sent");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Could not send the report.");
      setStatus("error");
    }
  };

  const sending = status === "sending";

  return (
    <div
      className="welcome-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onDismiss();
      }}
    >
      <div
        className="welcome-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bug-report-title"
      >
        <button
          type="button"
          className="welcome-close"
          onClick={onDismiss}
          aria-label="Close bug report dialog"
        >
          ×
        </button>

        <h2 id="bug-report-title">Report a bug</h2>

        {status === "sent" ? (
          <>
            <p className="welcome-intro">Thanks! Your report was sent.</p>
            <button type="button" className="welcome-get-started" onClick={onDismiss}>
              Close
            </button>
          </>
        ) : (
          <>
            <p className="welcome-intro">
              Tell us what went wrong. The current page and browser info are
              attached automatically.
            </p>

            <form className="bug-report-form" onSubmit={handleSubmit}>
              <label>
                <span>Summary</span>
                <input
                  type="text"
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  placeholder="e.g. Prerequisite highlight missing for ENSC 351"
                  maxLength={150}
                  required
                  autoFocus
                  disabled={sending}
                />
              </label>
              <label>
                <span>What happened?</span>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  placeholder="What you expected vs. what actually happened"
                  maxLength={5000}
                  required
                  disabled={sending}
                />
              </label>
              <label>
                <span>Steps to reproduce (optional)</span>
                <textarea
                  value={steps}
                  onChange={(e) => setSteps(e.target.value)}
                  rows={3}
                  placeholder={"1. Open ...\n2. Click ..."}
                  maxLength={3000}
                  disabled={sending}
                />
              </label>
              <input
                type="text"
                className="bug-report-honeypot"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
              />
              {status === "error" && (
                <p className="bug-report-error" role="alert">
                  {errorMessage} Please try again.
                </p>
              )}
              <button type="submit" className="welcome-get-started" disabled={sending}>
                {sending ? "Sending…" : "Send report"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
