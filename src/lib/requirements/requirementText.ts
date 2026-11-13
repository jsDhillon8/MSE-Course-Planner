// Step 1 of requirement parsing: find the prerequisite and corequisite text
// inside SFU wording (outline fields, calendar descriptions, or bullet lists).

export interface SplitRequirementsText {
  prerequisiteText: string;
  corequisiteText: string;
}

const EMPTY: SplitRequirementsText = { prerequisiteText: "", corequisiteText: "" };

/** Flatten bullet lists and SFU spacing into one "; "-separated line. */
export function normalizeRequirementSection(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-•*]\s*/, "").trim())
    .filter(Boolean)
    .join("; ")
    .replace(/\s+/g, " ")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .replace(/\.$/, "")
    .trim();
}

/** Split a "Prerequisites: ... Corequisites: ..." block. */
function splitSfuRequirementsSection(combinedText: string): SplitRequirementsText {
  let body = combinedText.trim();
  if (!body) return { ...EMPTY };

  body = body.replace(/^Prerequisites:\s*/i, "");
  const match = body.match(/([\s\S]*?)(?:Corequisites?:\s*)([\s\S]*)/i);

  if (match) {
    return {
      prerequisiteText: normalizeRequirementSection(match[1]),
      corequisiteText: normalizeRequirementSection(match[2]),
    };
  }

  return { prerequisiteText: normalizeRequirementSection(body), corequisiteText: "" };
}

/** Pull labelled sections out of a calendar-style course description. */
function extractCalendarRequirements(description: string): SplitRequirementsText {
  return {
    prerequisiteText: extractLabeledSection(description, "Prerequisite") ?? "",
    corequisiteText: extractLabeledSection(description, "Corequisite") ?? "",
  };
}

function extractLabeledSection(description: string, label: "Prerequisite" | "Corequisite"): string | null {
  const regex =
    label === "Prerequisite"
      ? /Prerequisites?:\s*([\s\S]*?)(?=\.\s*(?:Corequisites?|Recommended|Students with credit|Quantitative|Breadth)|$)/i
      : /Corequisites?:\s*([\s\S]*?)(?=\.\s*(?:Recommended|Students with credit|Quantitative|Breadth)|$)/i;

  const match = description.match(regex);
  if (!match) return null;
  return normalizeRequirementSection(match[1]);
}

/**
 * Move "X may be taken concurrently" phrases from the prerequisite text to corequisites.
 * X is everything back to the previous sentence break or comma, e.g. "MSE 281 (or MATH 260)".
 */
function extractConcurrentCorequisites(text: string): SplitRequirementsText {
  const corequisites: string[] = [];

  let prerequisiteText = text.replace(
    /([^.;,]*?)\s+may be taken concurrently\.?/gi,
    (_match, courses: string) => {
      corequisites.push(courses.trim());
      return "";
    },
  );

  prerequisiteText = prerequisiteText.replace(/,\s*,/g, ",").replace(/\s+/g, " ").trim();

  return { prerequisiteText, corequisiteText: corequisites.join("; ") };
}

/** Detect the source format and return its prerequisite and corequisite text. */
export function resolveRequirementTexts(rawSource: string): SplitRequirementsText {
  const source = rawSource.trim();
  if (!source) return { ...EMPTY };

  let result: SplitRequirementsText;

  if (/^Prerequisites:/i.test(source) || /Corequisites?:/i.test(source)) {
    result = splitSfuRequirementsSection(source);
  } else if (/Prerequisites?:/i.test(source)) {
    result = extractCalendarRequirements(source);
  } else {
    result = { prerequisiteText: normalizeRequirementSection(source), corequisiteText: "" };
  }

  // Advice such as "Recommended: MATH 240 ..." is not a requirement.
  const withoutAdvice = result.prerequisiteText.replace(/\s*\bRecommended:[\s\S]*$/i, "");
  const concurrent = extractConcurrentCorequisites(withoutAdvice);

  return {
    prerequisiteText: concurrent.prerequisiteText,
    corequisiteText: [result.corequisiteText, concurrent.corequisiteText].filter(Boolean).join("; "),
  };
}
