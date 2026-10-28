import { useEffect, useMemo, useState } from "react";
import { loadOfferingHistory } from "../sfuOutlines";
import { Course, OfferingHistory } from "../types";
import { isPlaceholderCourse, normalizeCourseCode, parseCourseCode } from "../utils/courseCodes";

export type OfferingHistoryState = OfferingHistory | "loading" | "unknown";

export function useOfferingHistories(courses: Course[]): Map<string, OfferingHistoryState> {
  const [tick, setTick] = useState(0);
  const [states, setStates] = useState<Record<string, OfferingHistoryState>>({});

  const targets = useMemo(() => {
    const byCode = new Map<string, Course>();
    for (const course of courses) {
      if (!course) continue;
      byCode.set(normalizeCourseCode(course.code), course);
    }
    return [...byCode.values()];
  }, [courses]);

  const targetKey = targets.map((course) => course.code).join("|");

  useEffect(() => {
    let cancelled = false;

    for (const course of targets) {
      const key = normalizeCourseCode(course.code);
      if (isPlaceholderCourse(course) || !parseCourseCode(course.code)) {
        setStates((current) => (current[key] === "unknown" ? current : { ...current, [key]: "unknown" }));
        continue;
      }

      setStates((current) => {
        if (current[key] && current[key] !== "loading") return current;
        return { ...current, [key]: "loading" };
      });
    }

    async function loadAll() {
      await Promise.all(
        targets.map(async (course) => {
          const key = normalizeCourseCode(course.code);
          if (isPlaceholderCourse(course)) return;

          const parsed = parseCourseCode(course.code);
          if (!parsed) return;

          const result = await loadOfferingHistory(parsed.dept, parsed.number, 9);
          if (cancelled) return;

          setStates((current) => ({
            ...current,
            [key]: result === "failed" ? "unknown" : result,
          }));
          setTick((value) => value + 1);
        })
      );
    }

    loadAll();
    return () => {
      cancelled = true;
    };
  }, [targetKey]);

  return useMemo(() => {
    const map = new Map<string, OfferingHistoryState>();
    for (const course of targets) {
      const key = normalizeCourseCode(course.code);
      map.set(course.id, states[key] ?? (isPlaceholderCourse(course) ? "unknown" : "loading"));
    }
    return map;
  }, [targets, states, tick]);
}
