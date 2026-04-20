import { useEffect, useMemo, useState } from "react";
import { Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { courseById, courseEquivalencies, pageTemplates } from "./data";
import { Course, PageTemplate, TermPlan, VariantId } from "./types";

// ─── SFU API Types ───────────────────────────────────────────────────────────

interface SfuSection {
  text: string;
  value: string;
  title: string;
  classType: "e" | "n";
  sectionCode: string;
  associatedClass: string;
}

interface SfuScheduleItem {
  startTime: string;
  endTime: string;
  days: string;
  sectionCode: string;
  campus: string;
  isExam: boolean;
  startDate: string;
  endDate: string;
}

interface SfuInstructor {
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  roleCode: string;
  profileUrl?: string;
}

interface SfuOutline {
  title: string;
  description: string;
  prerequisites: string;
  corequisites: string;
  units: string;
  term: string;
  deliveryMethod: string;
  educationalGoals?: string;
  courseDetails?: string;
  instructor?: SfuInstructor[];
  courseSchedule?: SfuScheduleItem[];
  grades?: { description: string; weight: string }[];
  gradingNotes?: string;
}

// ─── SFU API Hook ─────────────────────────────────────────────────────────────

type LiveStatus = "idle" | "loading" | "success" | "error" | "not-offered";

interface LiveCourseData {
  status: LiveStatus;
  outline: SfuOutline | null;
  sectionName: string | null;
  errorMsg?: string;
}

const SFU_BASE = "https://www.sfu.ca/bin/wcm/course-outlines";

function parseCourseCode(code: string): { dept: string; number: string } | null {
  const match = code.trim().match(/^([A-Za-z]+)\s+(\S+)$/);
  if (!match) return null;
  return { dept: match[1].toLowerCase(), number: match[2].toLowerCase() };
}

async function fetchSectionsForTerm(
  term: string,
  dept: string,
  num: string
): Promise<SfuSection[] | null> {
  const res = await fetch(`${SFU_BASE}?${term}/${dept}/${num}`);
  if (!res.ok) return null;
  const data = await res.json();
  // API sometimes returns an error object instead of an array
  if (!Array.isArray(data)) return null;
  return data as SfuSection[];
}

function useLiveCourseData(course: Course | null): LiveCourseData {
  const [state, setState] = useState<LiveCourseData>({ status: "idle", outline: null, sectionName: null });

  useEffect(() => {
    if (!course) {
      setState({ status: "idle", outline: null, sectionName: null });
      return;
    }

    const parsed = parseCourseCode(course.code);
    if (!parsed) {
      setState({ status: "error", outline: null, sectionName: null, errorMsg: "Could not parse course code." });
      return;
    }

    let cancelled = false;
    setState({ status: "loading", outline: null, sectionName: null });

    async function fetchData() {
      try {
        const { dept, number } = parsed!;

        // Try current term first, then registration (upcoming) term
        let sections: SfuSection[] | null = null;
        let termSlug = "current/current";

        sections = await fetchSectionsForTerm(`current/current`, dept, number);
        if (!sections) {
          sections = await fetchSectionsForTerm(`registration/registration`, dept, number);
          termSlug = "registration/registration";
        }

        if (!sections || sections.length === 0) {
          if (!cancelled) setState({ status: "not-offered", outline: null, sectionName: null });
          return;
        }

        // Prefer an enrollment lecture section
        const enrollSection =
          sections.find((s) => s.classType === "e" && s.sectionCode === "LEC") ??
          sections.find((s) => s.classType === "e") ??
          sections[0];

        if (!enrollSection) {
          if (!cancelled) setState({ status: "not-offered", outline: null, sectionName: null });
          return;
        }

        const outlineRes = await fetch(
          `${SFU_BASE}?${termSlug}/${dept}/${number}/${enrollSection.value}`
        );
        if (!outlineRes.ok) {
          if (!cancelled) setState({ status: "not-offered", outline: null, sectionName: null });
          return;
        }

        const outline = await outlineRes.json();
        if (!cancelled) setState({ status: "success", outline, sectionName: enrollSection.text });
      } catch (err) {
        if (!cancelled) {
          setState({ status: "error", outline: null, sectionName: null, errorMsg: String(err) });
        }
      }
    }

    fetchData();
    return () => { cancelled = true; };
  }, [course?.id]);

  return state;
}

// ─── App ─────────────────────────────────────────────────────────────────────

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
      if (label.includes("Fall")) return 0;
      if (label.includes("Spring")) return 1;
      if (label.includes("Summer")) return 2;
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
    if (!selectedCourse) return [];
    return courseEquivalencies
      .filter((item) => item.sourceCourseId === selectedCourse.id)
      .map((item) => ({ ...item, equivalentCourse: courseById[item.equivalentCourseId] }))
      .filter((item) => Boolean(item.equivalentCourse));
  }, [selectedCourse]);

  const liveData = useLiveCourseData(selectedCourse);

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
                            <button
                              key={course.id}
                              className={`course-card${selectedCourse?.id === course.id ? " selected" : ""}`}
                              onClick={() => setSelectedCourse(course)}
                            >
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
              <p className="course-title-text">{selectedCourse.title}</p>
              <p>Credits: {selectedCourse.credits}</p>
              <p className="static-description">{selectedCourse.description}</p>

              {/* ── Live SFU Outline ── */}
              <div className="live-section">
                <h4 className="live-section-header">
                  Live SFU Outline
                  {liveData.status === "loading" && (
                    <span className="live-badge loading">Fetching…</span>
                  )}
                  {liveData.status === "success" && (
                    <span className="live-badge success">
                      {liveData.outline?.term ?? "Live"} · {liveData.sectionName}
                    </span>
                  )}
                  {liveData.status === "not-offered" && (
                    <span className="live-badge warn">Not found this term</span>
                  )}
                  {liveData.status === "error" && (
                    <span className="live-badge error">API error</span>
                  )}
                </h4>

                {liveData.status === "loading" && (
                  <p className="empty-note">Contacting SFU Outlines API…</p>
                )}
                {liveData.status === "not-offered" && (
                  <p className="empty-note">
                    No section found for the current or upcoming term. The description above still
                    applies.
                  </p>
                )}
                {liveData.status === "error" && (
                  <p className="empty-note">Could not reach the SFU Outlines API right now.</p>
                )}
                {liveData.status === "success" && liveData.outline && (
                  <LiveOutlineBlock outline={liveData.outline} />
                )}
              </div>

              {/* ── Equivalencies ── */}
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

// ─── Live Outline Block ───────────────────────────────────────────────────────

function LiveOutlineBlock({ outline }: { outline: SfuOutline }) {
  return (
    <div className="live-outline">
      {outline.deliveryMethod && (
        <p className="outline-meta">
          <span className="meta-label">Delivery:</span> {outline.deliveryMethod}
        </p>
      )}

      {outline.prerequisites && (
        <div className="outline-field">
          <span className="meta-label">Prerequisites:</span> {outline.prerequisites}
        </div>
      )}

      {outline.corequisites && (
        <div className="outline-field">
          <span className="meta-label">Corequisites:</span> {outline.corequisites}
        </div>
      )}

      {outline.instructor && outline.instructor.length > 0 && (
        <div className="outline-field">
          <span className="meta-label">Instructor(s):</span>
          <ul className="inline-list">
            {outline.instructor.map((inst, i) => (
              <li key={i}>
                {inst.name}
                {inst.email && (
                  <>
                    {" · "}
                    <a href={`mailto:${inst.email}`}>{inst.email}</a>
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {outline.courseSchedule && outline.courseSchedule.filter((s) => !s.isExam).length > 0 && (
        <div className="outline-field">
          <span className="meta-label">Schedule:</span>
          <ul className="inline-list">
            {outline.courseSchedule
              .filter((s) => !s.isExam)
              .map((s, i) => (
                <li key={i}>
                  {s.days} {s.startTime}–{s.endTime} ({s.sectionCode}, {s.campus})
                </li>
              ))}
          </ul>
        </div>
      )}

      {outline.grades && outline.grades.length > 0 && (
        <div className="outline-field">
          <span className="meta-label">Grading:</span>
          <ul className="inline-list">
            {outline.grades.map((g, i) => (
              <li key={i}>
                {g.description}: {g.weight}%
              </li>
            ))}
          </ul>
        </div>
      )}

      {outline.educationalGoals && (
        <details className="outline-goals">
          <summary>Educational Goals</summary>
          <p>{outline.educationalGoals}</p>
        </details>
      )}
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

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