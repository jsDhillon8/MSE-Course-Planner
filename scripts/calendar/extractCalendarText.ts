/**
 * Turns SFU pages into stable plain text for the local requirements backup
 * (src/data/calendar/text/). No dependencies: SFU's markup is simple and regular.
 *
 * - Calendar program pages: headings, requirement wording, and one line per course
 *   ("MSE 220 - Engineering Materials (3)"). Course descriptions and the per-term
 *   section tables are dropped, so the text only changes when requirements change.
 * - Other pages (e.g. the MSE program requirements page): the main content column.
 * - The WQB certified courses page: one line per course, plus structured rows.
 */

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === "#") {
      const value = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(value) ? String.fromCodePoint(value) : match;
    }
    return ENTITIES[code.toLowerCase()] ?? match;
  });
}

/** Removes every `<div class="…name…">…</div>` block, honouring nested divs. */
function removeDivBlocks(html: string, className: string): string {
  const opener = new RegExp(`<div[^>]*class="[^"]*\\b${className}\\b[^"]*"[^>]*>`, "gi");
  let result = "";
  let index = 0;
  let match: RegExpExecArray | null;

  while ((match = opener.exec(html))) {
    if (match.index < index) continue;
    result += html.slice(index, match.index);
    let depth = 1;
    const tag = /<div\b[^>]*>|<\/div>/gi;
    tag.lastIndex = match.index + match[0].length;
    let end = html.length;
    let next: RegExpExecArray | null;
    while ((next = tag.exec(html))) {
      depth += next[0][1] === "/" ? -1 : 1;
      if (depth === 0) {
        end = next.index + next[0].length;
        break;
      }
    }
    index = end;
    opener.lastIndex = end;
  }

  return result + html.slice(index);
}

/** Inline text of an HTML fragment on one line. */
function oneLine(fragment: string): string {
  return decodeEntities(fragment.replace(/<[^>]+>/g, " ")).replace(/[\s ]+/g, " ").trim();
}

/** Block-level HTML → markdown-ish lines (headings as #, list items as -). */
function htmlToText(html: string): string {
  const text = html
    .replace(/<(script|style|nav)\b[\s\S]*?<\/\1>/gi, "")
    .replace(
      /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi,
      (_m, level: string, inner: string) => `\n\n${"#".repeat(Number(level))} ${oneLine(inner)}\n`
    )
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<(p|div|br|tr|ul|ol|table|section)\b[^>]*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ");

  return decodeEntities(text)
    .replace(/�/g, "–")
    .split("\n")
    .map((line) => line.replace(/[ \t ]+/g, " ").trim())
    .filter((line) => line !== "-")
    .filter((line, i, lines) => line !== "" || (i > 0 && lines[i - 1] !== ""))
    .join("\n")
    .trim()
    .concat("\n");
}

function beforeFooter(html: string, start: number): string {
  const footer = html.slice(start).search(/<footer\b|<div[^>]*id="footer"/i);
  return html.slice(start, footer >= 0 ? start + footer : html.length);
}

/** An SFU calendar program page (e.g. Mechatronic Systems Engineering Major). */
export function extractCalendarText(html: string): string {
  const titles = [...html.matchAll(/<h1[^>]*>/gi)];
  let body = beforeFooter(html, titles.length > 1 ? titles[titles.length - 1].index! : 0);
  body = removeDivBlocks(body, "course-description");
  body = body
    .replace(/<a[^>]*class="[^"]*all-sections-toggle[^"]*"[^>]*>[\s\S]*?<\/a>/gi, "")
    // One line per course: "MSE 220 - Engineering Materials (3)".
    .replace(/<a[^>]*class="[^"]*course-link[^"]*"[^>]*>([\s\S]*?)<\/a>/gi, (_m, inner: string) => `\n${oneLine(inner)}\n`);
  return htmlToText(body);
}

/** A regular sfu.ca page: its main content column only (no menus, header or footer). */
export function extractPageText(html: string): string {
  const marker = html.search(/id="content-start"/i);
  const start = marker >= 0 ? html.indexOf(">", marker) + 1 : 0;
  return htmlToText(beforeFooter(html, start));
}

export interface WqbCourse {
  /** e.g. "CMPT 105W" */
  code: string;
  title: string;
  units: number | null;
  /** e.g. ["W"], ["B-Hum"], ["Q", "B-Sci"] */
  designations: string[];
  /** The faculty heading the course is listed under, e.g. "Faculty of Applied Sciences". */
  faculty: string;
}

/**
 * The WQB certified courses page: three sections (W, Q, B), each a table per
 * faculty. A course listed in several tables is merged into one row.
 */
export function extractWqbCourses(html: string): WqbCourse[] {
  const byCode = new Map<string, WqbCourse>();
  let section: "W" | "Q" | "B" | null = null;
  let faculty = "";
  const token = /<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>|<p[^>]*>\s*(?:<[^>]+>\s*)*(Faculty of [^<]+|Beedie School of Business)\s*(?:<\/[^>]+>\s*)*<\/p>|<table[\s\S]*?<\/table>/gi;
  let match: RegExpExecArray | null;

  while ((match = token.exec(html))) {
    if (match[0].startsWith("<table")) {
      if (!section) continue;
      const rows = [...match[0].matchAll(/<tr[\s\S]*?<\/tr>/gi)].map((row) =>
        [...row[0].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell) => oneLine(cell[1]))
      );
      const header = rows.shift() ?? [];
      if (!/course no/i.test(header[0] ?? "")) continue; // "Q and B-Sci for Arts Students" repeats earlier rows
      for (const cells of rows) {
        const parsed = (cells[0] ?? "").match(/^([A-Z]{2,5})\s+(\d{3}[A-Z]?)(?:-(\d+))?/);
        if (!parsed) continue;
        const code = `${parsed[1]} ${parsed[2]}`;
        const extra = cells.slice(2).join(" ");
        const designations = new Set<string>(section === "B" ? [] : [section]);
        for (const found of extra.matchAll(/\b(W|Q)\b|B-(Hum|Soc|Sci)(?:\/(Hum|Soc|Sci))?/g)) {
          if (found[1]) designations.add(found[1]);
          if (found[2]) designations.add(`B-${found[2]}`);
          if (found[3]) designations.add(`B-${found[3]}`);
        }
        const existing = byCode.get(code);
        if (existing) {
          designations.forEach((d) => existing.designations.includes(d) || existing.designations.push(d));
        } else {
          byCode.set(code, {
            code,
            title: (cells[1] ?? "").replace(/\s*\*.*$/, "").trim(),
            units: parsed[3] ? Number(parsed[3]) : null,
            designations: [...designations],
            faculty,
          });
        }
      }
      continue;
    }

    const heading = oneLine(match[1] ?? match[2] ?? "");
    if (/Certified Writing/i.test(heading)) section = "W";
    else if (/Certified Quantitative/i.test(heading)) section = "Q";
    else if (/Certified Breadth/i.test(heading)) section = "B";
    else if (/Q and B-Sci for Arts/i.test(heading)) section = null;
    else if (/^(Faculty of|Beedie School)/i.test(heading)) faculty = heading.replace(/Health Science$/, "Health Sciences");
  }

  const order = ["W", "Q", "B-Hum", "B-Soc", "B-Sci"];
  return [...byCode.values()]
    .map((course) => ({ ...course, designations: course.designations.sort((a, b) => order.indexOf(a) - order.indexOf(b)) }))
    .sort((a, b) => a.code.localeCompare(b.code, "en", { numeric: true }));
}

/** Text form of the WQB list, one course per line, for diffing. */
export function wqbCoursesToText(courses: WqbCourse[], pageUpdated: string | null): string {
  const lines = courses.map(
    (c) => `${c.code} - ${c.title}${c.units ? ` (${c.units})` : ""} | ${c.designations.join(", ")} | ${c.faculty}`
  );
  return `# WQB Certified Courses${pageUpdated ? `\n\nPage last updated: ${pageUpdated}` : ""}\n\n${lines.join("\n")}\n`;
}

/** "Updated: September 1, 2026" on the WQB page, if present. */
export function wqbPageUpdated(html: string): string | null {
  return html.match(/(?:Last\s+)?Updated:?\s*([A-Z][a-z]+ \d{1,2}, \d{4})/)?.[1] ?? null;
}
