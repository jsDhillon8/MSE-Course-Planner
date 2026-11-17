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
- Course data trimmed to 4 fields (`id, code, title, credits`), synced from the SFU Course Outlines API with `npm run sync-data`.
- Prerequisite fixes (MATH 152, MATH 232, PHYS 140/141, MATH 251).
- Header subtitle on one line, inverted `?` button, "Available (x)" section badge.
- Bug reporter (Google Apps Script).
- Equivalent swap in the custom builder (works, but not intuitive).
- Autosave of custom plans to browser storage (no version number yet).
- Term-offering warning (rare/never offered) based on the last 9 terms.

---

## Phase 1: Foundations
1. **Program layer**
   - Programs → curricula → templates, elective groups, concentrations.
   - One shared course list and one shared equivalency list across all programs.
   - Start with MSE only. SEE later tests the design.
2. **Versioned save format**
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

## Phase 3: Requirement Features (built for any program)
1. Reusable **requirement group** component plus an electives tab. Technical electives come first: Group A, at least 4 for old-curriculum students.
2. **Agritech concentration:** a toggle with its requirements section at the top. Rules come from the SFU calendar and get confirmed before building.
3. **Complementary electives** using the same component, with an optional breadth filter.

## Phase 4: Expanding and Later Items
- SEE as the second full program, then other engineering programs.
- Calendar view (optional).
- Touch and keyboard drag, batch move.
- Student milestones: transfer credit, repeated courses.
- Offering confidence in the details panel (how often and how recently a course ran in each term).
- Full accessibility audit (new components get covered as they're built).

## Not Planned
Large-plan performance work (plans are too small to need it), cloud sync, ranked course suggestions, a diff view between curriculum versions.
