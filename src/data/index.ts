// Course data. Files in generated/ are written by `npm run sync-data` (do not hand-edit);
// the files next to this one are hand-edited.
import generatedCoursesJson from "./generated/courses.json";
import courseRequirementsJson from "./generated/courseRequirements.json";
import generatedEquivalenciesJson from "./generated/equivalencies.json";
import equivalencyOverridesJson from "./equivalencyOverrides.json";
import placeholderCoursesJson from "./placeholderCourses.json";
import mseProgramJson from "./programs/mse.json";
import { Course, CourseEquivalency, Curriculum, PageTemplate, Program } from "../types";

export const courses = [...generatedCoursesJson, ...placeholderCoursesJson] as Course[];

/** Programs → curricula → templates, elective groups, concentrations. One file per program. */
export const programs = [mseProgramJson] as Program[];

/** Every template across all programs and curricula, tagged with where it came from. */
export const pageTemplates: PageTemplate[] = programs.flatMap((program) =>
  program.curricula.flatMap((curriculum) =>
    curriculum.templates.map((template) => ({
      ...template,
      programId: program.id,
      curriculumId: curriculum.id,
    }))
  )
);

/** Used for new plans and for old saves that predate the program layer. */
export const DEFAULT_PROGRAM_ID = programs[0].id;
export const DEFAULT_CURRICULUM_ID = programs[0].curricula[0].id;

export function getProgram(programId: string): Program | undefined {
  return programs.find((program) => program.id === programId);
}

export function getCurriculum(programId: string, curriculumId: string): Curriculum | undefined {
  return getProgram(programId)?.curricula.find((curriculum) => curriculum.id === curriculumId);
}

/**
 * Course ids that can count toward graduation in a curriculum: every course in
 * its templates (including each "choose one of" option and placeholder slots)
 * plus its elective groups.
 */
export function getCurriculumCourseIds(programId: string, curriculumId: string): Set<string> {
  const ids = new Set<string>();
  const curriculum = getCurriculum(programId, curriculumId);
  if (!curriculum) return ids;
  for (const template of curriculum.templates) {
    const termLists = template.terms ? [template.terms] : Object.values(template.termsByVariant ?? {});
    for (const terms of termLists) {
      for (const term of terms) {
        for (const slot of term.courseIds) {
          for (const id of Array.isArray(slot) ? slot : [slot]) ids.add(id);
        }
      }
    }
  }
  for (const group of curriculum.electiveGroups) {
    for (const code of group.courseCodes) ids.add(code.toLowerCase().replace(/\s+/g, ""));
  }
  return ids;
}
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
