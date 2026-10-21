const SCENE_HEADING = /^\s*(?:INT\.?|EXT\.?|INT\.?\s*\/\s*EXT\.?|I\/E\.?)\s+/i;
const MOTION_PRESETS = ["still", "slow-push", "pan-left", "pan-right"];

export function normalizeSceneDuration(value, fallback = 4) {
  const duration = Number(value);
  return Number.isFinite(duration) ? Math.min(20, Math.max(2, duration)) : fallback;
}

export function buildAnimaticTimeline(scenes) {
  let start = 0;
  return scenes.map((scene, index) => {
    const duration = normalizeSceneDuration(scene.durationSeconds);
    const entry = { ...scene, index, start, end: start + duration, duration };
    start = entry.end;
    return entry;
  });
}

export function findAnimaticFrame(timeline, time) {
  if (timeline.length === 0) return null;
  const totalDuration = timeline[timeline.length - 1].end;
  const boundedTime = Math.min(totalDuration, Math.max(0, Number(time) || 0));
  const entry = timeline.find((scene) => boundedTime < scene.end) || timeline[timeline.length - 1];
  return { scene: entry, localTime: Math.max(0, boundedTime - entry.start), totalDuration, time: boundedTime };
}

export function parseScreenplay(text, previousScenes = []) {
  const scenes = [];
  let current = null;
  for (const line of String(text).replace(/\r/g, "").split("\n")) {
    if (SCENE_HEADING.test(line)) {
      if (current) scenes.push(current);
      const sceneHeading = line.trim().replace(/\s+/g, " ");
      const occurrence = scenes.filter((scene) => scene.heading === sceneHeading).length + 1;
      current = {
        key: `${sceneHeading.toLowerCase()}#${occurrence}`,
        heading: sceneHeading,
        synopsis: [],
        footage: "",
        status: "missing",
        durationSeconds: 4,
        motion: "slow-push",
      };
    } else if (current && line.trim()) {
      current.synopsis.push(line.trim());
    }
  }
  if (current) scenes.push(current);

  const priorByKey = new Map(
    (Array.isArray(previousScenes) ? previousScenes : [])
      .filter((scene) => scene && typeof scene === "object" && typeof scene.key === "string")
      .map((scene) => [scene.key, scene]),
  );
  return scenes.map((scene) => {
    const prior = priorByKey.get(scene.key);
    const validStatuses = ["missing", "planned", "covered", "review"];
    return prior
      ? {
          ...scene,
          footage: typeof prior.footage === "string" ? prior.footage : "",
          status: validStatuses.includes(prior.status) ? prior.status : "missing",
          durationSeconds: normalizeSceneDuration(prior.durationSeconds),
          motion: MOTION_PRESETS.includes(prior.motion) ? prior.motion : "slow-push",
        }
      : scene;
  });
}
