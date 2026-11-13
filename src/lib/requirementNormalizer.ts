import { courseEquivalencies, courses } from "../data";
import { Course, CourseEquivalency } from "../types";
import { buildCourseCodeIndex } from "./courseCodes";
import { NormalizedRequirements, normalizeRequirementsFromText } from "./prerequisiteParser";

export interface CourseRequirementsIndex {
  get(courseId: string): NormalizedRequirements;
}

function expandWithEquivalencies(ids: Set<string>, equivalencies: CourseEquivalency[]): Set<string> {
  const expanded = new Set(ids);

  for (const eq of equivalencies) {
    if (eq.equivalencyType === "elective-only") continue;
    if (expanded.has(eq.sourceCourseId)) expanded.add(eq.equivalentCourseId);
    if (expanded.has(eq.equivalentCourseId)) expanded.add(eq.sourceCourseId);
  }

  return expanded;
}

function resolveRequirementsSource(
  course: Course,
  apiRequirementsByCourseId: Record<string, string>
): string {
  const apiText = apiRequirementsByCourseId[course.id]?.trim();
  if (apiText) return apiText;

  if (/\bPrerequisites?:\s*/i.test(course.description)) {
    return course.description;
  }

  return "";
}

export function buildCourseRequirementsIndex(
  courseList: Course[] = courses,
  apiRequirementsByCourseId: Record<string, string> = {},
  equivalencies: CourseEquivalency[] = courseEquivalencies
): CourseRequirementsIndex {
  const codeToId = buildCourseCodeIndex(courseList);
  const cache = new Map<string, NormalizedRequirements>();

  for (const course of courseList) {
    const source = resolveRequirementsSource(course, apiRequirementsByCourseId);
    const normalized = normalizeRequirementsFromText(source, codeToId);

    cache.set(course.id, {
      prerequisiteExpression: normalized.prerequisiteExpression,
      corequisiteExpression: normalized.corequisiteExpression,
      prerequisiteIds: expandWithEquivalencies(normalized.prerequisiteIds, equivalencies),
      corequisiteIds: expandWithEquivalencies(normalized.corequisiteIds, equivalencies),
    });
  }

  return {
    get(courseId: string): NormalizedRequirements {
      return (
        cache.get(courseId) ?? {
          prerequisiteExpression: null,
          corequisiteExpression: null,
          prerequisiteIds: new Set<string>(),
          corequisiteIds: new Set<string>(),
        }
      );
    },
  };
}
