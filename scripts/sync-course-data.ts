/**
 * Refreshes src/data/generated/ from the SFU Course Outlines API.
 * Run once a term:  npm run sync-data   then review `git diff` and run the tests.
 *
 * Courses synced: every real course in programs/*.json (templates, elective groups, degree
 * requirements and concentrations from the local calendar copy) + the current
 * generated/courses.json (so nothing is dropped). Placeholders (COMP ELEC 1, CO-OP, ...)
 * live in placeholderCourses.json and are never touched.
 *
 * Writes:
 *   generated/courses.json             id, code, title, credits
 *   generated/courseRequirements.json  raw SFU prerequisite/corequisite text per course
 *   generated/equivalencies.json       "may not take for further credit" pairs from outline notes,
 *                                      limited to courses in the course list, type "full".
 *   generated/courseRequirementsByOutlineTerm.json
 *                                      older prerequisite text for curricula with an `outlineTerm`
 *                                      (e.g. pre-Fall 2024 = "2024/spring"): the program's own
 *                                      courses (MSE) only, from that term or the latest offering
 *                                      in the terms before it. Other departments keep current rules.
 *
 * If SFU has no outline for a course (not offered in the last 6 terms, or a request
 * failed), its previous generated data is kept and the course is listed as a warning.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchSectionsForTerm, fetchSharedOutline, resolveOfferedSections } from "../src/api/sfuOutlines";
import { normalizeCourseCode, parseCourseCode } from "../src/lib/courseCodes";
import { parseEquivalents } from "../src/lib/parseEquivalents";
import type { Course, CourseEquivalency, Program, SharedOutlineFields, TermName } from "../src/types";

const DATA = join(dirname(fileURLToPath(import.meta.url)), "../src/data");
const GENERATED = join(DATA, "generated");
const CONCURRENCY = 4;
/** How many terms before an `outlineTerm` to search when the course wasn't offered in it. */
const OUTLINE_LOOKBACK = 5;

type CourseRow = Pick<Course, "id" | "code" | "title" | "credits">;

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T;
const idFromCode = (code: string) => normalizeCourseCode(code).toLowerCase().replace(/\s+/g, "");
const isRealCourse = (code: string) => /^[A-Z]{3,4} \d{3}[A-Z]?$/.test(normalizeCourseCode(code));

// ── Inputs ──
const PROGRAMS = join(DATA, "programs");
const programs = readdirSync(PROGRAMS)
  .filter((file) => file.endsWith(".json"))
  .map((file) => readJson<Program>(join(PROGRAMS, file)));
const placeholders = readJson<CourseRow[]>(join(DATA, "placeholderCourses.json"));
const previousCourses = readJson<CourseRow[]>(join(GENERATED, "courses.json"));
const previousRequirements = readJson<Record<string, string>>(join(GENERATED, "courseRequirements.json"));
const previousEquivalencies = readJson<CourseEquivalency[]>(join(GENERATED, "equivalencies.json"));
const previousByOutlineTerm = readJson<Record<string, Record<string, string>>>(
  join(GENERATED, "courseRequirementsByOutlineTerm.json")
);

const placeholderIds = new Set(placeholders.map((c) => c.id));
const previousById = new Map(previousCourses.map((c) => [c.id, c]));

/** id → code for every course to sync, in a stable order (previous file first). */
const toSync = new Map<string, string>();
for (const c of previousCourses) toSync.set(c.id, c.code);

for (const program of programs) {
  for (const curriculum of program.curricula) {
    const where = `${program.id}/${curriculum.id}`;
    const addCodes = (codes: string[] | undefined, label: string) => {
      for (const code of codes ?? []) {
        if (!isRealCourse(code)) {
          console.warn(`! ${where} ${label}: "${code}" is not a course code, skipped`);
          continue;
        }
        const id = idFromCode(code);
        if (!toSync.has(id)) toSync.set(id, normalizeCourseCode(code));
      }
    };
    for (const group of curriculum.electiveGroups) addCodes(group.courseCodes, `elective group "${group.id}"`);
    for (const degree of curriculum.degrees ?? []) {
      addCodes(degree.requiredCourses, `degree "${degree.id}"`);
      for (const options of degree.chooseOne) addCodes(options, `degree "${degree.id}"`);
    }
    for (const concentration of curriculum.concentrations) {
      addCodes(concentration.requiredCourses, `concentration "${concentration.id}"`);
    }
    for (const template of curriculum.templates) {
      const termLists = template.terms ? [template.terms] : Object.values(template.termsByVariant ?? {});
      for (const terms of termLists) {
        for (const term of terms) {
          for (const slot of term.courseIds) {
            for (const id of Array.isArray(slot) ? slot : [slot]) {
              if (placeholderIds.has(id) || toSync.has(id)) continue;
              console.warn(
                `! ${id} is in ${where} template "${template.id}" but has no course data; add it to an elective group or placeholderCourses.json`
              );
            }
          }
        }
      }
    }
  }
}

/** outlineTerm → departments whose courses use that term's rules (each program's own courses). */
const outlineTermDepts = new Map<string, Set<string>>();
for (const program of programs) {
  for (const curriculum of program.curricula) {
    if (!curriculum.outlineTerm) continue;
    if (!/^\d{4}\/(spring|summer|fall)$/.test(curriculum.outlineTerm)) {
      console.warn(`! ${program.id}/${curriculum.id} outlineTerm "${curriculum.outlineTerm}" should look like "2024/spring", skipped`);
      continue;
    }
    const depts = outlineTermDepts.get(curriculum.outlineTerm) ?? new Set<string>();
    depts.add(program.shortName.toUpperCase());
    outlineTermDepts.set(curriculum.outlineTerm, depts);
  }
}

// ── Fetch ──
async function mapLimited<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await fn(items[index]);
      }
    })
  );
  return results;
}

const entries = [...toSync.entries()];
let done = 0;
console.log(`Fetching ${entries.length} course outlines from SFU...`);

const outlines = await mapLimited(entries, CONCURRENCY, async ([id, code]) => {
  const parsed = parseCourseCode(code);
  let outline: SharedOutlineFields | null = null;
  if (parsed) {
    try {
      outline = await fetchSharedOutline(parsed.dept.toLowerCase(), parsed.number.toLowerCase());
    } catch {
      outline = null;
    }
  }
  done += 1;
  if (done % 10 === 0 || done === entries.length) console.log(`  ${done}/${entries.length}`);
  return { id, code, outline };
});

/** "2024/spring" plus the `count` terms before it, newest first. */
function termsFrom(outlineTerm: string, count: number): string[] {
  const order: TermName[] = ["spring", "summer", "fall"];
  const [yearText, termText] = outlineTerm.split("/");
  let year = Number(yearText);
  let index = order.indexOf(termText as TermName);
  const terms = [outlineTerm];
  for (let i = 0; i < count; i++) {
    index -= 1;
    if (index < 0) {
      index = order.length - 1;
      year -= 1;
    }
    terms.push(`${year}/${order[index]}`);
  }
  return terms;
}

/** The outline from `outlineTerm`, or the latest offering in the terms before it. */
async function fetchOutlineAsOf(code: string, outlineTerm: string): Promise<SharedOutlineFields | null> {
  const parsed = parseCourseCode(code);
  if (!parsed) return null;
  const dept = parsed.dept.toLowerCase();
  const number = parsed.number.toLowerCase();
  for (const term of termsFrom(outlineTerm, OUTLINE_LOOKBACK)) {
    try {
      const sections = await fetchSectionsForTerm(term, dept, number);
      if (!sections) continue;
      const resolved = await resolveOfferedSections(dept, number, [sections]);
      if (resolved) return resolved.sharedOutline;
    } catch {
      // Try the next older term.
    }
  }
  return null;
}

const olderEntries = [...outlineTermDepts].flatMap(([outlineTerm, depts]) =>
  entries
    .filter(([, code]) => depts.has(parseCourseCode(code)?.dept.toUpperCase() ?? ""))
    .map(([id, code]) => ({ outlineTerm, id, code }))
);
if (olderEntries.length) {
  console.log(`Fetching ${olderEntries.length} older outlines (${[...outlineTermDepts.keys()].join(", ")})...`);
}
done = 0;
const olderOutlines = await mapLimited(olderEntries, CONCURRENCY, async (entry) => {
  const outline = await fetchOutlineAsOf(entry.code, entry.outlineTerm);
  done += 1;
  if (done % 10 === 0 || done === olderEntries.length) console.log(`  ${done}/${olderEntries.length}`);
  return { ...entry, outline };
});

// ── Build outputs ──
/** "Prerequisites: ...\nCorequisites: ..." from an outline, or "" when it lists neither. */
function requirementTextFrom(outline: SharedOutlineFields): string {
  // Collapse SFU's stray line breaks ("MSE 320\r\n(or ENSC 382)") so they don't read as list breaks.
  const prereq = outline.prerequisites?.replace(/\s+/g, " ").trim();
  const coreq = outline.corequisites?.replace(/\s+/g, " ").trim();
  return [prereq && `Prerequisites: ${prereq}`, coreq && `Corequisites: ${coreq}`].filter(Boolean).join("\n");
}

const missing: string[] = [];
const courses: CourseRow[] = [];
const requirements: Record<string, string> = {};

for (const { id, code, outline } of outlines) {
  const previous = previousById.get(id);
  if (!outline) {
    missing.push(code);
    if (previous) courses.push(previous);
    if (previousRequirements[id]) requirements[id] = previousRequirements[id];
    continue;
  }

  courses.push({
    id,
    code,
    title: outline.title?.trim() || previous?.title || code,
    credits: outline.units ?? previous?.credits ?? 0,
  });

  const text = requirementTextFrom(outline);
  if (text) requirements[id] = text;
}

/** Older rules. A course with no older outline found keeps its previous entry, or uses current rules. */
const byOutlineTerm: Record<string, Record<string, string>> = {};
const olderMissing: string[] = [];
for (const { outlineTerm, id, code, outline } of olderOutlines) {
  const termEntries = (byOutlineTerm[outlineTerm] ??= {});
  const text = outline ? requirementTextFrom(outline) : previousByOutlineTerm[outlineTerm]?.[id];
  if (!outline) olderMissing.push(`${code} (${outlineTerm})`);
  if (text) termEntries[id] = text;
}

const knownIds = new Set(courses.map((c) => c.id));
const equivalencies: CourseEquivalency[] = [];
const seenPairs = new Set<string>();
for (const { id, code, outline } of outlines) {
  if (!outline) {
    for (const eq of previousEquivalencies) if (eq.sourceCourseId === id) equivalencies.push(eq);
    continue;
  }
  if (!outline.notes) continue;
  for (const item of parseEquivalents(outline.notes, code)) {
    const equivalentId = idFromCode(item.code);
    const pair = `${id}>${equivalentId}`;
    if (equivalentId === id || !knownIds.has(equivalentId) || seenPairs.has(pair)) continue;
    seenPairs.add(pair);
    equivalencies.push({ sourceCourseId: id, equivalentCourseId: equivalentId, equivalencyType: "full" });
  }
}

// ── Write (one entry per line, so git diffs stay readable) ──
const objectLine = (value: object) =>
  JSON.stringify(value).replace(/^\{/, "{ ").replace(/\}$/, " }").replace(/":/g, '": ').replace(/,"/g, ', "');
const arrayFile = (rows: object[]) => (rows.length ? `[\n${rows.map((r) => `  ${objectLine(r)}`).join(",\n")}\n]\n` : "[]\n");

writeFileSync(join(GENERATED, "courses.json"), arrayFile(courses));
writeFileSync(join(GENERATED, "courseRequirements.json"), `${JSON.stringify(requirements, null, 2)}\n`);
writeFileSync(join(GENERATED, "equivalencies.json"), arrayFile(equivalencies));
writeFileSync(join(GENERATED, "courseRequirementsByOutlineTerm.json"), `${JSON.stringify(byOutlineTerm, null, 2)}\n`);

// ── Summary ──
const changed = (a: unknown, b: unknown) => JSON.stringify(a) !== JSON.stringify(b);
const added = courses.filter((c) => !previousById.has(c.id)).map((c) => c.code);
const updated = courses.filter((c) => previousById.has(c.id) && changed(previousById.get(c.id), c)).map((c) => c.code);
const reqChanged = [...new Set([...Object.keys(previousRequirements), ...Object.keys(requirements)])].filter((id) =>
  changed(previousRequirements[id], requirements[id])
);

console.log(`\nWrote ${courses.length} courses, ${Object.keys(requirements).length} requirement entries, ${equivalencies.length} equivalencies.`);
if (added.length) console.log(`Added courses: ${added.join(", ")}`);
if (updated.length) console.log(`Title/credits changed: ${updated.join(", ")}`);
if (reqChanged.length) console.log(`Requirement text changed: ${reqChanged.join(", ")}`);
if (missing.length) console.log(`No SFU outline found (kept previous data): ${missing.join(", ")}`);
for (const [outlineTerm, termEntries] of Object.entries(byOutlineTerm)) {
  const differs = Object.keys(termEntries).filter((id) => termEntries[id] !== requirements[id]);
  console.log(`${outlineTerm} rules: ${Object.keys(termEntries).length} courses, ${differs.length} differ from current outlines.`);
}
if (olderMissing.length) console.log(`No older outline found (current rules used): ${olderMissing.join(", ")}`);
console.log("\nNext: review `git diff src/data/generated`, then run `npm run test:dependency-graph`.");
