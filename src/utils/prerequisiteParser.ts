import { PrerequisiteExpression } from "../types";
import { findCourseIdsInText } from "./courseCodes";

const SECTION_BOUNDARY =
  /\.\s*(?:Corequisite|Recommended|Students with credit|Quantitative|Breadth-Science)/i;

export function extractRequirementSection(
  description: string,
  kind: "prerequisite" | "corequisite"
): string | null {
  const label = kind === "prerequisite" ? "Prerequisite" : "Corequisite";
  const match = description.match(new RegExp(`${label}:\\s*([\\s\\S]+)`, "i"));
  if (!match) return null;

  let section = match[1].trim();
  const boundary = section.search(SECTION_BOUNDARY);
  if (boundary >= 0) {
    section = section.slice(0, boundary).trim();
  }

  return section.replace(/\.$/, "").trim() || null;
}

function splitTopLevelOr(text: string): string[] {
  return text
    .split(/\s*;\s*or\s+|\s*,\s*or\s+(?=[A-Za-z])/i)
    .map((part) => part.trim())
    .filter(Boolean);
}

function splitAndClause(text: string): string[] {
  return text
    .split(/\s+and\s+|\s*,\s*both with\s+/i)
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseClause(clause: string, codeToId: Map<string, string>): PrerequisiteExpression | null {
  const andParts = splitAndClause(clause);
  const items: PrerequisiteExpression[] = [];

  for (const part of andParts) {
    const courseIds = findCourseIdsInText(part, codeToId);
    if (courseIds.length === 1) {
      items.push({ type: "course", courseId: courseIds[0] });
    } else if (courseIds.length > 1) {
      items.push({
        type: "or",
        items: courseIds.map((courseId) => ({ type: "course", courseId })),
      });
    }
  }

  if (items.length === 0) return null;
  if (items.length === 1) return items[0];
  return { type: "and", items };
}

/** Parse SFU-style prerequisite/corequisite prose into a structured expression tree. */
export function parsePrerequisiteExpression(
  text: string,
  codeToId: Map<string, string>
): PrerequisiteExpression | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const orClauses = splitTopLevelOr(trimmed);
  const parsedClauses = orClauses
    .map((clause) => parseClause(clause, codeToId))
    .filter((clause): clause is PrerequisiteExpression => clause !== null);

  if (parsedClauses.length === 0) return null;
  if (parsedClauses.length === 1) return parsedClauses[0];
  return { type: "or", items: parsedClauses };
}

export function collectCourseIds(expression: PrerequisiteExpression | null): Set<string> {
  const ids = new Set<string>();
  if (!expression) return ids;

  const walk = (node: PrerequisiteExpression): void => {
    if (node.type === "course") {
      ids.add(node.courseId);
      return;
    }
    for (const item of node.items) walk(item);
  };

  walk(expression);
  return ids;
}
