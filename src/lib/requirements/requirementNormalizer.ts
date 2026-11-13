// Step 3 of requirement parsing: build each course's requirements, expanded with equivalencies.
import { courseEquivalencies, courses } from "../../data";
import { Course, CourseEquivalency, PrerequisiteExpression } from "../../types";
import { buildCourseCodeIndex } from "../courseCodes";
import { collectCourseIds, parsePrerequisiteExpression } from "./requirementExpression";
import { resolveRequirementTexts } from "./requirementText";

export interface NormalizedRequirements {
  prerequisiteExpression: PrerequisiteExpression | null;
  corequisiteExpression: PrerequisiteExpression | null;
  prerequisiteIds: Set<string>;
  corequisiteIds: Set<string>;
}

/**
 * Full pipeline for one course: find the text, parse it, collect the course ids.
 * A course listed as both (e.g. "MSE 250 ... may be taken concurrently") counts as a corequisite only.
 */
export function normalizeRequirementsFromText(
  rawSource: string,
  codeToId: Map<string, string>,
): NormalizedRequirements {
  const { prerequisiteText, corequisiteText } = resolveRequirementTexts(rawSource);
  const prerequisiteExpression = parsePrerequisiteExpression(prerequisiteText, codeToId);
  const corequisiteExpression = parsePrerequisiteExpression(corequisiteText, codeToId);

  const corequisiteIds = collectCourseIds(corequisiteExpression);
  const prerequisiteIds = collectCourseIds(prerequisiteExpression);
  for (const id of corequisiteIds) prerequisiteIds.delete(id);

  return { prerequisiteExpression, corequisiteExpression, prerequisiteIds, corequisiteIds };
}

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
    const prerequisiteIds = expandWithEquivalencies(normalized.prerequisiteIds, equivalencies);
    const corequisiteIds = expandWithEquivalencies(normalized.corequisiteIds, equivalencies);
    // A course never requires itself (SFU text sometimes names the course, e.g. "... concurrently with MATH 251").
    prerequisiteIds.delete(course.id);
    corequisiteIds.delete(course.id);

    cache.set(course.id, {
      prerequisiteExpression: normalized.prerequisiteExpression,
      corequisiteExpression: normalized.corequisiteExpression,
      prerequisiteIds,
      corequisiteIds,
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
