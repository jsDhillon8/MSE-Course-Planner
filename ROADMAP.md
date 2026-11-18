# SFU Engineering Course Navigator - Roadmap

## Goal
Grow the MSE Course Navigator into a planner for **all SFU engineering programs**, using the fact that many courses can be swapped between programs (MSE ↔ SEE ↔ ENSC).

## Way of Working
- One batch per step. Each batch is reviewed and committed before the next one starts.
- Generalize the data model early, but add other programs' data only once MSE is solid.

## Design Principles
- **Curricula stay separate:** never mix requirements from different curriculum eras (pre/post Fall 2024) or programs.
- **No hidden rules:** every warning says why and how to fix it.
- **Portable data:** plans can be exported and imported; saved data is versioned.
- **Show sources:** equivalencies record where they came from (SFU calendar, outline notes, advising).
- **Works on small screens:** responsive grid, no dense layouts that break on phones.

## Quality Standards
- **Accessibility:** keyboard navigation, focus states, ARIA labels, contrast checks.
- **Reliability:** deterministic validation with regression tests (see `src/lib/requirements/*.test.ts`).

---

## Already Done
Full history in [CHANGELOG.md](CHANGELOG.md).

**Planner basics**
- Recommended plans for pre-2024, post-2024 and the MSE + Business double degree, including 5-year co-op options and "choose one of" slots.
- Live course outlines from the SFU Course Outlines API: sections by campus, instructors, schedule, grading, educational goals, previous offerings.
- Prerequisite map with a colour legend and recursive highlights.
- Credit counter (with transfer credits), completed-course tracking, dark mode, welcome guide.

**Custom planner**
- Custom Schedule page copied from any recommended plan, with a course picker (search + department filter), drag and drop, and Add/Move/Remove menus.
- Equivalent Courses in the details panel, with Swap into plan and undo (works, but not intuitive).
- Term-offering warnings (rare/never offered) and recent offering history, based on the last 9 terms.
- Autosave, versioned save format (v2, older saves upgraded automatically) and plan file Export/Import.

**Data and infrastructure**
- Course data trimmed to 4 fields (`id, code, title, credits`), synced from the SFU API each term with `npm run sync-data`.
- Requirement parser rewrite with regression tests; prerequisite fixes for MATH 152, MATH 232, PHYS 140/141, MATH 251.
- Program layer: plans organized by program (`src/data/programs/mse.json`), MSE only so far.
- Instructor Ratings (RateMyProfessors proxy on Render) and a bug reporter (Google Apps Script).
- Automatic deploys with GitHub Actions.
- UI polish: header subtitle on one line, inverted `?` button, "Available (x)" section badge.

---

## Phase 1: Foundations
1. **Program layer** ✅ Done (Nov 17, 2026)
   - Programs → curricula → templates, elective groups, concentrations.
   - One shared course list and one shared equivalency list across all programs.
   - Start with MSE only. SEE later tests the design.
2. **Versioned save format** ✅ Done (Nov 17, 2026)
   - Saved plans become `{ version, programId, curriculumId, terms, swaps }`.
   - Old saves (no version) are upgraded once when loaded.
   - Plan file import/export.
3. **Prerequisite validation**
   - Warning badges on placed courses whose prerequisites aren't met in an earlier term. Corequisites are allowed in the same term.
   - The details panel explains each warning and how to fix it, e.g. "MATH 251 needs MATH 152 in an earlier term".
   - Checked against the full prerequisite rules, so alternate prerequisites work automatically.

## Phase 2: Course List Expansion + Equivalents
1. **Relationship types:** add the `alt-prereq` type and give `partial` its advisor note. See [Course relationship types](README.md#course-relationship-types) in the README for what each type does.
2. **Sync additions:** `sync-data` adds every course named in an "or" option of the prerequisite text, plus every equivalent from the outline notes, each tagged `required`, `equivalent` or `alt-prereq`.
3. **Equivalents in the course list:** grouped under the course they replace, with the terms each is offered (MSE 220 · Fall ↳ SEE 222 · Spring). Dragging one in fills the original course's slot. The swap button stays.
4. **Alternate prerequisite courses in the list:** can be placed, marked "doesn't count toward graduation", and their credits are shown separately.
5. **Term-offering warnings**
   - When a course is placed in a term it's not usually offered, suggest an equivalent that is offered that term.
   - **New-course warning:** many new-curriculum MSE courses were first offered in Fall 2024, so the 9-term lookup wrongly flags them as "rare" or "never". When a course has no offerings before Fall 2024 (or before its first recorded offering), show a soft "new course, limited offering history" note instead of the rare/never warning.
6. **MSE ↔ SEE equivalency data.**
7. **Details panel polish:** group equivalents by department (SEE, ENSC, MATH, ...) and show each one's type and source.
8. **Optional:** a grid toggle that highlights every course with an equivalent.
9. **Semester availability filter** in the custom page's course picker: show only courses usually offered in Fall, Spring or Summer, using the same offering history as the term warnings. Helps find the equivalent that runs in the term you need.

## Phase 3: Requirement Features (built for any program)
1. Reusable **requirement group** component plus an electives tab. Technical electives come first: Group A, at least 4 for old-curriculum students.
2. **Agritech concentration:** a toggle with its requirements section at the top. Rules come from the SFU calendar and get confirmed before building.
3. **Complementary electives** using the same component, with an optional breadth filter.

## Phase 4: Redesign
Done after Phases 1-3 so the new design is built around the finished feature set instead of being redone as features land.
1. **Site restructure**
   - New **landing page**: what the planner does, and a clear starting point (choose program → curriculum → plan, or jump into a custom schedule).
   - Rework page structure and navigation so it scales to multiple programs (MSE first, SEE and others later).
   - A consistent visual style across all pages (layout, spacing, colours, typography) in light and dark mode.
2. **Custom page UI/UX redesign**
   - Rethink the layout of the term grid, course picker and details panel together.
   - Make adding, moving and swapping courses (including equivalents) obvious without needing the welcome guide.
   - Bring validation, offering and new-course warnings into one clear place.
   - Usable on phones and tablets, not only desktop.

## Milestone: Beta Release
The point where a student can plan their whole MSE degree and trust the result.

**Required features**
- Prerequisite validation (Phase 1).
- Equivalents and alternate prerequisites in the course list, and the new-course warning fix (Phase 2 core). False warnings would undercut validation.
- Technical electives (Phase 3, step 1), since they're a graduation requirement.
- The redesign (Phase 4). At minimum the new landing page, since beta is most students' first look at the site.

**Can ship before or after beta:** Agritech, complementary electives, the semester filter and the optional Phase 2 items.

**Release checks**
- Every recommended plan (4-year, 5-year co-op options, pre-2024, double degree) checked by hand against the SFU calendar.
- No known wrong prerequisites, and the requirement parser tests pass.
- Usable on a phone, at least for viewing plans and the Add/Move menus.
- Bug reporter confirmed working end to end.

## Milestone: 1.0
- At least one term of beta feedback addressed.
- Agritech concentration and complementary electives included.

## Phase 5: Expanding and Later Items
- SEE as the second full program, then other engineering programs.
- Calendar view (optional).
- Touch and keyboard drag, batch move.
- Student milestones: transfer credit, repeated courses.
- Offering confidence in the details panel (how often and how recently a course ran in each term).
- Full accessibility audit (new components get covered as they're built).

## Not Planned
Large-plan performance work (plans are too small to need it), cloud sync, ranked course suggestions, a diff view between curriculum versions.
