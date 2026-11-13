// Parsing checks on real SFU requirement wording. Run: npm run test:requirement-parsing
// Only courses in the app's course list are recognised (e.g. PHYS 121 and MATH 154 are not).
import { courses } from "../../data";
import { buildCourseCodeIndex } from "../courseCodes";
import { normalizeRequirementsFromText } from "./requirementNormalizer";

interface Case {
  name: string;
  input: string;
  pre: string[];
  co?: string[];
  /** Expected type of the top-level prerequisite expression, when it matters. */
  preType?: "course" | "and" | "or";
}

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
];

const codeToId = buildCourseCodeIndex(courses);
const sorted = (ids: Iterable<string>) => [...ids].sort().join(", ");
const failures: string[] = [];

for (const testCase of CASES) {
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

  if (problems.length) failures.push(`✗ ${testCase.name}\n    ${problems.join("\n    ")}`);
  else console.log(`✓ ${testCase.name}`);
}

if (failures.length) {
  console.error(`\n${failures.join("\n")}`);
  throw new Error(`${failures.length}/${CASES.length} requirement parsing tests failed.`);
}

console.log(`\n${CASES.length}/${CASES.length} requirement parsing tests passed.`);
