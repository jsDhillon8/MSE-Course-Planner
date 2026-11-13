import type { Dispatch, SetStateAction } from "react";
import { fetchCourseInfoFields } from "../../api/sfuOutlines";
import { EquivalentBox } from "../../components/course-details/CourseDetailsPanel";
import { courseById, courses } from "../../data";
import { buildCourseCodeIndex, isPlaceholderCourse, normalizeCourseCode, parseCourseCode } from "../../lib/courseCodes";
import {
  customCourseIdFromCode,
  CustomPlan,
  findSwapForCourse,
  resolvePlanCourse,
  swapCourseIntoPlan,
  undoSwapInPlan,
} from "../../lib/customPlan";
import { Course } from "../../types";

const courseIdByCode = buildCourseCodeIndex(courses);

/** Swap a placed course for one of its equivalents, and undo that swap. */
export function useEquivalentSwap(
  plan: CustomPlan,
  setPlan: Dispatch<SetStateAction<CustomPlan>>,
  placed: Set<string>,
  selectedCourse: Course | null,
  setSelectedCourse: Dispatch<SetStateAction<Course | null>>,
) {
  const handleUndoSwap = (courseId: string) => {
    const swap = findSwapForCourse(plan, courseId);
    setPlan((current) => undoSwapInPlan(current, courseId));
    if (swap) {
      const original = resolvePlanCourse(plan, swap.originalCourseId) ?? courseById[swap.originalCourseId];
      if (original) setSelectedCourse(original);
    }
  };

  const handleSwapIntoPlan = async (box: EquivalentBox) => {
    if (!selectedCourse) return;
    if (!placed.has(selectedCourse.id)) return;
    const originalId = selectedCourse.id;

    const normalized = normalizeCourseCode(box.code);
    const catalogId = courseIdByCode.get(normalized) ?? courseIdByCode.get(normalized.replace(/\s+/g, ""));
    const catalogCourse = catalogId ? courseById[catalogId] : undefined;

    let replacement: Course;
    if (catalogCourse) {
      replacement = catalogCourse;
    } else {
      // Not in the course list: build an entry from the live SFU outline.
      const parsed = parseCourseCode(box.code);
      let title = box.title ?? box.code;
      let credits = 0;
      let description = "";
      if (parsed && !isPlaceholderCourse({ code: box.code })) {
        const info = await fetchCourseInfoFields(parsed.dept, parsed.number);
        if (info) {
          if (info.title) title = info.title;
          if (info.units != null) credits = info.units;
          description = info.description;
        }
      }
      replacement = {
        id: customCourseIdFromCode(box.code),
        code: normalized,
        title,
        credits,
        description,
      };
    }

    setPlan((current) => swapCourseIntoPlan(current, originalId, replacement));
    setSelectedCourse(replacement);
  };

  return { handleSwapIntoPlan, handleUndoSwap };
}
