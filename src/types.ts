export type CurriculumType = "pre-2024" | "post-2024" | "double-degree";
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

export interface TermPlan {
  id: string;
  label: string;
  courseIds: string[];
}

export interface PageTemplate {
  id: string;
  title: string;
  curriculum: CurriculumType;
  planLength: PlanLength;
  supportsVariants: boolean;
  availableVariants: VariantId[];
  termsByVariant?: Partial<Record<VariantId, TermPlan[]>>;
  terms: TermPlan[];
}

export interface CourseEquivalency {
  sourceCourseId: string;
  equivalentCourseId: string;
  faculty: string;
  equivalencyType: "full" | "partial" | "elective-only";
  evidenceSource: string;
  expiry: string | null;
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
  educationalGoals?: string;
  grades?: { description: string; weight: string }[];
}

export interface HistoricalLookupResult {
  year: number;
  term: TermName;
  sections: OfferedSection[];
  sharedOutline: SharedOutlineFields;
  isHistorical: true;
}
