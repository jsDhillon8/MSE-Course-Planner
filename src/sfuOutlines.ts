import {
  HistoricalLookupResult,
  OfferedSection,
  OfferingHistory,
  OfferingFill,
  SeasonOfferingStats,
  SharedOutlineFields,
  TermName,
  TermTuple,
} from "./types";

const SFU_BASE = "https://www.sfu.ca/bin/wcm/course-outlines";

const TERM_ORDER: TermName[] = ["spring", "summer", "fall"];

const TERM_TO_SFU_CODE: Record<TermName, string> = {
  spring: "1",
  summer: "4",
  fall: "7",
};

interface SfuSection {
  text: string;
  value: string;
  title: string;
  classType: "e" | "n";
  sectionCode: string;
  associatedClass: string;
}

interface SfuScheduleItem {
  campus: string;
  isExam: boolean;
}

interface SfuInstructor {
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  roleCode: string;
  profileUrl?: string;
}

interface SfuOutline {
  description: string;
  prerequisites: string;
  corequisites: string;
  notes?: string;
  term: string;
  deliveryMethod: string;
  educationalGoals?: string;
  instructor?: SfuInstructor[];
  courseSchedule?: SfuScheduleItem[];
  grades?: { description: string; weight: string }[];
  title?: string;
  name?: string;
  units?: string | number;
}

type SectionsFetchResult =
  | { kind: "ok"; sections: SfuSection[]; termSlug: string }
  | { kind: "empty"; termSlug: string }
  | { kind: "error" };

export function getCurrentAcademicTerm(): TermTuple {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  if (month <= 4) return { year, term: "spring" };
  if (month <= 8) return { year, term: "summer" };
  return { year, term: "fall" };
}

export function getPastTerms(count: number): TermTuple[] {
  const terms: TermTuple[] = [];
  let { year, term } = getCurrentAcademicTerm();

  for (let i = 0; i < count; i++) {
    let idx = TERM_ORDER.indexOf(term) - 1;
    if (idx < 0) {
      idx = TERM_ORDER.length - 1;
      year -= 1;
    }
    term = TERM_ORDER[idx];
    terms.push({ year, term });
  }

  return terms;
}

export function termTupleToSlug({ year, term }: TermTuple): string {
  const yy = year - 2000;
  return `1${String(yy).padStart(2, "0")}${TERM_TO_SFU_CODE[term]}`;
}

export function termTupleToLabel({ year, term }: TermTuple): string {
  const sem = { spring: "Spring", summer: "Summer", fall: "Fall" }[term];
  return `${sem} ${year}`;
}

export function termCodeToLabel(termCode: string): string {
  const match = termCode.match(/^1(\d{2})(\d)$/);
  if (!match) return termCode;
  const year = 2000 + parseInt(match[1], 10);
  const semMap: Record<string, string> = { "1": "Spring", "4": "Summer", "7": "Fall" };
  const sem = semMap[match[2]] ?? `Term ${match[2]}`;
  return `${sem} ${year}`;
}

async function fetchSectionsForTermInternal(
  termSlug: string,
  dept: string,
  num: string
): Promise<SectionsFetchResult> {
  try {
    const res = await fetch(`${SFU_BASE}?${termSlug}/${dept}/${num}`);
    if (res.status === 404) return { kind: "empty", termSlug };
    if (!res.ok) return { kind: "error" };
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return { kind: "empty", termSlug };
    return { kind: "ok", sections: data as SfuSection[], termSlug };
  } catch {
    return { kind: "error" };
  }
}

export async function fetchSectionsForTerm(
  termSlug: string,
  dept: string,
  num: string
): Promise<{ sections: SfuSection[]; termSlug: string } | null> {
  const result = await fetchSectionsForTermInternal(termSlug, dept, num);
  if (result.kind === "ok") return { sections: result.sections, termSlug: result.termSlug };
  return null;
}

function enrollmentSections(result: { sections: SfuSection[]; termSlug: string }) {
  const hasLec = result.sections.some((s) => s.classType === "e" && s.sectionCode === "LEC");
  return result.sections.filter(
    (s) => s.classType === "e" && (hasLec ? s.sectionCode === "LEC" : true)
  );
}

function campusFromOutline(outline: SfuOutline): string {
  const item = outline.courseSchedule?.find((s) => !s.isExam);
  return item?.campus ?? "Unknown";
}

function parseUnits(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function sharedOutlineFrom(outline: SfuOutline): SharedOutlineFields {
  return {
    description: outline.description,
    prerequisites: outline.prerequisites,
    corequisites: outline.corequisites,
    notes: outline.notes,
    educationalGoals: outline.educationalGoals,
    grades: outline.grades,
    title: outline.title || outline.name,
    units: parseUnits(outline.units),
  };
}

function hydrateOutline(raw: Record<string, unknown>, fallback: SfuOutline): SfuOutline {
  const info = (raw.info ?? raw.courseInfo ?? {}) as Record<string, unknown>;
  const outline: SfuOutline = { ...fallback };
  if (!outline.courseSchedule && raw.courseSchedule) {
    outline.courseSchedule = raw.courseSchedule as SfuScheduleItem[];
  }
  if (!outline.instructor && raw.instructor) {
    outline.instructor = raw.instructor as SfuInstructor[];
  }
  if (!outline.grades && raw.grades) {
    outline.grades = raw.grades as { description: string; weight: string }[];
  }
  if (!outline.notes && typeof info.notes === "string") outline.notes = info.notes;
  if (!outline.notes && typeof raw.notes === "string") outline.notes = raw.notes;
  if (!outline.prerequisites && typeof info.prerequisites === "string") {
    outline.prerequisites = info.prerequisites;
  }
  if (!outline.corequisites && typeof info.corequisites === "string") {
    outline.corequisites = info.corequisites;
  }
  if (outline.units == null && info.units != null) outline.units = info.units as string | number;
  if (!outline.title && typeof info.title === "string") outline.title = info.title;
  if (!outline.title && typeof info.name === "string") outline.title = info.name;
  if (!outline.description && typeof info.description === "string") {
    outline.description = info.description;
  }
  return outline;
}

async function fetchSectionOutlines(
  dept: string,
  number: string,
  toFetch: { termSlug: string; section: SfuSection }[]
): Promise<{ sections: OfferedSection[]; sharedOutline: SharedOutlineFields } | null> {
  if (toFetch.length === 0) return null;

  const outlineResults = await Promise.all(
    toFetch.map(async ({ termSlug, section }) => {
      try {
        const res = await fetch(`${SFU_BASE}?${termSlug}/${dept}/${number}/${section.value}`);
        if (!res.ok) return null;
        const raw = (await res.json()) as Record<string, unknown>;
        const base: SfuOutline = (raw.info ?? raw.courseInfo ?? raw) as SfuOutline;
        const outline = hydrateOutline(raw, base);
        return { outline, sectionName: section.value };
      } catch {
        return null;
      }
    })
  );

  const validResults = outlineResults.filter(
    (r): r is { outline: SfuOutline; sectionName: string } => r !== null
  );
  if (validResults.length === 0) return null;

  return {
    sharedOutline: sharedOutlineFrom(validResults[0].outline),
    sections: validResults.map(({ outline, sectionName }) => ({
      sectionName,
      termLabel: termCodeToLabel(outline.term),
      campus: campusFromOutline(outline),
      instructors: outline.instructor ?? [],
      deliveryMethod: outline.deliveryMethod,
    })),
  };
}

/** Resolve enrollment sections + outlines across one or more term slug results. */
export async function resolveOfferedSections(
  dept: string,
  number: string,
  termResults: ({ sections: SfuSection[]; termSlug: string } | null)[]
): Promise<{ sections: OfferedSection[]; sharedOutline: SharedOutlineFields } | null> {
  const toFetch: { termSlug: string; section: SfuSection }[] = [];
  const seenValues = new Set<string>();

  for (const result of termResults) {
    if (!result) continue;
    for (const section of enrollmentSections(result)) {
      if (!seenValues.has(section.value)) {
        seenValues.add(section.value);
        toFetch.push({ termSlug: result.termSlug, section });
      }
    }
  }

  return fetchSectionOutlines(dept, number, toFetch);
}

async function fetchOfferedSectionsForTerm(
  termSlug: string,
  dept: string,
  number: string,
  sectionResult: { sections: SfuSection[]; termSlug: string }
): Promise<{ sections: OfferedSection[]; sharedOutline: SharedOutlineFields } | null> {
  const candidates = enrollmentSections(sectionResult);
  if (candidates.length === 0) return null;

  return fetchSectionOutlines(
    dept,
    number,
    candidates.map((section) => ({ termSlug, section }))
  );
}

/**
 * Walks backward through past terms (newest first) looking for the most recent
 * term a course was actually offered in. Stops at the first match.
 */
export async function findHistoricalOffering(
  dept: string,
  courseNumber: string,
  maxTermsBack = 6
): Promise<HistoricalLookupResult | null> {
  const candidateTerms = getPastTerms(maxTermsBack);

  for (const tuple of candidateTerms) {
    try {
      const termSlug = termTupleToSlug(tuple);
      const sectionResult = await fetchSectionsForTerm(termSlug, dept, courseNumber);
      if (!sectionResult || sectionResult.sections.length === 0) continue;

      const offered = await fetchOfferedSectionsForTerm(termSlug, dept, courseNumber, sectionResult);
      if (!offered || offered.sections.length === 0) continue;

      return {
        year: tuple.year,
        term: tuple.term,
        sections: offered.sections,
        sharedOutline: offered.sharedOutline,
        isHistorical: true,
      };
    } catch (err) {
      console.warn(
        `[findHistoricalOffering] Lookup failed for ${dept} ${courseNumber} in ${tuple.year}/${tuple.term}:`,
        err
      );
    }
  }

  return null;
}

function emptySeasonStats(): SeasonOfferingStats {
  return { offered: 0, total: 0 };
}

function emptyOfferingHistory(): OfferingHistory {
  return {
    fall: emptySeasonStats(),
    spring: emptySeasonStats(),
    summer: emptySeasonStats(),
  };
}

function createPromiseQueue(maxConcurrent: number) {
  let active = 0;
  const waiting: Array<() => void> = [];

  const pump = () => {
    while (active < maxConcurrent && waiting.length > 0) {
      const next = waiting.shift();
      if (next) next();
    }
  };

  return function enqueue<T>(work: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const start = () => {
        active += 1;
        Promise.resolve()
          .then(work)
          .then(resolve, reject)
          .finally(() => {
            active -= 1;
            pump();
          });
      };

      if (active < maxConcurrent) start();
      else waiting.push(start);
    });
  };
}

const enqueueOfferingRequest = createPromiseQueue(4);

/**
 * Counts how often a course had enrollment sections in each season over
 * `termsBack` past terms. Unlike findHistoricalOffering, this does not stop
 * at the first match. Network/5xx failures are skipped (not counted). A 404
 * is treated as a checked term with no sections.
 */
export async function getOfferingHistory(
  dept: string,
  number: string,
  termsBack = 9
): Promise<OfferingHistory> {
  const history = emptyOfferingHistory();

  const termResults = await Promise.all(
    getPastTerms(termsBack).map((tuple) =>
      enqueueOfferingRequest(async () => {
        try {
          const termSlug = termTupleToSlug(tuple);
          const result = await fetchSectionsForTermInternal(termSlug, dept, number);
          return { tuple, result };
        } catch {
          return { tuple, result: { kind: "error" as const } };
        }
      })
    )
  );

  for (const { tuple, result } of termResults) {
    if (result.kind === "error") continue;

    const season = history[tuple.term];
    season.total += 1;

    if (result.kind === "ok" && enrollmentSections(result).length > 0) {
      season.offered += 1;
    }
  }

  return history;
}

export function offeringFill(stats: SeasonOfferingStats | undefined): OfferingFill {
  if (!stats || stats.total <= 0) return "unknown";
  const ratio = stats.offered / stats.total;
  if (ratio >= 2 / 3) return "full";
  if (ratio >= 1 / 3) return "half";
  return "empty";
}

export function offeringTooltip(seasonLabel: string, stats: SeasonOfferingStats | undefined): string {
  if (!stats || stats.total <= 0) return `${seasonLabel}: Unknown`;
  return `${seasonLabel}: ${stats.offered}/${stats.total} recent years`;
}

const offeringHistoryCache = new Map<string, OfferingHistory | "failed">();
const offeringHistoryInflight = new Map<string, Promise<OfferingHistory | "failed">>();

function cacheKeyForCourse(dept: string, number: string): string {
  return `${dept.trim().toLowerCase()} ${number.trim().toLowerCase()}`;
}

/** Module-level cached history fetch, limited to 4 concurrent SFU requests. */
export function loadOfferingHistory(
  dept: string,
  number: string,
  termsBack = 9
): Promise<OfferingHistory | "failed"> {
  const key = cacheKeyForCourse(dept, number);
  const cached = offeringHistoryCache.get(key);
  if (cached) return Promise.resolve(cached);

  const inflight = offeringHistoryInflight.get(key);
  if (inflight) return inflight;

  const request = (async () => {
    try {
      const history = await getOfferingHistory(dept, number, termsBack);
      offeringHistoryCache.set(key, history);
      return history;
    } catch {
      offeringHistoryCache.set(key, "failed");
      return "failed";
    }
  })().finally(() => {
    offeringHistoryInflight.delete(key);
  });

  offeringHistoryInflight.set(key, request);
  return request;
}

export async function fetchCourseInfoFields(
  dept: string,
  number: string
): Promise<{ title?: string; description: string; units?: number } | null> {
  const [currentResult, registrationResult] = await Promise.all([
    fetchSectionsForTerm("current/current", dept, number),
    fetchSectionsForTerm("registration/registration", dept, number),
  ]);

  let resolved = await resolveOfferedSections(dept, number, [currentResult, registrationResult]);
  if (!resolved) {
    const historical = await findHistoricalOffering(dept, number, 6);
    if (!historical) return null;
    resolved = historical;
  }

  return {
    title: resolved.sharedOutline.title,
    description: resolved.sharedOutline.description ?? "",
    units: resolved.sharedOutline.units,
  };
}
