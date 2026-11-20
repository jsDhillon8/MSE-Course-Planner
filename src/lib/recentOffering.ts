// "Not offered recently": a course with no sections next term, this term or the 3 terms before.
import { getCurrentAcademicTerm } from "../api/sfuOutlines";
import type { OfferingHistoryState } from "../hooks/useOfferingHistories";
import { skippedCourseIds } from "../data";
import { Course, TermName } from "../types";
import { isPlaceholderCourse } from "./courseCodes";

/** Past terms (before the current one) that still count as recent. */
export const RECENT_PAST_TERMS = 3;

const TERM_ORDER: TermName[] = ["spring", "summer", "fall"];
const TERM_LABEL: Record<TermName, string> = { spring: "Spring", summer: "Summer", fall: "Fall" };

/** "2026/fall" → a number that sorts terms in time order, or null if it isn't a term. */
function termIndex(term: string): number | null {
  const [year, name] = term.split("/");
  const order = TERM_ORDER.indexOf(name as TermName);
  return /^\d{4}$/.test(year) && order >= 0 ? Number(year) * 3 + order : null;
}

/** "2026/fall" → "Fall 2026". */
export function formatTerm(term: string): string {
  const [year, name] = term.split("/");
  return `${TERM_LABEL[name as TermName] ?? name} ${year}`;
}

/**
 * Why a course counts as not offered recently, for its badge and tooltip, or null when it
 * was offered recently (or isn't checked: placeholders, custom courses, data from before
 * `lastOffered` was synced). Uses the synced `lastOffered`, and the live offering history
 * when it's loaded and shows a newer offering.
 */
export function notOfferedRecentlyReason(course: Course, history?: OfferingHistoryState): string | null {
  if (isPlaceholderCourse(course) || course.lastOffered === undefined) return null;

  const now = getCurrentAcademicTerm();
  const cutoff = now.year * 3 + TERM_ORDER.indexOf(now.term) - RECENT_PAST_TERMS;
  const live = history && history !== "loading" && history !== "unknown" ? history.lastOffered : undefined;
  const newest = [course.lastOffered, live]
    .filter((term): term is string => Boolean(term))
    .sort((a, b) => (termIndex(b) ?? 0) - (termIndex(a) ?? 0))[0];

  if (newest && (termIndex(newest) ?? -Infinity) >= cutoff) return null;
  return newest
    ? `Not offered in the last ${RECENT_PAST_TERMS} terms. Last offered ${formatTerm(newest)}.`
    : `Not offered in the last ${RECENT_PAST_TERMS} terms, or the ones before them that were checked.`;
}

/**
 * For a course outside the course list (e.g. an equivalent named only in SFU's notes):
 * the sync left it out because SFU has no outline for it in the last 6 terms (CMPT 128).
 */
export function skippedCourseReason(courseId: string): string | null {
  return skippedCourseIds.has(courseId) ? "Not offered in the last 6 terms, so it isn't in the course list." : null;
}
