// Checks a plan's prerequisites and corequisites term by term, using the full
// and/or requirement trees (so "MATH 150 or MATH 151" is met by either one).
import {
  courseEquivalencies,
  courseRequirementsById,
  courses,
  getOutlineTerm,
  getRequirementTextsForOutlineTerm,
} from "../../data";
import { Course, PrerequisiteExpression } from "../../types";
import { equivalentsById } from "../equivalence";
import { buildCourseRequirementsIndex, type CourseRequirementsIndex } from "./requirementNormalizer";

export interface PlanTermInput {
  id: string;
  label: string;
  courseIds: string[];
}

export interface PlanSwapInput {
  replacementId: string;
  originalCourseId: string;
}

/** One unmet requirement of a placed course, written for students. */
export interface PlanRequirementWarning {
  courseId: string;
  termId: string;
  kind: "prerequisite" | "corequisite";
  /** e.g. "MATH 251 needs MATH 152 in an earlier term." */
  message: string;
  /** e.g. "MATH 152 is in Year 1 - Summer. Move it to an earlier term, or move MATH 251 later." */
  fix: string;
  /** The unmet part on its own, e.g. "MATH 152" or "MATH 150 or MATH 151". */
  requirement: string;
}

/** A soft note (not a warning), e.g. a rule the current outline adds for an old-curriculum student. */
export interface PlanRequirementNote {
  courseId: string;
  termId: string;
  message: string;
}

export interface PlanRequirementCheck {
  warnings: Map<string, PlanRequirementWarning[]>;
  notes: Map<string, PlanRequirementNote[]>;
}

const currentRequirementsIndex = buildCourseRequirementsIndex(courses, courseRequirementsById, courseEquivalencies);
const indexesByOutlineTerm = new Map<string, CourseRequirementsIndex>();

function requirementsIndexFor(outlineTerm: string): CourseRequirementsIndex {
  let index = indexesByOutlineTerm.get(outlineTerm);
  if (!index) {
    index = buildCourseRequirementsIndex(courses, getRequirementTextsForOutlineTerm(outlineTerm), courseEquivalencies);
    indexesByOutlineTerm.set(outlineTerm, index);
  }
  return index;
}

/** Every requirement id a placed course can satisfy: itself, its equivalents, and what it was swapped in for. */
function creditedIds(courseId: string, swapOriginal: string | undefined): string[] {
  const ids = new Set([courseId, ...(equivalentsById.get(courseId) ?? [])]);
  if (swapOriginal) {
    ids.add(swapOriginal);
    for (const id of equivalentsById.get(swapOriginal) ?? []) ids.add(id);
  }
  return [...ids];
}

/** The part of `node` that isn't met, or null when it is. An unmet "or" is kept whole so all options show. */
function unmetPart(
  node: PrerequisiteExpression,
  isMet: (courseId: string) => boolean
): PrerequisiteExpression | null {
  if (node.type === "course") return isMet(node.courseId) ? null : node;
  if (node.type === "or") return node.items.some((item) => unmetPart(item, isMet) === null) ? null : node;
  const missing = node.items
    .map((item) => unmetPart(item, isMet))
    .filter((item): item is PrerequisiteExpression => item !== null);
  if (!missing.length) return null;
  return missing.length === 1 ? missing[0] : { type: "and", items: missing };
}

function courseIdsIn(node: PrerequisiteExpression): string[] {
  return node.type === "course" ? [node.courseId] : node.items.flatMap(courseIdsIn);
}

/**
 * Validates every placed course. `terms` must be in chronological order.
 * Swapped-in equivalents count as the course they replaced; courses without
 * requirement data (placeholders, custom equivalents) are not checked themselves.
 * Uses current outline rules unless another `requirementsIndex` is given.
 */
export function validatePlanRequirements(
  terms: PlanTermInput[],
  swaps: PlanSwapInput[],
  lookup: Record<string, Course>,
  requirementsIndex: CourseRequirementsIndex = currentRequirementsIndex
): Map<string, PlanRequirementWarning[]> {
  const swapOriginalById = new Map(swaps.map((swap) => [swap.replacementId, swap.originalCourseId]));

  // Earliest term index at which each requirement id is satisfied, and where.
  const earliest = new Map<string, number>();
  const placedAt = new Map<string, { termIndex: number; courseId: string }>();
  terms.forEach((term, termIndex) => {
    for (const courseId of term.courseIds) {
      for (const id of creditedIds(courseId, swapOriginalById.get(courseId))) {
        if (!earliest.has(id) || earliest.get(id)! > termIndex) {
          earliest.set(id, termIndex);
          placedAt.set(id, { termIndex, courseId });
        }
      }
    }
  });

  const code = (id: string) => lookup[id]?.code ?? id.toUpperCase();
  const describe = (node: PrerequisiteExpression, nested = false): string => {
    if (node.type === "course") return code(node.courseId);
    const text = node.items.map((item) => describe(item, true)).join(` ${node.type} `);
    return nested ? `(${text})` : text;
  };

  const warnings = new Map<string, PlanRequirementWarning[]>();

  terms.forEach((term, termIndex) => {
    for (const courseId of term.courseIds) {
      const requirements = requirementsIndex.get(courseId);
      const course = lookup[courseId];
      if (!course) continue;

      const isSelf = (id: string) => id === courseId || (equivalentsById.get(courseId)?.has(id) ?? false);
      const before = (id: string) => isSelf(id) || (earliest.get(id) ?? Infinity) < termIndex;
      const sameOrBefore = (id: string) => isSelf(id) || (earliest.get(id) ?? Infinity) <= termIndex;

      const unmet: { node: PrerequisiteExpression; kind: PlanRequirementWarning["kind"]; sameTermOk: boolean }[] = [];
      const split = (node: PrerequisiteExpression | null) =>
        !node ? [] : node.type === "and" ? node.items : [node];

      if (requirements.prerequisiteExpression) {
        // Courses the outline says "may be taken concurrently" can sit in the same term.
        const isMet = (id: string) => before(id) || (requirements.corequisiteIds.has(id) && sameOrBefore(id));
        for (const node of split(unmetPart(requirements.prerequisiteExpression, isMet))) {
          const sameTermOk = courseIdsIn(node).every((id) => requirements.corequisiteIds.has(id));
          unmet.push({ node, kind: "prerequisite", sameTermOk });
        }
      }
      if (requirements.corequisiteExpression) {
        const alreadyListed = new Set(unmet.flatMap((item) => courseIdsIn(item.node)));
        for (const node of split(unmetPart(requirements.corequisiteExpression, sameOrBefore))) {
          if (courseIdsIn(node).every((id) => alreadyListed.has(id))) continue;
          unmet.push({ node, kind: "corequisite", sameTermOk: true });
        }
      }
      if (!unmet.length) continue;

      const seen = new Set<string>();
      const courseWarnings = unmet.map(({ node, kind, sameTermOk }): PlanRequirementWarning => {
          const when = sameTermOk ? "in the same or an earlier term" : "in an earlier term";
          const options = courseIdsIn(node);
          const placed = options
            .map((id) => placedAt.get(id))
            .find((spot): spot is { termIndex: number; courseId: string } => spot !== undefined);

          let fix: string;
          if (placed) {
            const where = placed.termIndex === termIndex ? "the same term" : terms[placed.termIndex].label;
            const target = sameTermOk ? `${term.label} or earlier` : `a term before ${term.label}`;
            fix = `${code(placed.courseId)} is in ${where}. Move it to ${target}, or move ${course.code} later.`;
          } else {
            fix = sameTermOk
              ? `Add ${describe(node)} to ${term.label} or earlier.`
              : `Add ${describe(node)} to a term before ${term.label}.`;
          }

          return {
            courseId,
            termId: term.id,
            kind,
            message: `${course.code} needs ${describe(node)} ${when}.`,
            fix,
            requirement: describe(node),
          };
        })
        // SFU text sometimes repeats a requirement (e.g. BUS 312's two identical options).
        .filter((warning) => {
          if (seen.has(warning.message)) return false;
          seen.add(warning.message);
          return true;
        });

      warnings.set(courseId, courseWarnings);
    }
  });

  return warnings;
}

/**
 * Checks a plan against its curriculum's rules. A curriculum with an `outlineTerm`
 * (pre-Fall 2024) is checked against that older outline; anything the current outline
 * asks for on top of it becomes a soft note, since old-curriculum students resolve
 * those through a prerequisite appeal.
 */
export function checkPlanRequirements(
  terms: PlanTermInput[],
  swaps: PlanSwapInput[],
  lookup: Record<string, Course>,
  programId: string,
  curriculumId: string
): PlanRequirementCheck {
  const outlineTerm = getOutlineTerm(programId, curriculumId);
  const current = validatePlanRequirements(terms, swaps, lookup);
  if (!outlineTerm) return { warnings: current, notes: new Map() };

  const warnings = validatePlanRequirements(terms, swaps, lookup, requirementsIndexFor(outlineTerm));
  const notes = new Map<string, PlanRequirementNote[]>();
  for (const [courseId, currentWarnings] of current) {
    const shown = new Set((warnings.get(courseId) ?? []).map((warning) => warning.message));
    const extra = currentWarnings.filter((warning) => !shown.has(warning.message));
    if (!extra.length) continue;
    notes.set(
      courseId,
      extra.map((warning) => ({
        courseId,
        termId: warning.termId,
        message: `Current SFU outline also lists ${warning.requirement}${
          warning.kind === "corequisite" ? " as a corequisite" : ""
        }; old-curriculum students usually resolve this through a prerequisite appeal.`,
      }))
    );
  }
  return { warnings, notes };
}
