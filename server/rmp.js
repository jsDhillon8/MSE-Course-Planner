// RateMyProfessors lookup, ported from the "Scraper Test.js" reference script.
// Talks to RMP's (unofficial) GraphQL endpoint. Uses Node 18+ built-in fetch.

const RMP_URL = "https://www.ratemyprofessors.com/graphql";

const MIN_COMMENTS = 5; // minimum number of comments to show; gaps are filled with general ones
const COMMENT_LIMIT = 10; // how many to pull per request
const MAX_EQUIVALENT_FETCHES = 3; // cap on extra per-course requests for equivalents

const HEADERS = {
  "Content-Type": "application/json",
  // Public token the RMP website itself sends ("test:test")
  Authorization: "Basic dGVzdDp0ZXN0",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  Referer: "https://www.ratemyprofessors.com/",
};

// RMP school IDs are just base64("School-<legacyId>")
const schoolIdFromLegacy = (legacyId) =>
  Buffer.from(`School-${legacyId}`).toString("base64");

// Primary campuses, checked first without any school lookup
const PRIMARY_CAMPUSES = [
  { legacyId: 4267, name: "Simon Fraser University - Surrey" },
  { legacyId: 1482, name: "Simon Fraser University (Burnaby)" },
].map((c) => ({ ...c, id: schoolIdFromLegacy(c.legacyId) }));

// "MSE 250" -> "MSE250" (RMP stores course names without spaces)
export const normalizeCourse = (s) => (s ?? "").replace(/\s+/g, "").toUpperCase();

const rmpProfessorUrl = (legacyId) =>
  `https://www.ratemyprofessors.com/professor/${legacyId}`;

async function gql(query, variables) {
  const res = await fetch(RMP_URL, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  const json = await res.json();
  if (json.errors) throw new Error(`GraphQL error: ${JSON.stringify(json.errors)}`);
  return json.data;
}

// ── Fallback: find every SFU campus via school search ─────────────────────
async function findSfuSchools() {
  const query = `
    query SchoolSearch($query: SchoolSearchQuery!) {
      newSearch {
        schools(query: $query) {
          edges { node { id legacyId name city state } }
        }
      }
    }`;
  const data = await gql(query, { query: { text: "Simon Fraser University" } });
  return data.newSearch.schools.edges
    .map((e) => e.node)
    .filter((s) => s.name.trim().toLowerCase().startsWith("simon fraser university"))
    .map((s) => ({ id: s.id, legacyId: s.legacyId, name: s.name.trim() }));
}

// ── Search professors at one school ───────────────────────────────────────
async function searchTeachers(name, school) {
  const query = `
    query TeacherSearch($query: TeacherSearchQuery!) {
      newSearch {
        teachers(query: $query, first: 5) {
          edges {
            node {
              id legacyId firstName lastName department
              avgRating avgDifficulty numRatings wouldTakeAgainPercent
            }
          }
        }
      }
    }`;
  const data = await gql(query, { query: { text: name, schoolID: school.id } });
  return data.newSearch.teachers.edges.map((e) => ({
    ...e.node,
    schoolName: school.name,
  }));
}

// Search several campuses in parallel, merge, and de-duplicate
async function searchCampuses(name, schools) {
  const results = await Promise.all(schools.map((s) => searchTeachers(name, s)));
  const seen = new Set();
  return results.flat().filter((t) => {
    if (seen.has(t.legacyId)) return false;
    seen.add(t.legacyId);
    return true;
  });
}

// Primary campuses first; fall back to the full SFU campus list if nothing found
// (results whose name doesn't match don't count as found, so they also trigger the fallback)
async function findTeachers(name, courseCodes = []) {
  const allowedDepts = departmentKeywordsFor(courseCodes);
  const keep = (teachers) =>
    teachers.filter(
      (t) =>
        nameMatches(t, name) &&
        // Exact names are trusted (profs teach outside their home department);
        // possible matches must also come from a related department.
        (isExactName(t, name) || departmentMatches(t, allowedDepts))
    );

  const found = keep(await searchCampuses(name, PRIMARY_CAMPUSES));
  if (found.length > 0) return found;

  const primaryIds = new Set(PRIMARY_CAMPUSES.map((c) => c.legacyId));
  const others = (await findSfuSchools()).filter((s) => !primaryIds.has(Number(s.legacyId)));
  if (others.length === 0) return [];
  return keep(await searchCampuses(name, others));
}

// "José  García-Lopez" -> "jose garcia lopez"
const normalizeName = (s) =>
  (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

// Common English nickname <-> given-name pairs that a prefix check can't catch.
const NICKNAMES = [
  ["mike", "michael"], ["mick", "michael"], ["bill", "william"], ["will", "william"],
  ["liam", "william"], ["bob", "robert"], ["rob", "robert"], ["bobby", "robert"],
  ["jim", "james"], ["jimmy", "james"], ["dick", "richard"], ["rick", "richard"],
  ["rich", "richard"], ["ted", "edward"], ["ed", "edward"], ["ned", "edward"],
  ["tony", "anthony"], ["peggy", "margaret"], ["maggie", "margaret"], ["meg", "margaret"],
  ["kate", "katherine"], ["katie", "katherine"], ["kathy", "katherine"], ["liz", "elizabeth"],
  ["beth", "elizabeth"], ["betty", "elizabeth"], ["jack", "john"], ["johnny", "john"],
  ["larry", "lawrence"], ["harry", "henry"], ["hank", "henry"], ["chuck", "charles"],
  ["charlie", "charles"], ["sandy", "alexander"], ["alex", "alexander"], ["sasha", "alexander"],
  ["peg", "margaret"], ["sue", "susan"], ["nancy", "anne"], ["dave", "david"],
  ["steve", "stephen"], ["steve", "steven"], ["joe", "joseph"], ["greg", "gregory"],
];
const nicknameKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
const NICKNAME_PAIRS = new Set(NICKNAMES.map(([a, b]) => nicknameKey(a, b)));

// Two single first-name tokens could be the same person when they are:
// equal; a 3+ letter prefix of the other ("chris"/"christopher"); a known nickname
// pair ("mike"/"michael"); or, for the leading token on both sides only, an initial
// ("j"/"john"). Initials elsewhere are usually middle initials and too ambiguous.
function firstTokensCompatible(a, b, bothLeading) {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (long.startsWith(short) && (short.length >= 3 || (short.length === 1 && bothLeading))) {
    return true;
  }
  return NICKNAME_PAIRS.has(nicknameKey(a, b));
}

/** True when the RMP teacher's "first last" equals the queried name (ignoring case/accents). */
export function isExactName(teacher, query) {
  return normalizeName(`${teacher.firstName} ${teacher.lastName}`) === normalizeName(query);
}

// RMP's search is fuzzy and returns unrelated people when nobody matches
// (e.g. "Zhida Li" -> "Wei Becky Lin"). A result is kept only when:
//   1. its last name matches the end of the queried name, and
//   2. some first-name token on each side is compatible (see above), so
//      "Wei Lin" matches "Wei Becky Lin" but "John Chen" never matches "Mary Chen".
// A query with no first name (surname only) skips check 2.
function nameMatches(teacher, query) {
  const last = normalizeName(teacher.lastName);
  const q = normalizeName(query);
  if (!last || !q) return false;
  if (q !== last && !q.endsWith(` ${last}`)) return false;

  const queryFirst = q.slice(0, q.length - last.length).trim().split(" ").filter(Boolean);
  if (queryFirst.length === 0) return true;
  const rmpFirst = normalizeName(teacher.firstName).split(" ").filter(Boolean);
  return queryFirst.some((qf, qi) =>
    rmpFirst.some((rf, ri) => firstTokensCompatible(qf, rf, qi === 0 && ri === 0))
  );
}

// SFU course prefix -> words expected in a related RMP department name.
// A possible (non-exact) name match from an unrelated department is dropped, e.g.
// "Agnes McDonald" (Sociology) is not a plausible "Peter McDonald" for MATH 251.
// Prefixes not listed here skip the department check.
const RELATED_DEPARTMENTS = {
  MATH: ["math", "statistic", "actuarial"],
  MACM: ["math", "computer", "computing"],
  STAT: ["statistic", "math", "actuarial"],
  MSE: ["engineering", "mechatronic", "electrical", "mechanical", "applied science", "computer", "physics"],
  ENSC: ["engineering", "electrical", "mechatronic", "computer", "applied science", "physics"],
  SEE: ["engineering", "sustainable", "energy", "environment", "applied science"],
  CMPT: ["computer", "computing", "engineering", "software", "information"],
  PHYS: ["physics", "astronomy", "engineering"],
  CHEM: ["chemistry", "biochemistry"],
  BUS: ["business", "commerce", "accounting", "finance", "management", "marketing", "economics"],
  BUEC: ["business", "economics", "finance"],
  ECON: ["economics", "business"],
};

function departmentKeywordsFor(courseCodes) {
  const keywords = new Set();
  for (const code of courseCodes) {
    const prefix = (code.match(/^[A-Za-z]+/)?.[0] ?? "").toUpperCase();
    for (const word of RELATED_DEPARTMENTS[prefix] ?? []) keywords.add(word);
  }
  return keywords;
}

// No known course department, or RMP lists no department: can't judge, so keep it.
function departmentMatches(teacher, keywords) {
  if (keywords.size === 0) return true;
  const dept = normalizeName(teacher.department);
  if (!dept) return true;
  return [...keywords].some((word) => dept.includes(word));
}

// Exact full-name matches first, then most ratings
function rank(teachers, query) {
  return [...teachers].sort(
    (a, b) =>
      Number(isExactName(b, query)) - Number(isExactName(a, query)) || b.numRatings - a.numRatings
  );
}

// ── Professor profile + the list of courses people have rated them for ────
async function getTeacherProfile(teacherId) {
  const query = `
    query TeacherProfile($id: ID!) {
      node(id: $id) {
        ... on Teacher {
          legacyId firstName lastName department
          avgRating avgDifficulty numRatings wouldTakeAgainPercent
          courseCodes { courseName courseCount }
        }
      }
    }`;
  const data = await gql(query, { id: teacherId });
  return data.node;
}

// ── Comments, optionally filtered to one course (e.g. "MSE250") ───────────
async function getComments(teacherId, courseFilter, limit) {
  const query = `
    query TeacherComments($id: ID!, $first: Int!, $courseFilter: String) {
      node(id: $id) {
        ... on Teacher {
          ratings(first: $first, courseFilter: $courseFilter) {
            edges {
              node {
                id class date comment
                helpfulRating clarityRating difficultyRating
                wouldTakeAgain grade
              }
            }
          }
        }
      }
    }`;
  const data = await gql(query, {
    id: teacherId,
    first: limit,
    courseFilter: courseFilter ?? null,
  });
  // Skip star-only ratings with no written comment
  return data.node.ratings.edges
    .map((e) => e.node)
    .filter((r) => r.comment && r.comment.trim().length > 0);
}

// ── Main logic ────────────────────────────────────────────────────────────
// Returns null when no SFU professor matches `name`.
// `equivalentCodes` (e.g. ["ENSC 220"]) are courses SFU lists as equivalent to
// `courseCode`; their comments are preferred over general ones.
export async function getProfessorInsights(name, courseCode, equivalentCodes = []) {
  const found = await findTeachers(name, [courseCode, ...equivalentCodes].filter(Boolean));
  if (found.length === 0) return null;

  const teachers = rank(found, name);
  const top = teachers[0];
  const profile = await getTeacherProfile(top.id);

  // Match the selected course against the courses this professor has ratings for
  const wanted = normalizeCourse(courseCode);
  const matchedCourse = wanted
    ? profile.courseCodes.find((c) => normalizeCourse(c.courseName) === wanted)
    : null;

  // 1. Pull every available comment for the selected class
  let classComments = [];
  let filterError = null;

  if (matchedCourse) {
    try {
      classComments = (await getComments(top.id, matchedCourse.courseName, COMMENT_LIMIT)).map(
        (c) => ({ ...c, fromClass: true, source: "class", equivalentCourse: null })
      );
    } catch (err) {
      filterError = err;
    }
  }

  const included = new Set(classComments.map((c) => c.id));
  let comments = classComments;

  // 2. Not enough for the class: prefer comments from equivalent courses this
  //    professor actually has ratings for (no request for courses they never taught).
  let equivComments = [];
  if (comments.length < MIN_COMMENTS && equivalentCodes.length > 0) {
    const wantedEquivs = new Set(
      equivalentCodes.map(normalizeCourse).filter((code) => code && code !== wanted)
    );
    const matchedEquivs = profile.courseCodes
      .filter((c) => wantedEquivs.has(normalizeCourse(c.courseName)))
      .slice(0, MAX_EQUIVALENT_FETCHES);

    const perCourse = await Promise.all(
      matchedEquivs.map((c) =>
        getComments(top.id, c.courseName, COMMENT_LIMIT)
          .then((list) => list.map((r) => ({ ...r, equivalentCourse: c.courseName })))
          .catch(() => [])
      )
    );

    const needed = MIN_COMMENTS - comments.length;
    equivComments = perCourse
      .flat()
      .filter((c, i, all) => !included.has(c.id) && all.findIndex((o) => o.id === c.id) === i)
      .slice(0, needed)
      .map((c) => ({ ...c, fromClass: false, source: "equivalent" }));
    equivComments.forEach((c) => included.add(c.id));
    comments = [...comments, ...equivComments];
  }

  // 3. Still short: fill the remaining slots with general comments,
  //    skipping any already included.
  let generalComments = [];
  if (comments.length < MIN_COMMENTS) {
    const needed = MIN_COMMENTS - comments.length;
    const general = await getComments(top.id, null, COMMENT_LIMIT + comments.length);
    generalComments = general
      .filter((c) => !included.has(c.id))
      .slice(0, needed)
      .map((c) => ({ ...c, fromClass: false, source: "general", equivalentCourse: null }));
    comments = [...comments, ...generalComments];
  }

  const classCount = classComments.length;
  const equivCount = equivComments.length;
  const generalCount = generalComments.length;

  let source;
  if (classCount > 0) source = equivCount + generalCount > 0 ? "mixed" : "class";
  else if (equivCount > 0) source = "equivalent";
  else source = "general";

  let note = "";
  if (filterError) {
    note = `Course filter failed (${filterError.message}); showing other comments.`;
  } else if (wanted && classCount < MIN_COMMENTS) {
    const lead =
      classCount === 0
        ? `No ratings for ${courseCode} yet`
        : `Only ${classCount} comment(s) for ${courseCode}`;
    const parts = [];
    if (equivCount > 0) parts.push(`${equivCount} from equivalent courses`);
    if (generalCount > 0) parts.push(`${generalCount} general`);
    note = parts.length > 0 ? `${lead}; showing ${parts.join(" and ")}.` : `${lead}.`;
  }

  return {
    matches: teachers,
    professor: profile,
    url: rmpProfessorUrl(profile.legacyId),
    course: courseCode ?? null,
    commentSource: source, // "class" | "mixed" | "equivalent" | "general"
    note,
    comments, // each has source: "class" | "equivalent" | "general" (+ fromClass)
  };
}
