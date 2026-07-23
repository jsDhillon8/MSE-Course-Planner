import { Course } from "../types";

export function normalizeCourseCode(code: string): string {
  return code.replace(/\s+/g, " ").trim().toUpperCase();
}

export function buildCourseCodeIndex(courses: Course[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const course of courses) {
    index.set(normalizeCourseCode(course.code), course.id);
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
  const sortedCodes = [...codeToId.keys()].sort((a, b) => b.length - a.length);
  const found: string[] = [];

  for (const code of sortedCodes) {
    const pattern = new RegExp(`\\b${code.replace(/\s+/g, "\\s+")}\\b`, "i");
    if (pattern.test(expanded)) {
      const id = codeToId.get(code);
      if (id) found.push(id);
    }
  }

  return [...new Set(found)];
}
