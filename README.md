# SFU MSE Course Navigator - Project Design Blueprint

**Goal:** Build an updated planner for the Simon Fraser University Mechatronic Systems Engineering (MSE) program with modern UX, accurate prerequisite flow, and long-term maintainability.

---

## High-Level Overview
- **3** Primary User Types
- **6** Core Page Templates
- **6** MVP Feature Pillars
- **6** Core Data Models
- **3** Release Phases

---

## Design Targets

| Area | Must Keep | Improve | Avoid |
| :--- | :--- | :--- | :--- |
| **Curriculum Coverage** | Official SFU curriculum alignment | Separate pages for pre-Fall 2024 and post-Fall 2024 | Mixing requirements from different curriculum eras |
| **Curriculum Grid** | Term-by-term visual map | Faster drag/drop, touch support, responsive columns | Dense layout that breaks on small screens |
| **Course Details** | Hover or click details panel | Prereq tree + reverse dependencies + offering confidence | Hidden prerequisite rationale |
| **Customization** | Elective slot selection | Constraint-aware suggestions and validation warnings | Manual trial-and-error only |
| **Persistence** | Import/export plans | Versioned schema + migration support + auto-save | Brittle storage format |
| **Student Workflow** | Quick what-if planning | Milestones (co-op, transfer credit, repeats) and conflict checker | No guidance when plan is invalid |
| **Cross-Faculty Equivalencies** | Show recognized substitutes clearly | Clickable equivalency map across faculties and departments | Students manually searching external calendars |

---

## Navigation Model

1.  **Landing Selector:** Choose curriculum era (Pre-2024, Post-2024, Double Degree).
2.  **Plan Selector:** Choose 4-year or 5-year recommended path.
3.  **Variant Selector:** If 5-year selected, switch between Option A, Option B, and Option C.
4.  **In-page Planner:** Drag/drop with live prerequisite and graduation requirement validation.

*Shared layout: Top controls, term grid, right details panel, bottom validation rail.*

---

## Site/Page Architecture

| Page | Curriculum Era | Plan Type | Special Controls |
| :--- | :--- | :--- | :--- |
| **Post-2024 4-Year** | Post-Fall 2024 | Recommended 4-year | Curriculum-year lock + term filter |
| **Post-2024 5-Year** | Post-Fall 2024 | Recommended 5-year | 5-year option switcher (A/B/C) |
| **Pre-2024 4-Year** | Pre-Fall 2024 | Recommended 4-year | Legacy prerequisite rule set |
| **Pre-2024 5-Year** | Pre-Fall 2024 | Recommended 5-year | Legacy plan switcher + migration notice |
| **MSE + Business Double Degree** | Separate track | Combined degree map | Faculty ownership tags + extra credit progress |
| **Custom Planner** | User-selected base | What-if scenarios | Start from any template page |

---

## Feature Set 

| Feature | V0 | V1+ | Notes |
| :--- | :--- | :--- | :--- |
| **Drag/drop planning** | Yes | Batch move + keyboard controls | Must support desktop and touch |
| **Prereq validation** | Hard/soft rule engine | Explainable conflict traces | Show exactly why course placement fails |
| **Elective handling** | Template slots + chooser | Recommendation ranking | Handle technical + complementary electives |
| **Persistence** | Local autosave + file import/export | Optional cloud sync | Keep data portable |
| **Term offerings** | Static expected term flags | Historical probability model | Display confidence and recency |
| **Multi-page curriculum** | Pre/Post + 4-yr/5-yr + Double Degree | Diff view between versions | Keeps requirements unambiguous |
| **Course equivalency** | SFU-equivalent courses from other faculties | Suggested alternatives by term/seat history | Mark source (calendar/advising) |

---

## Equivalency UX (New Core Feature)
1. On course click, details panel shows an "Equivalent Courses" section.
2. Equivalents grouped by faculty and department (e.g., ENSC, MATH, PHYS, BUS).
3. Each equivalent shows substitution scope: full replacement, partial credit, or elective-only.
4. Planner validates if selected equivalent satisfies prereqs and graduation rules.
5. Optional toggle on grid: highlight all courses that have approved cross-faculty equivalents.

---

## Data Model

| Entity | Key Fields | Purpose |
| :--- | :--- | :--- |
| **Course** | id, code, title, units, prereqExpr, coreqExpr, offeredTerms | Source of truth for rule checks and display |
| **CurriculumTrack** | trackId, era(pre/post), planLength(4/5), requiredCourses, electiveRules | Represents each official curriculum page template |
| **PlanVariant** | variantId(A/B/C), coopPattern, termOverrides | Stores 5-year option-specific structures |
| **Plan** | planId, terms[], chosenElectives, overrides, version | User's schedule state and edits |
| **ValidationIssue** | issueType, severity, affectedCourses, explanation | Drives warnings and guidance panel |
| **ProgramProfile** | programId, name, owningFaculty, graduationRules | Handles standard MSE vs MSE+Business |
| **CourseEquivalency** | sourceCourseId, equivalentCourseId, faculty, type, provenance | Maps approved cross-faculty substitutions |

### Course data files (`src/data/`)

| File | Edited by | Contents |
|---|---|---|
| `templates.json` | hand | Plan templates (courses per term, co-op variants) |
| `placeholderCourses.json` | hand | Placeholder slots (COMP ELEC 1, CO-OP, ...) |
| `electives.json` | hand | Extra course codes to sync, by category (e.g. `technical`) |
| `equivalencyOverrides.json` | hand | Equivalency pairs to add, or to change the type of a generated pair |
| `generated/*.json` | `npm run sync-data` | Courses, raw SFU requirement text, and equivalencies from outline notes |

Refresh once a term: run `npm run sync-data`, review `git diff src/data/generated`, then run `npm run test:dependency-graph`. If the requirement map changed on purpose, paste the new snapshot the test prints into `src/lib/requirements/dependencyGraph.snapshot.json`.

---

## Implementation Plan
- **Phase 1:** Baseline grid UI, course catalog, drag/drop, side panel details.
- **Phase 2:** Prerequisite engine, elective slot logic, import/export compatibility.
- **Phase 3:** Touch responsiveness, accessibility, performance tuning, QA fixtures.

---

## Quality Checklist
- **Accessibility:** Keyboard navigation, focus states, ARIA labels, contrast checks.
- **Reliability:** Deterministic validation engine with regression fixtures.
- **Performance:** Virtualized grid rendering for large custom plans.
- **Transparency:** Every warning includes remediation steps.

---

## Instructor Ratings (RateMyProfessors proxy)

The course details panel can show RateMyProfessors (RMP) ratings for each instructor. Browsers can't call RMP directly (CORS), and GitHub Pages only serves static files, so the lookup runs in a small Express server in `server/` that is **hosted separately from GitHub Pages**.

### Local development

Run the proxy and the Vite dev server in two terminals:

```bash
npm run server   # RMP proxy on http://localhost:3001
npm run dev      # Vite on http://localhost:5173, proxies /api -> localhost:3001
```

No env vars are needed locally. Ratings load only when you expand an instructor, and both the server (24h) and the browser cache results.

API: `GET /api/rmp/professor?name=Amr%20Marzouk&course=MSE%20110` (the `course` param is optional).

### Deploying the proxy to Render

1. Push `render.yaml` and `server/` to `main` on GitHub.
2. In Render: **New > Blueprint**, pick this repository, and apply. This creates the `mse-rmp-proxy` web service (free plan, `npm ci --omit=dev`, `npm run server`, health check `/healthz`).
3. Note the service URL (for example `https://mse-rmp-proxy.onrender.com`) and check `https://<service>.onrender.com/healthz` returns `{"ok":true}`.
4. If the site is served from another origin, edit `ALLOWED_ORIGINS` in the Render dashboard (comma-separated, origin only, no path).

### Pointing the GitHub Pages build at the proxy

`VITE_RMP_API_URL` is read at build time. Create `.env.production` (see `.env.example`):

```
VITE_RMP_API_URL=https://<service>.onrender.com/api/rmp
```

Then commit and push to `main`; the GitHub Actions workflow rebuilds and deploys the site. If this variable is missing, the production build hides the Instructor Ratings section instead of showing errors.

Free Render services sleep after ~15 minutes idle, so the first lookup after a quiet period can take 30–60 seconds while it wakes up.

RMP's API is unofficial and may change or rate-limit without notice; data may be incomplete.
