import { Course } from "../types";

export function normalizeCourseCode(code: string): string {
  return code.replace(/\s+/g, " ").trim().toUpperCase();
}

export function buildCourseCodeIndex(courses: Course[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const course of courses) {
    const normalized = normalizeCourseCode(course.code);
    index.set(normalized, course.id);
    index.set(normalized.replace(/\s+/g, ""), course.id);
  }
  return index;
}

/** Expand shorthand like "MATH 150 or 151 or 155" to include department prefixes. */
export function expandDepartmentShorthand(text: string): string {
  return text.replace(
    /\b([A-Za-z]{2,8})\s+(\d{1,3}[A-Za-z]?)([\s\S]*)/g,
    (_full, dept: string, firstNum: string, rest: string) => {
      const expandedRest = rest.replace(
        /\bor\s+(\d{1,3}[A-Za-z]?)\b/gi,
        (_match, num: string) => `or ${dept} ${num}`
      );
      return `${dept} ${firstNum}${expandedRest}`;
    }
  );
}

export function findCourseIdsInText(text: string, codeToId: Map<string, string>): string[] {
  const expanded = expandDepartmentShorthand(text);
  const found: string[] = [];

  // Match spaced and compact catalog codes, e.g. "MSE 220" and "MSE220".
  const spacedPattern = /\b([A-Za-z]{2,8})\s+(\d{1,3}[A-Za-z]?)\b/g;
  let match: RegExpExecArray | null;
  while ((match = spacedPattern.exec(expanded)) !== null) {
    const spaced = normalizeCourseCode(`${match[1]} ${match[2]}`);
    const compact = spaced.replace(/\s+/g, "");
    const id = codeToId.get(spaced) ?? codeToId.get(compact);
    if (id) found.push(id);
  }

  return [...new Set(found)];
}
