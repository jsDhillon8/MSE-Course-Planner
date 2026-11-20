import { courseById, courseEquivalencies } from "../data";

/**
 * Course id → ids that count as the same course: SFU's "may not take for further
 * credit" pairs (`full` and `variant`), both directions. `alt-prereq` courses are not
 * the same course; they only count where a prerequisite's text names them.
 */
export const equivalentsById: Map<string, Set<string>> = (() => {
  const map = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    if (!map.has(a)) map.set(a, new Set());
    map.get(a)!.add(b);
  };
  for (const eq of courseEquivalencies) {
    if (eq.equivalencyType === "alt-prereq") continue;
    link(eq.sourceCourseId, eq.equivalentCourseId);
    link(eq.equivalentCourseId, eq.sourceCourseId);
  }
  return map;
})();

export function areEquivalent(a: string, b: string): boolean {
  return a === b || (equivalentsById.get(a)?.has(b) ?? false);
}

/**
 * Course id → its variant group: the same lecture with or without a lab or tutorial
 * (MATH 150/151, CHEM 120/121), itself included, sorted by code. Courses without
 * variants have no entry.
 */
export const variantGroupById: Map<string, string[]> = (() => {
  const groups = new Map<string, Set<string>>();
  for (const eq of courseEquivalencies) {
    if (eq.equivalencyType !== "variant") continue;
    const a = groups.get(eq.sourceCourseId);
    const b = groups.get(eq.equivalentCourseId);
    const merged = new Set([...(a ?? [eq.sourceCourseId]), ...(b ?? [eq.equivalentCourseId])]);
    for (const id of merged) groups.set(id, merged);
  }
  const result = new Map<string, string[]>();
  for (const [id, group] of groups) result.set(id, [...group].sort());
  return result;
})();

/** The course's variant group, or just the course when it has no variants. */
export function variantGroup(courseId: string): string[] {
  return variantGroupById.get(courseId) ?? [courseId];
}

/**
 * Course list grouping (step 3's `listedAs` tags): a required course → the courses listed
 * only as its equivalents (MSE 220 → SEE 222), and back. Variants and alt-prereq courses
 * aren't included.
 */
function buildListedEquivalents() {
  const byRequired = new Map<string, Set<string>>();
  const byEquivalent = new Map<string, Set<string>>();
  const add = (map: Map<string, Set<string>>, key: string, value: string) => {
    if (!map.has(key)) map.set(key, new Set());
    map.get(key)!.add(value);
  };
  for (const eq of courseEquivalencies) {
    if (eq.equivalencyType !== "full") continue;
    for (const [a, b] of [
      [eq.sourceCourseId, eq.equivalentCourseId],
      [eq.equivalentCourseId, eq.sourceCourseId],
    ]) {
      if (courseById[a]?.listedAs !== "required" || courseById[b]?.listedAs !== "equivalent") continue;
      add(byRequired, a, b);
      add(byEquivalent, b, a);
    }
  }
  const sortedByCode = (map: Map<string, Set<string>>) =>
    new Map(
      [...map].map(([key, ids]) => [
        key,
        [...ids].sort((x, y) => (courseById[x]?.code ?? x).localeCompare(courseById[y]?.code ?? y)),
      ])
    );
  return { byRequired: sortedByCode(byRequired), byEquivalent: sortedByCode(byEquivalent) };
}

const listedEquivalents = buildListedEquivalents();
/** Required course id → courses listed only as its equivalents, by code (MSE 220 → [SEE 222]). */
export const listedEquivalentsById: Map<string, string[]> = listedEquivalents.byRequired;
/** Equivalent-only course id → the required courses it can replace (SEE 222 → [MSE 220]). */
export const replacedCoursesById: Map<string, string[]> = listedEquivalents.byEquivalent;
