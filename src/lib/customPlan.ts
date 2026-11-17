import { courseById, DEFAULT_CURRICULUM_ID, DEFAULT_PROGRAM_ID, getCurriculum } from "../data";
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
/**
 * Save format version. Bump it when the saved shape changes and add a step to
 * `upgradeSavedPlan` so older saves and plan files still load.
 *   (none) / schemaVersion 1: { schemaVersion?, terms, customCourses, swaps }
 *   2: { version, programId, curriculumId, terms, customCourses, swaps }
 */
export const PLAN_SAVE_VERSION = 2 as const;

export interface CustomTerm {
  id: string;
  label: string;
  courseIds: string[];
}

export interface CustomPlan {
  version: typeof PLAN_SAVE_VERSION;
  programId: string;
  curriculumId: string;
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

export function createEmptyCustomPlan(
  programId: string = DEFAULT_PROGRAM_ID,
  curriculumId: string = DEFAULT_CURRICULUM_ID
): CustomPlan {
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
    version: PLAN_SAVE_VERSION,
    programId,
    curriculumId,
    terms,
    customCourses: {},
    swaps: [],
  };
}

export function cloneCustomPlan(plan: CustomPlan): CustomPlan {
  return {
    version: PLAN_SAVE_VERSION,
    programId: plan.programId,
    curriculumId: plan.curriculumId,
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

/**
 * Slots that may appear in several terms (templates reuse one `coop` id for
 * every work term). Each copy still has to sit alone in its term.
 */
export function isRepeatableCourseId(courseId: string, plan?: CustomPlan): boolean {
  return isCoopCourseId(courseId, plan);
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

/**
 * Flattens one term's slots to plain ids. `usedInPlan` spans the whole plan so a
 * course is placed only once; a "choose one" slot falls back to its first
 * alternative that isn't already placed. Repeatable slots (CO-OP) are only
 * deduped within the term.
 */
function flattenSlots(slots: CourseSlot[], usedInPlan: Set<string>): string[] {
  const ids: string[] = [];
  for (const slot of slots) {
    const pick = slotCourseIds(slot).find(
      (id) =>
        courseById[id] &&
        !ids.includes(id) &&
        (isRepeatableCourseId(id) || !usedInPlan.has(id))
    );
    if (!pick) continue;
    ids.push(pick);
    usedInPlan.add(pick);
  }
  return ids;
}

/** Copies a template/variant onto a Year 1–5 F/S/U grid. Never mutates the template. */
export function customPlanFromTemplate(template: PageTemplate, variant: VariantId): CustomPlan {
  const plan = createEmptyCustomPlan(template.programId, template.curriculumId);
  const sourceTerms = getActiveTerms(template, variant);
  const usedInPlan = new Set<string>();

  for (const source of sourceTerms) {
    const year = yearFromLabel(source.label);
    const season = seasonFromLabel(source.label);
    if (year === null || !season) continue;

    const dest = plan.terms.find((term) => term.label === `Year ${year} - ${season}`);
    if (!dest) continue;

    dest.courseIds = flattenSlots(source.courseIds, usedInPlan);
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
  if (
    plan.version !== PLAN_SAVE_VERSION ||
    typeof plan.programId !== "string" ||
    typeof plan.curriculumId !== "string" ||
    !Array.isArray(plan.terms) ||
    !plan.terms.every(isCustomTerm)
  ) {
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

/**
 * Brings any older saved shape up to the current version, one step at a time.
 * Returns the input unchanged when it is already current (or not a plan at all;
 * `isCustomPlan` rejects that afterwards).
 */
export function upgradeSavedPlan(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  let data = value as Record<string, unknown>;

  // Unversioned or schemaVersion 1 → 2: these saves were MSE-only and had no curriculum.
  if (data.version === undefined && (data.schemaVersion === undefined || data.schemaVersion === 1)) {
    const { schemaVersion: _dropped, ...rest } = data;
    data = {
      ...rest,
      version: 2,
      programId: DEFAULT_PROGRAM_ID,
      curriculumId: DEFAULT_CURRICULUM_ID,
    };
  }

  return data;
}

export type PlanParseResult = { ok: true; plan: CustomPlan } | { ok: false; error: string };

/**
 * Upgrades, validates and cleans a saved plan (from browser storage or a plan
 * file): unknown courses and stale swaps are dropped, terms are mapped onto the
 * Year 1–5 grid.
 */
export function parseSavedPlan(value: unknown): PlanParseResult {
  const upgraded = upgradeSavedPlan(value);
  const version = (upgraded as { version?: unknown } | null)?.version;
  if (typeof version === "number" && version > PLAN_SAVE_VERSION) {
    return { ok: false, error: "This plan was saved by a newer version of the planner. Reload the page and try again." };
  }
  if (!isCustomPlan(upgraded)) {
    return { ok: false, error: "This isn't a valid plan file." };
  }
  const parsed = upgraded;
  if (!getCurriculum(parsed.programId, parsed.curriculumId)) {
    return {
      ok: false,
      error: `This plan is for a program or curriculum the planner doesn't know (${parsed.programId} / ${parsed.curriculumId}).`,
    };
  }

  const empty = createEmptyCustomPlan(parsed.programId, parsed.curriculumId);

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
    ...empty,
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
  return { ok: true, plan };
}

/** Loads the autosaved plan. Older saves are upgraded here and re-saved in the new format on the next change. */
export function loadCustomPlan(): CustomPlan {
  try {
    const raw = localStorage.getItem(CUSTOM_PLAN_STORAGE_KEY);
    if (!raw) return createEmptyCustomPlan();
    const result = parseSavedPlan(JSON.parse(raw));
    return result.ok ? result.plan : createEmptyCustomPlan();
  } catch {
    return createEmptyCustomPlan();
  }
}

// ── Plan files (export / import) ──

export const PLAN_FILE_EXTENSION = ".plan.json";

/** The plan as a downloadable JSON file. Same shape as the autosave. */
export function serializePlanFile(plan: CustomPlan): string {
  const { version, programId, curriculumId, terms, customCourses, swaps } = plan;
  return JSON.stringify({ version, programId, curriculumId, terms, customCourses, swaps }, null, 2);
}

export function parsePlanFile(text: string): PlanParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: "This file isn't valid JSON, so it can't be a plan file." };
  }
  return parseSavedPlan(data);
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
