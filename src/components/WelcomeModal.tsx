import { useEffect } from "react";

interface WelcomeModalProps {
  isOpen: boolean;
  onDismiss: () => void;
}

export function WelcomeModal({ isOpen, onDismiss }: WelcomeModalProps) {
  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDismiss();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onDismiss]);

  if (!isOpen) return null;

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
        aria-labelledby="welcome-modal-title"
      >
        <button
          type="button"
          className="welcome-close"
          onClick={onDismiss}
          aria-label="Close welcome dialog"
        >
          ×
        </button>

        <h2 id="welcome-modal-title">Welcome to the SFU MSE Course Planner</h2>
        <p className="welcome-intro">
          Plan your MSE degree, explore courses, and understand prerequisite
          relationships with an interactive course planning tool.
        </p>

        <ul className="welcome-feature-list">
          <li>
            <span className="welcome-feature-title">Course Planner</span>
            <span className="welcome-feature-desc">
              Organize courses by semester and build and visualize your
              degree plan.
            </span>
          </li>
          <li>
            <span className="welcome-feature-title">Course Information Cards</span>
            <span className="welcome-feature-desc">
              Click any course to view its description, prerequisites, 
              requirements, and other details. Check the box to add the 
              course credits to your progress counter.
            </span>
          </li>
          <li>
            <span className="welcome-feature-title">Prerequisite Visualization</span>
            <span className="welcome-feature-desc">
              Explore prerequisite relationships to see which courses are
              required before taking another. Use the{" "}
              <strong>Recursive highlights</strong> toggle to control how
              many prerequisite levels are shown: off highlights only a
              course's direct prerequisites, while on traces the full chain
              of prerequisites-of-prerequisites so you can see everything
              leading up to a course.
            </span>
          </li>
          <li>
            <span className="welcome-feature-title">Github</span>
            <span className="welcome-feature-desc">
              Feedback welcome! Found a bug or have an idea? Please open an 
              issue or discussion on the project's GitHub repository to help 
              improve the planner.
            </span>
          </li>
        </ul>

        <button type="button" className="welcome-get-started" onClick={onDismiss}>
          Get Started
        </button>
      </div>
    </div>
  );
}