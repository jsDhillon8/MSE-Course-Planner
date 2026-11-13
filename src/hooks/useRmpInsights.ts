import { useEffect, useState } from "react";
import { fetchRmpInsights, isRmpEnabled, normalizeEquivalentCodes } from "../rmp";
import { RmpInsights } from "../types";

export type RmpStatus = "idle" | "loading" | "success" | "not-found" | "error";

export interface RmpInsightsState {
  status: RmpStatus;
  data: Extract<RmpInsights, { found: true }> | null;
  errorMsg?: string;
}

const IDLE: RmpInsightsState = { status: "idle", data: null };

// Successful and not-found lookups are kept for the page's lifetime; errors are not,
// so collapsing and re-expanding an instructor retries after a failure.
const rmpCache = new Map<string, RmpInsightsState>();

function cacheKey(name: string, courseCode: string | null, equivKey: string): string {
  return `${name.toLowerCase()}|${(courseCode ?? "").replace(/\s+/g, "").toUpperCase()}|${equivKey}`;
}

/**
 * Loads RMP insights for one instructor. Nothing is fetched while `enabled` is false,
 * which lets callers lazy-load only when the user expands that instructor.
 */
export function useRmpInsights(
  name: string | null,
  courseCode: string | null,
  equivalentCodes: string[],
  enabled: boolean
): RmpInsightsState {
  // Join to a string so a new array with the same codes doesn't re-run the effect.
  const equivKey = normalizeEquivalentCodes(equivalentCodes, courseCode).join(",");
  const [state, setState] = useState<RmpInsightsState>(() =>
    name ? rmpCache.get(cacheKey(name, courseCode, equivKey)) ?? IDLE : IDLE
  );

  useEffect(() => {
    if (!name || !isRmpEnabled()) {
      setState(IDLE);
      return;
    }

    const key = cacheKey(name, courseCode, equivKey);
    const cached = rmpCache.get(key);
    if (cached) {
      setState(cached);
      return;
    }

    if (!enabled) {
      setState(IDLE);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    setState({ status: "loading", data: null });

    async function load() {
      try {
        const result = await fetchRmpInsights(
          name!,
          courseCode,
          equivKey ? equivKey.split(",") : [],
          controller.signal
        );
        const next: RmpInsightsState = result.found
          ? { status: "success", data: result }
          : { status: "not-found", data: null };
        rmpCache.set(key, next);
        if (!cancelled) setState(next);
      } catch (err) {
        if (cancelled) return;
        setState({ status: "error", data: null, errorMsg: String(err) });
      }
    }

    load();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [name, courseCode, equivKey, enabled]);

  return state;
}
