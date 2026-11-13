// Course data. Files in generated/ are written by `npm run sync-data` (do not hand-edit);
// the files next to this one are hand-edited.
import generatedCoursesJson from "./generated/courses.json";
import courseRequirementsJson from "./generated/courseRequirements.json";
import generatedEquivalenciesJson from "./generated/equivalencies.json";
import equivalencyOverridesJson from "./equivalencyOverrides.json";
import placeholderCoursesJson from "./placeholderCourses.json";
import templatesJson from "./templates.json";
import { Course, CourseEquivalency, PageTemplate } from "../types";

export const courses = [...generatedCoursesJson, ...placeholderCoursesJson] as Course[];
export const pageTemplates = templatesJson as PageTemplate[];
export const courseRequirementsById = courseRequirementsJson as Record<string, string>;

/** Generated equivalencies, with hand-edited overrides replacing the type or adding pairs. */
export const courseEquivalencies: CourseEquivalency[] = (() => {
  const key = (eq: CourseEquivalency) => `${eq.sourceCourseId}>${eq.equivalentCourseId}`;
  const merged = new Map<string, CourseEquivalency>();
  for (const eq of generatedEquivalenciesJson as CourseEquivalency[]) merged.set(key(eq), eq);
  for (const eq of equivalencyOverridesJson as CourseEquivalency[]) merged.set(key(eq), eq);
  return [...merged.values()];
})();

export const courseById: Record<string, Course> = Object.fromEntries(courses.map((course) => [course.id, course]));
