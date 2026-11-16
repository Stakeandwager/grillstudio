/* ------------------------------------------------------------------ *
 * Production breakdown — one parsed story, requirements per mode.
 *
 * Every requirement says *why* it exists and which scene/source lines it
 * came from. Live-action and animation needs are always both computed;
 * the project mode only decides which the UI leads with. That is what
 * lets a filmmaker switch production method without re-analysing.
 * ------------------------------------------------------------------ */

import { parseScreenplay } from "./screenplay.js";
import { hashString } from "./history.js";

const isNight = (t) => /NIGHT|EVENING|DUSK|MIDNIGHT/.test(t || "");
const isGolden = (t) => /SUNSET|SUNRISE|DAWN|MAGIC HOUR|GOLDEN/.test(t || "");

const liveActionNeeds = (s) => {
  const needs = [];
  if (s.location)
    needs.push({ kind: "location", item: s.location, why: `${s.intExt || "Unspecified"} location named in the scene heading.` });
  for (const c of s.present) needs.push({ kind: "cast", item: c, why: s.speakers.includes(c) ? "Speaks in this scene." : "Named in the action." });
  if (s.dialogueCount) needs.push({ kind: "sound", item: "Sync dialogue recording", why: `${s.dialogueCount} dialogue line(s).` });
  if (isNight(s.timeOfDay))
    needs.push({ kind: "lighting", item: s.intExt === "EXT" ? "Night exterior lighting" : "Night interior lighting", why: `Time of day is ${s.timeOfDay}.` });
  if (isGolden(s.timeOfDay)) needs.push({ kind: "schedule", item: "Short natural-light window", why: `${s.timeOfDay} light only lasts a short time.` });
  if (s.intExt === "EXT") needs.push({ kind: "logistics", item: "Exterior: check permission, weather and ambient noise", why: "Exterior scene." });
  for (const w of s.callouts) needs.push({ kind: "callout", item: w, why: "Capitalised in the action — usually a sound, prop or effect to plan for. Confirm." });
  return needs;
};

const animationNeeds = (s) => {
  const needs = [];
  if (s.location) needs.push({ kind: "environment", item: s.location, why: "Environment to design, build or reuse." });
  for (const c of s.present)
    needs.push({ kind: "character-asset", item: c, why: "Character model/rig must appear here and stay on-model." });
  if (s.dialogueCount)
    needs.push({ kind: "lip-sync", item: `Facial animation + lip sync (${s.speakers.join(", ")})`, why: `${s.dialogueCount} dialogue line(s) need recorded voice and mouth shapes.` });
  if (s.timeOfDay) needs.push({ kind: "lighting", item: `${s.timeOfDay.toLowerCase()} lighting setup`, why: "Virtual lighting must match the time of day." });
  needs.push({ kind: "camera", item: "Virtual camera / layout", why: "Every animated scene needs staged cameras." });
  for (const w of s.callouts) needs.push({ kind: "fx-or-sound", item: w, why: "Capitalised in the action — likely an effect, prop or sound. Confirm." });
  return needs;
};

export function buildBreakdown(source, { characterNotes = {} } = {}) {
  const parsed = parseScreenplay(source);
  const scenes = parsed.scenes.map((s) => ({
    ...s,
    needs: { "live-action": liveActionNeeds(s), animation: animationNeeds(s) },
    estimatedScreenSeconds: Math.round((s.pageEighths / 8) * 60),
  }));

  const continuity = [];
  for (const c of parsed.characters) {
    const note = characterNotes[c.name];
    if (!note?.look?.trim())
      continuity.push({ type: "missing-reference", character: c.name, message: `${c.name} has no visual reference yet — appearance can drift between scenes.` });
    if (c.sceneIndexes.length > 1) {
      const gaps = c.sceneIndexes.slice(1).map((n, i) => n - c.sceneIndexes[i]).filter((g) => g > 3);
      if (gaps.length)
        continuity.push({ type: "long-absence", character: c.name, message: `${c.name} disappears for ${Math.max(...gaps) - 1} scenes — check costume, look and state on return.` });
    }
    if (c.lines === 0 && c.mentions > 0) continuity.push({ type: "non-speaking", character: c.name, message: `${c.name} never speaks — performance must carry it visually.` });
  }

  const sum = (mode, kind) => new Set(scenes.flatMap((s) => s.needs[mode].filter((n) => n.kind === kind).map((n) => n.item))).size;

  return {
    format: parsed.format,
    scenes,
    characters: parsed.characters,
    candidateCharacters: parsed.candidateCharacters,
    locations: parsed.locations,
    transitions: parsed.transitions,
    warnings: parsed.warnings,
    continuity,
    stats: parsed.stats,
    totals: {
      "live-action": { locations: sum("live-action", "location"), cast: sum("live-action", "cast"), nightScenes: scenes.filter((s) => isNight(s.timeOfDay)).length },
      animation: { environments: sum("animation", "environment"), characterAssets: sum("animation", "character-asset"), lipSyncScenes: scenes.filter((s) => s.dialogueCount).length },
      estimatedScreenMinutes: +(scenes.reduce((n, s) => n + s.estimatedScreenSeconds, 0) / 60).toFixed(1),
    },
  };
}

export const analyseProject = (project, clock) => ({
  ...project,
  breakdown: { ...buildBreakdown(project.story.source, { characterNotes: project.characterNotes }), analysedAt: clock.now(), sourceHash: hashString(project.story.source) },
  updatedAt: clock.now(),
});

/* True when the story text changed after the breakdown was made. */
export const breakdownIsStale = (project) =>
  Boolean(project.breakdown) && project.breakdown.sourceHash !== hashString(project.story.source);
