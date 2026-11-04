import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseScreenplay, parseHeading } from "../../src/engine/screenplay.js";

const fixture = readFileSync(new URL("../fixtures/rain-walk.fountain", import.meta.url), "utf8");

describe("parseHeading", () => {
  it("splits int/ext, location and time of day", () => {
    expect(parseHeading("EXT. CITY STREET - NIGHT")).toMatchObject({ intExt: "EXT", location: "CITY STREET", timeOfDay: "NIGHT" });
    expect(parseHeading("int/ext. car - moving - day")).toMatchObject({ intExt: "INT/EXT", location: "CAR - MOVING", timeOfDay: "DAY" });
    expect(parseHeading("I/E VAN - NIGHT")).toMatchObject({ intExt: "INT/EXT" });
    expect(parseHeading(".FLASHBACK")).toMatchObject({ intExt: null, location: "FLASHBACK", timeOfDay: null });
    expect(parseHeading("INT. HOUSE - DAY #12A#")).toMatchObject({ number: "12A", location: "HOUSE" });
  });
});

describe("parseScreenplay on a Fountain fixture", () => {
  const r = parseScreenplay(fixture);

  it("reads it as a screenplay and skips the title page", () => {
    expect(r.format).toBe("screenplay");
    expect(r.scenes.map((s) => s.heading)).toEqual([
      "EXT. CITY STREET - NIGHT",
      "INT. GRILL HOUSE - NIGHT",
      "EXT. ROOFTOP - DAWN",
      "INT. GRILL HOUSE - DAY",
      "INT. GRIL HOUSE - DAY",
    ]);
    expect(r.scenes.some((s) => s.action.some((a) => /Title:/.test(a.text)))).toBe(false);
  });

  it("finds speaking characters with extensions stripped", () => {
    const names = r.characters.map((c) => c.name);
    expect(names).toContain("MAYA");
    expect(names).toContain("TUNDE");
    expect(names).not.toContain("TUNDE (V.O.)");
    const tunde = r.characters.find((c) => c.name === "TUNDE");
    expect(tunde.lines).toBe(3);
    expect(tunde.sceneIndexes).toEqual([1, 2, 4]);
  });

  it("captures dialogue, parentheticals and source line numbers", () => {
    const s0 = r.scenes[0];
    expect(s0.dialogue[0]).toMatchObject({ character: "MAYA", text: "Of course it does.", parentheticals: ["(to herself)"] });
    expect(fixture.split("\n")[s0.dialogue[0].line - 1].trim()).toBe("MAYA");
    expect(s0.source.startLine).toBe(7);
  });

  it("detects characters present but not speaking", () => {
    const rooftop = r.scenes[2];
    expect(rooftop.speakers).toEqual([]);
    expect(rooftop.present.sort()).toEqual(["MAYA", "TUNDE"]);
  });

  it("collects capitalised callouts but not character names", () => {
    expect(r.scenes[0].callouts).toContain("HORN");
    expect(r.scenes[0].callouts).not.toContain("MAYA");
    expect(r.scenes[1].callouts).toContain("HISSES");
  });

  it("strips [[notes]] and records transitions", () => {
    expect(JSON.stringify(r.scenes[3].action)).not.toContain("Continuity");
    expect(r.transitions.map((t) => t.text)).toEqual(["FADE IN:", "CUT TO:"]);
  });

  it("warns about a probable location misspelling", () => {
    expect(r.warnings.some((w) => w.type === "location-name-variant" && w.names.includes("GRIL HOUSE"))).toBe(true);
  });

  it("groups locations with their times of day", () => {
    const gh = r.locations.find((l) => l.name === "GRILL HOUSE");
    expect(gh.timesOfDay).toEqual(["NIGHT", "DAY"]);
    expect(gh.sceneIndexes).toEqual([1, 3]);
  });
});

describe("prose and edge cases", () => {
  it("reads prose as passages and labels character guesses as heuristic", () => {
    const r = parseScreenplay("Rain fell on the city. Later, Maya walked home.\n\nThe old man watched Maya pass. He knew Tunde would be waiting.\n\nAt the grill, Tunde smiled.");
    expect(r.format).toBe("prose");
    expect(r.scenes).toHaveLength(3);
    expect(r.candidateCharacters.map((c) => c.name)).toEqual(expect.arrayContaining(["MAYA", "TUNDE"]));
    expect(r.candidateCharacters.every((c) => c.confidence === "heuristic")).toBe(true);
    expect(r.warnings[0].type).toBe("no-headings");
  });

  it("handles empty input without throwing", () => {
    const r = parseScreenplay("");
    expect(r.scenes).toEqual([]);
    expect(r.warnings[0].type).toBe("empty");
  });

  it("is not fooled by an ALL-CAPS action line with no dialogue after it", () => {
    const r = parseScreenplay("INT. ROOM - DAY\n\nBOOM.\n\nSilence.");
    expect(r.characters).toEqual([]);
  });

  it("handles a long screenplay within a time budget", () => {
    const scene = (i) => `INT. ROOM ${i} - DAY\n\nANA walks in.\n\nANA\nLine ${i}.\n\nBEN\nReply ${i}.\n`;
    const big = Array.from({ length: 2000 }, (_, i) => scene(i)).join("\n");
    const t0 = performance.now();
    const r = parseScreenplay(big);
    const ms = performance.now() - t0;
    expect(r.scenes).toHaveLength(2000);
    expect(r.characters.find((c) => c.name === "ANA").lines).toBe(2000);
    expect(ms).toBeLessThan(5000);
  });
});
