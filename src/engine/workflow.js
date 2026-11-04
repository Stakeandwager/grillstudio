/* ------------------------------------------------------------------ *
 * AFEP workflow — Understand → Interpret → Plan → Approve → Produce →
 * Observe → Evaluate → Correct → Verify → Deliver.
 *
 * Each forward move is guarded by a gate that inspects the project and
 * returns human-readable reasons when the move is not yet justified.
 * Going backwards is always allowed, but moving back before Approve
 * revokes the approval: a changed plan must be approved again.
 * ------------------------------------------------------------------ */

export const STAGES = [
  { id: "understand", label: "Understand", purpose: "Capture what the filmmaker intends and what the audience should feel." },
  { id: "interpret", label: "Interpret", purpose: "Read the story or material and decide what it must communicate." },
  { id: "plan", label: "Plan", purpose: "Break the story into scenes, characters, places and needs." },
  { id: "approve", label: "Approve", purpose: "The filmmaker explicitly signs off the plan before anything is produced." },
  { id: "produce", label: "Produce", purpose: "Shoot, animate, generate or assemble the material." },
  { id: "observe", label: "Observe", purpose: "Look at what was actually produced, with sources." },
  { id: "evaluate", label: "Evaluate", purpose: "Judge the result against the intention — not just whether it exported." },
  { id: "correct", label: "Correct", purpose: "Record what was wrong and the lesson learned, then fix it." },
  { id: "verify", label: "Verify", purpose: "Confirm the corrected work now achieves the intention." },
  { id: "deliver", label: "Deliver", purpose: "Hand over the finished, verified work." },
];

export const STAGE_IDS = STAGES.map((s) => s.id);
export const stageIndex = (id) => STAGE_IDS.indexOf(id);

/* Which stages may follow which. Correct loops back; Verify can fail. */
export const FORWARD = {
  understand: ["interpret"],
  interpret: ["plan"],
  plan: ["approve"],
  approve: ["produce"],
  produce: ["observe"],
  observe: ["evaluate"],
  evaluate: ["correct", "verify"],
  correct: ["plan", "produce"],
  verify: ["deliver", "correct"],
  deliver: [],
};

const filled = (s) => typeof s === "string" && s.trim().length > 0;

/* Gates: return [] when the move is justified, else a list of reasons. */
const GATES = {
  interpret: (p) => {
    const r = [];
    if (!filled(p.intention?.filmmakerIntent)) r.push("Describe what you intend this film to do.");
    if (!filled(p.intention?.audienceFeeling)) r.push("Describe what the audience should feel.");
    return r;
  },
  plan: (p) => (filled(p.story?.source) ? [] : ["Add a story, treatment or screenplay to interpret."]),
  approve: (p) => (p.breakdown?.scenes?.length ? [] : ["Analyse the story into at least one scene first."]),
  produce: (p) => (p.approval?.approved ? [] : ["The plan has not been approved by the filmmaker."]),
  observe: () => [],
  evaluate: () => [],
  correct: (p) => (p.evaluations?.length ? [] : ["Record an evaluation before correcting."]),
  verify: (p) => (p.evaluations?.length ? [] : ["Record an evaluation before verifying."]),
  deliver: (p) => {
    const last = p.evaluations?.[p.evaluations.length - 1];
    if (!last) return ["No evaluation has been recorded."];
    /* Non-critical issues are reported but don't block; critical misses do. */
    return last.verdict === "achieves-intention" || last.verdict === "achieves-intention-with-issues"
      ? []
      : ["The latest evaluation does not show the work achieving the intention."];
  },
};

export const checkTransition = (project, to) => {
  const from = project.stage;
  if (!STAGE_IDS.includes(to)) return { ok: false, reasons: [`Unknown stage "${to}".`] };
  if (to === from) return { ok: false, reasons: ["Already at this stage."] };
  const backwards = stageIndex(to) < stageIndex(from) && !FORWARD[from].includes(to);
  if (backwards) return { ok: true, reasons: [], backwards: true };
  if (!FORWARD[from].includes(to))
    return { ok: false, reasons: [`Cannot go from ${from} to ${to}; next allowed: ${FORWARD[from].join(", ") || "none"}.`] };
  const reasons = GATES[to] ? GATES[to](project) : [];
  return { ok: reasons.length === 0, reasons, backwards: false };
};

export const nextStages = (project) =>
  FORWARD[project.stage].map((to) => ({ to, ...checkTransition(project, to) }));

/* Pure: returns a new project or throws with the gate reasons. */
export const transition = (project, to, clock, note = "") => {
  const check = checkTransition(project, to);
  if (!check.ok) {
    const err = new Error(check.reasons.join(" "));
    err.reasons = check.reasons;
    throw err;
  }
  let approval = project.approval;
  if (check.backwards && stageIndex(to) <= stageIndex("approve") && approval?.approved) {
    approval = { approved: false, revokedAt: clock.now(), previous: approval };
  }
  return {
    ...project,
    stage: to,
    approval,
    stageLog: [...(project.stageLog || []), { from: project.stage, to, at: clock.now(), note }],
    updatedAt: clock.now(),
  };
};

export const approvePlan = (project, { by, note = "" }, clock) => {
  if (project.stage !== "approve") throw new Error("Plans can only be approved at the Approve stage.");
  if (!filled(by)) throw new Error("Approval needs the name of the person approving.");
  return {
    ...project,
    approval: { approved: true, by: by.trim(), note, at: clock.now(), planScenes: project.breakdown?.scenes?.length || 0 },
    updatedAt: clock.now(),
  };
};
