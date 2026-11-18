/**
 * Reads the course lists out of a saved calendar program text
 * (src/data/calendar/text/*.txt, written by `npm run calendar:update`).
 * Used by the requirements test to check programs/*.json against SFU's wording.
 */

export interface CalendarCourse {
  code: string;
  title: string;
  units: number;
}

export interface ParsedProgramText {
  /** "Students complete all of" */
  required: CalendarCourse[];
  /** Each "and one of" list */
  chooseOne: CalendarCourse[][];
  /** Number in "complete <n> mechatronic systems engineering elective courses" */
  technicalElectives: number | null;
  agritech: {
    required: CalendarCourse[];
    /** "Students do not need to complete the following from the program requirements" */
    waived: CalendarCourse[];
    /** "complete <n> ... elective courses ... instead of" */
    technicalElectives: number | null;
  } | null;
}

const COURSE_LINE = /^([A-Z]{2,5} \d{3}[A-Z]?) - (.+) \((\d+)\)$/;
const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8 };

function section(lines: string[], heading: RegExp): string[] {
  const start = lines.findIndex((line) => heading.test(line));
  if (start < 0) return [];
  const level = lines[start].match(/^#+/)![0].length;
  const end = lines.findIndex((line, i) => i > start && /^#+ /.test(line) && line.match(/^#+/)![0].length <= level);
  return lines.slice(start + 1, end < 0 ? lines.length : end);
}

function courseLists(lines: string[]): { label: string; courses: CalendarCourse[] }[] {
  const lists: { label: string; courses: CalendarCourse[] }[] = [];
  for (const line of lines) {
    if (/^#+ /.test(line)) break;
    const course = line.match(COURSE_LINE);
    if (course) {
      lists[lists.length - 1]?.courses.push({ code: course[1], title: course[2], units: Number(course[3]) });
    } else if (/complete all of|and one of|do not need to complete/i.test(line)) {
      lists.push({ label: line, courses: [] });
    }
  }
  return lists;
}

function electiveCount(text: string): number | null {
  const match = text.match(/complete (\w+) mechatronic systems engineering elective courses/i);
  return match ? NUMBER_WORDS[match[1].toLowerCase()] ?? Number(match[1]) : null;
}

export function parseProgramText(text: string): ParsedProgramText {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const program = courseLists(section(lines, /^## Program Requirements/));
  const agritechLines = section(lines, /^### Agriculture Technology \(AgriTech\) Concentration/);
  const agritechLists = courseLists(agritechLines);
  const mseElectives = section(lines, /^## Mechatronic Systems Engineering Elective Courses/).join(" ");

  return {
    required: program.filter((list) => /all of/i.test(list.label)).flatMap((list) => list.courses),
    chooseOne: program.filter((list) => /one of/i.test(list.label)).map((list) => list.courses),
    technicalElectives: electiveCount(mseElectives),
    agritech: agritechLines.length
      ? {
          required: agritechLists.filter((list) => /all of/i.test(list.label)).flatMap((list) => list.courses),
          waived: agritechLists.filter((list) => /do not need/i.test(list.label)).flatMap((list) => list.courses),
          technicalElectives: electiveCount(agritechLines.join(" ")),
        }
      : null,
  };
}
