/* ------------------------------------------------------------------ *
 * Shared project model — one story, many production methods.
 *
 * A project holds the creative intention and the story once. Live-action
 * and animation are *production modes* that read the same breakdown and
 * derive different requirements from it, so switching mode never means
 * rebuilding the story.
 * ------------------------------------------------------------------ */

export const SCHEMA_VERSION = 1;

export const PRODUCTION_MODES = {
  "live-action": { label: "Live action", summary: "Actors, locations, cameras, lights and sound on set." },
  animation: { label: "Animation", summary: "Designed characters and environments, rigs, virtual cameras, rendering." },
  hybrid: { label: "Hybrid", summary: "Live action combined with animated or generated elements." },
};

export const INTENTION_FIELDS = [
  { key: "filmmakerIntent", label: "What do you intend this film to do?", hint: "The purpose behind it, in your own words." },
  { key: "audienceFeeling", label: "What should the audience feel?", hint: "The reaction you want — and when." },
  { key: "storyCommunicates", label: "What does the story communicate?", hint: "The idea or truth the audience should leave with." },
  { key: "imagesAndSounds", label: "What images and sounds does it need?", hint: "Pictures, textures, music, silence." },
  { key: "productionMethod", label: "How could it be produced?", hint: "Shoot, animate, generate, combine — and with what." },
  { key: "constraints", label: "Constraints", hint: "Budget, time, equipment, people, rights." },
];

export const emptyIntention = () =>
  Object.fromEntries(INTENTION_FIELDS.map((f) => [f.key, ""]));

export const createProject = ({ title, mode = "live-action", owner = "local" } = {}, clock) => {
  if (!title || !String(title).trim()) throw new Error("A project needs a title.");
  if (!PRODUCTION_MODES[mode]) throw new Error(`Unknown production mode "${mode}".`);
  const at = clock.now();
  return {
    schemaVersion: SCHEMA_VERSION,
    id: clock.id("prj"),
    title: String(title).trim(),
    owner,
    mode,
    stage: "understand",
    stageLog: [],
    intention: emptyIntention(),
    story: { format: "screenplay", source: "" },
    breakdown: null,
    characterNotes: {},
    approval: { approved: false },
    evaluations: [],
    lessons: [],
    createdAt: at,
    updatedAt: at,
  };
};

export const updateIntention = (project, patch, clock) => {
  const allowed = new Set(INTENTION_FIELDS.map((f) => f.key));
  const clean = Object.fromEntries(Object.entries(patch).filter(([k, v]) => allowed.has(k) && typeof v === "string"));
  return { ...project, intention: { ...project.intention, ...clean }, updatedAt: clock.now() };
};

/* Changing the story invalidates an approved plan built on the old one. */
export const updateStory = (project, source, clock) => {
  if (source === project.story.source) return project;
  const wasApproved = project.approval?.approved;
  return {
    ...project,
    story: { ...project.story, source },
    approval: wasApproved ? { approved: false, revokedAt: clock.now(), reason: "Story changed after approval.", previous: project.approval } : project.approval,
    updatedAt: clock.now(),
  };
};

export const setMode = (project, mode, clock) => {
  if (!PRODUCTION_MODES[mode]) throw new Error(`Unknown production mode "${mode}".`);
  return { ...project, mode, updatedAt: clock.now() };
};

/* Continuity references the filmmaker writes per character. Keyed by
   normalised name so they survive re-analysis of the story. */
export const setCharacterNote = (project, name, note, clock) => ({
  ...project,
  characterNotes: { ...project.characterNotes, [name.toUpperCase()]: { ...project.characterNotes?.[name.toUpperCase()], ...note } },
  updatedAt: clock.now(),
});

export const validateProject = (p) => {
  const errors = [];
  if (!p || typeof p !== "object") return ["Not a project object."];
  if (typeof p.id !== "string") errors.push("Missing id.");
  if (typeof p.title !== "string" || !p.title.trim()) errors.push("Missing title.");
  if (!PRODUCTION_MODES[p.mode]) errors.push(`Invalid mode "${p.mode}".`);
  if (typeof p.stage !== "string") errors.push("Missing stage.");
  if (!p.intention || typeof p.intention !== "object") errors.push("Missing intention.");
  if (!p.story || typeof p.story.source !== "string") errors.push("Missing story.");
  if (!Array.isArray(p.evaluations)) errors.push("evaluations must be a list.");
  if (!Array.isArray(p.lessons)) errors.push("lessons must be a list.");
  if (typeof p.schemaVersion !== "number" || p.schemaVersion > SCHEMA_VERSION)
    errors.push(`Unsupported schema version ${p.schemaVersion}.`);
  return errors;
};
