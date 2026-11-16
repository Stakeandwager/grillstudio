/* ------------------------------------------------------------------ *
 * Creative evaluation — "did it work?", not "did it export?".
 *
 * Each criterion is scored 1–5 *with evidence*. A score without evidence
 * is rejected. The verdict only says the work achieves the intention
 * when the intention-critical criteria pass, however good the rest is.
 * ------------------------------------------------------------------ */

export const CRITERIA = [
  { id: "emotionalImpact", label: "Intended emotional impact", critical: true, question: "Does the audience feel what the intention says they should?" },
  { id: "narrativeCoherence", label: "Narrative coherence", critical: true, question: "Is the story clear and does each scene earn its place?" },
  { id: "characterContinuity", label: "Character continuity", critical: false, question: "Do characters look, sound and behave consistently?" },
  { id: "visualConsistency", label: "Visual consistency", critical: false, question: "Do style, colour and lighting hold together?" },
  { id: "performance", label: "Performance", critical: false, question: "Are performances (acted or animated) believable for the intention?" },
  { id: "sound", label: "Sound", critical: false, question: "Is dialogue clear and does sound support the feeling?" },
  { id: "pacing", label: "Pacing", critical: false, question: "Does time move at the speed the feeling needs?" },
  { id: "technical", label: "Technical delivery", critical: false, question: "Does it play, export and meet the delivery spec?" },
];

const PASS = 4;

export function createEvaluation({ subject, scores, evaluator, intentionSnapshot }, clock) {
  if (!subject || !String(subject).trim()) throw new Error("Say what is being evaluated (a cut, a scene, a render).");
  const problems = [];
  const entries = {};
  for (const c of CRITERIA) {
    const s = scores?.[c.id];
    if (!s || s.score == null || s.score === "") continue;
    const score = Number(s.score);
    if (!Number.isInteger(score) || score < 1 || score > 5) problems.push(`${c.label}: score must be 1–5.`);
    else if (!s.evidence || !String(s.evidence).trim()) problems.push(`${c.label}: a score needs evidence (what you saw or heard, and where).`);
    else entries[c.id] = { score, evidence: String(s.evidence).trim() };
  }
  if (problems.length) {
    const err = new Error(problems.join(" "));
    err.reasons = problems;
    throw err;
  }
  const missingCritical = CRITERIA.filter((c) => c.critical && !entries[c.id]);
  const failing = CRITERIA.filter((c) => entries[c.id] && entries[c.id].score < PASS);
  let verdict;
  if (missingCritical.length) verdict = "incomplete";
  else if (failing.some((c) => c.critical)) verdict = "misses-intention";
  else if (failing.length) verdict = "achieves-intention-with-issues";
  else verdict = "achieves-intention";
  const scored = Object.values(entries);
  return {
    id: clock.id("eval"),
    subject: String(subject).trim(),
    evaluator: evaluator || "filmmaker",
    at: clock.now(),
    scores: entries,
    average: scored.length ? +(scored.reduce((n, e) => n + e.score, 0) / scored.length).toFixed(2) : null,
    verdict,
    failing: failing.map((c) => c.id),
    missingCritical: missingCritical.map((c) => c.id),
    intentionSnapshot: intentionSnapshot || null,
  };
}

export const VERDICT_TEXT = {
  incomplete: "Incomplete — the intention-critical criteria have not been judged.",
  "misses-intention": "Misses the intention — a critical criterion is below the bar.",
  "achieves-intention-with-issues": "Achieves the intention, with issues worth correcting.",
  "achieves-intention": "Achieves the intention.",
};

/* Delivery is allowed for a clean pass or a pass with non-critical issues. */
export const deliverable = (evaluation) =>
  evaluation?.verdict === "achieves-intention" || evaluation?.verdict === "achieves-intention-with-issues";

export const addEvaluation = (project, input, clock) => {
  const ev = createEvaluation({ ...input, intentionSnapshot: { ...project.intention } }, clock);
  return { ...project, evaluations: [...project.evaluations, ev], updatedAt: clock.now() };
};
