// Guards the requirement map. Run: npm run test:dependency-graph
//
// 1. Spot checks: a few relationships written out by hand, so intent is readable.
// 2. Snapshot: direct prerequisites/corequisites of every course, compared against
//    dependencyGraph.snapshot.json. If course data changes on purpose (e.g. after
//    syncing from SFU), review the printed diff, then replace the snapshot file with
//    the JSON printed below it.
import { courses } from "../../data";
import { courseDependencyGraph as graph } from "./dependencyGraph";
import snapshot from "./dependencyGraph.snapshot.json";

type Edges = { pre: string[]; co: string[] };

const sorted = (ids: Iterable<string>) => [...ids].sort();
const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

let passed = 0;
const failures: string[] = [];

function check(name: string, actual: Iterable<string>, expected: string[]): void {
  const a = sorted(actual);
  const e = sorted(expected);
  if (same(a, e)) {
    passed += 1;
    console.log(`✓ ${name}`);
  } else {
    failures.push(`✗ ${name}: expected [${e.join(", ")}] but got [${a.join(", ")}]`);
  }
}

// ── Spot checks ──
check("MATH 152 needs MATH 151", graph.getPrerequisites("math152", false), ["math151"]);
check(
  "MSE 210 needs PHYS 141, MATH 150, MATH 151",
  graph.getPrerequisites("mse210", false),
  ["math150", "math151", "phys141"]
);
check("MSE 320 has corequisite MSE 212", graph.getCorequisites("mse320"), ["mse212"]);
check(
  "MATH 151 unlocks MATH 152, MATH 232, MSE 210",
  graph.getDependents("math151", false),
  ["math152", "math232", "mse210"]
);
check(
  "MSE 381 full prerequisite chain",
  graph.getPrerequisites("mse381", true),
  ["math151", "math152", "math232", "math251", "mse103", "mse250", "mse280", "mse281", "phys141"]
);
check(
  "Highlight roles for MSE 251 (direct)",
  [...graph.getHighlights("mse251", false).roles].map(([id, role]) => `${id}:${role}`),
  ["mse251:selected", "mse250:prerequisite", "mse310:dependent", "mse352:dependent", "mse353:dependent"]
);

// ── Snapshot ──
const current: Record<string, Edges> = {};
for (const course of courses) {
  const pre = sorted(graph.getPrerequisites(course.id, false));
  const co = sorted(graph.getCorequisites(course.id));
  if (pre.length || co.length) current[course.id] = { pre, co };
}

const expected = snapshot as Record<string, Edges>;
const snapshotDiffs: string[] = [];
for (const id of sorted(new Set([...Object.keys(expected), ...Object.keys(current)]))) {
  const was = expected[id] ?? { pre: [], co: [] };
  const now = current[id] ?? { pre: [], co: [] };
  if (!same(was.pre, now.pre)) snapshotDiffs.push(`  ${id} prereqs: [${was.pre}] → [${now.pre}]`);
  if (!same(was.co, now.co)) snapshotDiffs.push(`  ${id} coreqs:  [${was.co}] → [${now.co}]`);
}

if (snapshotDiffs.length === 0) {
  passed += 1;
  console.log(`✓ snapshot matches (${Object.keys(current).length} courses with requirements)`);
} else {
  failures.push(`✗ snapshot differs:\n${snapshotDiffs.join("\n")}`);
}

const total = passed + failures.length;
if (failures.length > 0) {
  console.error(`\n${failures.join("\n")}`);
  if (snapshotDiffs.length > 0) {
    const lines = Object.entries(current).map(([id, edges]) => `  ${JSON.stringify(id)}: ${JSON.stringify(edges)}`);
    console.error(`\nNew snapshot (paste into dependencyGraph.snapshot.json if the change is expected):\n{\n${lines.join(",\n")}\n}`);
  }
  throw new Error(`${failures.length}/${total} dependencyGraph tests failed.`);
}

console.log(`\n${passed}/${total} dependencyGraph tests passed.`);
