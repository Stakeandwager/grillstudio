const SCENE_HEADING = /^\s*(?:INT\.?|EXT\.?|INT\.?\s*\/\s*EXT\.?|I\/E\.?)\s+/i;

export function parseScreenplay(text, previousScenes = []) {
  const scenes = [];
  let current = null;
  for (const line of String(text).replace(/\r/g, "").split("\n")) {
    if (SCENE_HEADING.test(line)) {
      if (current) scenes.push(current);
      const sceneHeading = line.trim().replace(/\s+/g, " ");
      const occurrence = scenes.filter((scene) => scene.heading === sceneHeading).length + 1;
      current = { key: `${sceneHeading.toLowerCase()}#${occurrence}`, heading: sceneHeading, synopsis: [], footage: "", status: "missing" };
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
        }
      : scene;
  });
}
