// Every recommended plan should pass prerequisite validation, and a few hand-built
// plans check the rules. Run: npm run test:plan-validation
import { courseById, pageTemplates } from "../../data";
import { customPlanFromTemplate } from "../customPlan";
import { PlanTermInput, validatePlanRequirements } from "./planValidation";

const failures: string[] = [];
let passed = 0;

function check(name: string, ok: boolean, detail: string): void {
  if (ok) {
    passed += 1;
    console.log(`✓ ${name}`);
  } else {
    failures.push(`✗ ${name}\n    ${detail}`);
  }
}

// ── Recommended plans ──
// Warnings the recommended plans currently produce, pending a check against the SFU
// calendar. Remove an entry once its template (or equivalency data) is fixed; the
// test fails on any warning that isn't listed here, and on listed ones that are gone.
const PRE_2024_OUTLINE_CHANGES = [
  // Current SFU outlines list post-2024 prerequisites that old-curriculum plans don't take.
  "MSE 222 needs MSE 103 in an earlier term.",
  "MSE 320 needs MSE 212 in the same or an earlier term.",
  "MSE 352 needs MSE 252 in an earlier term.",
];
const KNOWN_TEMPLATE_WARNINGS: Record<string, string[]> = {
  "pre-2024-4-year": PRE_2024_OUTLINE_CHANGES,
  "pre-2024-5-year option A": PRE_2024_OUTLINE_CHANGES,
  "pre-2024-5-year option B": PRE_2024_OUTLINE_CHANGES,
  "pre-2024-5-year option C": PRE_2024_OUTLINE_CHANGES,
  "double-degree-pre-2024": PRE_2024_OUTLINE_CHANGES,
};

for (const template of pageTemplates) {
  const variants = template.supportsVariants ? template.availableVariants : (["A"] as const);
  for (const variant of variants) {
    const name = `${template.id}${template.supportsVariants ? ` option ${variant}` : ""}`;
    const plan = customPlanFromTemplate(template, variant);
    const warnings = [...validatePlanRequirements(plan.terms, plan.swaps, courseById).values()].flat();
    const actual = new Set(warnings.map((w) => w.message));
    const known = new Set(KNOWN_TEMPLATE_WARNINGS[name] ?? []);
    const unexpected = warnings.filter((w) => !known.has(w.message)).map((w) => `new: ${w.message} ${w.fix}`);
    const gone = [...known].filter((message) => !actual.has(message)).map((message) => `no longer warns: ${message}`);
    check(
      `${name} has only its known prerequisite warnings (${known.size})`,
      unexpected.length === 0 && gone.length === 0,
      [...unexpected, ...gone].join("\n    ")
    );
  }
}

// ── Rules ──
const term = (n: number, ...courseIds: string[]): PlanTermInput => ({ id: `t${n}`, label: `Term ${n}`, courseIds });
const messagesFor = (terms: PlanTermInput[], courseId: string, swaps = [] as { replacementId: string; originalCourseId: string }[]) =>
  (validatePlanRequirements(terms, swaps, courseById).get(courseId) ?? []).map((w) => w.message);

{
  const messages = messagesFor([term(1, "math251"), term(2, "math152")], "math251");
  check(
    "Prerequisite in a later term is flagged",
    messages.join() === "MATH 251 needs MATH 152 in an earlier term.",
    messages.join(" | ")
  );
}
{
  const messages = messagesFor([term(1, "math152", "math251")], "math251");
  check("Prerequisite in the same term is flagged", messages.length === 1, messages.join(" | ") || "no warning");
}
{
  const messages = messagesFor([term(1, "math150"), term(2, "math152")], "math152");
  check("Either option of an 'or' prerequisite is enough", messages.length === 0, messages.join(" | "));
}
{
  const messages = messagesFor([term(1, "math151"), term(2, "math152")], "math152");
  check("Missing 'or' prerequisite lists every option", messages.length === 0, messages.join(" | "));
  const missing = messagesFor([term(1, "math152")], "math152");
  check(
    "Unmet 'or' names all options",
    missing.join() === "MATH 152 needs MATH 150 or MATH 151 in an earlier term.",
    missing.join(" | ")
  );
}
{
  // MSE 281: MSE 250 "may be taken concurrently".
  const same = messagesFor([term(1, "math251", "mse103"), term(2, "mse250", "mse281")], "mse281");
  check("Concurrent prerequisite may share the term", same.length === 0, same.join(" | "));
  const later = messagesFor([term(1, "math251", "mse103"), term(2, "mse281"), term(3, "mse250")], "mse281");
  check(
    "Concurrent prerequisite in a later term says 'same or earlier'",
    later.join() === "MSE 281 needs MSE 250 in the same or an earlier term.",
    later.join(" | ")
  );
}
{
  // PHYS 141 has corequisite MATH 152.
  const missing = messagesFor([term(1, "mse103"), term(2, "phys141"), term(3, "math152")], "phys141");
  check(
    "Corequisite in a later term is flagged",
    missing.join() === "PHYS 141 needs MATH 152 in the same or an earlier term.",
    missing.join(" | ")
  );
}
{
  // MSE 310 needs MSE 224; MSE 221 is listed as its equivalent.
  const messages = messagesFor([term(1, "mse221", "mse251", "mse280"), term(2, "mse310")], "mse310");
  check("An equivalent course satisfies the prerequisite", messages.length === 0, messages.join(" | "));
}
{
  // A swapped-in replacement counts as the course it replaced.
  const messages = messagesFor([term(1, "custom:see222", "mse212", "mse224"), term(2, "mse320")], "mse320", [
    { replacementId: "custom:see222", originalCourseId: "mse220" },
  ]);
  check("A swapped-in equivalent satisfies the original's dependents", messages.length === 0, messages.join(" | "));
}

if (failures.length) {
  console.error(`\n${failures.join("\n")}`);
  throw new Error(`${failures.length}/${failures.length + passed} plan validation tests failed.`);
}
console.log(`\n${passed}/${passed} plan validation tests passed.`);
