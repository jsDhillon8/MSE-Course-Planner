// Step 2 of requirement parsing: turn prerequisite text into an and/or tree of course ids.
import { PrerequisiteExpression } from "../../types";
import { expandDepartmentShorthand, findCourseIdsInText } from "../courseCodes";
import { normalizeRequirementSection } from "./requirementText";

/**
 * Grade conditions such as ", with a minimum grade of C-" or " with a grade of at least B".
 * The grade must be a whole word, so "grade of at least" isn't read as grade "a" + "t least".
 */
const GRADE_CONDITION = /,?\s+with\s+(?:a\s+)?(?:minimum\s+)?grade\s+of\s+(?:at\s+least\s+)?[A-F][+-]?(?![A-Za-z])/gi;

/** Separators between independent requirements: sentences and semicolons. */
const SENTENCE_SEPARATOR = /^(?:\.\s+|;\s*)/;
/** Separators inside one requirement list: commas, ", and", " and ". */
const LIST_SEPARATOR = /^(?:,\s*(?:and\s+)?|\s+and\s+)/i;
const OR_SEPARATOR = /^\s+or\s+/i;
const ONE_OF = /\b(?:one of|any of|either)\s+(.+)/i;
/** A "one of" list starting this part, or after an "or" in it ("BC Calculus 12, or any of MATH 100, 150"). */
const STARTS_ONE_OF_LIST = /(?:^|\bor\s+)(?:one of|any of|either)\b/i;
/**
 * An Oxford-comma list of alternatives, "MATH 150, MATH 151, MATH 154, or MATH 157"
 * (codes are full after department shorthand is expanded): the final ", or" makes
 * every comma in the run an "or".
 */
const OXFORD_OR_LIST =
  /[A-Z]{2,5}\s+\d{3}[A-Z]?(?:,\s*[A-Z]{2,5}\s+\d{3}[A-Z]?)+,\s*or\s+(?=[A-Z]{2,5}\s+\d{3})/g;

/**
 * A same-department list without the final comma, "MATH 150, MATH 151 or MATH 154"
 * (after shorthand is expanded): every comma in the run is an "or". Lists mixing
 * departments are left alone, since "PHYS 141, MATH 152 or MATH 155" may mean "and", and so
 * is a list right after an "or": in "ECON 103 or ECON 113, ECON 105 or ECON 115" the comma is "and".
 */
const SAME_DEPT_OR_LIST = /(?<!\bor\s+)\b([A-Z]{2,5})\s+\d{3}[A-Z]?(?:,\s*\1\s+\d{3}[A-Z]?)+\s+or\s+(?=\1\s+\d{3})/g;

/** A course code, known or not (after department shorthand is expanded). */
const COURSE_CODE = /\b[A-Z]{2,5}\s+\d{3}[A-Z]?\b/;
/** An "or equivalent" option: not a separate route. */
const JUST_EQUIVALENT = /^(?:an?\s+)?equivalent\b/i;
/**
 * Separate routes for different groups of students, which SFU writes with a capital "OR":
 * "BUS 217W and 45 units, OR to ... double degree students with 45 units". Only an OR
 * after a break and followed by "to ..." or a "students" phrase starts a route, so
 * "100 units OR 80 units plus co-op" stays one requirement.
 */
const ROUTE_SEPARATOR = /[;,.]\s+OR\s+(?=to\b|[^;.]*\bstudents\b)/;
/**
 * Sentences that aren't requirements: what can't be taken together, what to do before a
 * later course, advice, waivers and enrolment notes. They name courses that would
 * otherwise be read as prerequisites (MSE 410: "Must not be taken concurrently with MSE 493").
 */
const NOT_A_REQUIREMENT =
  /\bmust not\b|\bbefore enrolling\b|\brecommend|\bautomatically enrolled\b|\bimmediately following\b|\bmay be waived\b|\bin order to obtain credit\b/i;
/** "Also, for students in the life sciences, MATH 154 and MATH 155": another route, not an extra requirement. */
const ALSO_FOR_STUDENTS = /^Also,?\s+for\s+[^,]*,\s*/i;

/** True when text names no course at all, e.g. "Chemistry 12" or "permission of the department". */
const namesNoCourse = (text: string) => !COURSE_CODE.test(expandDepartmentShorthand(text));

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

/**
 * Parse "A or B or C"; falls back to the whole part if no alternative names a known course.
 * An option that names no course ("Chemistry 12", "permission of the department") can be
 * met without any course, so the whole "or" is met (null). An option naming a course
 * outside the course list is just left out.
 */
function parseAlternatives(part: string, codeToId: Map<string, string>): PrerequisiteExpression | null {
  const alternatives = splitOutsideParentheses(part, OR_SEPARATOR).filter((alt) => !JUST_EQUIVALENT.test(alt));
  if (alternatives.length > 1) {
    const options = alternatives.map((alt) => parseClause(alt, codeToId));
    if (options.some((option, i) => option === null && namesNoCourse(cleanClause(alternatives[i])))) return null;
    const parsed = combine("or", options);
    if (parsed) return parsed;
  }
  return parseClause(alternatives.length === 1 ? alternatives[0] : part, codeToId);
}

/**
 * Parse SFU requirement text. Sentences, semicolons, commas and "and" combine as "and";
 * "or" (including "; or" and ", or") combines as "or". Separate student routes ("..., OR to
 * double degree students with 45 units") combine as "or"; a route that needs no course
 * means the whole requirement can be met without one (null).
 */
export function parsePrerequisiteExpression(
  text: string,
  codeToId: Map<string, string>,
): PrerequisiteExpression | null {
  const routes = normalizeRequirementSection(text).split(ROUTE_SEPARATOR);
  if (routes.length === 1) return parseRoute(routes[0], codeToId);

  const parsed = routes.map((route) => parseRoute(route, codeToId));
  if (parsed.some((route, i) => route === null && namesNoCourse(routes[i]))) return null;
  return combine("or", parsed);
}

/** One route: its sentences combine as "and", except "Also, for students in ..." which is an alternative. */
function parseRoute(text: string, codeToId: Map<string, string>): PrerequisiteExpression | null {
  const cleaned = expandDepartmentShorthand(text)
    .replace(GRADE_CONDITION, "")
    .replace(OXFORD_OR_LIST, (list) => list.replace(/,\s*(?:or\s+)?/g, " or "))
    .replace(SAME_DEPT_OR_LIST, (list) => list.replace(/,\s*/g, " or "))
    .replace(/\s*[;,]\s*or\s+/gi, " or ");
  if (!cleaned) return null;

  const sentences: (PrerequisiteExpression | null)[] = [];
  for (const sentence of splitOutsideParentheses(cleaned, SENTENCE_SEPARATOR)) {
    if (NOT_A_REQUIREMENT.test(sentence)) continue;
    const alsoFor = sentence.match(ALSO_FOR_STUDENTS);
    if (alsoFor && sentences.length) {
      const previous = sentences.pop() ?? null;
      const alternative = parseRequirementList(sentence.slice(alsoFor[0].length), codeToId);
      const options = previous?.type === "or" ? previous.items : [previous];
      sentences.push(previous && alternative ? combine("or", [...options, alternative]) : previous);
      continue;
    }
    sentences.push(parseRequirementList(sentence, codeToId));
  }
  return combine("and", sentences);
}

/**
 * Parse one sentence: a comma/"and" list of requirements. A part starting with
 * "one of"/"either" (or with it after an "or") takes the rest of the list with it
 * ("MSE 103 and one of MATH 150, MATH 151").
 */
function parseRequirementList(sentence: string, codeToId: Map<string, string>): PrerequisiteExpression | null {
  const parts = splitOutsideParentheses(sentence, LIST_SEPARATOR);
  const oneOfIndex = parts.findIndex((part) => STARTS_ONE_OF_LIST.test(part));
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
