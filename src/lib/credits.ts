import { Course, CourseSlot, TermPlan } from "../types";
import { slotCourseIds } from "./scheduleTerms";

function isDev(): boolean {
  return Boolean((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV);
}

/**
 * Credits a single slot contributes to the curriculum total.
 *
 * For a plain slot (one course id) this is just that course's credits.
 * For a "choose one of" slot (array of alternatives), only one course is
 * ever actually taken, so we use the first resolvable alternative's credit
 * value as the slot's representative weight rather than summing every
 * alternative (which would over-count credits nobody actually earns twice).
 *
 * Assumption: alternatives within a choice slot carry equal credit weight
 * (true for every current pairing in courses.json/programs/*.json, e.g.
 * BUS 343 / BUEC 232 are both 3 credits). Revisit if a future choice slot
 * ever mixes differently-weighted courses.
 */
export function getSlotCredits(slot: CourseSlot, courseById: Record<string, Course>): number {
  const ids = slotCourseIds(slot);
  for (const id of ids) {
    const course = courseById[id];
    if (course) return course.credits ?? 0;
  }
  if (isDev()) {
    console.warn(`[credits] Slot [${ids.join(", ")}] has no resolvable course; counting as 0.`);
  }
  return 0;
}

/**
 * Credits a slot contributes to "completed" totals, given the set of
 * checked course ids. If more than one alternative within a choice slot is
 * checked, the slot still only counts once (using whichever checked
 * alternative comes first), so a student can't double-count a slot they
 * can only actually complete one course from.
 */
export function getSlotCompletedCredits(
  slot: CourseSlot,
  completedCourseIds: Set<string>,
  courseById: Record<string, Course>
): number {
  const ids = slotCourseIds(slot);
  const checkedId = ids.find((id) => completedCourseIds.has(id));
  if (!checkedId) return 0;
  return courseById[checkedId]?.credits ?? 0;
}

export function computeTotalCurriculumCredits(
  terms: TermPlan[],
  courseById: Record<string, Course>
): number {
  let total = 0;
  for (const term of terms) {
    for (const slot of term.courseIds) {
      total += getSlotCredits(slot, courseById);
    }
  }
  return total;
}

export function computeCompletedCredits(
  terms: TermPlan[],
  completedCourseIds: Set<string>,
  courseById: Record<string, Course>
): number {
  let total = 0;
  for (const term of terms) {
    for (const slot of term.courseIds) {
      total += getSlotCompletedCredits(slot, completedCourseIds, courseById);
    }
  }
  return total;
}

export interface PlanCreditSummary {
  /** Credits of placed courses that count toward graduation. */
  graduationCredits: number;
  /** Of those, credits for courses marked completed. */
  completedGraduationCredits: number;
  /** Credits of placed courses that don't count (outside the curriculum, or a repeat of an equivalent). */
  extraCredits: number;
  /** Why each non-counting placed course doesn't count, by course id. */
  notCountingReasons: Map<string, string>;
}

/**
 * Graduation credits for a custom plan. A placed course counts when it (or the
 * course it was swapped in for, or an equivalent of either) is part of the
 * curriculum. Equivalent courses ("may not take for further credit") count once:
 * the earliest placed one counts. Term workload totals are unaffected.
 */
export function summarizePlanCredits(
  terms: { courseIds: string[] }[],
  swaps: { replacementId: string; originalCourseId: string }[],
  completedCourseIds: Set<string>,
  lookup: Record<string, Course>,
  curriculumCourseIds: Set<string>,
  equivalentsById: Map<string, Set<string>>
): PlanCreditSummary {
  const swapOriginalById = new Map(swaps.map((swap) => [swap.replacementId, swap.originalCourseId]));
  const summary: PlanCreditSummary = {
    graduationCredits: 0,
    completedGraduationCredits: 0,
    extraCredits: 0,
    notCountingReasons: new Map(),
  };
  /** Ids already credited (each counted course plus its equivalents), with the course that took the credit. */
  const creditedBy = new Map<string, string>();

  for (const term of terms) {
    for (const courseId of term.courseIds) {
      const course = lookup[courseId];
      if (!course || !course.credits) continue;

      const original = swapOriginalById.get(courseId);
      const sameAs = new Set([courseId, ...(equivalentsById.get(courseId) ?? [])]);
      if (original) {
        sameAs.add(original);
        for (const id of equivalentsById.get(original) ?? []) sameAs.add(id);
      }

      const repeatOf = [...sameAs].map((id) => creditedBy.get(id)).find(Boolean);
      const inCurriculum = [...sameAs].some((id) => curriculumCourseIds.has(id));

      if (repeatOf) {
        summary.extraCredits += course.credits;
        summary.notCountingReasons.set(
          courseId,
          `Equivalent to ${lookup[repeatOf]?.code ?? repeatOf}, which already counts. SFU only gives credit for one of them.`
        );
        continue;
      }
      if (!inCurriculum) {
        summary.extraCredits += course.credits;
        summary.notCountingReasons.set(courseId, "Not part of this plan's curriculum, so it doesn't count toward graduation.");
        continue;
      }

      for (const id of sameAs) creditedBy.set(id, courseId);
      summary.graduationCredits += course.credits;
      if (completedCourseIds.has(courseId)) summary.completedGraduationCredits += course.credits;
    }
  }

  return summary;
}

export const TERM_CREDIT_WARN_THRESHOLD = 18;

export function computeTermCredits(
  courseIds: string[],
  courseById: Record<string, Course>
): number {
  let total = 0;
  for (const id of courseIds) {
    const course = courseById[id];
    if (!course) continue;
    if (course.code.trim().toUpperCase() === "CO-OP") continue;
    total += course.credits ?? 0;
  }
  return total;
}