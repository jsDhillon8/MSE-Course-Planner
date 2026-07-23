import courses from "./data/courses.json";
import { buildCourseDependencyGraph } from "./utils/dependencyGraph";
import { extractRequirementSection } from "./utils/prerequisiteParser";

const ids = [
  "math151",
  "math152",
  "mse101w",
  "mse112",
  "mse210",
  "mse220",
  "mse251",
  "mse381",
  "mse103",
  "mse102",
];

for (const id of ids) {
  const course = courses.find((x) => x.id === id)!;
  const prereqText = extractRequirementSection(course.description, "prerequisite");
  const coreqText = extractRequirementSection(course.description, "corequisite");
  console.log(
    `${course.code}: prereq=${prereqText ?? "NONE"} | coreq=${coreqText ?? "NONE"}`
  );
}

const graph = buildCourseDependencyGraph(courses);
console.log("\n--- graph ---");
for (const id of ids) {
  const course = courses.find((x) => x.id === id)!;
  console.log(
    `${course.code} pre=[${[...graph.getPrerequisites(id, true)].join(", ")}] dep=[${[...graph.getDependents(id, true)].join(", ")}]`
  );
}
