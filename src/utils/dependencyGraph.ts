import { courses } from "../data";
import { Course, CourseHighlightRole, CourseRelationshipHighlights } from "../types";
import { buildCourseCodeIndex } from "./courseCodes";
import {
  collectCourseIds,
  extractRequirementSection,
  parsePrerequisiteExpression,
} from "./prerequisiteParser";

export interface CourseDependencyGraph {
  getPrerequisites(courseId: string, recursive: boolean): Set<string>;
  getCorequisites(courseId: string): Set<string>;
  getDependents(courseId: string, recursive: boolean): Set<string>;
  getHighlights(selectedCourseId: string | null, recursive: boolean): CourseRelationshipHighlights;
}

function transitiveClosure(
  startId: string,
  getDirect: (courseId: string) => Set<string>
): Set<string> {
  const visited = new Set<string>();
  const stack = [...getDirect(startId)];

  while (stack.length > 0) {
    const id = stack.pop()!;
    if (visited.has(id)) continue;
    visited.add(id);
    for (const next of getDirect(id)) {
      stack.push(next);
    }
  }

  return visited;
}

export function buildCourseDependencyGraph(courseList: Course[] = courses): CourseDependencyGraph {
  const codeToId = buildCourseCodeIndex(courseList);

  const prerequisiteMap = new Map<string, Set<string>>();
  const corequisiteMap = new Map<string, Set<string>>();
  const dependentMap = new Map<string, Set<string>>();

  for (const course of courseList) {
    prerequisiteMap.set(course.id, new Set());
    corequisiteMap.set(course.id, new Set());
    dependentMap.set(course.id, new Set());
  }

  for (const course of courseList) {
    const prereqText = extractRequirementSection(course.description, "prerequisite");
    const coreqText = extractRequirementSection(course.description, "corequisite");

    const prereqExpr = prereqText
      ? parsePrerequisiteExpression(prereqText, codeToId)
      : null;
    const coreqExpr = coreqText ? parsePrerequisiteExpression(coreqText, codeToId) : null;

    const prereqIds = collectCourseIds(prereqExpr);
    const coreqIds = collectCourseIds(coreqExpr);

    prerequisiteMap.set(course.id, prereqIds);
    corequisiteMap.set(course.id, coreqIds);

    for (const prereqId of prereqIds) {
      dependentMap.get(prereqId)?.add(course.id);
    }
  }

  const getPrerequisites = (courseId: string, recursive: boolean): Set<string> => {
    const direct = prerequisiteMap.get(courseId) ?? new Set<string>();
    return recursive ? transitiveClosure(courseId, (id) => prerequisiteMap.get(id) ?? new Set()) : new Set(direct);
  };

  const getCorequisites = (courseId: string): Set<string> => {
    return new Set(corequisiteMap.get(courseId) ?? []);
  };

  const getDependents = (courseId: string, recursive: boolean): Set<string> => {
    const direct = dependentMap.get(courseId) ?? new Set<string>();
    return recursive ? transitiveClosure(courseId, (id) => dependentMap.get(id) ?? new Set()) : new Set(direct);
  };

  const getHighlights = (
    selectedCourseId: string | null,
    recursive: boolean
  ): CourseRelationshipHighlights => {
    const roles = new Map<string, CourseHighlightRole>();
    if (!selectedCourseId) return { roles };

    roles.set(selectedCourseId, "selected");

    for (const id of getPrerequisites(selectedCourseId, recursive)) {
      roles.set(id, "prerequisite");
    }

    for (const id of getCorequisites(selectedCourseId)) {
      if (!roles.has(id)) roles.set(id, "corequisite");
    }

    for (const id of getDependents(selectedCourseId, recursive)) {
      if (!roles.has(id)) roles.set(id, "dependent");
    }

    return { roles };
  };

  return {
    getPrerequisites,
    getCorequisites,
    getDependents,
    getHighlights,
  };
}

/** Singleton graph — built once at module load. */
export const courseDependencyGraph = buildCourseDependencyGraph();
