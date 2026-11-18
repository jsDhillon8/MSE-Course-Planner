// Course data. Files in generated/ are written by `npm run sync-data` (do not hand-edit);
// calendar/ is the local copy of SFU's degree requirements (`npm run calendar:check`);
// the files next to this one are hand-edited.
import generatedCoursesJson from "./generated/courses.json";
import courseRequirementsJson from "./generated/courseRequirements.json";
import courseRequirementsByOutlineTermJson from "./generated/courseRequirementsByOutlineTerm.json";
import generatedEquivalenciesJson from "./generated/equivalencies.json";
import placeholderCoursesJson from "./placeholderCourses.json";
import mseProgramJson from "./programs/mse.json";
import calendarSourcesJson from "./calendar/sources.json";
import {
  CalendarSource,
  Course,
  CourseEquivalency,
  Curriculum,
  DegreeRequirements,
  PageTemplate,
  Program,
} from "../types";

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

export function getDegree(programId: string, curriculumId: string, degreeId: string): DegreeRequirements | undefined {
  return getCurriculum(programId, curriculumId)?.degrees.find((degree) => degree.id === degreeId);
}

/** Pages copied into the local requirements backup (src/data/calendar/), by id. */
export const calendarSourceById: Record<string, CalendarSource> = Object.fromEntries(
  (calendarSourcesJson as CalendarSource[]).map((source) => [source.id, source])
);

/** "MSE 405W" → "mse405w", the id format used by courses.json. */
export const courseIdFromCode = (code: string) => code.toLowerCase().replace(/\s+/g, "");

/**
 * Course ids that can count toward graduation in a curriculum: every course its
 * degrees require (from the local calendar copy, including each "one of" option),
 * its elective group lists, its concentrations' courses, and every course and
 * placeholder slot in its templates.
 */
export function getCurriculumCourseIds(programId: string, curriculumId: string): Set<string> {
  const ids = new Set<string>();
  const curriculum = getCurriculum(programId, curriculumId);
  if (!curriculum) return ids;
  const addCodes = (codes: string[] = []) => codes.forEach((code) => ids.add(courseIdFromCode(code)));

  for (const degree of curriculum.degrees) {
    addCodes(degree.requiredCourses);
    degree.chooseOne.forEach((options) => addCodes(options));
  }
  for (const group of curriculum.electiveGroups) addCodes(group.courseCodes);
  for (const concentration of curriculum.concentrations) addCodes(concentration.requiredCourses);

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
  return ids;
}
export const courseRequirementsById = courseRequirementsJson as Record<string, string>;

/** Older outline rules, by outline term ("2024/spring") then course id. Written by `npm run sync-data`. */
const courseRequirementsByOutlineTerm = courseRequirementsByOutlineTermJson as Record<string, Record<string, string>>;

/** The outline term whose rules a curriculum uses, or null for current outlines. */
export function getOutlineTerm(programId: string, curriculumId: string): string | null {
  return getCurriculum(programId, curriculumId)?.outlineTerm ?? null;
}

/**
 * Requirement text per course for a curriculum: the older outline's rules where the
 * curriculum names an `outlineTerm` and that outline was found, current rules otherwise.
 */
export function getRequirementTextsForOutlineTerm(outlineTerm: string | null): Record<string, string> {
  const older = outlineTerm ? courseRequirementsByOutlineTerm[outlineTerm] : undefined;
  return older ? { ...courseRequirementsById, ...older } : courseRequirementsById;
}

export const courseEquivalencies = generatedEquivalenciesJson as CourseEquivalency[];

export const courseById: Record<string, Course> = Object.fromEntries(courses.map((course) => [course.id, course]));
