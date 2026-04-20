export type CurriculumType = "pre-2024" | "post-2024" | "double-degree";
export type PlanLength = "4-year" | "5-year";
export type VariantId = "8-MONTH CO-OP(yr2-3) + 4-MONTH CO-OP(yr5)" | "B" | "C";

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
