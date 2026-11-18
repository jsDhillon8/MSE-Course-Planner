import { courseEquivalencies } from "../data";

/**
 * Course id → ids that count as the same course: SFU's "may not take for further
 * credit" pairs and the hand-edited overrides, both directions, excluding
 * elective-only pairs.
 */
export const equivalentsById: Map<string, Set<string>> = (() => {
  const map = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    if (!map.has(a)) map.set(a, new Set());
    map.get(a)!.add(b);
  };
  for (const eq of courseEquivalencies) {
    if (eq.equivalencyType === "elective-only") continue;
    link(eq.sourceCourseId, eq.equivalentCourseId);
    link(eq.equivalentCourseId, eq.sourceCourseId);
  }
  return map;
})();

export function areEquivalent(a: string, b: string): boolean {
  return a === b || (equivalentsById.get(a)?.has(b) ?? false);
}
