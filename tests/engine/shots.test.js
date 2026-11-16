import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  createSequence,
  createProject,
  updateIntention,
  updateStory,
  analyseProject,
  setCharacterNote,
  recordCorrection,
  planShots,
  readTones,
  applyOverrides,
  setShotOverride,
  shotListCsv,
  buildImagePrompt,
  frameSeed,
} from "../../src/engine/index.js";
import { generateImage, PROVIDERS } from "../../src/media/imageProviders.js";

const fixture = readFileSync(new URL("../fixtures/rain-walk.fountain", import.meta.url), "utf8");

const make = (feeling, mode = "live-action") => {
  const clock = createSequence();
  let p = createProject({ title: "Rain", mode }, clock);
  p = updateIntention(p, { audienceFeeling: feeling }, clock);
  return { clock, p: analyseProject(updateStory(p, fixture, clock), clock) };
};

describe("tone from intention", () => {
  it("reads an emotional arc in order", () => {
    expect(readTones({ audienceFeeling: "Loneliness easing into warmth" }).map((t) => t.id)).toEqual(["lonely", "warmth"]);
  });
  it("falls back to neutral coverage when no feeling is written", () => {
    expect(readTones({}).map((t) => t.id)).toEqual(["neutral"]);
  });
});

describe("shot planning", () => {
  it("plans explained shots with alternatives for every scene", () => {
    const { p } = make("lonely");
    const plan = planShots(p);
    expect(plan.scenes).toHaveLength(p.breakdown.scenes.length);
    for (const sc of plan.scenes)
      for (const s of sc.shots) {
        expect(s.why).toBeTruthy();
        expect(s.camera.text).toMatch(/mm/);
      }
    const dialogueScene = plan.scenes[1];
    expect(dialogueScene.shots.map((s) => s.purpose)).toEqual(expect.arrayContaining(["Establish", "Master", "Single", "Emotional peak"]));
    expect(plan.scenes[0].shots.some((s) => s.alternatives.length > 0)).toBe(true);
  });

  it("the same scene is covered differently for different feelings", () => {
    const lonely = planShots(make("lonely, isolated").p).scenes[0].shots[0];
    const tense = planShots(make("unbearable tension").p).scenes[0].shots[0];
    expect(lonely.size).toBe("EWS");
    expect(lonely.angle).toBe("high angle");
    expect(tense.movement).toBe("slow push-in");
  });

  it("silent scenes get a held performance beat", () => {
    const plan = planShots(make("warmth").p);
    expect(plan.scenes[2].shots.some((s) => s.purpose === "Silent beat")).toBe(true);
  });

  it("animation gets virtual cameras from the same plan", () => {
    const s = planShots(make("lonely", "animation").p).scenes[0].shots[0];
    expect(s.camera.kind).toBe("virtual");
  });

  it("a recorded lesson changes later shot recommendations (and says so)", () => {
    const { p: p0, clock } = make("lonely");
    const before = planShots(p0).scenes[0].shots.filter((s) => s.size !== "INSERT");
    expect(before.some((s) => s.movement === "handheld")).toBe(false);
    const { project } = recordCorrection(
      p0,
      { area: "shot", correction: "Handheld following Maya through the rain", lesson: "Rainy night street walks feel more lonely handheld", tags: ["night", "street"] },
      clock
    );
    const after = planShots(project).scenes[0];
    const changed = after.shots.filter((s) => s.size !== "INSERT");
    expect(changed.every((s) => s.movement === "handheld")).toBe(true);
    expect(changed[0].adjustedBy[0].before.movement).toBeDefined();
    expect(after.lessonsApplied[0].changed).toContain("movement");
    // Other scenes share the feeling and the character but not the place: untouched.
    const all = planShots(project).scenes;
    for (const i of [1, 2, 3, 4]) expect(all[i].shots.every((s) => s.movement !== "handheld")).toBe(true);
    expect(all[1].lessonsApplied[0].changed).toEqual([]);
  });

  it("filmmaker overrides survive regeneration and removals hide shots", () => {
    const { p: p0, clock } = make("lonely");
    const id = planShots(p0).scenes[0].shots[0].id;
    let p = setShotOverride(p0, id, { fields: { size: "CU" }, note: "Start on her face" }, clock);
    let plan = applyOverrides(planShots(p), p.shotOverrides);
    expect(plan.scenes[0].shots[0]).toMatchObject({ size: "CU", lens: 85, edited: true, note: "Start on her face" });
    p = setShotOverride(p, id, { removed: true }, clock);
    plan = applyOverrides(planShots(p), p.shotOverrides);
    expect(plan.scenes[0].shots.find((s) => s.id === id)).toBeUndefined();
  });

  it("exports a CSV shot list with a header row", () => {
    const csv = shotListCsv(planShots(make("lonely").p));
    expect(csv.split("\n")[0]).toMatch(/^"Scene","Heading","Shot"/);
    expect(csv.split("\n").length).toBeGreaterThan(5);
  });
});

describe("image prompts", () => {
  it("carry shot, place, light, mood, look and character references", () => {
    const { p: p0, clock } = make("loneliness");
    let p = setCharacterNote(p0, "MAYA", { look: "woman in her 30s, short black hair", wardrobe: "soaked green coat" }, clock);
    p = { ...p, visualStyle: "muted teal and amber" };
    const plan = planShots(p);
    const sp = plan.scenes[0];
    const prompt = buildImagePrompt(sp.shots[0], sp, p.breakdown.scenes[0], p);
    expect(prompt).toMatch(/extreme wide shot/);
    expect(prompt).toMatch(/city street, night/);
    expect(prompt).toMatch(/soaked green coat/);
    expect(prompt).toMatch(/muted teal and amber/);
    expect(prompt).toMatch(/Mood: isolation/);
    expect(prompt).toMatch(/no text/);
  });
  it("animation prompts ask for an animated style", () => {
    const { p } = make("joy", "animation");
    const sp = planShots(p).scenes[0];
    expect(buildImagePrompt(sp.shots[0], sp, p.breakdown.scenes[0], p)).toMatch(/animated feature film still/);
  });
  it("seed is stable for the same subject", () => {
    const { p } = make("x");
    expect(frameSeed(p, { subject: "MAYA" })).toBe(frameSeed(p, { subject: "MAYA" }));
  });
});

describe("image providers", () => {
  it("pollinations builds a free image URL with seed and size", async () => {
    const out = await generateImage("pollinations", { prompt: "a rainy street", seed: 42 });
    expect(out.kind).toBe("url");
    expect(out.url).toMatch(/^https:\/\/image\.pollinations\.ai\/prompt\/a%20rainy%20street\?/);
    expect(out.url).toMatch(/seed=42/);
  });
  it("key-based providers refuse to run without a key", async () => {
    await expect(generateImage("openai", { prompt: "x" })).rejects.toThrow(/key first/);
    await expect(generateImage("nope", { prompt: "x" })).rejects.toThrow(/Unknown/);
  });
  it("OpenAI: decodes the returned image and sends the key only to OpenAI", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ data: [{ b64_json: btoa("PNGDATA") }] }), { status: 200 }));
    const out = await generateImage("openai", { prompt: "x", apiKey: "k", fetchImpl });
    expect(out.kind).toBe("blob");
    expect(await out.blob.text()).toBe("PNGDATA");
    expect(fetchImpl.mock.calls[0][0]).toBe("https://api.openai.com/v1/images/generations");
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe("Bearer k");
  });
  it("Gemini: reads inline image data", async () => {
    const body = { candidates: [{ content: { parts: [{ text: "here" }, { inlineData: { mimeType: "image/jpeg", data: btoa("JPG") } }] } }] };
    const out = await generateImage("gemini", { prompt: "x", apiKey: "k", fetchImpl: async () => new Response(JSON.stringify(body)) });
    expect(out.mime).toBe("image/jpeg");
  });
  it("explains auth, rate-limit, policy and network failures in plain words", async () => {
    const r = (status, msg = "") => async () => new Response(JSON.stringify({ error: { message: msg } }), { status });
    await expect(generateImage("openai", { prompt: "x", apiKey: "k", fetchImpl: r(401) })).rejects.toThrow(/rejected the key/);
    await expect(generateImage("openai", { prompt: "x", apiKey: "k", fetchImpl: r(429) })).rejects.toThrow(/rate-limiting|credit/);
    await expect(generateImage("openai", { prompt: "x", apiKey: "k", fetchImpl: r(400, "safety system") })).rejects.toThrow(/content policy/);
    await expect(
      generateImage("gemini", {
        prompt: "x",
        apiKey: "k",
        fetchImpl: async () => {
          throw new TypeError("Failed to fetch");
        },
      })
    ).rejects.toThrow(/Couldn't reach/);
  });
  it("every provider explains its cost", () => {
    for (const p of Object.values(PROVIDERS)) expect(p.cost).toBeTruthy();
  });
});
