import coursesJson from "./data/courses.json";
import courseRequirementsJson from "./data/courseRequirements.json";
import equivalenciesJson from "./data/equivalencies.json";
import templatesJson from "./data/templates.json";
import { Course, CourseEquivalency, PageTemplate } from "./types";

export const courses = coursesJson as Course[];
export const pageTemplates = templatesJson as PageTemplate[];
export const courseEquivalencies = equivalenciesJson as CourseEquivalency[];
export const courseRequirementsById = courseRequirementsJson as Record<string, string>;

export const courseById: Record<string, Course> = Object.fromEntries(courses.map((course) => [course.id, course]));
