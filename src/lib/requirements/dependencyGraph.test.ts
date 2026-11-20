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
// Prerequisites include every "or" option and every equivalent of a listed course
// (e.g. PHYS 141 ↔ PHYS 102/121/126, MSE 250 ↔ SEE 230/ENSC 220).
check(
  "MATH 152 needs MATH 150, 151, 154 or 157",
  graph.getPrerequisites("math152", false),
  ["math150", "math151", "math154", "math157"]
);
check(
  "MSE 210 needs PHYS 141 (or an equivalent) and MATH 150 or 151 (or an equivalent)",
  graph.getPrerequisites("mse210", false),
  ["math150", "math151", "math154", "math157", "phys102", "phys121", "phys126", "phys141"]
);
check("MSE 320 has corequisite MSE 212", graph.getCorequisites("mse320"), ["mse212"]);
check(
  "MATH 151 unlocks MATH 152, MATH 232, MSE 210, BUS 207, BUS 336, ECON 201 and the other calculus routes",
  graph.getDependents("math151", false),
  ["bus207", "bus336", "econ201", "math152", "math155", "math158", "math232", "math240", "math251", "mse210", "phys102"]
);
check(
  "MSE 381 full prerequisite chain",
  graph.getPrerequisites("mse381", true),
  // MSE 282 replaced MSE 280 ("may not take for further credit"), so either counts; ENSC/SEE equivalents too.
  [
    "ensc220", "ensc380", "macm101", "math150", "math151", "math152", "math154", "math155", "math157", "math158",
    "math232", "math240", "math251", "math260", "mse103", "mse211", "mse250", "mse280", "mse281", "mse282",
    "phys101", "phys102", "phys120", "phys121", "phys125", "phys126", "phys140", "phys141", "see230", "see242", "see341",
  ]
);
check(
  "MSE 281 takes MSE 250 (or an equivalent) as a corequisite, not a prerequisite",
  graph.getCorequisites("mse281"),
  ["ensc220", "mse250", "see230"]
);
check(
  "Highlight roles for MSE 251 (direct)",
  [...graph.getHighlights("mse251", false).roles].map(([id, role]) => `${id}:${role}`),
  [
    "mse251:selected",
    "mse250:prerequisite",
    "ensc220:prerequisite",
    "see230:prerequisite",
    "ensc325:dependent",
    "see331:dependent",
    "mse310:dependent",
    "mse311:dependent",
    "mse352:dependent",
    "mse353:dependent",
    "mse451:dependent",
  ]
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
