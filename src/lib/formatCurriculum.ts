import { getCurriculum } from "../data";
import { PageTemplate } from "../types";

export function formatCurriculum(template: PageTemplate): string {
  return getCurriculum(template.programId, template.curriculumId)?.label ?? template.curriculumId;
}
