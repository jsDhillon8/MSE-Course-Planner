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

/** A named list of courses a student picks from (e.g. technical electives). */
export interface ElectiveGroup {
  id: string;
  label: string;
  /** SFU course codes, e.g. "MSE 450". `npm run sync-data` fetches each one. */
  courseCodes: string[];
}

/** An optional specialization within a curriculum (e.g. Agritech). Requirements come in Phase 3. */
export interface Concentration {
  id: string;
  label: string;
}

/**
 * One curriculum era of a program (e.g. MSE Post-Fall 2024). Requirements from
 * different curricula are never mixed.
 */
export interface Curriculum {
  id: string;
  label: string;
  electiveGroups: ElectiveGroup[];
  concentrations: Concentration[];
  templates: TemplateDefinition[];
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
