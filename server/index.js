// Small proxy so the static (GitHub Pages) frontend can read RateMyProfessors data.
// Run locally with `npm run server`; deploy separately (e.g. Render, see render.yaml).

import express from "express";
import cors from "cors";
import { getProfessorInsights, isExactName, normalizeCourse } from "./rmp.js";

const PORT = Number(process.env.PORT) || 3001;

const FOUND_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const NOT_FOUND_TTL_MS = 60 * 60 * 1000; // 1h
const MAX_CACHE_ENTRIES = 2000;

const NAME_MAX_LENGTH = 80;
const COURSE_PATTERN = /^[A-Za-z]{2,8}\s?[A-Za-z0-9]{1,6}$/;
const MAX_EQUIVALENTS = 5;

const allowedOrigins = new Set(
  [
    "http://localhost:5173",
    ...(process.env.ALLOWED_ORIGINS ?? "").split(","),
  ]
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean)
);

/** key -> { value, expiresAt } */
const cache = new Map();
/** key -> Promise, so concurrent identical requests share one RMP lookup */
const inFlight = new Map();

function cacheGet(key) {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return undefined;
  }
  return entry.value;
}

function cacheSet(key, value, ttlMs) {
  if (cache.size >= MAX_CACHE_ENTRIES) {
    // Map iterates in insertion order, so this drops the oldest entry.
    cache.delete(cache.keys().next().value);
  }
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

// RMP uses -1 for "no would-take-again data".
function toPercentOrNull(value) {
  return typeof value === "number" && value >= 0 ? value : null;
}

async function lookup(name, course, equivalents) {
  const result = await getProfessorInsights(name, course || undefined, equivalents);
  if (!result) return { found: false };

  const top = result.matches[0];
  const p = result.professor;

  return {
    found: true,
    isExactNameMatch: isExactName(top, name),
    professor: {
      name: `${p.firstName} ${p.lastName}`,
      department: p.department,
      school: top.schoolName,
      avgRating: p.avgRating,
      avgDifficulty: p.avgDifficulty,
      numRatings: p.numRatings,
      wouldTakeAgainPercent: toPercentOrNull(p.wouldTakeAgainPercent),
      url: result.url,
    },
    commentSource: result.commentSource,
    note: result.note,
    comments: result.comments.map((c) => ({
      id: c.id,
      class: c.class,
      date: c.date,
      comment: c.comment,
      clarityRating: c.clarityRating,
      difficultyRating: c.difficultyRating,
      helpfulRating: c.helpfulRating,
      grade: c.grade || null,
      fromClass: c.fromClass,
      source: c.source,
      equivalentCourse: c.equivalentCourse ?? null,
    })),
  };
}

const app = express();
app.disable("x-powered-by");

app.use(
  cors({
    origin(origin, callback) {
      // Non-browser requests (curl, health checks) send no Origin header.
      callback(null, !origin || allowedOrigins.has(origin));
    },
    methods: ["GET"],
  })
);

app.get("/healthz", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/rmp/professor", async (req, res) => {
  const rawName = typeof req.query.name === "string" ? req.query.name : "";
  const rawCourse = typeof req.query.course === "string" ? req.query.course : "";
  const rawEquiv = typeof req.query.equiv === "string" ? req.query.equiv : "";
  const name = rawName.trim().replace(/\s+/g, " ");
  const course = rawCourse.trim();

  if (!name || name.length > NAME_MAX_LENGTH) {
    return res.status(400).json({ error: `"name" is required (max ${NAME_MAX_LENGTH} characters).` });
  }
  if (course && !COURSE_PATTERN.test(course)) {
    return res.status(400).json({ error: `"course" must look like "MSE 250".` });
  }

  // Comma-separated equivalent courses, e.g. "ENSC 220,ENSC 225". Sorted + de-duplicated
  // so the same set always produces the same cache key.
  const equivalents = [
    ...new Map(
      rawEquiv
        .split(",")
        .map((code) => code.trim().replace(/\s+/g, " "))
        .filter(Boolean)
        .map((code) => [normalizeCourse(code), code])
    ).values(),
  ].sort((a, b) => normalizeCourse(a).localeCompare(normalizeCourse(b)));
  if (equivalents.length > MAX_EQUIVALENTS || equivalents.some((code) => !COURSE_PATTERN.test(code))) {
    return res.status(400).json({
      error: `"equiv" must be up to ${MAX_EQUIVALENTS} comma-separated codes like "ENSC 220".`,
    });
  }

  const key = `${name.toLowerCase()}|${normalizeCourse(course)}|${equivalents.map(normalizeCourse).join(",")}`;
  const cached = cacheGet(key);
  if (cached) {
    res.set("Cache-Control", "public, max-age=3600");
    return res.json(cached);
  }

  try {
    let pending = inFlight.get(key);
    if (!pending) {
      pending = lookup(name, course, equivalents).finally(() => inFlight.delete(key));
      inFlight.set(key, pending);
    }
    const payload = await pending;
    cacheSet(key, payload, payload.found ? FOUND_TTL_MS : NOT_FOUND_TTL_MS);
    res.set("Cache-Control", "public, max-age=3600");
    return res.json(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[rmp] lookup failed for "${name}" (${course || "no course"}): ${message}`);
    return res.status(502).json({ error: "Could not reach RateMyProfessors." });
  }
});

app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.listen(PORT, () => {
  console.log(`RMP proxy listening on port ${PORT}`);
  console.log(`Allowed origins: ${[...allowedOrigins].join(", ")}`);
});
