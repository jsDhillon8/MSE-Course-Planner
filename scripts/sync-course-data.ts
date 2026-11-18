/**
 * Refreshes src/data/generated/ from the SFU Course Outlines API.
 * Run once a term:  npm run sync-data   then review `git diff` and run the tests.
 *
 * Courses synced, each tagged with `listedAs`:
 *   required     every real course in programs/*.json (templates, elective groups, degree
 *                requirements and concentrations from the local calendar copy)
 *   equivalent   every course named in a required course's "may not take for further credit" notes
 *   alt-prereq   every course named in an "or" option of a required course's prerequisite or
 *                corequisite text (MATH 154 in MATH 152's "MATH 150 or 151; or MATH 154 or 157")
 * Only one level: the added courses' own notes and "or" options don't add more courses.
 * The current generated/courses.json is synced too, so nothing is dropped; a course no
 * longer named anywhere keeps its previous tag and is listed in the summary to review.
 * Placeholders (COMP ELEC 1, CO-OP, ...) live in placeholderCourses.json and are never touched.
 *
 * Writes:
 *   generated/courses.json             id, code, title, credits, listedAs, lastOffered (newest term
 *                                      with sections: next term, current term, then up to 6 back;
 *                                      null if none, so the planner can mark "Not offered recently")
 *   generated/courseRequirements.json  raw SFU prerequisite/corequisite text per course
 *   generated/equivalencies.json       "may not take for further credit" pairs from outline notes,
 *                                      limited to courses in the course list. A pair that is also a
 *                                      calendar "one of" choice (MATH 150/151) is a `variant`
 *                                      (same lecture, with or without a lab or tutorial); any other
 *                                      pair is `full`. Each "or" option that isn't required is also
 *                                      an `alt-prereq` of the required courses in the same "or".
 *   generated/skippedCourses.json      equivalents and "or" options left out because SFU has no outline
 *                                      for them in the last 6 terms (CMPT 128 under CMPT 130), so the
 *                                      planner can still mark them "Not offered recently"
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
import {
  fetchSectionsForTerm,
  fetchSharedOutline,
  getCurrentAcademicTerm,
  resolveOfferedSections,
} from "../src/api/sfuOutlines";
import { expandDepartmentShorthand, normalizeCourseCode, parseCourseCode } from "../src/lib/courseCodes";
import { parseEquivalents } from "../src/lib/parseEquivalents";
import { parsePrerequisiteExpression } from "../src/lib/requirements/requirementExpression";
import { normalizeRequirementSection, resolveRequirementTexts } from "../src/lib/requirements/requirementText";
import type {
  Course,
  CourseEquivalency,
  CourseListedAs,
  EquivalencyType,
  PrerequisiteExpression,
  Program,
  SharedOutlineFields,
  TermName,
} from "../src/types";

const DATA = join(dirname(fileURLToPath(import.meta.url)), "../src/data");
const GENERATED = join(DATA, "generated");
const CONCURRENCY = 4;
/** How many terms before an `outlineTerm` to search when the course wasn't offered in it. */
const OUTLINE_LOOKBACK = 5;

type CourseRow = Pick<Course, "id" | "code" | "title" | "credits" | "listedAs" | "lastOffered">;

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
/** Courses a program names: the `required` tag, and the courses scanned for equivalents and "or" options. */
const requiredIds = new Set<string>();

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
        requiredIds.add(id);
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
              if (placeholderIds.has(id)) continue;
              requiredIds.add(id);
              if (toSync.has(id)) continue;
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

/**
 * Pairs that share a calendar "one of" group (local degree-requirements copy), as "a>b" both ways.
 * One of these that is also a "may not take for further credit" pair is a `variant`;
 * without the note it's just a choice slot (BUS 374 / BUS 381) and gets no equivalency.
 */
const chooseOnePairs = new Set<string>();
for (const program of programs) {
  for (const curriculum of program.curricula) {
    for (const degree of curriculum.degrees ?? []) {
      for (const options of degree.chooseOne) {
        const ids = options.filter(isRealCourse).map(idFromCode);
        for (const a of ids) for (const b of ids) if (a !== b) chooseOnePairs.add(`${a}>${b}`);
      }
    }
  }
}
const noteType = (a: string, b: string): EquivalencyType => (chooseOnePairs.has(`${a}>${b}`) ? "variant" : "full");

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

let done = 0;
async function fetchOutlines(list: [string, string][]) {
  done = 0;
  return mapLimited(list, CONCURRENCY, async ([id, code]) => {
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
    if (done % 10 === 0 || done === list.length) console.log(`  ${done}/${list.length}`);
    return { id, code, outline };
  });
}

const firstEntries = [...toSync.entries()];
console.log(`Fetching ${firstEntries.length} course outlines from SFU...`);
const firstOutlines = await fetchOutlines(firstEntries);

// ── Discover equivalents and "or" options of required courses ──
const CODE_IN_TEXT = /\b[A-Z]{2,5} \d{3}[A-Z]?\b/g;
const TAG_RANK: Record<CourseListedAs, number> = { required: 3, equivalent: 2, "alt-prereq": 1 };
const listedAsById = new Map<string, CourseListedAs>([...requiredIds].map((id) => [id, "required"]));
const discoveredCodes = new Map<string, string>();
/** [required course, alternative] pairs from the same "or" option. */
const altPrereqPairs: [string, string][] = [];

function tagCourse(id: string, code: string, listedAs: CourseListedAs) {
  if (placeholderIds.has(id) || !isRealCourse(code)) return;
  const current = listedAsById.get(id);
  if (current && TAG_RANK[current] >= TAG_RANK[listedAs]) return;
  listedAsById.set(id, listedAs);
  if (!toSync.has(id)) discoveredCodes.set(id, normalizeCourseCode(code));
}

/** Each "or" in the text as the course ids under it, e.g. [["math150", "math151", "math154", "math157"]]. */
function orGroups(text: string): { ids: string[]; codeById: Map<string, string> }[] {
  if (!text) return [];
  const codes = expandDepartmentShorthand(normalizeRequirementSection(text)).match(CODE_IN_TEXT) ?? [];
  const codeToId = new Map(codes.map((code) => [normalizeCourseCode(code), idFromCode(code)]));
  const codeById = new Map([...codeToId].map(([code, id]) => [id, code]));
  const leaves = (node: PrerequisiteExpression): string[] =>
    node.type === "course" ? [node.courseId] : node.items.flatMap(leaves);
  const groups: { ids: string[]; codeById: Map<string, string> }[] = [];
  const walk = (node: PrerequisiteExpression) => {
    if (node.type === "course") return;
    if (node.type === "or") groups.push({ ids: [...new Set(leaves(node))], codeById });
    node.items.forEach(walk);
  };
  const expression = parsePrerequisiteExpression(text, codeToId);
  if (expression) walk(expression);
  return groups;
}

for (const { id, code, outline } of firstOutlines) {
  if (!outline || !requiredIds.has(id)) continue;
  if (outline.notes) {
    for (const item of parseEquivalents(outline.notes, code)) {
      const equivalentId = idFromCode(item.code);
      // An order rule only counts when the calendar also offers the two as a "one of" choice.
      if (item.orderRuleOnly && noteType(id, equivalentId) !== "variant") continue;
      if (equivalentId !== id) tagCourse(equivalentId, item.code, "equivalent");
    }
  }
  const { prerequisiteText, corequisiteText } = resolveRequirementTexts(requirementTextFrom(outline));
  for (const group of [...orGroups(prerequisiteText), ...orGroups(corequisiteText)]) {
    const required = group.ids.filter((option) => requiredIds.has(option));
    for (const option of group.ids) {
      if (option === id || requiredIds.has(option)) continue;
      tagCourse(option, group.codeById.get(option) ?? option, "alt-prereq");
      for (const requiredId of required) altPrereqPairs.push([requiredId, option]);
    }
  }
}

const extraEntries = [...discoveredCodes.entries()];
if (extraEntries.length) console.log(`Fetching ${extraEntries.length} added course outlines (equivalents and "or" options)...`);
const extraOutlines = await fetchOutlines(extraEntries);
/** Added courses SFU has no outline for (not offered in the last 6 terms): left out. */
const skippedOutlines = extraOutlines.filter((o) => !o.outline);
const skipped = skippedOutlines.map((o) => `${o.code} (${listedAsById.get(o.id)})`);

const outlines = [...firstOutlines, ...extraOutlines.filter((o) => o.outline)];

// ── Last offered term ──
const LAST_OFFERED_LOOKBACK = 6;
/** Next term, the current term, then LAST_OFFERED_LOOKBACK terms back, newest first. */
const offeredScanTerms = (() => {
  const order: TermName[] = ["spring", "summer", "fall"];
  const now = getCurrentAcademicTerm();
  const nowIndex = now.year * 3 + order.indexOf(now.term);
  return Array.from({ length: LAST_OFFERED_LOOKBACK + 2 }, (_, i) => {
    const index = nowIndex + 1 - i;
    return `${Math.floor(index / 3)}/${order[index % 3]}`;
  });
})();

/** The newest scanned term with enrollment sections, or null if none. */
async function findLastOffered(code: string): Promise<string | null> {
  const parsed = parseCourseCode(code);
  if (!parsed) return null;
  for (const term of offeredScanTerms) {
    try {
      const result = await fetchSectionsForTerm(term, parsed.dept.toLowerCase(), parsed.number.toLowerCase());
      if (result?.sections.some((section) => section.classType === "e")) return term;
    } catch {
      // Treat as not offered that term and keep looking.
    }
  }
  return null;
}

console.log(`Checking when ${outlines.length} courses were last offered (${offeredScanTerms[0]} back to ${offeredScanTerms.at(-1)})...`);
done = 0;
const lastOfferedById = new Map(
  await mapLimited(outlines, CONCURRENCY, async ({ id, code }) => {
    const lastOffered = await findLastOffered(code);
    done += 1;
    if (done % 20 === 0 || done === outlines.length) console.log(`  ${done}/${outlines.length}`);
    return [id, lastOffered] as const;
  })
);
const entries = outlines.map(({ id, code }): [string, string] => [id, code]);

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
  // A course nothing names any more keeps its previous tag (see `unreferenced` in the summary).
  const listedAs = listedAsById.get(id) ?? previous?.listedAs ?? "required";
  if (!outline) {
    missing.push(code);
    if (previous) courses.push({ ...previous, listedAs, lastOffered: lastOfferedById.get(id) ?? previous.lastOffered ?? null });
    if (previousRequirements[id]) requirements[id] = previousRequirements[id];
    continue;
  }

  courses.push({
    id,
    code,
    title: outline.title?.trim() || previous?.title || code,
    credits: outline.units ?? previous?.credits ?? 0,
    listedAs,
    lastOffered: lastOfferedById.get(id) ?? null,
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
    for (const eq of previousEquivalencies) {
      if (eq.sourceCourseId !== id) continue;
      equivalencies.push(
        eq.equivalencyType === "alt-prereq"
          ? eq
          : { ...eq, equivalencyType: noteType(eq.sourceCourseId, eq.equivalentCourseId) }
      );
    }
    continue;
  }
  if (!outline.notes) continue;
  for (const item of parseEquivalents(outline.notes, code)) {
    const equivalentId = idFromCode(item.code);
    if (item.orderRuleOnly && noteType(id, equivalentId) !== "variant") continue;
    const pair = `${id}>${equivalentId}`;
    if (equivalentId === id || !knownIds.has(equivalentId) || seenPairs.has(pair)) continue;
    seenPairs.add(pair);
    equivalencies.push({ sourceCourseId: id, equivalentCourseId: equivalentId, equivalencyType: noteType(id, equivalentId) });
  }
}
// "Or" options, unless the two are already equivalents or variants.
for (const [requiredId, option] of altPrereqPairs) {
  const pair = `${requiredId}>${option}`;
  if (!knownIds.has(requiredId) || !knownIds.has(option)) continue;
  if (seenPairs.has(pair) || seenPairs.has(`${option}>${requiredId}`)) continue;
  seenPairs.add(pair);
  equivalencies.push({ sourceCourseId: requiredId, equivalentCourseId: option, equivalencyType: "alt-prereq" });
}

// ── Write (one entry per line, so git diffs stay readable) ──
const objectLine = (value: object) =>
  JSON.stringify(value).replace(/^\{/, "{ ").replace(/\}$/, " }").replace(/":/g, '": ').replace(/,"/g, ', "');
const arrayFile = (rows: object[]) => (rows.length ? `[\n${rows.map((r) => `  ${objectLine(r)}`).join(",\n")}\n]\n` : "[]\n");

writeFileSync(join(GENERATED, "courses.json"), arrayFile(courses));
writeFileSync(join(GENERATED, "courseRequirements.json"), `${JSON.stringify(requirements, null, 2)}\n`);
writeFileSync(join(GENERATED, "equivalencies.json"), arrayFile(equivalencies));
writeFileSync(
  join(GENERATED, "skippedCourses.json"),
  arrayFile(
    skippedOutlines
      .map(({ id, code }) => ({ id, code, listedAs: listedAsById.get(id) }))
      .sort((a, b) => a.code.localeCompare(b.code))
  )
);
writeFileSync(join(GENERATED, "courseRequirementsByOutlineTerm.json"), `${JSON.stringify(byOutlineTerm, null, 2)}\n`);

// ── Summary ──
const changed = (a: unknown, b: unknown) => JSON.stringify(a) !== JSON.stringify(b);
const added = courses.filter((c) => !previousById.has(c.id)).map((c) => c.code);
const updated = courses
  .filter((c) => {
    const previous = previousById.get(c.id);
    return previous && (previous.title !== c.title || previous.credits !== c.credits);
  })
  .map((c) => c.code);
const reqChanged = [...new Set([...Object.keys(previousRequirements), ...Object.keys(requirements)])].filter((id) =>
  changed(previousRequirements[id], requirements[id])
);

console.log(`\nWrote ${courses.length} courses, ${Object.keys(requirements).length} requirement entries, ${equivalencies.length} equivalencies.`);
if (added.length) console.log(`Added courses: ${added.join(", ")}`);
if (updated.length) console.log(`Title/credits changed: ${updated.join(", ")}`);
if (reqChanged.length) console.log(`Requirement text changed: ${reqChanged.join(", ")}`);
if (missing.length) console.log(`No SFU outline found (kept previous data): ${missing.join(", ")}`);
const tagCounts = courses.reduce<Record<string, number>>((counts, c) => {
  counts[c.listedAs ?? "required"] = (counts[c.listedAs ?? "required"] ?? 0) + 1;
  return counts;
}, {});
// Same rule as the planner: no sections next term, this term or the 3 before (scan terms 0-4).
const recentTerms = new Set(offeredScanTerms.slice(0, 5));
const notRecent = courses.filter((c) => !c.lastOffered || !recentTerms.has(c.lastOffered));
if (notRecent.length) {
  console.log(`Not offered recently: ${notRecent.map((c) => `${c.code} (${c.lastOffered ?? "none found"})`).join(", ")}`);
}
console.log(`Listed as: ${Object.entries(tagCounts).map(([tag, n]) => `${n} ${tag}`).join(", ")}.`);
if (skipped.length) console.log(`Not added, no SFU outline in the last 6 terms: ${skipped.join(", ")}`);
const unreferenced = courses.filter((c) => !listedAsById.has(c.id)).map((c) => c.code);
if (unreferenced.length) console.log(`No longer named by any program or outline (kept, review): ${unreferenced.join(", ")}`);
for (const [outlineTerm, termEntries] of Object.entries(byOutlineTerm)) {
  const differs = Object.keys(termEntries).filter((id) => termEntries[id] !== requirements[id]);
  console.log(`${outlineTerm} rules: ${Object.keys(termEntries).length} courses, ${differs.length} differ from current outlines.`);
}
if (olderMissing.length) console.log(`No older outline found (current rules used): ${olderMissing.join(", ")}`);
console.log("\nNext: review `git diff src/data/generated`, then run `npm run test:dependency-graph`.");
