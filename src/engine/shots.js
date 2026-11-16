/* ------------------------------------------------------------------ *
 * Shot planning — from scene + intention to a shot list.
 *
 * Rule-based and explainable. Every shot says why it exists and offers
 * alternatives, because there is rarely one right answer. The emotional
 * "tone" comes from the project's intention (what the audience should
 * feel), so the same scene is covered differently for loneliness than
 * for tension. Stored lessons can adjust shots; when they do, the shot
 * records which lesson changed it.
 * ------------------------------------------------------------------ */

import { retrieveLessons, sceneQuery, tokenize } from "./lessons.js";

export const SHOT_SIZES = {
  EWS: { label: "Extreme wide", lens: 18, figure: 0.12 },
  WS: { label: "Wide", lens: 24, figure: 0.32 },
  FS: { label: "Full", lens: 32, figure: 0.62 },
  MS: { label: "Medium", lens: 40, figure: 1.7 },
  MCU: { label: "Medium close-up", lens: 50, figure: 2.5 },
  CU: { label: "Close-up", lens: 85, figure: 3.6 },
  ECU: { label: "Extreme close-up", lens: 100, figure: 6 },
  INSERT: { label: "Insert", lens: 65, figure: 0 },
};

export const MOVEMENTS = ["static", "slow push-in", "pull-out", "pan", "tracking", "handheld", "crane up", "dolly"];
export const ANGLES = ["eye level", "low angle", "high angle", "dutch", "overhead"];

/* Feeling → visual grammar. Keyword match on the intention text. */
export const TONES = [
  {
    id: "lonely",
    words: ["lonely", "loneliness", "alone", "isolation", "isolated", "empty", "lost", "melancholy", "sad", "grief"],
    label: "Isolation",
    establish: "EWS",
    movement: "static",
    angle: "high angle",
    framing: "Small in frame with lots of empty space around them.",
    pace: 1.3,
    why: "Distance and empty space make the audience feel how alone the character is.",
  },
  {
    id: "tension",
    words: ["tension", "tense", "suspense", "dread", "anxious", "anxiety", "uneasy", "threat", "danger", "nervous"],
    label: "Tension",
    establish: "WS",
    movement: "slow push-in",
    angle: "eye level",
    framing: "Tight framing, little headroom, something blocking part of the frame.",
    pace: 0.8,
    why: "A slow push-in and tight frames squeeze the space, so the audience feels trapped with the character.",
  },
  {
    id: "fear",
    words: ["fear", "afraid", "scared", "terror", "horror", "panic", "frightened"],
    label: "Fear",
    establish: "WS",
    movement: "handheld",
    angle: "low angle",
    framing: "Off-balance framing; keep the threat partly out of frame.",
    pace: 0.7,
    why: "Unstable handheld camera and hidden threats make the audience feel unsafe.",
  },
  {
    id: "warmth",
    words: ["warm", "warmth", "belong", "belonging", "love", "tender", "comfort", "home", "hope", "intimate", "intimacy", "kindness"],
    label: "Warmth",
    establish: "WS",
    movement: "dolly",
    angle: "eye level",
    framing: "Characters share the frame; soft, close, at eye level.",
    pace: 1.1,
    why: "Sharing the frame at eye level puts the audience beside the characters, not watching from outside.",
  },
  {
    id: "joy",
    words: ["joy", "happy", "fun", "funny", "laugh", "excited", "excitement", "celebrate", "energy", "uplift"],
    label: "Energy",
    establish: "WS",
    movement: "tracking",
    angle: "eye level",
    framing: "Open, bright frames with movement through them.",
    pace: 0.8,
    why: "Movement and quicker cuts carry the energy into the audience.",
  },
  {
    id: "awe",
    words: ["awe", "wonder", "epic", "vast", "majestic", "beauty", "beautiful", "powerful"],
    label: "Awe",
    establish: "EWS",
    movement: "crane up",
    angle: "low angle",
    framing: "Let the world dwarf the character.",
    pace: 1.3,
    why: "Scale and a rising camera give the audience the feeling of something bigger than them.",
  },
];

const NEUTRAL = {
  id: "neutral",
  label: "Neutral",
  establish: "WS",
  movement: "static",
  angle: "eye level",
  framing: "Classic coverage: clear geography, then closer for the important moments.",
  pace: 1,
  why: "No audience feeling has been written yet, so this is standard, clear coverage.",
};

const words = (s) => new Set(String(s || "").toLowerCase().match(/[a-z]+/g) || []);

/* Tones present in the intention, strongest first. A feeling that moves
   ("loneliness easing into warmth") yields an arc: first → last. */
export function readTones(intention = {}) {
  const text = `${intention.audienceFeeling || ""} ${intention.filmmakerIntent || ""}`.toLowerCase();
  const w = words(text);
  const found = TONES.map((t) => {
    const hits = t.words.filter((x) => w.has(x));
    const pos = hits.length ? Math.min(...hits.map((h) => text.indexOf(h))) : Infinity;
    return { tone: t, hits, pos };
  })
    .filter((x) => x.hits.length)
    .sort((a, b) => a.pos - b.pos);
  return found.length ? found.map((x) => ({ ...x.tone, matched: x.hits })) : [{ ...NEUTRAL, matched: [] }];
}

/* Which tone governs scene i of n — walks the arc across the film. */
export const toneForScene = (tones, i, n) => (tones.length === 1 || n <= 1 ? tones[0] : tones[Math.min(tones.length - 1, Math.floor((i / n) * tones.length))]);

const isNight = (t) => /NIGHT|EVENING|DUSK|MIDNIGHT/.test(t || "");

/* Emotional peak of a scene: the longest line or one with a pause/tears. */
const peakLine = (scene) => {
  if (!scene.dialogue?.length) return null;
  const scored = scene.dialogue.map((d, i) => ({
    d,
    i,
    s: d.text.length + (/\?|!|\.\.\.|…/.test(d.text) ? 15 : 0) + (d.parentheticals?.some((p) => /quiet|whisper|beat|tear|cry|soft|to (him|her)self/i.test(p)) ? 40 : 0),
  }));
  return scored.sort((a, b) => b.s - a.s)[0];
};

const SOUND_WORDS = /^(HORN|BANG|BOOM|CRASH|HISS|HISSES|RING|RINGS|KNOCK|KNOCKS|THUNDER|SCREAM|SCREAMS|SIREN|BEEP|SLAM|SLAMS|CLICK)$/;

export function planScene(scene, project, { sceneCount = 1, lessons = [] } = {}) {
  const tones = readTones(project.intention);
  const tone = toneForScene(tones, scene.index, sceneCount);
  const live = project.mode !== "animation";
  const shots = [];
  const add = (s) =>
    shots.push({
      id: `s${scene.index}-${shots.length + 1}`,
      scene: scene.index,
      n: shots.length + 1,
      lens: SHOT_SIZES[s.size]?.lens,
      angle: "eye level",
      movement: "static",
      seconds: 3,
      alternatives: [],
      adjustedBy: [],
      ...s,
    });

  const people = scene.present?.length ? scene.present : [];
  const place = scene.location || "the location";
  const night = isNight(scene.timeOfDay);

  // 1. Establish geography (new location, exterior, or tone wants distance).
  const prevSameLocation = false;
  if (!prevSameLocation) {
    add({
      size: tone.establish,
      angle: tone.id === "lonely" ? "high angle" : tone.angle === "low angle" ? "low angle" : "eye level",
      movement: tone.id === "awe" ? "crane up" : tone.id === "tension" ? "slow push-in" : "static",
      subject: people.length ? `${place} with ${people.join(" and ")}` : place,
      purpose: "Establish",
      description: `Show where we are${scene.timeOfDay ? ` — ${scene.timeOfDay.toLowerCase()}` : ""}.${people.length ? ` ${tone.framing}` : ""}`,
      why: `The audience needs to know where they are before they can feel anything about it. ${tone.why}`,
      seconds: Math.round(4 * tone.pace),
      alternatives: [
        { size: "WS", movement: "pan", why: "Reveal the place gradually, letting the audience discover it with the character." },
        { size: "INSERT", movement: "static", why: "Open on a telling detail instead of the whole place — more mystery, less orientation." },
      ],
    });
  }

  // 2. Dialogue coverage: master, then singles for each speaker.
  const speakers = scene.speakers || [];
  if (speakers.length >= 2) {
    add({
      size: tone.id === "lonely" ? "WS" : "MS",
      subject: speakers.slice(0, 3).join(", "),
      purpose: "Master",
      description: `Two-shot of ${speakers.slice(0, 2).join(" and ")} — the whole exchange in one frame.`,
      why: "A master holds the whole conversation, so the edit can always cut back to show the relationship.",
      seconds: Math.round(6 * tone.pace),
      alternatives: [
        { size: "WS", movement: "static", why: "Keep them small and apart — the distance between them becomes the point." },
        { size: "MS", movement: "dolly", why: "A slow move around them keeps a long conversation alive without cutting." },
      ],
    });
    for (const sp of speakers.slice(0, 3)) {
      add({
        size: tone.id === "warmth" ? "MCU" : tone.id === "tension" || tone.id === "fear" ? "CU" : "MCU",
        angle: "over-the-shoulder",
        subject: sp,
        purpose: "Single",
        description: `Over-the-shoulder on ${sp} for their lines.`,
        why: `Singles let the edit choose when to be with ${sp} — and when to show the other person listening.`,
        seconds: Math.round(5 * tone.pace),
        alternatives: [
          { size: "MCU", angle: "eye level", why: `Clean single on ${sp} (no shoulder) — feels more isolated from the other person.` },
          { size: "CU", angle: "eye level", why: "Closer for intensity, if this is the scene's turning point." },
        ],
      });
    }
  } else if (speakers.length === 1) {
    add({
      size: tone.id === "lonely" ? "MS" : "MCU",
      subject: speakers[0],
      purpose: "Single",
      description: `${speakers[0]} speaks${people.length > 1 ? "" : " alone"}.`,
      why: "One voice in the scene — stay with them so the audience hears it as a private thought.",
      seconds: Math.round(5 * tone.pace),
      alternatives: [{ size: "WS", movement: "static", why: "Keep them small in the frame while they speak — words lost in the space." }],
    });
  } else if (people.length) {
    // Silent scene: performance carries it.
    add({
      size: people.length > 1 ? "MS" : "MCU",
      movement: tone.id === "tension" ? "slow push-in" : "static",
      subject: people.join(" and "),
      purpose: "Silent beat",
      description: `No dialogue — hold on ${people.join(" and ")} and let their faces carry it.`,
      why: "Without words the audience reads the face. Holding the shot longer than feels comfortable lets the feeling land.",
      seconds: Math.round(7 * tone.pace),
      alternatives: [
        { size: "WS", movement: "static", why: "Stay wide — the setting says what they can't." },
        { size: "CU", movement: "slow push-in", why: "Push in slowly to make a quiet moment feel important." },
      ],
    });
  }

  // 3. Emotional peak.
  const peak = peakLine(scene);
  if (peak && speakers.length) {
    add({
      size: tone.id === "lonely" ? "MCU" : "CU",
      movement: tone.id === "tension" || tone.id === "fear" ? "slow push-in" : "static",
      subject: peak.d.character,
      purpose: "Emotional peak",
      description: `“${peak.d.text.slice(0, 70)}${peak.d.text.length > 70 ? "…" : ""}” — ${peak.d.character}.`,
      why: "The scene's strongest line. Saving the closest shot for this moment makes it hit harder.",
      seconds: Math.round(4 * tone.pace),
      sourceLine: peak.d.line,
      alternatives: [
        { size: "MS", movement: "static", why: "Stay back — understatement can be more powerful than a close-up." },
        { size: "CU", subject: "listener", why: "Show the other person hearing it instead — the reaction is the story." },
      ],
    });
  }

  // 4. Inserts for objects / sound cues called out in the action.
  for (const c of (scene.callouts || []).slice(0, 3)) {
    const sound = SOUND_WORDS.test(c);
    add({
      size: "INSERT",
      subject: c.toLowerCase(),
      purpose: sound ? "Sound cue" : "Insert",
      description: sound ? `Sound: ${c.toLowerCase()} — can play off-screen over another shot.` : `Detail: ${c.toLowerCase()}.`,
      why: sound ? "Capitalised as a sound in the script. Usually heard, not shown — decide in the edit." : "Called out in the action, so the audience probably needs to see it.",
      seconds: 2,
      alternatives: [{ size: "MS", why: "Show it in context instead of a separate insert." }],
    });
  }

  // 5. Closing button for the scene in slow/lonely/awe tones.
  if (tone.pace >= 1.2 && people.length) {
    add({
      size: "EWS",
      movement: tone.id === "awe" ? "crane up" : "pull-out",
      angle: "high angle",
      subject: people.join(" and "),
      purpose: "Button",
      description: "End the scene by pulling away.",
      why: "Leaving the characters behind lets the feeling linger before the next scene.",
      seconds: Math.round(5 * tone.pace),
      alternatives: [{ size: "CU", movement: "static", why: "End close on a face instead — keep the audience inside the moment." }],
    });
  }

  // Lighting note per scene from time of day + tone.
  const lighting = night
    ? tone.id === "warmth"
      ? "Night: warm practical light sources (lamps, embers) against cool darkness."
      : "Night: low-key, one motivated source, deep shadows."
    : /DAWN|SUNRISE|SUNSET|DUSK/.test(scene.timeOfDay || "")
      ? "Golden hour: soft, low, directional light — schedule tightly."
      : "Day: soft natural light; shape it so faces read clearly.";

  // Lessons can change the plan.
  const hits = retrieveLessons(lessons, { ...sceneQuery(scene, project), area: "shot" }, { limit: 5 });
  const applied = [];
  /* A lesson only *changes* this scene's shots when it matches what is
     specific to the scene (place, time, objects) at least twice — not
     just the film-wide feeling or a character who is everywhere. */
  const specific = new Set(tokenize([scene.location, scene.timeOfDay, scene.intExt === "EXT" ? "exterior outside" : "interior inside", ...(scene.callouts || [])].join(" ")));
  for (const h of hits) {
    const lessonTokens = new Set([...tokenize(`${h.lesson.lesson} ${h.lesson.correction} ${h.lesson.whatWasWrong}`), ...h.lesson.tags.flatMap((x) => tokenize(x))]);
    const sceneMatches = [...lessonTokens].filter((x) => specific.has(x));
    const t = ` ${tokenize(`${h.lesson.lesson} ${h.lesson.correction}`).join(" ")} `;
    if (sceneMatches.length < 2) {
      applied.push({ lessonId: h.lesson.id, lesson: h.lesson.lesson, why: h.why, changed: [], note: "Related, but not specific to this scene's place and time — shown for reference." });
      continue;
    }
    const change = {};
    if (/ handheld /.test(t)) change.movement = "handheld";
    else if (/ static | still | lock /.test(t)) change.movement = "static";
    else if (/ push /.test(t)) change.movement = "slow push-in";
    if (/ low angle | low-angle /.test(` ${h.lesson.lesson.toLowerCase()} `)) change.angle = "low angle";
    if (/ wide /.test(t)) change.size = "WS";
    else if (/ close-up | closeup | close /.test(t)) change.size = "CU";
    if (!Object.keys(change).length) {
      applied.push({ lessonId: h.lesson.id, lesson: h.lesson.lesson, why: h.why, changed: [] });
      continue;
    }
    const targets = shots.filter((s) => s.size !== "INSERT");
    for (const s of targets) {
      const before = {};
      for (const [k, v] of Object.entries(change)) if (s[k] !== v) before[k] = s[k];
      if (!Object.keys(before).length) continue;
      Object.assign(s, change);
      if (change.size) s.lens = SHOT_SIZES[change.size].lens;
      s.adjustedBy.push({ lessonId: h.lesson.id, lesson: h.lesson.lesson, before });
    }
    applied.push({ lessonId: h.lesson.id, lesson: h.lesson.lesson, why: h.why, changed: Object.keys(change), matchedOn: sceneMatches });
  }

  for (const s of shots) {
    s.camera = live
      ? { kind: "lens", text: `${s.lens ?? "—"}mm${s.movement !== "static" ? `, ${s.movement}` : ", locked off"}` }
      : { kind: "virtual", text: `Virtual camera ~${s.lens ?? "—"}mm equivalent${s.movement !== "static" ? `, keyframed ${s.movement}` : ", fixed"}` };
  }

  return {
    scene: scene.index,
    heading: scene.heading,
    tone: { id: tone.id, label: tone.label, why: tone.why, matched: tone.matched },
    lighting,
    shots,
    lessonsApplied: applied,
    estimatedSeconds: shots.reduce((n, s) => n + s.seconds, 0),
  };
}

export function planShots(project, { globalLessons = [] } = {}) {
  const scenes = project.breakdown?.scenes || [];
  const lessons = [...(project.lessons || []), ...globalLessons];
  const tones = readTones(project.intention);
  const plans = scenes.map((s) => planScene(s, project, { sceneCount: scenes.length, lessons }));
  return {
    tones: tones.map((t) => ({ id: t.id, label: t.label, matched: t.matched })),
    arc: tones.length > 1,
    scenes: plans,
    totalShots: plans.reduce((n, p) => n + p.shots.length, 0),
    estimatedMinutes: +(plans.reduce((n, p) => n + p.estimatedSeconds, 0) / 60).toFixed(1),
  };
}

/* Filmmaker overrides are stored by shot id and survive regeneration. */
export const applyOverrides = (plan, overrides = {}) => ({
  ...plan,
  scenes: plan.scenes.map((p) => ({
    ...p,
    shots: p.shots
      .filter((s) => !overrides[s.id]?.removed)
      .map((s) => {
        const o = overrides[s.id];
        if (!o) return s;
        const merged = { ...s, ...o.fields, edited: true, note: o.note || "" };
        if (o.fields?.size) merged.lens = SHOT_SIZES[o.fields.size]?.lens;
        return merged;
      }),
  })),
});

export const setShotOverride = (project, shotId, patch, clock) => {
  const prev = project.shotOverrides?.[shotId] || {};
  const next = { ...prev, ...patch, fields: { ...prev.fields, ...patch.fields } };
  return { ...project, shotOverrides: { ...project.shotOverrides, [shotId]: next }, updatedAt: clock.now() };
};

export const shotListCsv = (plan) => {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = [["Scene", "Heading", "Shot", "Purpose", "Size", "Angle", "Movement", "Camera", "Subject", "Description", "Seconds", "Why", "Note"]];
  for (const p of plan.scenes)
    for (const s of p.shots)
      rows.push([p.scene + 1, p.heading, s.n, s.purpose, SHOT_SIZES[s.size]?.label || s.size, s.angle, s.movement, s.camera?.text, s.subject, s.description, s.seconds, s.why, s.note || ""]);
  return rows.map((r) => r.map(esc).join(",")).join("\n");
};
