import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  createSequence,
  createProject,
  updateIntention,
  updateStory,
  setMode,
  setCharacterNote,
  validateProject,
  checkTransition,
  transition,
  approvePlan,
  nextStages,
  analyseProject,
  buildBreakdown,
  addEvaluation,
  createEvaluation,
} from "../../src/engine/index.js";

const fixture = readFileSync(new URL("../fixtures/rain-walk.fountain", import.meta.url), "utf8");

const fresh = () => {
  const clock = createSequence();
  return { clock, p: createProject({ title: "The Long Way Home", mode: "animation" }, clock) };
};

const goodScores = {
  emotionalImpact: { score: 4, evidence: "Test audience went quiet at the rooftop scene (02:10)." },
  narrativeCoherence: { score: 5, evidence: "All three viewers could retell the story." },
};

describe("project model", () => {
  it("creates a valid project at the Understand stage", () => {
    const { p } = fresh();
    expect(validateProject(p)).toEqual([]);
    expect(p.stage).toBe("understand");
    expect(p.approval.approved).toBe(false);
  });

  it("rejects missing titles and unknown modes", () => {
    const clock = createSequence();
    expect(() => createProject({ title: " " }, clock)).toThrow(/title/);
    expect(() => createProject({ title: "x", mode: "claymation-ish" }, clock)).toThrow(/mode/);
  });

  it("only accepts known intention fields", () => {
    const { p, clock } = fresh();
    const q = updateIntention(p, { filmmakerIntent: "Show loneliness ending", hack: "x", audienceFeeling: 5 }, clock);
    expect(q.intention.filmmakerIntent).toBe("Show loneliness ending");
    expect(q.intention.hack).toBeUndefined();
    expect(q.intention.audienceFeeling).toBe("");
  });

  it("switching mode keeps the story and breakdown (shared model)", () => {
    const { p, clock } = fresh();
    const a = analyseProject(updateStory(p, fixture, clock), clock);
    const b = setMode(a, "live-action", clock);
    expect(b.story.source).toBe(a.story.source);
    expect(b.breakdown).toBe(a.breakdown);
    expect(b.breakdown.scenes[0].needs["live-action"].length).toBeGreaterThan(0);
    expect(b.breakdown.scenes[0].needs.animation.length).toBeGreaterThan(0);
  });
});

describe("workflow gates", () => {
  it("blocks Interpret until intention and audience feeling exist", () => {
    const { p, clock } = fresh();
    const c = checkTransition(p, "interpret");
    expect(c.ok).toBe(false);
    expect(c.reasons).toHaveLength(2);
    const q = updateIntention(p, { filmmakerIntent: "a", audienceFeeling: "b" }, clock);
    expect(checkTransition(q, "interpret").ok).toBe(true);
  });

  it("refuses to skip stages", () => {
    const { p } = fresh();
    expect(checkTransition(p, "produce").ok).toBe(false);
    expect(checkTransition(p, "nonsense").ok).toBe(false);
  });

  it("walks the full loop and requires explicit approval before producing", () => {
    const { p: p0, clock } = fresh();
    let p = updateIntention(p0, { filmmakerIntent: "A stranger finds a place to belong", audienceFeeling: "Loneliness easing into warmth" }, clock);
    p = transition(p, "interpret", clock);
    expect(() => transition(p, "plan", clock)).toThrow(/story/);
    p = updateStory(p, fixture, clock);
    p = transition(p, "plan", clock);
    expect(() => transition(p, "approve", clock)).toThrow(/scene/);
    p = analyseProject(p, clock);
    p = transition(p, "approve", clock);
    expect(() => transition(p, "produce", clock)).toThrow(/not been approved/);
    expect(() => approvePlan(p, { by: "" }, clock)).toThrow(/name/);
    p = approvePlan(p, { by: "StakeandWager", note: "Go" }, clock);
    expect(p.approval).toMatchObject({ approved: true, by: "StakeandWager", planScenes: 5 });
    p = transition(p, "produce", clock);
    p = transition(p, "observe", clock);
    p = transition(p, "evaluate", clock);
    expect(nextStages(p).map((n) => n.to)).toEqual(["correct", "verify"]);
    expect(nextStages(p).every((n) => !n.ok)).toBe(true);
    p = addEvaluation(p, { subject: "Rough cut v1", scores: { ...goodScores, emotionalImpact: { score: 2, evidence: "Nobody reacted to the rooftop." } } }, clock);
    expect(p.evaluations[0].verdict).toBe("misses-intention");
    p = transition(p, "verify", clock);
    expect(checkTransition(p, "deliver").ok).toBe(false);
    p = transition(p, "correct", clock);
    p = transition(p, "produce", clock);
    p = transition(p, "observe", clock);
    p = transition(p, "evaluate", clock);
    p = addEvaluation(p, { subject: "Rough cut v2", scores: goodScores }, clock);
    p = transition(p, "verify", clock);
    p = transition(p, "deliver", clock);
    expect(p.stage).toBe("deliver");
    expect(p.stageLog.map((l) => l.to).join(">")).toBe("interpret>plan>approve>produce>observe>evaluate>verify>correct>produce>observe>evaluate>verify>deliver");
  });

  it("revokes approval when going back to Plan", () => {
    const { p: p0, clock } = fresh();
    let p = { ...analyseProject(updateStory(p0, fixture, clock), clock), stage: "approve" };
    p = approvePlan(p, { by: "me" }, clock);
    p = transition(p, "produce", clock);
    const back = transition(p, "plan", clock);
    expect(back.approval.approved).toBe(false);
    expect(back.approval.previous.by).toBe("me");
  });

  it("revokes approval when the story changes", () => {
    const { p: p0, clock } = fresh();
    let p = { ...analyseProject(updateStory(p0, fixture, clock), clock), stage: "approve" };
    p = approvePlan(p, { by: "me" }, clock);
    p = updateStory(p, fixture + "\nINT. NEW - DAY\n\nNew.", clock);
    expect(p.approval.approved).toBe(false);
    expect(p.approval.reason).toMatch(/Story changed/);
  });
});

describe("breakdown", () => {
  const b = buildBreakdown(fixture);
  it("explains every requirement", () => {
    for (const s of b.scenes) for (const mode of ["live-action", "animation"]) for (const n of s.needs[mode]) expect(n.why).toBeTruthy();
  });
  it("derives mode-specific needs from the same scene", () => {
    const night = b.scenes[0];
    expect(night.needs["live-action"].map((n) => n.item)).toContain("Night exterior lighting");
    expect(night.needs.animation.some((n) => n.kind === "lip-sync")).toBe(true);
    expect(b.totals.animation.characterAssets).toBe(2);
    expect(b.totals["live-action"].nightScenes).toBe(2);
  });
  it("flags missing continuity references until notes exist", () => {
    expect(b.continuity.filter((c) => c.type === "missing-reference").map((c) => c.character).sort()).toEqual(["MAYA", "TUNDE"]);
    const clock = createSequence();
    let p = createProject({ title: "x" }, clock);
    p = setCharacterNote(p, "maya", { look: "Soaked green coat, short hair" }, clock);
    const b2 = buildBreakdown(fixture, { characterNotes: p.characterNotes });
    expect(b2.continuity.filter((c) => c.type === "missing-reference").map((c) => c.character)).toEqual(["TUNDE"]);
  });
});

describe("evaluation", () => {
  const clock = createSequence();
  it("requires evidence for every score", () => {
    expect(() => createEvaluation({ subject: "cut", scores: { pacing: { score: 3, evidence: "" } } }, clock)).toThrow(/evidence/);
  });
  it("rejects out-of-range scores", () => {
    expect(() => createEvaluation({ subject: "cut", scores: { pacing: { score: 7, evidence: "x" } } }, clock)).toThrow(/1–5/);
  });
  it("a technically perfect export without intention judgement is incomplete", () => {
    const e = createEvaluation({ subject: "export", scores: { technical: { score: 5, evidence: "Plays in all players" } } }, clock);
    expect(e.verdict).toBe("incomplete");
  });
  it("reports non-critical issues honestly", () => {
    const e = createEvaluation({ subject: "cut", scores: { ...goodScores, sound: { score: 2, evidence: "Hiss under dialogue at 00:40" } } }, clock);
    expect(e.verdict).toBe("achieves-intention-with-issues");
    expect(e.failing).toEqual(["sound"]);
  });
});
