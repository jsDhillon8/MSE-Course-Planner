import { PrerequisiteExpression } from "../types";
import { findCourseIdsInText } from "./courseCodes";

/** @deprecated Use resolveRequirementTexts + normalizeRequirementsFromText instead. */
  //prerequisiteText: string;
  //corequisiteText: string;


export interface NormalizedRequirements {
  prerequisiteExpression: PrerequisiteExpression | null;
  corequisiteExpression: PrerequisiteExpression | null;
  prerequisiteIds: Set<string>;
  corequisiteIds: Set<string>;
}

/**
 * Split a combined SFU Outlines "Prerequisites:" block into prerequisite and
 * corequisite prose. Corequisites appear as a subsection inside the same field.
 */
export function splitSfuRequirementsSection(combinedText: string): SplitRequirementsText {
  let body = combinedText.trim();
  if (!body) return { prerequisiteText: "", corequisiteText: "" };

  // Strip optional top-level header.
  body = body.replace(/^Prerequisites:\s*/i, "");

  const coreqParts = body.split(/\bCorequisites:\s*/i);
  if (coreqParts.length > 1) {
    return {
      prerequisiteText: normalizeRequirementSection(coreqParts[0]),
      corequisiteText: normalizeRequirementSection(coreqParts.slice(1).join("Corequisites:")),
    };
  }

  const coreqSingularParts = body.split(/\bCorequisite:\s*/i);
  if (coreqSingularParts.length > 1) {
    return {
      prerequisiteText: normalizeRequirementSection(coreqSingularParts[0]),
      corequisiteText: normalizeRequirementSection(coreqSingularParts.slice(1).join("Corequisite:")),
    };
  }

  return {
    prerequisiteText: normalizeRequirementSection(body),
    corequisiteText: "",
  };
}

/** Normalize bullet lists and inline SFU requirement prose for expression parsing. */
export function normalizeRequirementSection(text: string): string {
  const withoutBullets = text
    .split("\n")
    .map((line) => line.replace(/^\s*[-•*]\s*/, "").trim())
    .filter(Boolean)
    .join("; ");

  return withoutBullets
    .replace(/\(\s*/g, " (")
    .replace(/\s*\)/g, ")")
    .replace(/\s+/g, " ")
    .replace(/\.$/, "")
    .trim();
}

/** Extract calendar-style Prerequisite/Corequisite sentences from a course description. */
export function extractCalendarRequirements(description: string): SplitRequirementsText {
  const prerequisiteText = extractLabeledSection(description, "Prerequisite") ?? "";
  const corequisiteText = extractLabeledSection(description, "Corequisite") ?? "";
  return { prerequisiteText, corequisiteText };
}

function extractLabeledSection(description: string, label: "Prerequisite" | "Corequisite"): string | null {
  const pattern =
    label === "Prerequisite"
      ? /Prerequisites?:\s*([\s\S]*?)(?=\s*Corequisites?:|\.\s*(?:Recommended|Students with credit|Quantitative|Breadth-Science)|$)/i
      : /Corequisites?:\s*([\s\S]*?)(?=\.\s*(?:Recommended|Students with credit|Quantitative|Breadth-Science)|$)/i;

  const match = description.match(pattern);
  if (!match) return null;

  return normalizeRequirementSection(match[1].replace(/\.$/, ""));
}

/**
 * Move "COURSE may be taken concurrently" clauses from prerequisite text into
 * corequisite text (common in SFU calendar prose embedded in API strings).
 */
export function extractConcurrentCorequisites(text: string): SplitRequirementsText {
  let prerequisiteText = text;
  const corequisiteParts: string[] = [];

  const concurrentPattern =
    /(?:,\s*|\band\s+|\bor\s+)?([A-Za-z]{2,8}\s*\d{1,3}[A-Za-z]?)\s+may be taken concurrently\.?/gi;

  prerequisiteText = prerequisiteText.replace(concurrentPattern, (_match, courseRef: string) => {
    corequisiteParts.push(courseRef.trim());
    return "";
  });

  prerequisiteText = prerequisiteText
    .replace(/,\s*,/g, ",")
    .replace(/,\s*\./g, ".")
    .replace(/\s+and\s+\./i, ".")
    .replace(/\s+or\s+\./i, ".")
    .replace(/\.\s*\./g, ".")
    .replace(/,\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();

  return {
    prerequisiteText,
    corequisiteText: corequisiteParts.join("; "),
  };
}

/** Resolve requirement prose from either SFU Outlines or calendar description formats. */
export function resolveRequirementTexts(rawSource: string): SplitRequirementsText {
  const trimmed = rawSource.trim();
  if (!trimmed) return { prerequisiteText: "", corequisiteText: "" };

  const usesSfuBlock =
    /^Prerequisites:\s*/i.test(trimmed) || /\bCorequisites:\s*/i.test(trimmed);

  let split: SplitRequirementsText;
  if (usesSfuBlock) {
    split = splitSfuRequirementsSection(trimmed);
  } else if (/\bPrerequisites?:\s*/i.test(trimmed)) {
    split = extractCalendarRequirements(trimmed);
  } else {
    split = { prerequisiteText: normalizeRequirementSection(trimmed), corequisiteText: "" };
  }

  const concurrent = extractConcurrentCorequisites(split.prerequisiteText);
  return {
    prerequisiteText: concurrent.prerequisiteText,
    corequisiteText: [split.corequisiteText, concurrent.corequisiteText]
      .filter(Boolean)
      .join("; "),
  };
}

function splitTopLevelOr(text: string): string[] {
  return text
    .split(/\s*;\s*|\s*;\s*or\s+|\s*,\s*or\s+(?=[A-Za-z])/i)
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
  const trimmed = normalizeRequirementSection(text);
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

export function normalizeRequirementsFromText(
  rawSource: string,
  codeToId: Map<string, string>
): NormalizedRequirements {
  const { prerequisiteText, corequisiteText } = resolveRequirementTexts(rawSource);

  const prerequisiteExpression = parsePrerequisiteExpression(prerequisiteText, codeToId);
  const corequisiteExpression = parsePrerequisiteExpression(corequisiteText, codeToId);

  return {
    prerequisiteExpression,
    corequisiteExpression,
    prerequisiteIds: collectCourseIds(prerequisiteExpression),
    corequisiteIds: collectCourseIds(corequisiteExpression),
  };
}

/** @deprecated Use resolveRequirementTexts + normalizeRequirementsFromText instead. */
export function extractRequirementSection(
  description: string,
  kind: "prerequisite" | "corequisite"
): string | null {
  const split = resolveRequirementTexts(description);
  const text = kind === "prerequisite" ? split.prerequisiteText : split.corequisiteText;
  return text || null;
}
