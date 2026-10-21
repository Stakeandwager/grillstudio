import test from "node:test";
import assert from "node:assert/strict";
import { buildAnimaticTimeline, findAnimaticFrame, normalizeSceneDuration, parseScreenplay } from "./filmProject.js";

test("parses interior and exterior scene headings and keeps scene text", () => {
  const scenes = parseScreenplay("FADE IN:\r\nINT. KITCHEN - NIGHT\r\nMara cooks.\r\n\r\nEXT. YARD - NIGHT\r\nGuests arrive.");
  assert.equal(scenes.length, 2);
  assert.equal(scenes[0].heading, "INT. KITCHEN - NIGHT");
  assert.deepEqual(scenes[0].synopsis, ["Mara cooks."]);
  assert.equal(scenes[1].key, "ext. yard - night#1");
});

test("preserves coverage notes across screenplay edits and disambiguates repeated headings", () => {
  const initial = parseScreenplay("INT. ROOM - DAY\nFirst\nINT. ROOM - DAY\nSecond");
  const previous = [
    { ...initial[0], footage: "take-a.mp4", status: "covered" },
    { ...initial[1], footage: "pickup needed", status: "planned" },
  ];
  const edited = parseScreenplay("INT. ROOM - DAY\nUpdated first\nINT. ROOM - DAY\nUpdated second\nEXT. PARK - DAY\nNew scene", previous);
  assert.equal(edited[0].footage, "take-a.mp4");
  assert.equal(edited[0].status, "covered");
  assert.equal(edited[1].footage, "pickup needed");
  assert.equal(edited[2].status, "missing");
});

test("ignores action lines that are not scene headings", () => {
  assert.deepEqual(parseScreenplay("A room.\nThe door opens.\nCUT TO:").map((scene) => scene.heading), []);
});

test("safely ignores malformed saved scene records", () => {
  const scenes = parseScreenplay("INT. ROOM - DAY\nA scene.", [null, "bad", { key: "int. room - day#1", footage: 42, status: "unknown" }]);
  assert.equal(scenes[0].footage, "");
  assert.equal(scenes[0].status, "missing");
});

test("sets screenplay scenes up with a default animatic duration and motion", () => {
  const [scene] = parseScreenplay("INT. ROOM - DAY\nA quiet moment.");
  assert.equal(scene.durationSeconds, 4);
  assert.equal(scene.motion, "slow-push");
});

test("normalizes scene duration and preserves animatic edits across screenplay parsing", () => {
  assert.equal(normalizeSceneDuration(0), 2);
  assert.equal(normalizeSceneDuration(50), 20);
  assert.equal(normalizeSceneDuration("bad"), 4);
  const [scene] = parseScreenplay("INT. ROOM - DAY", [{ key: "int. room - day#1", durationSeconds: 8.5, motion: "pan-left" }]);
  assert.equal(scene.durationSeconds, 8.5);
  assert.equal(scene.motion, "pan-left");
});

test("builds a timeline and resolves the active scene at playback times", () => {
  const timeline = buildAnimaticTimeline([
    { key: "one", durationSeconds: 3 },
    { key: "two", durationSeconds: 5 },
  ]);
  assert.deepEqual(timeline.map(({ start, end }) => [start, end]), [[0, 3], [3, 8]]);
  assert.equal(findAnimaticFrame(timeline, 4).scene.key, "two");
  assert.equal(findAnimaticFrame(timeline, 4).localTime, 1);
  assert.equal(findAnimaticFrame(timeline, 30).time, 8);
  assert.equal(findAnimaticFrame([], 0), null);
});
