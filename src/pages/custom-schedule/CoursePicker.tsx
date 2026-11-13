import { useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { ScheduleSlotCard } from "../../components/schedule/ScheduleSlotCard";
import { courses } from "../../data";
import { courseDepartment, isPlaceholderCourse } from "../../lib/courseCodes";
import { canPlaceCourse, CustomPlan, isRepeatableCourseId, placeCourse } from "../../lib/customPlan";
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

/** Searchable list of unplaced courses, grouped by department. Also a drop target to unplace. */
export function CoursePicker({ plan, setPlan, placed, drag, cardProps }: CoursePickerProps) {
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("all");
  const { dragging, hoverTarget, setHoverTarget, keepDrag, dropOnPicker, beginDrag, endDrag } = drag;

  const pickerCourses = useMemo(() => {
    const query = search.trim().toLowerCase();
    return courses.filter((course) => {
      if (placed.has(course.id) && !isRepeatableCourseId(course.id)) return false;
      if (query) {
        const haystack = `${course.code} ${course.title}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      const dept = courseDepartment(course);
      if (deptFilter === "all") return true;
      if (deptFilter === "Slots") return dept === "Slots";
      return dept === deptFilter;
    });
  }, [placed, search, deptFilter]);

  const pickerGroups = useMemo(() => {
    const slots: Course[] = [];
    const byDept = new Map<string, Course[]>();

    for (const course of pickerCourses) {
      if (isPlaceholderCourse(course)) {
        slots.push(course);
        continue;
      }
      const dept = courseDepartment(course);
      const list = byDept.get(dept) ?? [];
      list.push(course);
      byDept.set(dept, list);
    }

    const groups = [...byDept.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([dept, items]) => ({
        id: dept,
        title: dept,
        courses: items.sort((a, b) => a.code.localeCompare(b.code)),
      }));

    if (slots.length && (deptFilter === "all" || deptFilter === "Slots")) {
      groups.push({
        id: "Slots",
        title: "Slots",
        courses: slots.sort((a, b) => a.code.localeCompare(b.code) || a.title.localeCompare(b.title)),
      });
    }

    return groups;
  }, [pickerCourses, deptFilter]);

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
              {group.courses.map((course) => (
                <ScheduleSlotCard
                  key={course.id}
                  slot={course.id}
                  {...cardProps}
                  draggable
                  onCourseDragStart={(event, courseId) => beginDrag(event, courseId, null)}
                  onCourseDragEnd={endDrag}
                  moveOptions={plan.terms.map((term) => ({
                    id: term.id,
                    label: term.label,
                    disabled: !canPlaceCourse(plan, course.id, term.id, null),
                  }))}
                  onMoveToTerm={(courseId, termId) =>
                    setPlan((current) => placeCourse(current, courseId, termId, null))
                  }
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </aside>
  );
}
