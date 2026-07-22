import { useMemo, useState } from "react";
import { Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { courseById, courseEquivalencies, pageTemplates } from "./data";
import { Course, PageTemplate, TermPlan, VariantId } from "./types";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/planner/post-2024-4-year" replace />} />
      <Route path="/planner/:pageId" element={<PlannerPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function PlannerPage() {
  const { pageId } = useParams<{ pageId: string }>();
  const navigate = useNavigate();
  const template = pageTemplates.find((p) => p.id === pageId) ?? pageTemplates[0];
  const [variant, setVariant] = useState<VariantId>("A" as VariantId);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);

  const terms = useMemo<TermPlan[]>(() => {
    if (!template.supportsVariants || !template.termsByVariant) {
      return template.terms;
    }
    return template.termsByVariant[variant] ?? template.terms;
  }, [template, variant]);

  const termsByYear = useMemo(() => {
    const grouped = new Map<number, TermPlan[]>();

    for (const term of terms) {
      const match = term.label.match(/Year\s+(\d+)/i);
      const yearNumber = match ? Number(match[1]) : 0;
      const yearTerms = grouped.get(yearNumber) ?? [];
      yearTerms.push(term);
      grouped.set(yearNumber, yearTerms);
    }

    const termOrder = (label: string): number => {
      if (label.includes("Fall")) {
        return 0;
      }
      if (label.includes("Spring")) {
        return 1;
      }
      if (label.includes("Summer")) {
        return 2;
      }
      return 3;
    };

    return [...grouped.entries()]
      .sort(([a], [b]) => a - b)
      .map(([year, yearTerms]) => ({
        year,
        terms: [...yearTerms].sort((a, b) => termOrder(a.label) - termOrder(b.label)),
      }));
  }, [terms]);

  const selectedEquivalencies = useMemo(() => {
    if (!selectedCourse) {
      return [];
    }

    return courseEquivalencies
      .filter((item) => item.sourceCourseId === selectedCourse.id)
      .map((item) => ({
        ...item,
        equivalentCourse: courseById[item.equivalentCourseId],
      }))
      .filter((item) => Boolean(item.equivalentCourse));
  }, [selectedCourse]);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <h1>SFU MSE Course Navigator</h1>
          <p className="subtitle">DEV VERSION</p>
        </div>
        <div className="toolbar">
          <select
            value={template.id}
            onChange={(event) => navigate(`/planner/${event.target.value}`)}
            aria-label="Select page template"
          >
            {pageTemplates.map((page) => (
              <option key={page.id} value={page.id}>
                {page.title}
              </option>
            ))}
          </select>
          {template.supportsVariants && (
            <select
              value={variant}
              onChange={(event) => setVariant(event.target.value as VariantId)}
              aria-label="Select 5-year option"
            >
              {template.availableVariants.map((option) => (
                <option key={option} value={option}>
                  Option {option}
                </option>
              ))}
            </select>
          )}
          <button type="button">Import</button>
          <button type="button">Export</button>
          <button type="button">Settings</button>
        </div>
      </header>

      <main className="planner-layout">
        <section className="grid-panel">
          <h2>{template.title}</h2>
          <p className="meta">
            Curriculum: <b>{formatCurriculum(template)}</b> | Plan: <b>{template.planLength}</b>
            {template.supportsVariants ? (
              <>
                {" "}
                | 5-year option: <b>{variant}</b>
              </>
            ) : null}
          </p>

          <div className="year-grid">
            {termsByYear.map((yearGroup) => (
              <section key={yearGroup.year} className="year-row">
                <h3 className="year-title">Year {yearGroup.year}</h3>
                <div className="term-grid">
                  {yearGroup.terms.map((term) => (
                    <article key={term.id} className="term-column">
                      <h4>{term.label.split("-")[1]?.trim() ?? term.label}</h4>
                      <div className="course-list">
                        {term.courseIds.map((courseId) => {
                          const course = courseById[courseId];
                          if (!course) {
                            return (
                              <div key={courseId} className="course-card">
                                <strong>Unknown Course</strong>
                                <span>{courseId}</span>
                              </div>
                            );
                          }

                          return (
                            <button key={course.id} className="course-card" onClick={() => setSelectedCourse(course)}>
                              <strong>{course.code}</strong>
                              <span>{course.title}</span>
                            </button>
                          );
                        })}
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </section>

        <aside className="details-panel">
          <h2>Course Details</h2>
          {selectedCourse ? (
            <>
              <h3>{selectedCourse.code}</h3>
              <p>{selectedCourse.title}</p>
              <p>Credits: {selectedCourse.credits}</p>
              <p>{selectedCourse.description}</p>
              <h4>Equivalent Courses (Other Faculties)</h4>
              {selectedEquivalencies.length ? (
                <ul>
                  {selectedEquivalencies.map((eq) => (
                    <li key={`${eq.sourceCourseId}-${eq.equivalentCourseId}`}>
                      {eq.equivalentCourse?.code} ({eq.faculty}, {eq.equivalencyType})
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="empty-note">No equivalencies listed in the seed data yet.</p>
              )}
            </>
          ) : (
            <p className="empty-note">Click a course card to view details and equivalency information.</p>
          )}
        </aside>
      </main>

      <footer className="status-rail">
        <div>Validation: placeholder</div>
        <div>Credits Progress: placeholder</div>
        <div>Warnings: placeholder</div>
      </footer>
    </div>
  );
}

function formatCurriculum(template: PageTemplate): string {
  switch (template.curriculum) {
    case "post-2024":
      return "Post-Fall 2024";
    case "pre-2024":
      return "Pre-Fall 2024";
    case "double-degree":
      return "MSE + Business";
    default:
      return template.curriculum;
  }
}

export default App;
