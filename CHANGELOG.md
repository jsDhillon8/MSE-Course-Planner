# Changelog

What's new in the SFU MSE Course Navigator, newest first. Upcoming work is in [ROADMAP.md](ROADMAP.md).

---

## November 18, 2026 - Unreleased (0.1.8)
- **Pre-Fall 2024 plans are checked against the old MSE prerequisites** (the Spring 2024 outlines), so old-curriculum plans no longer show warnings like "MSE 222 needs MSE 103". Courses from other departments (MATH, PHYS, BUS, ...) still use their current rules.
- Where the current SFU outline asks for more than the old one, the course details panel shows a soft note instead of a warning, e.g. "Current SFU outline also lists MSE 252; old-curriculum students usually resolve this through a prerequisite appeal."
- Relationship highlights also follow your curriculum's prerequisites.
- **"Not offered recently" badge:** courses with no sections this term, next term or the 3 terms before are marked, with the last term they ran in the tooltip and the course details panel. In the course picker they're faded and listed last in their department, but can still be found and added (e.g. older courses on the pre-Fall 2024 curriculum). The same goes for the equivalent courses listed in the course details panel, including retired ones that are no longer in the course list (e.g. CMPT 128 and CMPT 166 under CMPT 130). That list shows current courses first, then older ones, then courses the planner has no details for.
- **Equivalents are grouped in the course picker:** SEE, ENSC and other courses that replace a required course (e.g. SEE 222 for MSE 220) now sit under that course. Open the group to see which terms each one is usually offered. Dragging an equivalent onto the schedule takes the place of the original course if it's already in your plan, and "Undo swap" brings the original back. Searching for an equivalent opens its group.
- **More courses in the course list:** every equivalent named in a course's SFU outline (e.g. SEE courses that replace MSE ones) and every "or" option in a prerequisite (e.g. MATH 154 and MATH 157 for MATH 152) can now be found and placed.
- **Fewer false prerequisite warnings:** prerequisites that can be met without an SFU course (e.g. Chemistry 12 for CHEM 120) or by a separate route for your program (e.g. double degree students for BUS 360W) no longer ask for a course. Notes like "must not be taken concurrently with MSE 493" and recommendations are no longer read as prerequisites, and MATH 251 now accepts MATH 158 or MATH 154 + 155 as well as MATH 152.
- Courses that are only another option in a prerequisite (e.g. MACM 101 in MATH 232's "MATH 150 or 151 or MACM 101") are no longer shown as equivalents in the course details panel, and can't be swapped into a slot.
- **ECON 103 / ECON 113 and ECON 105 / ECON 115** now share one card with the version toggle, like MATH 150 / 151, and count as the same course. SFU's "taken X first may not then take this course" notes are only used together with a calendar "one of" choice, so a follow-up course like CMPT 125 isn't treated as the same as CMPT 130.
- The recommended plan pages now work like the custom page on wide screens: the schedule and the course details panel **scroll independently** with slim scrollbars, and the header and progress footer stay in place.
- **Reverted:** the Curriculum Relationships legend is no longer pinned while you scroll (added in 0.1.6). It now stays in place above the schedule and scrolls away with it.
- **Lab and tutorial versions share one card:** MATH 150 / MATH 151 and CHEM 120 / CHEM 121 (the same lecture with or without a lab or tutorial) now appear as one course in the custom schedule, with a toggle to pick the one you're taking. Term credits and the progress footer update to match. The toggle is on the recommended plans too.

## November 17, 2026 - Prerequisite checks and degree requirements (0.1.7)
- **Degree requirements from the SFU calendar** are now kept in the planner: required courses, "one of" choices, technical electives (Group A), complementary and business electives, and the AgriTech concentration, for both curricula and for the Major and the Double Degree. Each comes with its source link and the date it was copied.
- Technical electives from Group A (e.g. MSE 450, MSE 481), the AgriTech courses (BISC 106, MSE 360, SEE 351) and MSE 282 can now be added to a custom schedule, and Group A electives count toward graduation.
- Recommended plans were checked against the calendar: Fall 2024 plans now list MSE 282 Signals and Systems (which replaced MSE 280), the Fall 2024 double degree no longer includes MSE 380 and MSE 311, and the pre-Fall 2024 double degree now has all six technical electives and no longer lists BUS 336.
- **Prerequisite warnings** on the custom schedule: a course placed before its prerequisites shows a warning badge, and the course details panel explains what's missing and how to fix it (e.g. "MATH 251 needs MATH 152 in an earlier term"). "Or" options, courses that may be taken concurrently, corequisites, equivalent courses and swapped-in courses are all taken into account.
- **Credits that count:** custom schedule progress now only counts credits toward graduation. Courses outside your curriculum, or equivalent to one that already counts, are marked "Doesn't count toward graduation" and shown separately in the footer.
- The course picker and course details panels can be **hidden** to give the schedule more room.
- Offering warnings, the relationship legend and RateMyProfessors comments are now collapsible.
- The MSE + Business double-degree plans were reordered so every course comes after its prerequisites.
- Fixed prerequisites written as "A, B, C, or D" being read as needing all of them (affected BUS 232, BUS 336 and ECON 201).
- Fixed BUS 343 being treated as equivalent to BUEC 232, which showed Marketing as a prerequisite for BUS 312 and BUS 336.

## November 17, 2026 - Save your plans (0.1.6)
- **Export** your custom schedule to a file and **Import** it later, so you can back it up, move it to another device, or share it with a friend.
- Importing asks before replacing a schedule you've already started, and explains what's wrong if a file can't be read.
- Saved schedules now include a version number, so they keep working as the planner changes. Older saves are upgraded automatically.
- The MSE + Business double degree is now listed as two plans, one per curriculum (Post-Fall 2024 and Pre-Fall 2024). Old links still work.
- Behind the scenes: course plans are now organized by program, the first step toward supporting other SFU engineering programs.
- On the custom page, the course list, schedule and details panel now **scroll independently**, with subtler scrollbars.
- The progress footer and the relationship legend stay pinned while you scroll.

## November 13, 2026 - Instructor ratings and bug reports (0.1.5)
- **Instructor Ratings** in the course details panel: expand an instructor to see their RateMyProfessors rating, difficulty, "would take again" percentage and recent comments (with Show more / Show less).
- Ratings say clearly when an instructor isn't on RateMyProfessors, has no ratings yet, or is only a possible match to verify.
- **Report a bug** from the header: describe what happened, add optional steps to reproduce, and send it straight to the developer.
- **More accurate prerequisites:** rules are now read in full, including "or" options, minimum grades and corequisites.
- Course data is refreshed from SFU each term instead of being typed in by hand.
- Faster loading and smaller styles. The site now deploys automatically when changes are published.

## October 28, 2026 - Offering history and course swaps (0.1.4)
- **Offering warnings:** the custom planner flags courses placed in a term they're rarely or never offered.
- Each course card shows its **recent offering history** by term.
- **Swap into plan:** replace a course in your custom schedule with one of its equivalents, then undo it if you change your mind.
- Fixed a bug where some courses showed the wrong prerequisites and dependents.

## October 3-4, 2026 - Custom planner (0.1.3)
- New **Custom Schedule** page: copy any recommended plan as a starting point and make it your own.
- **Course picker** with search and a department filter, showing only courses not yet in your plan.
- **Drag and drop** courses between terms, or use the Add, Move and Remove menus on each card.
- **Mark courses as completed** and track your progress in the footer.
- **Equivalent Courses** section in the course details panel, read from SFU course outlines.
- Course outlines now show **Educational Goals** and **Grading**.
- Clearer messages when the SFU Outlines service can't be reached.

## July 22-24, 2026 - Alpha release (0.1.2)
- **Alpha launch** of the site.
- **Dark mode**, with a light/dark toggle in the header.
- **Prerequisite map:** click a course to highlight its prerequisites, corequisites and the courses that depend on it, with a colour legend. Recursive highlights can also show the whole chain.
- **Credit counter** to track progress toward graduation, including a field for transfer credits.
- **Welcome guide** on first visit (reopen it anytime with the **?** button), covering course cards and the prerequisite map.
- **"Choose one of" slots** for requirements you can meet with any of several courses (e.g. BUS 343 or BUEC 232).
- Corrected curriculum plans for the pre-2024, post-2024 and MSE + Business double-degree tracks. The double degree now opens on its most common plan.
- Course outlines reorganized, with **previous offerings** shown when a course isn't running this term.

## May 2 - June 2, 2026 - Plans and course details (0.1.1)
- **5-year plans with co-op options:** 8-month co-op (years 2-3 or 3-4) or 12-month co-op (years 3-4), each plus a 4-month co-op in year 5.
- Course details list **sections by campus** (Burnaby, Surrey, Vancouver), with instructors and terms.
- Course details include description, prerequisites and corequisites.

## April 20, 2026 - First version (0.1.0)
- First version of the planner: recommended MSE curriculum laid out term by term.
- **Live course outlines** from SFU's Course Outlines API: instructors, schedule, delivery method, grading and educational goals.
- Site published on GitHub Pages.
