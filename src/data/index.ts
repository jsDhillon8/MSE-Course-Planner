import coursesJson from "./courses.json";
import courseRequirementsJson from "./courseRequirements.json";
import equivalenciesJson from "./equivalencies.json";
import templatesJson from "./templates.json";
import { Course, CourseEquivalency, PageTemplate } from "../types";

export const courses = coursesJson as Course[];
export const pageTemplates = templatesJson as PageTemplate[];
export const courseEquivalencies = equivalenciesJson as CourseEquivalency[];
export const courseRequirementsById = courseRequirementsJson as Record<string, string>;

export const courseById: Record<string, Course> = Object.fromEntries(courses.map((course) => [course.id, course]));
