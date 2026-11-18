# SFU MSE Course Navigator - Project Design Blueprint 

**Goal:** Build an updated planner for the Simon Fraser University Mechatronic Systems Engineering (MSE) program with modern UX, accurate prerequisite flow, and long-term maintainability, and grow it to cover all SFU engineering programs.

Plans, priorities and design principles are in [ROADMAP.md](ROADMAP.md).

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

## Data Model

| Entity | Key Fields | Purpose |
| :--- | :--- | :--- |
| **Program** | programId, name, curricula, electiveGroups, concentrations | Top level for each engineering program (MSE first, SEE and others later) |
| **Course** | id, code, title, units, prereqExpr, coreqExpr, offeredTerms | Source of truth for rule checks and display |
| **CurriculumTrack** | trackId, era(pre/post), planLength(4/5), requiredCourses, electiveRules | Represents each official curriculum page template |
| **PlanVariant** | variantId(A/B/C), coopPattern, termOverrides | Stores 5-year option-specific structures |
| **Plan** | planId, terms[], chosenElectives, overrides, version | User's schedule state and edits |
| **ValidationIssue** | issueType, severity, affectedCourses, explanation | Drives warnings and guidance panel |
| **ProgramProfile** | programId, name, owningFaculty, graduationRules | Handles standard MSE vs MSE+Business |
| **CourseEquivalency** | sourceCourseId, equivalentCourseId, faculty, type, provenance | Maps approved cross-faculty substitutions |

### Course relationship types

| Type | Fills graduation slot | Satisfies prerequisites | Example |
| :--- | :--- | :--- | :--- |
| `full` | Yes | Yes | SEE 222 ↔ MSE 220 |
| `variant` | Yes (same lecture with or without a lab or tutorial; credits differ) | Yes | MATH 150 / MATH 151, CHEM 120 / CHEM 121 |
| `alt-prereq` | No | Only where SFU's prerequisite text lists it | MATH 260 for MSE 281's dependents |

`sync-data` tags each "may not take for further credit" pair from the outline notes: `variant` when the two courses are also a "one of" choice in the local calendar copy, `full` otherwise. A "one of" choice without that note (BUS 374 / BUS 381) is just a choice slot, not an equivalency.

### Course data files (`src/data/`)

| File | Edited by | Contents |
|---|---|---|
| `programs/<id>.json` | hand | One file per program: its curricula (e.g. Pre/Post-Fall 2024), each with degree requirements (Major, Double Degree), elective groups (e.g. `technical` Group A), concentrations (AgriTech) and plan templates (courses per term, co-op variants). Requirements are written from the local calendar copy below |
| `calendar/` | `npm run calendar:update` | Local copy of SFU's degree requirements: `sources.json` (each page's link and copy date), `text/` (the pages' wording) and `wqb-courses.json` (WQB certified courses). The site never reads SFU's calendar directly |
| `placeholderCourses.json` | hand | Placeholder slots (COMP ELEC 1, CO-OP, ...) |
| `generated/*.json` | `npm run sync-data` | Courses, raw SFU requirement text, and equivalencies from outline notes. Each course records `lastOffered`, the newest term with sections (next term, the current term, then up to 6 back; `null` if none), so the planner can mark courses not offered in the last 3 terms. Each course is tagged `listedAs`: `required` (named by a program), `equivalent` (in a required course's "may not take for further credit" notes) or `alt-prereq` (an "or" option in a required course's prerequisites); added courses are one level deep and need an SFU outline from the last 6 terms. Ones left out for that reason are listed in `skippedCourses.json` (e.g. CMPT 128), so they can still be marked "Not offered recently" where SFU's notes name them. `courseRequirementsByOutlineTerm.json` holds older MSE rules for curricula with an `outlineTerm` (pre-Fall 2024 uses `2024/spring`), so those plans are checked against the outlines that applied to them |

When a new SFU calendar is published, run `npm run calendar:check` to see what changed compared with the local copy. To move to the new calendar, change the URLs in `calendar/sources.json` if needed, run `npm run calendar:update`, update the degree requirements in `programs/<id>.json` to match, and run `npm run test:requirements` (checks `programs/<id>.json` against the saved wording, and every recommended plan against its degree).

Refresh once a term: run `npm run sync-data`, review `git diff src/data/generated`, then run `npm run test:dependency-graph` and `npm run test:plan-validation` (every recommended plan must pass prerequisite validation). If the requirement map changed on purpose, paste the new snapshot the test prints into `src/lib/requirements/dependencyGraph.snapshot.json`.

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
