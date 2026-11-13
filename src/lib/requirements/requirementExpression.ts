// Step 2 of requirement parsing: turn prerequisite text into an and/or tree of course ids.
import { PrerequisiteExpression } from "../../types";
import { findCourseIdsInText } from "../courseCodes";
import { normalizeRequirementSection } from "./requirementText";

/** Remove grade conditions and "(or equivalent)" notes. */
function cleanClause(text: string): string {
  return text
    .replace(/\s+with\s+(?:a\s+)?minimum\s+grade\s+of\s+[A-F][+-]?/gi, "")
    .replace(/\s+with\s+(?:a\s+)?grade\s+of\s+[A-F][+-]?/gi, "")
    .replace(/\s*\([^)]*equivalent[^)]*\)/gi, "")
    .trim();
}

/** Split text on a separator, ignoring separators inside parentheses. */
function splitOutsideParentheses(text: string, separator: RegExp): string[] {
  const parts: string[] = [];
  let current = "";
  let depth = 0;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === "(") depth++;
    if (char === ")") depth--;

    if (depth === 0 && separator.test(text.slice(i))) {
      parts.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  if (current.trim()) parts.push(current.trim());
  return parts;
}

const courseNode = (courseId: string): PrerequisiteExpression => ({ type: "course", courseId });

/** Parse one clause: a single course, a "one of" list, or several courses (treated as "and"). */
function parseClause(clause: string, codeToId: Map<string, string>): PrerequisiteExpression | null {
  clause = cleanClause(clause);

  const oneOf = clause.match(/(?:one of|any of|either)\s+(.+)/i);
  if (oneOf) {
    const ids = findCourseIdsInText(oneOf[1], codeToId);
    if (ids.length) return { type: "or", items: ids.map(courseNode) };
  }

  const ids = findCourseIdsInText(clause, codeToId);
  if (!ids.length) return null;
  if (ids.length === 1) return courseNode(ids[0]);
  return { type: "and", items: ids.map(courseNode) };
}

export function parsePrerequisiteExpression(
  text: string,
  codeToId: Map<string, string>,
): PrerequisiteExpression | null {
  const cleaned = normalizeRequirementSection(text);
  if (!cleaned) return null;

  const andParts = splitOutsideParentheses(cleaned, /\s+and\s+/i);

  const expressions = andParts
    .map((part): PrerequisiteExpression | null => {
      const orParts = splitOutsideParentheses(part, /\s+or\s+/i);

      if (orParts.length > 1) {
        const items = orParts
          .map((p) => parseClause(p, codeToId))
          .filter((x): x is PrerequisiteExpression => x !== null);
        if (items.length) return { type: "or", items };
      }

      return parseClause(part, codeToId);
    })
    .filter((x): x is PrerequisiteExpression => x !== null);

  if (!expressions.length) return null;
  if (expressions.length === 1) return expressions[0];
  return { type: "and", items: expressions };
}

/** Every course id mentioned anywhere in the expression. */
export function collectCourseIds(expression: PrerequisiteExpression | null): Set<string> {
  const ids = new Set<string>();
  if (!expression) return ids;

  const walk = (node: PrerequisiteExpression) => {
    if (node.type === "course") ids.add(node.courseId);
    else node.items.forEach(walk);
  };

  walk(expression);
  return ids;
}
