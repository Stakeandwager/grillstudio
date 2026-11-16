import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  createSequence,
  createProject,
  updateIntention,
  updateStory,
  analyseProject,
  createVersion,
  diffProjects,
  restoreVersion,
  contentHash,
  recordCorrection,
  retrieveLessons,
  sceneQuery,
  tokenize,
  createRepository,
  createMemoryBackend,
  StorageError,
} from "../../src/engine/index.js";

const fixture = readFileSync(new URL("../fixtures/rain-walk.fountain", import.meta.url), "utf8");

describe("history", () => {
  it("is append-only, skips no-op versions and restores without losing later versions", () => {
    const clock = createSequence();
    const repo = createRepository(createMemoryBackend());
    let p = createProject({ title: "H" }, clock);
    const v1 = repo.appendVersion(createVersion(p, { message: "start" }, clock));
    expect(v1.number).toBe(1);
    expect(createVersion({ ...p, updatedAt: "later" }, { previous: v1 }, clock)).toBeNull();
    p = updateIntention(p, { filmmakerIntent: "Make them laugh" }, clock);
    const v2 = repo.appendVersion(createVersion(p, { message: "intent", previous: v1 }, clock));
    expect(v2.parentHash).toBe(v1.hash);
    expect(diffProjects(v1.snapshot, v2.snapshot)).toEqual([{ path: "intention.filmmakerIntent", from: "(empty)", to: "Make them laugh" }]);
    const restored = restoreVersion(v1, clock);
    expect(restored.intention.filmmakerIntent).toBe("");
    repo.appendVersion(createVersion(restored, { message: "Restored v1", previous: v2, kind: "restore" }, clock));
    expect(repo.listVersions(p.id).map((v) => v.number)).toEqual([1, 2, 3]);
  });

  it("hash is independent of key order", () => {
    expect(contentHash({ a: 1, b: { c: 2, d: 3 } })).toBe(contentHash({ b: { d: 3, c: 2 }, a: 1 }));
  });
});

describe("correction memory", () => {
  it("records a correction with its context and retrieves it later with reasons", () => {
    const clock = createSequence();
    let p = analyseProject(updateStory(updateIntention(createProject({ title: "Rain", mode: "live-action" }, clock), { audienceFeeling: "lonely" }, clock), fixture, clock), clock);
    const nightScene = p.breakdown.scenes[0];

    // Before: nothing to recall.
    expect(retrieveLessons(p.lessons, sceneQuery(nightScene, p))).toEqual([]);

    const { project, lesson } = recordCorrection(
      p,
      {
        area: "visual-style",
        original: "High-key bright street lighting for the rain walk",
        correction: "Low-key lighting: single sodium streetlight, wet reflections",
        whatWasWrong: "Bright lighting killed the loneliness",
        lesson: "Lonely night street scenes need low-key lighting with one motivated source",
        tags: ["night", "lonely"],
      },
      clock
    );
    p = project;
    expect(lesson.context).toMatchObject({ projectTitle: "Rain", mode: "live-action", audienceFeeling: "lonely" });

    // After: the same scene now surfaces the lesson, with an explanation.
    const hits = retrieveLessons(p.lessons, { ...sceneQuery(nightScene, p), tags: ["night"] });
    expect(hits).toHaveLength(1);
    expect(hits[0].why.join(" ")).toMatch(/night/);

    // An unrelated scene does not.
    const dayInterior = p.breakdown.scenes[3];
    expect(retrieveLessons(p.lessons, { query: "kitchen cheerful morning breakfast" })).toEqual([]);
    expect(dayInterior.timeOfDay).toBe("DAY");
  });

  it("validates corrections", () => {
    const clock = createSequence();
    const p = createProject({ title: "x" }, clock);
    expect(() => recordCorrection(p, { area: "nope", correction: "", lesson: "" }, clock)).toThrow(/area/);
  });

  it("tokenizer stems simple plurals and -ing", () => {
    expect(tokenize("Lighting the lights; stories!")).toEqual(["light", "light", "story"]);
  });
});

describe("repository", () => {
  it("saves, lists, loads and deletes projects", () => {
    const clock = createSequence();
    const repo = createRepository(createMemoryBackend());
    const a = repo.saveProject(createProject({ title: "A" }, clock));
    const b = repo.saveProject(createProject({ title: "B" }, clock));
    expect(repo.listProjects().map((x) => x.title)).toEqual(["B", "A"]);
    expect(repo.loadProject(a.id).title).toBe("A");
    repo.deleteProject(a.id);
    expect(repo.listProjects().map((x) => x.id)).toEqual([b.id]);
    expect(repo.loadProject(a.id)).toBeNull();
  });

  it("refuses to save invalid projects", () => {
    const repo = createRepository(createMemoryBackend());
    expect(() => repo.saveProject({ id: "x" })).toThrow(StorageError);
  });

  it("reports full storage as a quota error instead of losing data silently", () => {
    const backend = createMemoryBackend();
    backend.setItem = () => {
      const e = new Error("full");
      e.name = "QuotaExceededError";
      throw e;
    };
    const repo = createRepository(backend);
    const clock = createSequence();
    try {
      repo.saveProject(createProject({ title: "A" }, clock));
      throw new Error("should have thrown");
    } catch (e) {
      expect(e.code).toBe("quota");
    }
  });

  it("survives a corrupted record without breaking the list", () => {
    const backend = createMemoryBackend();
    const repo = createRepository(backend);
    const clock = createSequence();
    const p = repo.saveProject(createProject({ title: "Good" }, clock));
    backend.setItem(`grillstudio:project:${p.id}`, "{not json");
    expect(repo.listProjects()[0]).toMatchObject({ corrupt: true });
    expect(() => repo.loadProject(p.id)).toThrow(/corrupted/);
  });

  it("export/import round-trips and never overwrites an existing project", () => {
    const clock = createSequence();
    const repo = createRepository(createMemoryBackend());
    const p = repo.saveProject(createProject({ title: "Orig" }, clock));
    repo.appendVersion(createVersion(p, { message: "v1" }, clock));
    const bundle = JSON.parse(JSON.stringify(repo.exportProject(p.id)));
    const imported = repo.importProject(bundle, clock);
    expect(imported.id).not.toBe(p.id);
    expect(imported.title).toBe("Orig (imported)");
    expect(repo.loadProject(p.id).title).toBe("Orig");
    expect(repo.listVersions(imported.id)).toHaveLength(1);
    const other = createRepository(createMemoryBackend());
    expect(other.importProject(bundle, clock).id).toBe(p.id);
    expect(() => repo.importProject({ format: "something-else" }, clock)).toThrow(/Not a GrillStudio/);
  });

  it("keeps namespaces isolated (per-user separation on a shared browser)", () => {
    const backend = createMemoryBackend();
    const clock = createSequence();
    const alice = createRepository(backend, "grillstudio:alice");
    const bob = createRepository(backend, "grillstudio:bob");
    alice.saveProject(createProject({ title: "Private" }, clock));
    expect(bob.listProjects()).toEqual([]);
  });
});
