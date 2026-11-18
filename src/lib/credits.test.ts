// Graduation credit rules for custom plans. Run: npm run test:credits
import { courseById, getCurriculumCourseIds, pageTemplates } from "../data";
import { computeTotalCurriculumCredits, summarizePlanCredits } from "./credits";
import { customPlanFromTemplate } from "./customPlan";
import { equivalentsById } from "./equivalence";

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

const summarize = (
  terms: { courseIds: string[] }[],
  options: { swaps?: { replacementId: string; originalCourseId: string }[]; completed?: string[] } = {}
) =>
  summarizePlanCredits(
    terms,
    options.swaps ?? [],
    new Set(options.completed ?? []),
    courseById,
    getCurriculumCourseIds("mse", "post-2024"),
    equivalentsById
  );

// Every course in a recommended plan counts. (pre-2024-4-year is skipped: its
// template lists MSE 110 in three terms, and copying it keeps only one.)
for (const template of pageTemplates) {
  if (template.id === "pre-2024-4-year") continue;
  for (const variant of template.supportsVariants ? template.availableVariants : (["A"] as const)) {
    const plan = customPlanFromTemplate(template, variant);
    const terms = template.supportsVariants ? template.termsByVariant![variant]! : template.terms!;
    const summary = summarizePlanCredits(
      plan.terms,
      plan.swaps,
      new Set(),
      courseById,
      getCurriculumCourseIds(plan.programId, plan.curriculumId),
      equivalentsById
    );
    const expected = computeTotalCurriculumCredits(terms, courseById);
    check(
      `${template.id}${template.supportsVariants ? ` option ${variant}` : ""}: all ${expected} credits count`,
      summary.graduationCredits === expected && summary.extraCredits === 0,
      `graduation ${summary.graduationCredits}, extra ${summary.extraCredits}: ${[...summary.notCountingReasons.keys()].join(", ")}`
    );
  }
}

{
  const summary = summarize([{ courseIds: ["math151"] }, { courseIds: ["math150"] }]);
  check(
    "Equivalent courses count once (the earlier one)",
    summary.graduationCredits === courseById.math151.credits &&
      summary.extraCredits === courseById.math150.credits &&
      summary.notCountingReasons.has("math150"),
    JSON.stringify({ ...summary, notCountingReasons: [...summary.notCountingReasons] })
  );
}
{
  const summary = summarize([{ courseIds: ["mse211"] }]); // pre-2024 only
  check(
    "A course outside the curriculum doesn't count",
    summary.graduationCredits === 0 && summary.extraCredits === courseById.mse211.credits,
    JSON.stringify({ ...summary, notCountingReasons: [...summary.notCountingReasons] })
  );
}
{
  const summary = summarize([{ courseIds: ["chem121"] }]);
  check(
    "An equivalent of a curriculum course counts in its place",
    summary.graduationCredits === courseById.chem121.credits && summary.extraCredits === 0,
    JSON.stringify({ ...summary, notCountingReasons: [...summary.notCountingReasons] })
  );
}
{
  const swapped = { id: "custom:see222", code: "SEE 222", title: "Swapped", credits: 4, description: "" };
  const summary = summarizePlanCredits(
    [{ courseIds: [swapped.id] }],
    [{ replacementId: swapped.id, originalCourseId: "mse220" }],
    new Set([swapped.id]),
    { ...courseById, [swapped.id]: swapped },
    getCurriculumCourseIds("mse", "post-2024"),
    equivalentsById
  );
  check(
    "A swapped-in equivalent counts in place of the original, and its completion counts",
    summary.graduationCredits === 4 && summary.completedGraduationCredits === 4,
    JSON.stringify({ ...summary, notCountingReasons: [...summary.notCountingReasons] })
  );
}
{
  const summary = summarize([{ courseIds: ["math151", "math152"] }], { completed: ["math151"] });
  check(
    "Only completed counting courses add to completed credits",
    summary.completedGraduationCredits === courseById.math151.credits,
    JSON.stringify({ ...summary, notCountingReasons: [...summary.notCountingReasons] })
  );
}

if (failures.length) {
  console.error(`\n${failures.join("\n")}`);
  throw new Error(`${failures.length}/${failures.length + passed} credit tests failed.`);
}
console.log(`\n${passed}/${passed} credit tests passed.`);
