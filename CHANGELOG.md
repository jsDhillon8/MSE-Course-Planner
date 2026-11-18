# Changelog

What's new in the SFU MSE Course Navigator, newest first. Upcoming work is in [ROADMAP.md](ROADMAP.md).

---

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
