import { Course } from "../types";

export function normalizeCourseCode(code: string): string {
  return code.replace(/\s+/g, " ").trim().toUpperCase();
}

export function buildCourseCodeIndex(courses: Course[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const course of courses) {
    const normalized = normalizeCourseCode(course.code);
    index.set(normalized, course.id);
    index.set(normalized.replace(/\s+/g, ""), course.id);
  }
  return index;
}

/** Expand shorthand like "MATH 150 or 151 or 155" to include department prefixes. */
export function expandDepartmentShorthand(text: string): string {
  return text.replace(
    /\b([A-Za-z]{2,8})\s+(\d{1,3}[A-Za-z]?)([\s\S]*)/g,
    (_full, dept: string, firstNum: string, rest: string) => {
      const expandedRest = rest.replace(
        /\bor\s+(\d{1,3}[A-Za-z]?)\b/gi,
        (_match, num: string) => `or ${dept} ${num}`
      );
      return `${dept} ${firstNum}${expandedRest}`;
    }
  );
}

export function findCourseIdsInText(
  text: string,
  codeToId: Map<string, string>
): string[] {

  const expanded =
    expandDepartmentShorthand(text);
  const found: string[] = [];


  /*
    Matches:

    MSE 110
    MSE110
    MSE 110W
    MSE110W
    MSE 110 W
    ENSC 251W

  */
  const coursePattern =
    /\b([A-Za-z]{2,8})\s*(\d{1,3})\s*([A-Za-z])?\b/gi;



  let match: RegExpExecArray | null;


  while (
    (match = coursePattern.exec(expanded)) !== null
  ) {


    const dept =
      match[1]
      .toUpperCase();


    const number =
      match[2];


    const suffix =
      match[3]
      ? match[3].toUpperCase()
      : "";


    const normalized =
      normalizeCourseCode(
        `${dept} ${number}${suffix}`
      );


    const compact =
      normalized.replace(
        /\s+/g,
        ""
      );


    const id =
      codeToId.get(normalized)
      ??
      codeToId.get(compact);



    if(id){
      found.push(id);
    }

  }


  return [
    ...new Set(found)
  ];

}
