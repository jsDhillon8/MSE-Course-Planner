import { RmpInsights, OfferedSectionInstructor } from "../types";

/**
 * Base URL of the RMP proxy server (see server/index.js).
 *
 * - Dev: defaults to "/api/rmp", which the Vite dev server proxies to localhost:3001.
 * - Production: must come from VITE_RMP_API_URL at build time. GitHub Pages is static,
 *   so without it there is nothing to call and the feature hides itself.
 */
const RMP_API_BASE: string | null = (() => {
  const configured = import.meta.env.VITE_RMP_API_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  return import.meta.env.DEV ? "/api/rmp" : null;
})();

export function isRmpEnabled(): boolean {
  return RMP_API_BASE !== null;
}

/** The name we search RMP with: "First Last", falling back to the SFU display name. */
export function instructorSearchName(instructor: OfferedSectionInstructor): string {
  const full = `${instructor.firstName ?? ""} ${instructor.lastName ?? ""}`.replace(/\s+/g, " ").trim();
  return full || (instructor.name ?? "").replace(/\s+/g, " ").trim();
}

/** Unique, non-empty instructor names across all sections, in first-seen order. */
export function uniqueInstructorNames(instructors: OfferedSectionInstructor[]): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const instructor of instructors) {
    const name = instructorSearchName(instructor);
    const key = name.toLowerCase();
    if (!name || key === "instructor tba" || key === "tba" || seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names;
}

/** "ENSC 220" style codes, de-duplicated and sorted so they make a stable cache key. */
export function normalizeEquivalentCodes(codes: string[], selfCode: string | null): string[] {
  const self = (selfCode ?? "").replace(/\s+/g, "").toUpperCase();
  const byKey = new Map<string, string>();
  for (const raw of codes) {
    const code = raw.replace(/\s+/g, " ").trim().toUpperCase();
    const key = code.replace(/\s+/g, "");
    // Same shape the server accepts; anything else would fail the whole lookup with a 400.
    if (/^[A-Z]{2,8} ?[A-Z0-9]{1,6}$/.test(code) && key !== self) byKey.set(key, code);
  }
  return [...byKey.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, code]) => code).slice(0, 5);
}

export async function fetchRmpInsights(
  name: string,
  courseCode: string | null,
  equivalentCodes: string[] = [],
  signal?: AbortSignal
): Promise<RmpInsights> {
  if (!RMP_API_BASE) throw new Error("RMP proxy is not configured");

  const params = new URLSearchParams({ name });
  const course = courseCode?.replace(/\s+/g, " ").trim();
  if (course) params.set("course", course);
  if (equivalentCodes.length > 0) params.set("equiv", equivalentCodes.join(","));

  const res = await fetch(`${RMP_API_BASE}/professor?${params.toString()}`, { signal });
  if (!res.ok) throw new Error(`RMP proxy responded ${res.status}`);
  return (await res.json()) as RmpInsights;
}
