// Checks the structured degree requirements in programs/*.json against the local
// calendar copy (src/data/calendar/), and the recommended templates against those
// requirements. Run: npm run test:requirements
// (Lives in scripts/ because it reads files with node:fs, which the app build has no types for.)
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { calendarSourceById, courseById, courseIdFromCode, programs } from "../../src/data";
import { isPlaceholderCourse } from "../../src/lib/courseCodes";
import { equivalentsById } from "../../src/lib/equivalence";
import { parseProgramText } from "./parseProgramText";

const TEXT_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../src/data/calendar/text");
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

const sameList = (a: string[], b: string[]) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
const describe = (a: string[], b: string[]) =>
  `missing [${b.filter((x) => !a.includes(x)).join(", ")}], extra [${a.filter((x) => !b.includes(x)).join(", ")}]`;

/**
 * Differences between a template and its degree that are known and accepted, by
 * template id. The test fails on any new difference and on listed ones that are gone.
 */
const KNOWN_TEMPLATE_GAPS: Record<string, string[]> = {};

for (const program of programs) {
  for (const curriculum of program.curricula) {
    const where = `${program.id}/${curriculum.id}`;

    // ── Sources ──
    for (const id of [
      ...curriculum.degrees.map((degree) => degree.source),
      ...curriculum.electiveGroups.flatMap((group) => (group.source ? [group.source] : [])),
    ]) {
      const source = calendarSourceById[id];
      check(
        `${where}: source "${id}" has a local copy`,
        Boolean(source?.copiedOn) && existsSync(join(TEXT_DIR, `${id}.txt`)),
        source ? `copiedOn ${source.copiedOn}, text file missing?` : "not in calendar/sources.json"
      );
    }

    // ── Structured requirements match the calendar text ──
    for (const degree of curriculum.degrees) {
      const file = join(TEXT_DIR, `${degree.source}.txt`);
      if (!existsSync(file)) continue;
      const parsed = parseProgramText(readFileSync(file, "utf8"));
      const name = `${where} ${degree.id}`;

      check(
        `${name}: required courses match the calendar`,
        sameList(degree.requiredCourses, parsed.required.map((c) => c.code)),
        describe(degree.requiredCourses, parsed.required.map((c) => c.code))
      );
      check(
        `${name}: "one of" choices match the calendar`,
        sameList(
          degree.chooseOne.map((options) => [...options].sort().join("/")),
          parsed.chooseOne.map((options) => options.map((c) => c.code).sort().join("/"))
        ),
        `${JSON.stringify(degree.chooseOne)} vs ${JSON.stringify(parsed.chooseOne.map((o) => o.map((c) => c.code)))}`
      );
      const technical = degree.electives.find((e) => e.groupId === "technical")?.courses ?? null;
      check(
        `${name}: technical elective count matches the calendar`,
        technical === parsed.technicalElectives,
        `${technical} vs ${parsed.technicalElectives}`
      );

      const listedUnits =
        parsed.required.reduce((sum, c) => sum + c.units, 0) +
        parsed.chooseOne.reduce((sum, options) => sum + Math.min(...options.map((c) => c.units)), 0) +
        degree.electives.reduce((sum, e) => sum + e.courses * 3, 0);
      check(`${name}: minimumUnits is ${listedUnits}`, degree.minimumUnits === listedUnits, `${degree.minimumUnits}`);

      const agritech = curriculum.concentrations.find((c) => c.id === "agritech");
      if (parsed.agritech && agritech) {
        check(
          `${name}: AgriTech courses match the calendar`,
          sameList(agritech.requiredCourses ?? [], parsed.agritech.required.map((c) => c.code)) &&
            sameList(agritech.waivedCourses ?? [], parsed.agritech.waived.map((c) => c.code)) &&
            agritech.technicalElectives === parsed.agritech.technicalElectives,
          JSON.stringify({ agritech, parsed: parsed.agritech })
        );
      }
    }

    // ── Templates cover their degree ──
    for (const template of curriculum.templates) {
      const degree = curriculum.degrees.find((d) => d.id === template.degreeId);
      if (!degree) {
        check(`${template.id}: degree "${template.degreeId}" exists`, false, `no such degree in ${where}`);
        continue;
      }
      const variants = template.termsByVariant ? Object.entries(template.termsByVariant) : [["", template.terms ?? []] as const];
      for (const [variant, terms] of variants) {
        const name = `${template.id}${variant ? ` option ${variant}` : ""}`;
        const slots = (terms ?? []).flatMap((term) => term.courseIds);
        const inTemplate = new Set(slots.flatMap((slot) => (Array.isArray(slot) ? slot : [slot])));
        const gaps: string[] = [];

        // An equivalent course (e.g. BUEC 232 for BUS 232) satisfies a requirement.
        const sameAs = (id: string) => [id, ...(equivalentsById.get(id) ?? [])];
        const covered = (code: string) => sameAs(courseIdFromCode(code)).some((id) => inTemplate.has(id));
        for (const code of degree.requiredCourses) {
          if (!covered(code)) gaps.push(`missing ${code}`);
        }
        for (const options of degree.chooseOne) {
          if (!options.some(covered)) gaps.push(`missing one of ${options.join("/")}`);
        }
        const degreeIds = new Set(
          [...degree.requiredCourses, ...degree.chooseOne.flat()].flatMap((code) => sameAs(courseIdFromCode(code)))
        );
        for (const slot of slots) {
          const options = Array.isArray(slot) ? slot : [slot];
          // A "choose one" slot is fine when any of its options is a degree course.
          if (options.some((id) => degreeIds.has(id))) continue;
          for (const id of options) {
            const course = courseById[id];
            if (course && !isPlaceholderCourse(course)) gaps.push(`extra ${course.code}`);
          }
        }
        const techSlots = slots.filter((slot) => !Array.isArray(slot) && slot.startsWith("techElec")).length;
        const techNeeded = degree.electives.find((e) => e.groupId === "technical")?.courses ?? 0;
        if (techSlots !== techNeeded) gaps.push(`${techSlots} technical elective slots (needs ${techNeeded})`);

        const known = KNOWN_TEMPLATE_GAPS[name] ?? [];
        const unexpected = gaps.filter((gap) => !known.includes(gap));
        const fixed = known.filter((gap) => !gaps.includes(gap));
        check(
          `${name} covers the ${degree.label} requirements${known.length ? ` (${known.length} known gaps)` : ""}`,
          unexpected.length === 0 && fixed.length === 0,
          [...unexpected.map((g) => `new: ${g}`), ...fixed.map((g) => `fixed (remove from known list): ${g}`)].join("\n    ")
        );
      }
    }
  }
}

if (failures.length) {
  console.error(`\n${failures.join("\n")}`);
  throw new Error(`${failures.length}/${failures.length + passed} requirements tests failed.`);
}
console.log(`\n${passed}/${passed} requirements tests passed.`);
