/* ------------------------------------------------------------------ *
 * Storyboard image prompts — written from the plan, not typed by hand.
 *
 * The prompt carries the shot (size, angle), the place and light, the
 * intention's tone, the film's look, and every character's written
 * reference. Re-using the same references and a stable seed per
 * character is what keeps people recognisable from frame to frame.
 * ------------------------------------------------------------------ */

import { SHOT_SIZES } from "./shots.js";
import { hashString } from "./history.js";

const SIZE_PHRASE = {
  EWS: "extreme wide shot, tiny figures in a vast environment",
  WS: "wide shot, full bodies with surroundings",
  FS: "full shot, head to toe",
  MS: "medium shot, waist up",
  MCU: "medium close-up, chest up",
  CU: "close-up on the face",
  ECU: "extreme close-up, eyes and detail",
  INSERT: "insert shot, close detail of an object",
};

const MODE_STYLE = {
  "live-action": "cinematic live-action film still, photographic, natural skin texture, shot on 35mm",
  animation: "animated feature film still, stylized character design, clean shapes, expressive lighting",
  hybrid: "cinematic film still mixing photographic live action with stylized animated elements",
};

const clean = (s) => String(s || "").replace(/\s+/g, " ").trim();

export function characterRefs(project, names) {
  return names
    .map((n) => {
      const note = project.characterNotes?.[n.toUpperCase()];
      const bits = [note?.look, note?.wardrobe].map(clean).filter(Boolean);
      return bits.length ? `${n.charAt(0) + n.slice(1).toLowerCase()}: ${bits.join(", ")}` : null;
    })
    .filter(Boolean);
}

export function buildImagePrompt(shot, scenePlan, scene, project) {
  const names = (scene?.present || []).filter((n) => String(shot.subject || "").toUpperCase().includes(n) || shot.size === "EWS" || shot.size === "WS" || shot.purpose === "Master");
  const refs = characterRefs(project, names.length ? names : (scene?.present || []).slice(0, 2));
  const place = [scene?.intExt === "EXT" ? "exterior" : scene?.intExt === "INT" ? "interior" : null, scene?.location?.toLowerCase(), scene?.timeOfDay?.toLowerCase()]
    .filter(Boolean)
    .join(", ");
  const angle = shot.angle && shot.angle !== "eye level" ? `${shot.angle} camera` : "eye-level camera";
  const parts = [
    MODE_STYLE[project.mode] || MODE_STYLE["live-action"],
    clean(project.visualStyle),
    `${SIZE_PHRASE[shot.size] || SHOT_SIZES[shot.size]?.label || "medium shot"}, ${angle}`,
    clean(shot.description),
    place && `Setting: ${place}`,
    refs.length && `Characters: ${refs.join("; ")}`,
    scenePlan?.lighting && `Lighting: ${scenePlan.lighting.replace(/^[A-Za-z ]+:\s*/, "")}`,
    scenePlan?.tone && scenePlan.tone.id !== "neutral" && `Mood: ${scenePlan.tone.label.toLowerCase()}${project.intention?.audienceFeeling ? ` (${clean(project.intention.audienceFeeling)})` : ""}`,
    "16:9 frame, no text, no captions, no watermark",
  ].filter(Boolean);
  return parts.join(". ").replace(/\.\./g, ".");
}

/* Stable seed per project + characters in frame, so re-generating the
   same people tends to give the same look (provider permitting). */
export const frameSeed = (project, shot) => parseInt(hashString(`${project.id}:${shot.subject || ""}`), 16) % 1_000_000;
