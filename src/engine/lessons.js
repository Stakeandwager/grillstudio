/* ------------------------------------------------------------------ *
 * Correction memory — persistent, retrievable lessons.
 *
 * This is memory and retrieval, NOT model training. A correction is
 * stored with what was recommended, what replaced it, what was wrong and
 * the context it applies to. Retrieval is lexical (token overlap with a
 * light stemmer) and explains *why* each lesson matched. A semantic
 * (embedding) retriever can replace `scoreLesson` behind the same API.
 * ------------------------------------------------------------------ */

export const LESSON_AREAS = ["story", "character", "scene", "shot", "visual-style", "sound", "performance", "pacing", "production"];

const STOP = new Set("a an the and or but of to in on at for with is are was were be been it this that these those as by from not no so too very can should would could will just than then there their they he she his her its into over under about".split(" "));

export const tokenize = (text) =>
  String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .map((w) => w.replace(/^['-]+|['-]+$/g, ""))
    .filter((w) => w.length > 2 && !STOP.has(w))
    .map((w) => w.replace(/(ings|ing|ies|ied|ed|es|s)$/, (m) => (m === "ies" || m === "ied" ? "y" : "")) || w);

export function createLesson(input, context, clock) {
  const { area, original, correction, whatWasWrong, lesson, tags = [], scope = "project" } = input;
  const reasons = [];
  if (!LESSON_AREAS.includes(area)) reasons.push(`Pick an area: ${LESSON_AREAS.join(", ")}.`);
  if (!String(correction || "").trim()) reasons.push("Write the correction (what it should be).");
  if (!String(lesson || "").trim()) reasons.push("Write the lesson to remember next time.");
  if (reasons.length) {
    const err = new Error(reasons.join(" "));
    err.reasons = reasons;
    throw err;
  }
  return {
    id: clock.id("lsn"),
    at: clock.now(),
    area,
    scope: scope === "global" ? "global" : "project",
    original: String(original || "").trim(),
    correction: String(correction).trim(),
    whatWasWrong: String(whatWasWrong || "").trim(),
    lesson: String(lesson).trim(),
    tags: tags.map((t) => String(t).trim().toLowerCase()).filter(Boolean),
    context: {
      projectId: context?.projectId || null,
      projectTitle: context?.projectTitle || null,
      mode: context?.mode || null,
      stage: context?.stage || null,
      audienceFeeling: context?.audienceFeeling || null,
    },
    approved: true,
    uses: 0,
  };
}

export const recordCorrection = (project, input, clock) => {
  const lesson = createLesson(input, { projectId: project.id, projectTitle: project.title, mode: project.mode, stage: project.stage, audienceFeeling: project.intention?.audienceFeeling }, clock);
  return { project: { ...project, lessons: [...project.lessons, lesson], updatedAt: clock.now() }, lesson };
};

export function scoreLesson(lesson, { query = "", mode = null, area = null, tags = [] } = {}) {
  const q = new Set(tokenize(query));
  const body = new Set(tokenize([lesson.lesson, lesson.correction, lesson.whatWasWrong, lesson.original, lesson.tags.join(" ")].join(" ")));
  const matched = [...q].filter((t) => body.has(t));
  let score = q.size ? matched.length / q.size : 0;
  const why = [];
  if (matched.length) why.push(`shares words: ${matched.join(", ")}`);
  const tagHits = tags.map((t) => t.toLowerCase()).filter((t) => lesson.tags.includes(t));
  if (tagHits.length) {
    score += 0.3 * tagHits.length;
    why.push(`tagged ${tagHits.join(", ")}`);
  }
  if (area && lesson.area === area) {
    score += 0.2;
    why.push(`same area (${area})`);
  }
  if (mode && lesson.context.mode === mode && score > 0) {
    score += 0.1;
    why.push(`same production mode (${mode})`);
  }
  return { score: +score.toFixed(3), why };
}

export const retrieveLessons = (lessons, query, { limit = 5, minScore = 0.25 } = {}) =>
  lessons
    .filter((l) => l.approved)
    .map((l) => ({ lesson: l, ...scoreLesson(l, query) }))
    .filter((r) => r.score >= minScore)
    .sort((a, b) => b.score - a.score || (a.lesson.at < b.lesson.at ? 1 : -1))
    .slice(0, limit);

/* The query a scene generates: what's in it and how it should feel. */
export const sceneQuery = (scene, project) => ({
  query: [scene.heading, scene.timeOfDay, scene.location, scene.present?.join(" "), project?.intention?.audienceFeeling].filter(Boolean).join(" "),
  mode: project?.mode || null,
});
