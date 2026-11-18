export type PlanLength = "4-year" | "5-year";
export type VariantId = "A" | "B" | "C";
export type TermName = "spring" | "summer" | "fall";

export interface Course {
  id: string;
  code: string;
  title: string;
  credits: number;
  description: string;
}

/** Catalog-like course stored on a custom plan when the equivalent is not in courses.json. */
export interface CustomCourseEntry {
  id: string;
  code: string;
  title: string;
  credits: number;
  description: string;
}

/** Records an equivalent swap so Undo can restore the original id at the same term index. */
export interface CustomSwapRecord {
  replacementId: string;
  originalCourseId: string;
  originalCode: string;
  termId: string;
  index: number;
}

export type PrerequisiteExpression =
  | { type: "course"; courseId: string }
  | { type: "and"; items: PrerequisiteExpression[] }
  | { type: "or"; items: PrerequisiteExpression[] };

export type CourseHighlightRole = "selected" | "prerequisite" | "corequisite" | "dependent";

export interface CourseRelationshipHighlights {
  roles: Map<string, CourseHighlightRole>;
}

export type ThemeMode = "light" | "dark";

/**
 * A single slot in a term's course list.
 *
 * - `string` — a single required course, referenced by its `Course.id`.
 * - `string[]` — a "choose one of" group. All ids in the array are
 *   rendered side-by-side on the same row, and the student may pick
 *   any one of them to satisfy that slot (e.g. ["bus343", "buec232"]
 *   renders as "BUS 343 OR BUEC 232").
 *
 * This keeps the recommended-schedule config purely data-driven: adding,
 * removing, or grouping courses only requires editing `programs/*.json`,
 * never the React components that render it.
 */
export type CourseSlot = string | string[];

export interface TermPlan {
  id: string;
  label: string;
  courseIds: CourseSlot[];
}

/** A recommended schedule as written in `programs/*.json` (inside a curriculum). */
export interface TemplateDefinition {
  id: string;
  title: string;
  /** The degree (in the same curriculum) this schedule completes, e.g. "major". */
  degreeId: string;
  planLength: PlanLength;
  supportsVariants: boolean;
  availableVariants: VariantId[];
  /**
   * Per-variant recommended schedules (5-year plans with Option A/B/C
   * co-op placements). When a template supports variants, this is the
   * single source of truth for its terms — see `terms` below.
   */
  termsByVariant?: Partial<Record<VariantId, TermPlan[]>>;
  /**
   * The recommended schedule for templates that don't support variants
   * (4-year plans, double-degree). Templates that DO support variants
   * should omit this and rely solely on `termsByVariant`, so there is
   * never a second copy of the same schedule to keep in sync — use
   * `getActiveTerms()` from `utils/scheduleTerms` to read the right one.
   */
  terms?: TermPlan[];
}

/** A template with the program and curriculum it belongs to (filled in by the data loader). */
export interface PageTemplate extends TemplateDefinition {
  programId: string;
  curriculumId: string;
}

/**
 * A named list of courses a student picks from (e.g. technical electives). How many
 * a degree needs is in `DegreeRequirements.electives`.
 */
export interface ElectiveGroup {
  id: string;
  label: string;
  /** Id of the page in src/data/calendar/sources.json this group was copied from. */
  source?: string;
  /** Name of the listed courses when the group also allows unlisted ones, e.g. "Group A". */
  listLabel?: string;
  /** SFU course codes, e.g. "MSE 450". `npm run sync-data` fetches each one. Empty when the rule is descriptive. */
  courseCodes: string[];
  /** The rule in words, for anything the list can't express. */
  note?: string;
}

/** An optional specialization within a curriculum (e.g. AgriTech). */
export interface Concentration {
  id: string;
  label: string;
  /** Extra courses the concentration requires (SFU course codes). */
  requiredCourses?: string[];
  /** Program courses the concentration replaces. */
  waivedCourses?: string[];
  /** Technical electives needed with this concentration (instead of the degree's usual count). */
  technicalElectives?: number;
  note?: string;
}

/** One elective requirement of a degree, e.g. four technical electives, at least three from Group A. */
export interface DegreeElectiveRequirement {
  groupId: string;
  courses: number;
  /** At least this many must come from the group's `courseCodes` list. */
  minFromList?: number;
}

/**
 * A degree's requirements as listed in the SFU calendar, copied locally (see
 * src/data/calendar/). The site reads this copy, never the live calendar.
 */
export interface DegreeRequirements {
  id: string;
  label: string;
  /** Id of the calendar page in src/data/calendar/sources.json. */
  source: string;
  /** "Students complete all of" (SFU course codes). */
  requiredCourses: string[];
  /** Each "and one of" list. */
  chooseOne: string[][];
  electives: DegreeElectiveRequirement[];
  coopTerms: number;
  /**
   * Units from the listed requirements (3 per elective course, smallest option of each
   * "one of"). The calendar doesn't state a total; advisors plan any remaining electives.
   */
  minimumUnits: number;
  concentrationIds: string[];
}

/**
 * One curriculum era of a program (e.g. MSE Post-Fall 2024). Requirements from
 * different curricula are never mixed.
 */
export interface Curriculum {
  id: string;
  label: string;
  /**
   * SFU outline term whose prerequisite rules apply to this curriculum's program courses
   * (e.g. "2024/spring" for pre-Fall 2024 students). Unset = current outlines.
   */
  outlineTerm?: string;
  electiveGroups: ElectiveGroup[];
  concentrations: Concentration[];
  /** Degrees in this curriculum (e.g. Major, Double Degree), each with its calendar requirements. */
  degrees: DegreeRequirements[];
  templates: TemplateDefinition[];
}

/** One page copied into the local requirements backup (src/data/calendar/sources.json). */
export interface CalendarSource {
  id: string;
  title: string;
  kind: "calendar-program" | "page" | "wqb";
  url: string;
  /** e.g. "2027/spring" for calendar pages */
  calendarTerm: string | null;
  /** Local date (YYYY-MM-DD) of the copy in src/data/calendar/text/. */
  copiedOn: string | null;
}

/** A degree program. Courses and equivalencies are shared across all programs. */
export interface Program {
  id: string;
  name: string;
  shortName: string;
  curricula: Curriculum[];
}

export interface CourseEquivalency {
  sourceCourseId: string;
  equivalentCourseId: string;
  equivalencyType: "full" | "partial" | "elective-only";
}

export interface TermTuple {
  year: number;
  term: TermName;
}

export interface OfferedSectionInstructor {
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  roleCode: string;
  profileUrl?: string;
}

/** One fetched section's worth of offering data shown in the outline panel. */
export interface OfferedSection {
  sectionName: string;
  termLabel: string;
  campus: string;
  instructors: OfferedSectionInstructor[];
  deliveryMethod: string;
}

export interface SharedOutlineFields {
  description: string;
  prerequisites: string;
  corequisites: string;
  notes?: string;
  educationalGoals?: string;
  grades?: { description: string; weight: string }[];
  title?: string;
  units?: number;
}

export interface SeasonOfferingStats {
  offered: number;
  total: number;
}

export interface OfferingHistory {
  fall: SeasonOfferingStats;
  spring: SeasonOfferingStats;
  summer: SeasonOfferingStats;
}

export type OfferingFill = "full" | "half" | "empty" | "unknown";

export interface HistoricalLookupResult {
  year: number;
  term: TermName;
  sections: OfferedSection[];
  sharedOutline: SharedOutlineFields;
  isHistorical: true;
}

/** One written RateMyProfessors rating returned by the RMP proxy server. */
export interface RmpComment {
  id: string;
  class: string;
  date: string;
  comment: string;
  clarityRating: number | null;
  difficultyRating: number | null;
  helpfulRating: number | null;
  grade: string | null;
  /** True when the rating is for the course currently selected in the planner. */
  fromClass: boolean;
  /** Which tier the comment was picked from: the course itself, an SFU-listed equivalent, or general. */
  source: RmpCommentTier;
  /** RMP course name (e.g. "ENSC220") when source is "equivalent". */
  equivalentCourse: string | null;
}

export type RmpCommentTier = "class" | "equivalent" | "general";

export interface RmpProfessor {
  name: string;
  department: string;
  school: string;
  avgRating: number;
  avgDifficulty: number;
  numRatings: number;
  /** null when RMP has no "would take again" data. */
  wouldTakeAgainPercent: number | null;
  url: string;
}

export type RmpCommentSource = "class" | "mixed" | "equivalent" | "general";

export type RmpInsights =
  | { found: false }
  | {
      found: true;
      isExactNameMatch: boolean;
      professor: RmpProfessor;
      commentSource: RmpCommentSource;
      note: string;
      comments: RmpComment[];
    };
