import { courseById } from "../data";
import {
  Course,
  CourseSlot,
  CustomCourseEntry,
  CustomSwapRecord,
  PageTemplate,
  TermName,
  VariantId,
} from "../types";
import { normalizeCourseCode } from "./courseCodes";
import { getActiveTerms, slotCourseIds } from "./scheduleTerms";

export const CUSTOM_PLAN_STORAGE_KEY = "mse-planner:custom-plan";
export const CUSTOM_PLAN_SCHEMA_VERSION = 1 as const;

export interface CustomTerm {
  id: string;
  label: string;
  courseIds: string[];
}

export interface CustomPlan {
  schemaVersion: typeof CUSTOM_PLAN_SCHEMA_VERSION;
  terms: CustomTerm[];
  customCourses: Record<string, CustomCourseEntry>;
  swaps: CustomSwapRecord[];
}

export interface CourseDragPayload {
  courseId: string;
  fromTermId: string | null;
}

const SEASONS = [
  { key: "f", name: "Fall" },
  { key: "s", name: "Spring" },
  { key: "u", name: "Summer" },
] as const;

function seasonFromLabel(label: string): string | null {
  if (/\bFall\b/i.test(label)) return "Fall";
  if (/\bSpring\b/i.test(label)) return "Spring";
  if (/\bSummer\b/i.test(label)) return "Summer";
  return null;
}

export function termNameFromLabel(label: string): TermName | null {
  const season = seasonFromLabel(label);
  if (season === "Fall") return "fall";
  if (season === "Spring") return "spring";
  if (season === "Summer") return "summer";
  return null;
}

function yearFromLabel(label: string): number | null {
  const match = label.match(/Year\s+(\d+)/i);
  return match ? Number(match[1]) : null;
}

export function customCourseIdFromCode(code: string): string {
  return `custom:${normalizeCourseCode(code).replace(/\s+/g, "").toLowerCase()}`;
}

export function createEmptyCustomPlan(): CustomPlan {
  const terms: CustomTerm[] = [];
  for (let year = 1; year <= 5; year += 1) {
    for (const season of SEASONS) {
      terms.push({
        id: `custom_y${year}_${season.key}`,
        label: `Year ${year} - ${season.name}`,
        courseIds: [],
      });
    }
  }
  return {
    schemaVersion: CUSTOM_PLAN_SCHEMA_VERSION,
    terms,
    customCourses: {},
    swaps: [],
  };
}

export function cloneCustomPlan(plan: CustomPlan): CustomPlan {
  return {
    schemaVersion: CUSTOM_PLAN_SCHEMA_VERSION,
    terms: plan.terms.map((term) => ({
      id: term.id,
      label: term.label,
      courseIds: [...term.courseIds],
    })),
    customCourses: Object.fromEntries(
      Object.entries(plan.customCourses ?? {}).map(([code, entry]) => [code, { ...entry }])
    ),
    swaps: (plan.swaps ?? []).map((swap) => ({ ...swap })),
  };
}

export function planCourseLookup(plan: CustomPlan): Record<string, Course> {
  const lookup: Record<string, Course> = { ...courseById };
  for (const entry of Object.values(plan.customCourses ?? {})) {
    lookup[entry.id] = entry;
  }
  return lookup;
}

export function resolvePlanCourse(plan: CustomPlan, courseId: string): Course | undefined {
  return planCourseLookup(plan)[courseId];
}

export function isCoopCourse(course: Course | undefined): boolean {
  if (!course) return false;
  return course.code.trim().toUpperCase() === "CO-OP";
}

export function isCoopCourseId(courseId: string, plan?: CustomPlan): boolean {
  const course = plan ? resolvePlanCourse(plan, courseId) : courseById[courseId];
  return isCoopCourse(course);
}

export function placedCourseIds(plan: CustomPlan): Set<string> {
  const ids = new Set<string>();
  for (const term of plan.terms) {
    for (const id of term.courseIds) ids.add(id);
  }
  return ids;
}

export function findSwapForCourse(plan: CustomPlan, courseId: string): CustomSwapRecord | undefined {
  return (plan.swaps ?? []).find((swap) => swap.replacementId === courseId);
}

export function findCoursePlacement(
  plan: CustomPlan,
  courseId: string
): { termId: string; index: number } | null {
  for (const term of plan.terms) {
    const index = term.courseIds.indexOf(courseId);
    if (index >= 0) return { termId: term.id, index };
  }
  return null;
}

function flattenSlots(slots: CourseSlot[]): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const slot of slots) {
    const first = slotCourseIds(slot)[0];
    if (!first || seen.has(first) || !courseById[first]) continue;
    seen.add(first);
    ids.push(first);
  }
  return ids;
}

/** Copies a template/variant onto a Year 1–5 F/S/U grid. Never mutates the template. */
export function customPlanFromTemplate(template: PageTemplate, variant: VariantId): CustomPlan {
  const plan = createEmptyCustomPlan();
  const sourceTerms = getActiveTerms(template, variant);

  for (const source of sourceTerms) {
    const year = yearFromLabel(source.label);
    const season = seasonFromLabel(source.label);
    if (year === null || !season) continue;

    const dest = plan.terms.find((term) => term.label === `Year ${year} - ${season}`);
    if (!dest) continue;

    dest.courseIds = flattenSlots(source.courseIds);
  }

  return plan;
}

function isCustomCourseEntry(value: unknown): value is CustomCourseEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as CustomCourseEntry;
  return (
    typeof entry.id === "string" &&
    typeof entry.code === "string" &&
    typeof entry.title === "string" &&
    typeof entry.credits === "number" &&
    typeof entry.description === "string"
  );
}

function isCustomSwapRecord(value: unknown): value is CustomSwapRecord {
  if (!value || typeof value !== "object") return false;
  const swap = value as CustomSwapRecord;
  return (
    typeof swap.replacementId === "string" &&
    typeof swap.originalCourseId === "string" &&
    typeof swap.originalCode === "string" &&
    typeof swap.termId === "string" &&
    typeof swap.index === "number"
  );
}

function isCustomTerm(value: unknown): value is CustomTerm {
  if (!value || typeof value !== "object") return false;
  const term = value as CustomTerm;
  return (
    typeof term.id === "string" &&
    typeof term.label === "string" &&
    Array.isArray(term.courseIds) &&
    term.courseIds.every((id) => typeof id === "string")
  );
}

function isCustomPlan(value: unknown): value is CustomPlan {
  if (!value || typeof value !== "object") return false;
  const plan = value as CustomPlan;
  if (plan.schemaVersion !== CUSTOM_PLAN_SCHEMA_VERSION || !Array.isArray(plan.terms) || !plan.terms.every(isCustomTerm)) {
    return false;
  }
  if (plan.customCourses != null) {
    if (typeof plan.customCourses !== "object") return false;
    if (!Object.values(plan.customCourses).every(isCustomCourseEntry)) return false;
  }
  if (plan.swaps != null && (!Array.isArray(plan.swaps) || !plan.swaps.every(isCustomSwapRecord))) {
    return false;
  }
  return true;
}

function pruneUnusedCustomCourses(plan: CustomPlan): void {
  const used = placedCourseIds(plan);
  for (const [code, entry] of Object.entries(plan.customCourses)) {
    if (!used.has(entry.id)) delete plan.customCourses[code];
  }
}

export function loadCustomPlan(): CustomPlan {
  const empty = createEmptyCustomPlan();
  try {
    const raw = localStorage.getItem(CUSTOM_PLAN_STORAGE_KEY);
    if (!raw) return empty;
    const parsed: unknown = JSON.parse(raw);
    if (!isCustomPlan(parsed)) return empty;

    const customCourses: Record<string, CustomCourseEntry> = {};
    for (const [code, entry] of Object.entries(parsed.customCourses ?? {})) {
      customCourses[normalizeCourseCode(code)] = { ...entry };
    }

    const byId = new Map(parsed.terms.map((term) => [term.id, term]));
    const knownIds = new Set([
      ...Object.keys(courseById),
      ...Object.values(customCourses).map((entry) => entry.id),
    ]);

    const plan: CustomPlan = {
      schemaVersion: CUSTOM_PLAN_SCHEMA_VERSION,
      terms: empty.terms.map((slot) => {
        const stored = byId.get(slot.id);
        const courseIds = stored
          ? [...new Set(stored.courseIds.filter((id) => knownIds.has(id)))]
          : [];
        return { ...slot, courseIds };
      }),
      customCourses,
      swaps: (parsed.swaps ?? []).filter((swap) => knownIds.has(swap.replacementId) && knownIds.has(swap.originalCourseId)),
    };

    pruneUnusedCustomCourses(plan);
    plan.swaps = plan.swaps.filter((swap) => placedCourseIds(plan).has(swap.replacementId));
    return plan;
  } catch {
    return empty;
  }
}

export function saveCustomPlan(plan: CustomPlan): void {
  try {
    localStorage.setItem(CUSTOM_PLAN_STORAGE_KEY, JSON.stringify(plan));
  } catch {
    // private browsing / quota
  }
}

export function clearCustomPlanStorage(): void {
  try {
    localStorage.removeItem(CUSTOM_PLAN_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function canPlaceCourse(
  plan: CustomPlan,
  courseId: string,
  destTermId: string,
  fromTermId: string | null
): boolean {
  if (!resolvePlanCourse(plan, courseId)) return false;
  const dest = plan.terms.find((term) => term.id === destTermId);
  if (!dest) return false;
  if (fromTermId === destTermId) return false;

  const destIds = dest.courseIds.filter((id) => !(fromTermId === dest.id && id === courseId));
  if (destIds.includes(courseId)) return false;

  const addingCoop = isCoopCourseId(courseId, plan);
  const destHasOtherCoop = destIds.some((id) => isCoopCourseId(id, plan));

  if (addingCoop) return destIds.length === 0;
  if (destHasOtherCoop) return false;
  return true;
}

export function placeCourse(
  plan: CustomPlan,
  courseId: string,
  destTermId: string,
  fromTermId: string | null
): CustomPlan {
  if (!canPlaceCourse(plan, courseId, destTermId, fromTermId)) return plan;

  const next = cloneCustomPlan(plan);
  if (fromTermId) {
    const source = next.terms.find((term) => term.id === fromTermId);
    if (source) source.courseIds = source.courseIds.filter((id) => id !== courseId);
  }

  const dest = next.terms.find((term) => term.id === destTermId);
  if (dest && !dest.courseIds.includes(courseId)) dest.courseIds.push(courseId);
  return next;
}

export function removeCourseFromPlan(plan: CustomPlan, courseId: string, fromTermId?: string): CustomPlan {
  const next = cloneCustomPlan(plan);
  for (const term of next.terms) {
    if (fromTermId && term.id !== fromTermId) continue;
    term.courseIds = term.courseIds.filter((id) => id !== courseId);
  }
  next.swaps = next.swaps.filter((swap) => swap.replacementId !== courseId);
  pruneUnusedCustomCourses(next);
  return next;
}

function ensureCustomCourse(plan: CustomPlan, course: Course): void {
  if (courseById[course.id]) return;
  const key = normalizeCourseCode(course.code);
  plan.customCourses[key] = {
    id: course.id,
    code: course.code,
    title: course.title,
    credits: course.credits,
    description: course.description ?? "",
  };
}

/**
 * Replace `originalCourseId` in its current term with `replacement`.
 * Undo always restores the first original id at the original term index.
 */
export function swapCourseIntoPlan(plan: CustomPlan, originalCourseId: string, replacement: Course): CustomPlan {
  if (originalCourseId === replacement.id) return plan;

  const placement = findCoursePlacement(plan, originalCourseId);
  if (!placement) return plan;

  const next = cloneCustomPlan(plan);
  ensureCustomCourse(next, replacement);

  const existing = findSwapForCourse(next, originalCourseId);
  const originalCourseIdToKeep = existing?.originalCourseId ?? originalCourseId;
  const originalCodeToKeep =
    existing?.originalCode ?? resolvePlanCourse(plan, originalCourseId)?.code ?? originalCourseId;
  const termIdToKeep = existing?.termId ?? placement.termId;
  const indexToKeep = existing?.index ?? placement.index;

  for (const term of next.terms) {
    term.courseIds = term.courseIds.filter((id) => id !== replacement.id);
  }

  const dest = next.terms.find((term) => term.id === placement.termId);
  if (!dest) return plan;

  const currentIndex = dest.courseIds.indexOf(originalCourseId);
  if (currentIndex < 0) return plan;
  dest.courseIds.splice(currentIndex, 1, replacement.id);

  next.swaps = next.swaps.filter(
    (swap) => swap.replacementId !== originalCourseId && swap.replacementId !== replacement.id
  );
  next.swaps.push({
    replacementId: replacement.id,
    originalCourseId: originalCourseIdToKeep,
    originalCode: originalCodeToKeep,
    termId: termIdToKeep,
    index: indexToKeep,
  });

  pruneUnusedCustomCourses(next);
  return next;
}

export function undoSwapInPlan(plan: CustomPlan, replacementId: string): CustomPlan {
  const swap = findSwapForCourse(plan, replacementId);
  if (!swap) return plan;

  const next = cloneCustomPlan(plan);

  for (const term of next.terms) {
    term.courseIds = term.courseIds.filter((id) => id !== replacementId && id !== swap.originalCourseId);
  }

  const dest = next.terms.find((term) => term.id === swap.termId);
  if (dest) {
    const insertAt = Math.min(Math.max(swap.index, 0), dest.courseIds.length);
    dest.courseIds.splice(insertAt, 0, swap.originalCourseId);
  }

  next.swaps = next.swaps.filter((item) => item.replacementId !== replacementId);
  pruneUnusedCustomCourses(next);
  return next;
}
