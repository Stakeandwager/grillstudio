import test from "node:test";
import assert from "node:assert/strict";
import { parseScreenplay } from "./filmProject.js";

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
