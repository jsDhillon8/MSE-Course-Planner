/**
 * Local backup of degree requirements (src/data/calendar/).
 *
 *   npm run calendar:check    fetch every source in sources.json and show what changed
 *                             compared to the local copy (writes nothing; exits 1 on changes)
 *   npm run calendar:update   same, then save the new text and set copiedOn to today
 *                             (add `-- <source id>` to update just one source)
 *
 * The site never reads SFU pages at runtime: it reads the structured requirements in
 * programs/*.json, which are written by hand from these copies. After an update, review
 * the diff and update programs/*.json to match, then run `npm run test:requirements`.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  extractCalendarText,
  extractPageText,
  extractWqbCourses,
  wqbCoursesToText,
  wqbPageUpdated,
} from "./calendar/extractCalendarText";
import type { CalendarSource } from "../src/types";

const CALENDAR = join(dirname(fileURLToPath(import.meta.url)), "../src/data/calendar");
const SOURCES_FILE = join(CALENDAR, "sources.json");
const TEXT_DIR = join(CALENDAR, "text");
const WQB_FILE = join(CALENDAR, "wqb-courses.json");

const update = process.argv.includes("--update");
const only = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const sources = JSON.parse(readFileSync(SOURCES_FILE, "utf8")) as CalendarSource[];
// Local date (YYYY-MM-DD), not UTC, so the copy date matches the day it was made.
const today = new Date().toLocaleDateString("en-CA");

/** Minimal line diff (LCS) with one line of context, for review in the terminal. */
function lineDiff(before: string[], after: string[]): string[] {
  const n = before.length;
  const m = after.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = before[i] === after[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const ops: { type: " " | "-" | "+"; line: string }[] = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && before[i] === after[j]) {
      ops.push({ type: " ", line: before[i++] });
      j++;
    } else if (j < m && (i === n || lcs[i][j + 1] >= lcs[i + 1][j])) {
      ops.push({ type: "+", line: after[j++] });
    } else {
      ops.push({ type: "-", line: before[i++] });
    }
  }
  const out: string[] = [];
  ops.forEach((op, k) => {
    const near = (offset: number) => ops[k + offset] && ops[k + offset].type !== " ";
    if (op.type !== " ") out.push(`${op.type} ${op.line}`);
    else if (near(-1) || near(1)) out.push(`  ${op.line}`);
    else if (out[out.length - 1] !== "  ...") out.push("  ...");
  });
  return out;
}

async function fetchText(source: CalendarSource): Promise<{ text: string; wqb?: ReturnType<typeof extractWqbCourses> }> {
  const response = await fetch(source.url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const html = await response.text();
  if (source.kind === "calendar-program") return { text: extractCalendarText(html) };
  if (source.kind === "page") return { text: extractPageText(html) };
  const wqb = extractWqbCourses(html);
  return { text: wqbCoursesToText(wqb, wqbPageUpdated(html)), wqb };
}

mkdirSync(TEXT_DIR, { recursive: true });
let changed = 0;
let failed = 0;

for (const source of sources) {
  if (only.length && !only.includes(source.id)) continue;
  const file = join(TEXT_DIR, `${source.id}.txt`);
  let result: Awaited<ReturnType<typeof fetchText>>;
  try {
    result = await fetchText(source);
  } catch (error) {
    failed++;
    console.warn(`! ${source.id}: could not fetch ${source.url} (${(error as Error).message}); local copy kept`);
    continue;
  }

  const previous = existsSync(file) ? readFileSync(file, "utf8").replace(/\r\n/g, "\n") : null;
  if (previous === result.text) {
    console.log(`✓ ${source.id}: unchanged (copied ${source.copiedOn ?? "never"})`);
    continue;
  }

  changed++;
  if (previous === null) {
    console.log(`+ ${source.id}: no local copy yet`);
  } else {
    console.log(`\n~ ${source.id}: SFU's page differs from the local copy (${source.url})`);
    console.log(lineDiff(previous.split("\n"), result.text.split("\n")).join("\n"));
  }

  if (update) {
    writeFileSync(file, result.text);
    if (result.wqb) writeFileSync(WQB_FILE, `${JSON.stringify(result.wqb, null, 2)}\n`);
    source.copiedOn = today;
    console.log(`  saved; copiedOn → ${today}`);
  }
}

if (update && changed) writeFileSync(SOURCES_FILE, `${JSON.stringify(sources, null, 2)}\n`);

console.log(
  `\n${changed} changed, ${failed} failed.` +
    (changed && !update ? " Review the differences, then run `npm run calendar:update` and update programs/*.json." : "") +
    (changed && update ? " Now update programs/*.json to match and run `npm run test:requirements`." : "")
);
if (changed && !update) process.exitCode = 1;
