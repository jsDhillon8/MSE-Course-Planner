// Parsing checks on real SFU requirement wording. Run: npm run test:requirement-parsing
// Uses a fixed course list (KNOWN_CODES, plus each case's `known`), not the synced one, so
// results don't change when `npm run sync-data` adds courses. Codes outside the list
// (e.g. PHYS 121, MATH 154) stand for courses the planner doesn't know.
import type { Course, PrerequisiteExpression } from "../../types";
import { buildCourseCodeIndex } from "../courseCodes";
import { normalizeRequirementsFromText } from "./requirementNormalizer";

interface Case {
  name: string;
  input: string;
  pre: string[];
  co?: string[];
  /** Expected type of the top-level prerequisite expression, when it matters. */
  preType?: "course" | "and" | "or";
  /** Expected and/or tree, written like "and(or(math150, math151), bus232)", when the structure matters. */
  preTree?: string;
  coTree?: string;
  /** Extra course codes this case treats as known. */
  known?: string[];
}

const KNOWN_CODES = [
  "BUS 207", "BUS 232", "BUS 312", "BUS 343", "BUS 360W", "BUS 374", "BUS 381", "ECON 201",
  "MATH 150", "MATH 151", "MATH 152", "MATH 232", "MATH 251", "MATH 260",
  "MSE 103", "MSE 110", "MSE 112", "MSE 212", "MSE 250", "MSE 280", "MSE 281", "MSE 320", "MSE 381",
  "PHYS 141",
];

const CASES: Case[] = [
  {
    name: "MSE 280: 'A or B' keeps both",
    input: "Prerequisites: MSE 281 or MATH 260.",
    pre: ["mse281", "math260"],
    preType: "or",
  },
  {
    name: "MSE 210: 'or equivalent' and a second sentence",
    input: "Prerequisites: PHYS 141 or equivalent. MATH 150 or MATH 151.",
    pre: ["phys141", "math150", "math151"],
    preType: "and",
  },
  {
    name: "MSE 250: bracketed alternatives and a concurrent corequisite",
    input:
      "Prerequisites: PHYS 141 or (PHYS 121 and 131), MSE 281 (or MATH 260), and MATH 232. MSE 281 (or MATH 260) may be taken concurrently.",
    pre: ["phys141", "math232"],
    co: ["mse281", "math260"],
  },
  {
    name: "MSE 281: concurrent course is a corequisite, not a prerequisite",
    input: "Prerequisites: MATH 251, MSE 103, MSE 250. MSE 250 may be taken concurrently.",
    pre: ["math251", "mse103"],
    co: ["mse250"],
  },
  {
    name: "MATH 152: grade conditions and '; or' alternatives",
    input:
      "Prerequisites: MATH 150 or MATH 151, with a minimum grade of C-; or MATH 154 or MATH 157, with a minimum grade of B.",
    pre: ["math150", "math151"],
    preType: "or",
  },
  {
    name: "BUS 232: Oxford-comma list 'A, B, C, or D' is one 'or'",
    input: "Corequisites: MATH 150, MATH 151, MATH 154, or MATH 157, with a minimum grade of C-; 15 units.",
    pre: [],
    co: ["math150", "math151"],
    coTree: "or(math150, math151)",
  },
  {
    name: "BUS 336: two Oxford-comma 'or' lists joined by ';' are both required",
    input:
      "Prerequisites: MATH 150, MATH 151, MATH 154, or MATH 157, with a minimum grade of C-; BUS 232, ECON 233, STAT 270, or STAT 271, with a minimum grade of C-; 45 units.",
    pre: ["math150", "math151", "bus232"],
    preTree: "and(or(math150, math151), bus232)",
  },
  {
    name: "MSE 381: '(or X)' with a course outside the list",
    input: "Prerequisites: MSE 280 (or ENSC 380).",
    pre: ["mse280"],
  },
  {
    name: "BUS 478: department shorthand ('BUS 312, 343') and 'either ... or'",
    input:
      "Prerequisites: BUS 207 (or ECON 201 or ECON 301), BUS 312, 343, 360W and either BUS 374 or 381, all with a minimum grade of C-; 90 units.",
    pre: ["bus207", "econ201", "bus312", "bus343", "bus360w", "bus374", "bus381"],
    preType: "and",
  },
  {
    name: "MATH 251: 'Recommended:' text is ignored",
    input:
      "Prerequisites: MATH 152 with a minimum grade of C-; or MATH 158 with a grade of at least B. Recommended: It is recommended that MATH 240 or 232 be taken before or concurrently with MATH 251.",
    pre: ["math152"],
  },
  {
    name: "MSE 212: bracketed 'or' group",
    input: "Prerequisites: MSE 103 and (MSE 110 or MSE 112).",
    pre: ["mse103", "mse110", "mse112"],
    preType: "and",
  },
  {
    name: "MSE 312: Windows line break mid-sentence",
    input:
      "Prerequisites: MSE 110 (or ENSC 182), MSE 320\r\n(or ENSC 382), MSE 381 (or ENSC 383). MSE 381 may be taken concurrently.",
    pre: ["mse110", "mse320"],
    co: ["mse381"],
  },
  {
    name: "'one of' list after another requirement",
    input: "Prerequisites: MSE 103 and one of MATH 150, MATH 151.",
    pre: ["mse103", "math150", "math151"],
    preType: "and",
  },
  {
    name: "Hand-written bullet list with a Corequisites section",
    input: "Prerequisites:\n- PHYS 141\n- MATH 232\nCorequisites:\n- MSE 281",
    pre: ["phys141", "math232"],
    co: ["mse281"],
    preType: "and",
  },
  {
    name: "CHEM 120: an option that names no course (Chemistry 12) means no course is needed",
    input: "Prerequisites: Chemistry 12 with a minimum grade of B, or CHEM 110 or 111 with a minimum grade of C-.",
    known: ["CHEM 110", "CHEM 111"],
    pre: [],
  },
  {
    name: "PHYS 140: 'or equivalent' is not a separate option",
    input: "Prerequisites: PHYS 141 or equivalent. MATH 150 or MATH 151.",
    pre: ["phys141", "math150", "math151"],
    preTree: "and(phys141, or(math150, math151))",
  },
  {
    name: "MSE 411: 'Must not be taken concurrently with' is not a prerequisite",
    input: "Prerequisites: MSE 410. Must not be taken concurrently with MSE 493 or MSE 494.",
    known: ["MSE 410", "MSE 493", "MSE 494"],
    pre: ["mse410"],
  },
  {
    name: "ENSC 405W: 'before enrolling in' and enrolment notes are ignored",
    input:
      "Prerequisites: (ENSC 105W or MSE 101W), ENSC 204, all with a minimum grade of C-. Students are required to complete at least two co-ops before enrolling in ENSC 440 Capstone B.",
    known: ["ENSC 105W", "MSE 101W", "ENSC 440"],
    pre: ["ensc105w", "mse101w"],
  },
  {
    name: "BUS 300: 'Recommendation to take with' is ignored",
    input: "Prerequisites: BUS 217W with a minimum grade of C-; 45 units. Recommendation to take with BUS 360W.",
    known: ["BUS 217W"],
    pre: ["bus217w"],
  },
  {
    name: "BUS 360W: a student route that needs no course means no course is needed",
    input:
      "Prerequisites: BUS 217W and (BUS 201 or BUS 202), both with a minimum grade of C-; and BUS 300, OR to mechatronic systems engineering and business administration double degree students with 45 units.",
    known: ["BUS 217W", "BUS 201", "BUS 202", "BUS 300"],
    pre: [],
  },
  {
    name: "BUS 374: capital 'OR' student routes combine as 'or'",
    input:
      "Prerequisites: 45 units and BUS 272 with a minimum grade of C-; OR business administration minor students admitted Fall 2025 - onwards with BUS 254 and 45 units.",
    known: ["BUS 272", "BUS 254"],
    pre: ["bus272", "bus254"],
    preTree: "or(bus272, bus254)",
  },
  {
    name: "SEE 402: 'units OR units' is not a student route",
    input: "Prerequisites: SEE 110; Minimum of 100 units OR 80 units plus two-term co-op work.",
    known: ["SEE 110"],
    pre: ["see110"],
  },
  {
    name: "MATH 251: 'Also, for students in ...' is another route; 'grade of at least B' is a grade",
    input:
      "Prerequisites: MATH 152 with a minimum grade of C-; or MATH 158 with a grade of at least B. Also, for students in the life sciences, MATH 154 with a minimum grade of C- and MATH 155 with a minimum grade of A-.",
    known: ["MATH 158", "MATH 154", "MATH 155"],
    pre: ["math152", "math158", "math154", "math155"],
    preTree: "or(math152, math158, and(math154, math155))",
  },
  {
    name: "MATH 155: same-department list without the final comma is one 'or'",
    input: "Prerequisites: MATH 150, 151 or 154, with a minimum grade of C-; or MATH 157 with a grade of at least B.",
    known: ["MATH 154", "MATH 157"],
    pre: ["math150", "math151", "math154", "math157"],
    preTree: "or(math150, math151, math154, math157)",
  },
  {
    name: "BUS 207: a list right after an 'or' keeps its commas as 'and'",
    input: "Prerequisites: ECON 103 or ECON 113, ECON 105 or ECON 115, MATH 157, all with a minimum grade of C-; 15 units.",
    known: ["ECON 103", "ECON 113", "ECON 105", "ECON 115", "MATH 157"],
    pre: ["econ103", "econ113", "econ105", "econ115", "math157"],
    preTree: "and(or(econ103, econ113), or(econ105, econ115), math157)",
  },
  {
    name: "MACM 101: 'or any of' after a non-course option",
    input: "Prerequisites: BC Pre-Calculus 12 or BC Calculus 12 (or equivalent), or any of MATH 100, 150, 151, 154, 157.",
    pre: [],
  },
  {
    name: "ECON 233: a whole Oxford list may be taken concurrently",
    input:
      "Prerequisites: MATH 150, MATH 151, MATH 154, or MATH 157, with a minimum grade of C-; 15 units. MATH 150, MATH 151, MATH 154, or MATH 157 may be taken concurrently with ECON 233.",
    known: ["MATH 154", "MATH 157", "ECON 233"],
    pre: [],
    co: ["math150", "math151", "math154", "math157"],
    coTree: "or(math150, math151, math154, math157)",
  },
  {
    name: "PHYS 125: 'Recommended Corequisite' is advice",
    input: "Prerequisites: Permission of the department. Corequisite: MATH 151. Recommended Corequisite: PHYS 132.",
    known: ["PHYS 132"],
    pre: [],
    co: ["math151"],
  },
  {
    name: "BUS 217W: 'corequisite:' mid-sentence stays in its route",
    input:
      "Prerequisites: BUS 201 with a minimum grade of C- and 15 units; OR 45 units and corequisite: BUS 202; OR business administration joint major, joint honours, or double degree students with 45 units.",
    known: ["BUS 201", "BUS 202"],
    pre: [],
    co: [],
  },
];

const courseFromCode = (code: string): Course => ({
  id: code.toLowerCase().replace(/\s+/g, ""),
  code,
  title: code,
  credits: 3,
  description: "",
});
const tree = (node: PrerequisiteExpression | null): string =>
  !node ? "none" : node.type === "course" ? node.courseId : `${node.type}(${node.items.map(tree).join(", ")})`;
const sorted = (ids: Iterable<string>) => [...ids].sort().join(", ");
const failures: string[] = [];

for (const testCase of CASES) {
  const codeToId = buildCourseCodeIndex([...KNOWN_CODES, ...(testCase.known ?? [])].map(courseFromCode));
  const result = normalizeRequirementsFromText(testCase.input, codeToId);
  const problems: string[] = [];

  if (sorted(result.prerequisiteIds) !== sorted(testCase.pre)) {
    problems.push(`prerequisites [${sorted(result.prerequisiteIds)}], expected [${sorted(testCase.pre)}]`);
  }
  if (sorted(result.corequisiteIds) !== sorted(testCase.co ?? [])) {
    problems.push(`corequisites [${sorted(result.corequisiteIds)}], expected [${sorted(testCase.co ?? [])}]`);
  }
  if (testCase.preType && result.prerequisiteExpression?.type !== testCase.preType) {
    problems.push(`expression type "${result.prerequisiteExpression?.type}", expected "${testCase.preType}"`);
  }

  if (testCase.preTree && tree(result.prerequisiteExpression) !== testCase.preTree) {
    problems.push(`prerequisite tree ${tree(result.prerequisiteExpression)}, expected ${testCase.preTree}`);
  }
  if (testCase.coTree && tree(result.corequisiteExpression) !== testCase.coTree) {
    problems.push(`corequisite tree ${tree(result.corequisiteExpression)}, expected ${testCase.coTree}`);
  }

  if (problems.length) failures.push(`✗ ${testCase.name}\n    ${problems.join("\n    ")}`);
  else console.log(`✓ ${testCase.name}`);
}

if (failures.length) {
  console.error(`\n${failures.join("\n")}`);
  throw new Error(`${failures.length}/${CASES.length} requirement parsing tests failed.`);
}

console.log(`\n${CASES.length}/${CASES.length} requirement parsing tests passed.`);
