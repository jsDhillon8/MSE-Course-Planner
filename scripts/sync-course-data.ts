/**
 * Refreshes src/data/generated/ from the SFU Course Outlines API.
 * Run once a term:  npm run sync-data   then review `git diff` and run the tests.
 *
 * Courses synced: every real course in templates.json + electives.json + the current
 * generated/courses.json (so nothing is dropped). Placeholders (COMP ELEC 1, CO-OP, ...)
 * live in placeholderCourses.json and are never touched.
 *
 * Writes:
 *   generated/courses.json             id, code, title, credits
 *   generated/courseRequirements.json  raw SFU prerequisite/corequisite text per course
 *   generated/equivalencies.json       "may not take for further credit" pairs from outline notes,
 *                                      limited to courses in the course list, type "full".
 *                                      Use equivalencyOverrides.json to change a type or add pairs.
 *
 * If SFU has no outline for a course (not offered in the last 6 terms, or a request
 * failed), its previous generated data is kept and the course is listed as a warning.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchSharedOutline } from "../src/api/sfuOutlines";
import { normalizeCourseCode, parseCourseCode } from "../src/lib/courseCodes";
import { parseEquivalents } from "../src/lib/parseEquivalents";
import type { Course, CourseEquivalency, PageTemplate, SharedOutlineFields } from "../src/types";

const DATA = join(dirname(fileURLToPath(import.meta.url)), "../src/data");
const GENERATED = join(DATA, "generated");
const CONCURRENCY = 4;

type CourseRow = Pick<Course, "id" | "code" | "title" | "credits">;

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T;
const idFromCode = (code: string) => normalizeCourseCode(code).toLowerCase().replace(/\s+/g, "");
const isRealCourse = (code: string) => /^[A-Z]{3,4} \d{3}[A-Z]?$/.test(normalizeCourseCode(code));

// ── Inputs ──
const templates = readJson<PageTemplate[]>(join(DATA, "templates.json"));
const placeholders = readJson<CourseRow[]>(join(DATA, "placeholderCourses.json"));
const electives = readJson<Record<string, string[]>>(join(DATA, "electives.json"));
const previousCourses = readJson<CourseRow[]>(join(GENERATED, "courses.json"));
const previousRequirements = readJson<Record<string, string>>(join(GENERATED, "courseRequirements.json"));
const previousEquivalencies = readJson<CourseEquivalency[]>(join(GENERATED, "equivalencies.json"));

const placeholderIds = new Set(placeholders.map((c) => c.id));
const previousById = new Map(previousCourses.map((c) => [c.id, c]));

/** id → code for every course to sync, in a stable order (previous file first). */
const toSync = new Map<string, string>();
for (const c of previousCourses) toSync.set(c.id, c.code);

for (const template of templates) {
  const termLists = template.terms ? [template.terms] : Object.values(template.termsByVariant ?? {});
  for (const terms of termLists) {
    for (const term of terms) {
      for (const slot of term.courseIds) {
        for (const id of Array.isArray(slot) ? slot : [slot]) {
          if (placeholderIds.has(id) || toSync.has(id)) continue;
          console.warn(`! ${id} is in templates.json but has no course data; add it to electives.json or placeholderCourses.json`);
        }
      }
    }
  }
}

for (const [category, codes] of Object.entries(electives)) {
  for (const code of codes) {
    if (!isRealCourse(code)) {
      console.warn(`! electives.json (${category}): "${code}" is not a course code, skipped`);
      continue;
    }
    const id = idFromCode(code);
    if (!toSync.has(id)) toSync.set(id, normalizeCourseCode(code));
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

// ── Build outputs ──
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

  // Collapse SFU's stray line breaks ("MSE 320\r\n(or ENSC 382)") so they don't read as list breaks.
  const prereq = outline.prerequisites?.replace(/\s+/g, " ").trim();
  const coreq = outline.corequisites?.replace(/\s+/g, " ").trim();
  const text = [prereq && `Prerequisites: ${prereq}`, coreq && `Corequisites: ${coreq}`].filter(Boolean).join("\n");
  if (text) requirements[id] = text;
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
console.log("\nNext: review `git diff src/data/generated`, then run `npm run test:dependency-graph`.");
