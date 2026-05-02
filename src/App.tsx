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

/** One fetched section's worth of offering data shown in the outline panel. */
interface OfferedSection {
  sectionName: string;         // e.g. "D100"
  termLabel: string;           // e.g. "Spring 2026"
  campus: string;              // e.g. "Burnaby", "Surrey", "Vancouver"
  instructors: SfuInstructor[];
  deliveryMethod: string;
}

// ─── SFU API Hook ─────────────────────────────────────────────────────────────

type LiveStatus = "idle" | "loading" | "success" | "error" | "not-offered";

interface LiveCourseData {
  status: LiveStatus;
  /** Shared fields taken from the first outline fetched. */
  sharedOutline: Pick<SfuOutline, "description" | "prerequisites" | "corequisites" | "educationalGoals" | "grades"> | null;
  /** All sections found across current + registration terms. */
  sections: OfferedSection[];
  errorMsg?: string;
}

const SFU_BASE = "https://www.sfu.ca/bin/wcm/course-outlines";

function parseCourseCode(code: string): { dept: string; number: string } | null {
  // Only match simple two-token codes like "MSE 102" or "PHYS 141"
  // Reject placeholders like "COMP ELEC 1", "CO-OP", "MSE 4XX TECH ELEC 1"
  const match = code.trim().match(/^([A-Za-z]{2,8})\s+([A-Za-z0-9]{1,6})$/);
  if (!match) return null;
  return { dept: match[1].toLowerCase(), number: match[2].toLowerCase() };
}

async function fetchSectionsForTerm(
  term: string,
  dept: string,
  num: string
): Promise<{ sections: SfuSection[]; termSlug: string } | null> {
  try {
    const res = await fetch(`${SFU_BASE}?${term}/${dept}/${num}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    return { sections: data as SfuSection[], termSlug: term };
  } catch {
    return null;
  }
}

/** Convert SFU's numeric term string (e.g. "1251") into a readable label like "Spring 2025". */
function termCodeToLabel(termCode: string): string {
  const match = termCode.match(/^1(\d{2})(\d)$/);
  if (!match) return termCode;
  const year = 2000 + parseInt(match[1], 10);
  const semMap: Record<string, string> = { "1": "Spring", "4": "Summer", "7": "Fall" };
  const sem = semMap[match[2]] ?? `Term ${match[2]}`;
  return `${sem} ${year}`;
}

/** Pick the campus from the first non-exam schedule item, falling back to "Unknown". */
function campusFromOutline(outline: SfuOutline): string {
  const item = outline.courseSchedule?.find((s) => !s.isExam);
  return item?.campus ?? "Unknown";
}

function useLiveCourseData(course: Course | null): LiveCourseData {
  const [state, setState] = useState<LiveCourseData>({ status: "idle", sharedOutline: null, sections: [] });

  useEffect(() => {
    if (!course) {
      setState({ status: "idle", sharedOutline: null, sections: [] });
      return;
    }

    // Parse inside the effect so the closure always has the current course code
    const parsed = parseCourseCode(course.code);
    if (!parsed) {
      setState({ status: "not-offered", sharedOutline: null, sections: [] });
      return;
    }

    let cancelled = false;
    setState({ status: "loading", sharedOutline: null, sections: [] });

    async function fetchData() {
      try {
        const { dept, number } = parsed;

        // Fetch both terms concurrently; each may return sections or null
        const [currentResult, registrationResult] = await Promise.all([
          fetchSectionsForTerm("current/current", dept, number),
          fetchSectionsForTerm("registration/registration", dept, number),
        ]);


        // Build a de-duplicated list of (termSlug, section) pairs for all LEC enrollment sections.
        // De-duplicate by section value only — the same section won't appear across both term slugs.
        const toFetch: { termSlug: string; section: SfuSection }[] = [];
        const seenValues = new Set<string>();

        for (const result of [currentResult, registrationResult]) {
          if (!result) continue;
          // Prefer LEC enrollment sections; fall back to any enrollment section
          const hasLec = result.sections.some((s) => s.classType === "e" && s.sectionCode === "LEC");
          const candidates = result.sections.filter(
            (s) => s.classType === "e" && (hasLec ? s.sectionCode === "LEC" : true)
          );
          for (const sec of candidates) {
            if (!seenValues.has(sec.value)) {
              seenValues.add(sec.value);
              toFetch.push({ termSlug: result.termSlug, section: sec });
            }
          }
        }

        if (toFetch.length === 0) {
          if (!cancelled) setState({ status: "not-offered", sharedOutline: null, sections: [] });
          return;
        }

        // Fetch each section's outline concurrently
        const outlineResults = await Promise.all(
          toFetch.map(async ({ termSlug, section }) => {
            try {
              const res = await fetch(`${SFU_BASE}?${termSlug}/${dept}/${number}/${section.value}`);
              if (!res.ok) return null;
              const raw = await res.json();
              console.log("[SFU] raw outline keys:", Object.keys(raw));
              // SFU API nests data — try top-level first, then common wrappers
              const outline: SfuOutline = raw.info ?? raw.courseInfo ?? raw;
              // Attach schedule/instructor from top level if nested outline doesn't have them
              if (!outline.courseSchedule && raw.courseSchedule) outline.courseSchedule = raw.courseSchedule;
              if (!outline.instructor && raw.instructor) outline.instructor = raw.instructor;
              if (!outline.grades && raw.grades) outline.grades = raw.grades;
              return { outline, sectionName: section.value };
            } catch {
              return null;
            }
          })
        );

        const validResults = outlineResults.filter((r): r is { outline: SfuOutline; sectionName: string } => r !== null);
        if (validResults.length === 0) {
          if (!cancelled) setState({ status: "not-offered", sharedOutline: null, sections: [] });
          return;
        }

        // Extract shared fields from the first outline
        const first = validResults[0].outline;
        const sharedOutline = {
          description: first.description,
          prerequisites: first.prerequisites,
          corequisites: first.corequisites,
          educationalGoals: first.educationalGoals,
          grades: first.grades,
        };

        // Build OfferedSection list, one entry per fetched outline
        const sections: OfferedSection[] = validResults.map(({ outline, sectionName }) => ({
          sectionName,
          termLabel: termCodeToLabel(outline.term),
          campus: campusFromOutline(outline),
          instructors: outline.instructor ?? [],
          deliveryMethod: outline.deliveryMethod,
        }));

        if (!cancelled) setState({ status: "success", sharedOutline, sections });
      } catch (err) {
        if (!cancelled) {
          setState({ status: "error", sharedOutline: null, sections: [], errorMsg: String(err) });
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
                      {liveData.sections.length} section{liveData.sections.length !== 1 ? "s" : ""} found
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
                {liveData.status === "success" && liveData.sharedOutline && (
                  <LiveOutlineBlock sharedOutline={liveData.sharedOutline} sections={liveData.sections} />
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

interface LiveOutlineBlockProps {
  sharedOutline: Pick<SfuOutline, "description" | "prerequisites" | "corequisites" | "educationalGoals" | "grades">;
  sections: OfferedSection[];
}

function LiveOutlineBlock({ sharedOutline, sections }: LiveOutlineBlockProps) {
  // Group sections by termLabel so each semester gets its own heading
  const byTerm = sections.reduce<Record<string, OfferedSection[]>>((acc, sec) => {
    (acc[sec.termLabel] ??= []).push(sec);
    return acc;
  }, {});

  return (
    <div className="live-outline">
      {/* Course description from the API */}
      {sharedOutline.description && (
        <div className="outline-field outline-description">
          <span className="meta-label">Description:</span>
          <p className="outline-description-text">{sharedOutline.description}</p>
        </div>
      )}

      {sharedOutline.prerequisites && (
        <div className="outline-field">
          <span className="meta-label">Prerequisites:</span> {sharedOutline.prerequisites}
        </div>
      )}

      {sharedOutline.corequisites && (
        <div className="outline-field">
          <span className="meta-label">Corequisites:</span> {sharedOutline.corequisites}
        </div>
      )}

      {/* Per-semester offerings */}
      {Object.entries(byTerm).map(([termLabel, termSections]) => (
        <div key={termLabel} className="outline-term-group">
          <p className="outline-term-heading">{termLabel}</p>
          <ul className="inline-list">
            {termSections.map((sec, i) => {
              const instructorNames =
                sec.instructors.length > 0
                  ? sec.instructors.map((inst) => inst.name).join(", ")
                  : "Instructor TBA";
              return (
                <li key={i} className="outline-section-row">
                  <span className="section-tag">{sec.sectionName}</span>
                  <span className="section-campus">{sec.campus}</span>
                  <span className="section-instructor">{instructorNames}</span>
                  {sec.deliveryMethod && (
                    <span className="section-delivery">{sec.deliveryMethod}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      {sharedOutline.grades && sharedOutline.grades.length > 0 && (
        <div className="outline-field">
          <span className="meta-label">Grading:</span>
          <ul className="inline-list">
            {sharedOutline.grades.map((g, i) => (
              <li key={i}>
                {g.description}: {g.weight}%
              </li>
            ))}
          </ul>
        </div>
      )}

      {sharedOutline.educationalGoals && (
        <details className="outline-goals">
          <summary>Educational Goals</summary>
          <p>{sharedOutline.educationalGoals}</p>
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