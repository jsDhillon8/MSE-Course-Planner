// Step 2 of requirement parsing: turn prerequisite text into an and/or tree of course ids.
import { PrerequisiteExpression } from "../../types";
import { expandDepartmentShorthand, findCourseIdsInText } from "../courseCodes";
import { normalizeRequirementSection } from "./requirementText";

/** Grade conditions such as ", with a minimum grade of C-". */
const GRADE_CONDITION = /,?\s+with\s+(?:a\s+)?(?:minimum\s+)?grade\s+of\s+[A-F][+-]?/gi;

/** Separators between independent requirements: sentences and semicolons. */
const SENTENCE_SEPARATOR = /^(?:\.\s+|;\s*)/;
/** Separators inside one requirement list: commas, ", and", " and ". */
const LIST_SEPARATOR = /^(?:,\s*(?:and\s+)?|\s+and\s+)/i;
const OR_SEPARATOR = /^\s+or\s+/i;
const ONE_OF = /\b(?:one of|any of|either)\s+(.+)/i;
const STARTS_WITH_ONE_OF = /^(?:one of|any of|either)\b/i;

/** Remove "(or equivalent)" style notes. */
function cleanClause(text: string): string {
  return text.replace(/\s*\([^)]*equivalent[^)]*\)/gi, "").trim();
}

/** Split text on a separator (anchored with ^), ignoring separators inside parentheses. */
function splitOutsideParentheses(text: string, separator: RegExp): string[] {
  const parts: string[] = [];
  let current = "";
  let depth = 0;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === "(") depth++;
    if (char === ")") depth--;

    const match = depth === 0 ? text.slice(i).match(separator) : null;
    if (match) {
      if (current.trim()) parts.push(current.trim());
      current = "";
      i += match[0].length - 1;
      continue;
    }

    current += char;
  }

  if (current.trim()) parts.push(current.trim());
  return parts;
}

/** True for "(...)" where the first bracket closes at the very end, e.g. "(MSE 110 or MSE 112)". */
function isWrappedInParentheses(text: string): boolean {
  if (!text.startsWith("(") || !text.endsWith(")")) return false;
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "(") depth++;
    if (text[i] === ")") depth--;
    if (depth === 0 && i < text.length - 1) return false;
  }
  return true;
}

const courseNode = (courseId: string): PrerequisiteExpression => ({ type: "course", courseId });

/** Combine sub-expressions: none → null, one → itself, several → and/or node. */
function combine(type: "and" | "or", items: (PrerequisiteExpression | null)[]): PrerequisiteExpression | null {
  const present = items.filter((x): x is PrerequisiteExpression => x !== null);
  if (!present.length) return null;
  if (present.length === 1) return present[0];
  return { type, items: present };
}

/**
 * Parse one clause: a single course, a "one of" list, "X (or Y)",
 * or several courses (treated as "and").
 */
function parseClause(clause: string, codeToId: Map<string, string>): PrerequisiteExpression | null {
  clause = cleanClause(clause);

  if (isWrappedInParentheses(clause)) return parseRequirementList(clause.slice(1, -1), codeToId);

  const oneOf = clause.match(ONE_OF);
  if (oneOf) {
    const ids = findCourseIdsInText(oneOf[1], codeToId);
    if (ids.length) return combine("or", ids.map(courseNode));
  }

  const bracketedAlternative = clause.match(/^(.*?)\s*\(\s*or\s+([^)]*)\)$/i);
  if (bracketedAlternative) {
    return combine("or", [
      parseClause(bracketedAlternative[1], codeToId),
      parseClause(bracketedAlternative[2], codeToId),
    ]);
  }

  const ids = findCourseIdsInText(clause, codeToId);
  return combine("and", ids.map(courseNode));
}

/** Parse "A or B or C"; falls back to the whole part if no alternative names a known course. */
function parseAlternatives(part: string, codeToId: Map<string, string>): PrerequisiteExpression | null {
  const alternatives = splitOutsideParentheses(part, OR_SEPARATOR);
  if (alternatives.length > 1) {
    const parsed = combine("or", alternatives.map((alt) => parseClause(alt, codeToId)));
    if (parsed) return parsed;
  }
  return parseClause(part, codeToId);
}

/**
 * Parse SFU requirement text. Sentences, semicolons, commas and "and" combine as "and";
 * "or" (including "; or" and ", or") combines as "or".
 */
export function parsePrerequisiteExpression(
  text: string,
  codeToId: Map<string, string>,
): PrerequisiteExpression | null {
  const cleaned = expandDepartmentShorthand(normalizeRequirementSection(text))
    .replace(GRADE_CONDITION, "")
    .replace(/\s*[;,]\s*or\s+/gi, " or ");
  if (!cleaned) return null;

  return combine(
    "and",
    splitOutsideParentheses(cleaned, SENTENCE_SEPARATOR).map((sentence) => parseRequirementList(sentence, codeToId)),
  );
}

/**
 * Parse one sentence: a comma/"and" list of requirements. A part starting with
 * "one of"/"either" takes the rest of the list with it ("MSE 103 and one of MATH 150, MATH 151").
 */
function parseRequirementList(sentence: string, codeToId: Map<string, string>): PrerequisiteExpression | null {
  const parts = splitOutsideParentheses(sentence, LIST_SEPARATOR);
  const oneOfIndex = parts.findIndex((part) => STARTS_WITH_ONE_OF.test(part));
  const listParts = oneOfIndex === -1 ? parts : [...parts.slice(0, oneOfIndex), parts.slice(oneOfIndex).join(", ")];
  return combine(
    "and",
    listParts.map((part) => parseAlternatives(part, codeToId)),
  );
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
