import { useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { ScheduleSlotCard } from "../../components/schedule/ScheduleSlotCard";
import { courseById, courses } from "../../data";
import { useOfferingHistories } from "../../hooks/useOfferingHistories";
import { courseDepartment, isPlaceholderCourse } from "../../lib/courseCodes";
import { addCourseToPlan, canPlaceCourse, CustomPlan, isRepeatableCourseId } from "../../lib/customPlan";
import { listedEquivalentsById, replacedCoursesById, variantGroup } from "../../lib/equivalence";
import { notOfferedRecentlyReason } from "../../lib/recentOffering";
import { Course } from "../../types";
import type { SharedCourseCardProps } from "./courseCardProps";
import type { CourseDrag } from "./useCourseDrag";

const departments = [
  ...new Set(courses.filter((course) => !isPlaceholderCourse(course)).map(courseDepartment)),
].sort();

interface CoursePickerProps {
  plan: CustomPlan;
  setPlan: Dispatch<SetStateAction<CustomPlan>>;
  placed: Set<string>;
  drag: CourseDrag;
  cardProps: SharedCourseCardProps;
}

/** One picker row: a course (or a placed one, as a header) and the equivalents listed under it. */
interface PickerEntry {
  course: Course;
  /** The course (or a variant of it) is already in the plan; only its equivalents can be added. */
  placed: boolean;
  /** Unplaced equivalent-only courses (SEE 222 under MSE 220). */
  equivalents: Course[];
  /** Opened because the search or department filter matched an equivalent. */
  autoOpen: boolean;
}

/**
 * Searchable list of unplaced courses, grouped by department. Courses listed only as an
 * equivalent (SEE 222) are grouped under the course they replace (MSE 220). Also a drop
 * target to unplace.
 */
export function CoursePicker({ plan, setPlan, placed, drag, cardProps }: CoursePickerProps) {
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("all");
  /** Variant group (keyed by its first id) → the variant this picker card currently shows. */
  const [chosenVariant, setChosenVariant] = useState<Record<string, string>>({});
  /** Courses whose equivalents list is opened by hand. */
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const { dragging, hoverTarget, setHoverTarget, keepDrag, dropOnPicker, beginDrag, endDrag } = drag;

  const entries = useMemo(() => {
    const query = search.trim().toLowerCase();
    const matchesQuery = (list: Course[]) =>
      !query || list.some((course) => `${course.code} ${course.title}`.toLowerCase().includes(query));
    const matchesDept = (course: Course) => {
      const dept = courseDepartment(course);
      if (deptFilter === "all") return true;
      if (deptFilter === "Slots") return dept === "Slots";
      return dept === deptFilter;
    };

    const result: PickerEntry[] = [];
    for (const course of courses) {
      // Shown under the course it replaces instead.
      if (replacedCoursesById.has(course.id)) continue;
      // Variants share one card: show only the chosen one.
      const group = variantGroup(course.id);
      if (group.length > 1 && course.id !== (chosenVariant[group[0]] ?? group[0])) continue;

      const isPlaced = group.some((id) => placed.has(id)) && !isRepeatableCourseId(course.id);
      const equivalents = [...new Set(group.flatMap((id) => listedEquivalentsById.get(id) ?? []))]
        .filter((id) => !placed.has(id))
        .map((id) => courseById[id])
        .filter((item): item is Course => Boolean(item));
      if (isPlaced && !equivalents.length) continue;

      const variants = group.map((id) => courseById[id]).filter((item): item is Course => Boolean(item));
      const selfMatch = matchesQuery(variants) && matchesDept(course);
      const matchingEquivalents = equivalents.filter((item) => matchesQuery([item]) && matchesDept(item));
      if (!selfMatch && !matchingEquivalents.length) continue;

      // Open the group when the match came from an equivalent, e.g. searching "SEE 222".
      const queryHitsCourse = Boolean(query) && matchesQuery(variants);
      const autoOpen = !selfMatch || (Boolean(query) && matchingEquivalents.length > 0 && !queryHitsCourse);
      result.push({
        course,
        placed: isPlaced,
        equivalents: selfMatch ? equivalents : matchingEquivalents,
        autoOpen,
      });
    }
    return result;
  }, [placed, search, deptFilter, chosenVariant]);

  const isOpen = (entry: PickerEntry) => entry.autoOpen || openGroups.has(entry.course.id);

  // Offered terms load only for opened groups, so the picker doesn't look up every course.
  const historyCourses = useMemo(
    () =>
      entries
        .filter((entry) => entry.equivalents.length > 0 && isOpen(entry))
        .flatMap((entry) => (entry.placed ? entry.equivalents : [entry.course, ...entry.equivalents])),
    [entries, openGroups]
  );
  const offeringHistories = useOfferingHistories(historyCourses);

  const pickerGroups = useMemo(() => {
    const slots: PickerEntry[] = [];
    const byDept = new Map<string, PickerEntry[]>();

    for (const entry of entries) {
      if (isPlaceholderCourse(entry.course)) {
        slots.push(entry);
        continue;
      }
      const dept = courseDepartment(entry.course);
      const list = byDept.get(dept) ?? [];
      list.push(entry);
      byDept.set(dept, list);
    }

    const groups = [...byDept.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([dept, items]) => ({
        id: dept,
        title: dept,
        // Courses not offered recently go last, still searchable and addable.
        entries: items.sort(
          (a, b) =>
            Number(Boolean(notOfferedRecentlyReason(a.course))) - Number(Boolean(notOfferedRecentlyReason(b.course))) ||
            a.course.code.localeCompare(b.course.code)
        ),
      }));

    if (slots.length && (deptFilter === "all" || deptFilter === "Slots")) {
      groups.push({
        id: "Slots",
        title: "Slots",
        entries: slots.sort(
          (a, b) => a.course.code.localeCompare(b.course.code) || a.course.title.localeCompare(b.course.title)
        ),
      });
    }

    return groups;
  }, [entries, deptFilter]);

  const toggleGroup = (courseId: string) =>
    setOpenGroups((current) => {
      const next = new Set(current);
      if (next.has(courseId)) next.delete(courseId);
      else next.add(courseId);
      return next;
    });

  const addToTermOptions = (courseId: string) =>
    plan.terms.map((term) => ({
      id: term.id,
      label: term.label,
      disabled: !canPlaceCourse(plan, courseId, term.id, null),
    }));
  const addToTerm = (courseId: string, termId: string) =>
    setPlan((current) => addCourseToPlan(current, courseId, termId, null));

  const dropActive = Boolean(dragging?.fromTermId);

  return (
    <aside
      className={`picker-panel${dropActive ? " drop-target-valid" : ""}${
        hoverTarget === "picker" && dropActive ? " drop-hover" : ""
      }`}
      onDragOver={(event) => {
        keepDrag(event);
        if (dragging?.fromTermId) setHoverTarget("picker");
      }}
      onDragLeave={(event) => {
        const next = event.relatedTarget as Node | null;
        if (next && event.currentTarget.contains(next)) return;
        if (hoverTarget === "picker") setHoverTarget(null);
      }}
      onDrop={dropOnPicker}
    >
      <h2>Course picker</h2>
      <p className="meta">Drag a course onto a term, or use Add to…</p>
      <input
        type="search"
        className="picker-search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search courses"
        aria-label="Search courses"
      />
      <select
        value={deptFilter}
        onChange={(event) => setDeptFilter(event.target.value)}
        aria-label="Filter by department"
      >
        <option value="all">All departments</option>
        {departments.map((dept) => (
          <option key={dept} value={dept}>
            {dept}
          </option>
        ))}
        <option value="Slots">Slots</option>
      </select>

      <div className="picker-list">
        {pickerGroups.length === 0 && <p className="empty-note">No matching unplaced courses.</p>}
        {pickerGroups.map((group) => (
          <section key={group.id} className="picker-group">
            <h3>{group.title}</h3>
            <div className="course-list">
              {group.entries.map((entry) => {
                const { course } = entry;
                const open = isOpen(entry);
                const count = entry.equivalents.length;
                return (
                  <div key={course.id} className="picker-entry">
                    {entry.placed ? (
                      <div className="equivalent-parent-placed">
                        <strong>{course.code}</strong>
                        <span>{course.title}</span>
                        <span>· in your plan</span>
                      </div>
                    ) : (
                      <ScheduleSlotCard
                        slot={course.id}
                        {...cardProps}
                        draggable
                        onCourseDragStart={(event, courseId) => beginDrag(event, courseId, null)}
                        onCourseDragEnd={endDrag}
                        moveOptions={addToTermOptions(course.id)}
                        onMoveToTerm={addToTerm}
                        variantIds={variantGroup(course.id)}
                        onChooseVariant={(_fromId, toId) =>
                          setChosenVariant((current) => ({ ...current, [variantGroup(toId)[0]]: toId }))
                        }
                        showOfferingBadges={count > 0 && open}
                        offeringHistory={offeringHistories.get(course.id)}
                      />
                    )}
                    {count > 0 && (
                      <div className="equivalent-group">
                        {!entry.autoOpen && (
                          <button
                            type="button"
                            className="equivalent-toggle"
                            aria-expanded={open}
                            onClick={() => toggleGroup(course.id)}
                          >
                            {open ? "Hide" : "Show"} {count} equivalent{count === 1 ? "" : "s"}
                          </button>
                        )}
                        {open && (
                          <>
                            <p className="equivalent-note">
                              {entry.placed
                                ? `Same course in another department. Adding one replaces ${course.code} in your plan.`
                                : `Same course in another department. Counts the same as ${course.code}.`}
                            </p>
                            {[...entry.equivalents]
                              .sort(
                                (a, b) =>
                                  Number(Boolean(notOfferedRecentlyReason(a))) - Number(Boolean(notOfferedRecentlyReason(b)))
                              )
                              .map((equivalent) => (
                              <ScheduleSlotCard
                                key={equivalent.id}
                                slot={equivalent.id}
                                {...cardProps}
                                draggable
                                onCourseDragStart={(event, courseId) => beginDrag(event, courseId, null)}
                                onCourseDragEnd={endDrag}
                                moveOptions={addToTermOptions(equivalent.id)}
                                onMoveToTerm={addToTerm}
                                showOfferingBadges
                                offeringHistory={offeringHistories.get(equivalent.id)}
                              />
                            ))}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </aside>
  );
}
