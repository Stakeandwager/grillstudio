/* ------------------------------------------------------------------ *
 * Screenplay / story reader.
 *
 * Reads Fountain-style plain-text screenplays (the de-facto plain-text
 * screenplay format) and falls back to a prose reading for stories
 * without scene headings. Purely rule-based and deterministic: every
 * observation carries the source line numbers it came from, so nothing
 * is asserted without a traceable source. Language-model analysis can be
 * layered on later through an adapter; this layer works offline.
 * ------------------------------------------------------------------ */

const HEADING_RE = /^(INT\.?\/EXT|EXT\.?\/INT|I\/E|INT|EXT|EST)[.\s]/i;
const TRANSITION_RE = /^[A-Z0-9 .'-]+TO:$|^(FADE (IN|OUT)[:.]?|CUT TO BLACK\.?|SMASH CUT:?|DISSOLVE TO:?)$/;
const EXTENSION_RE = /\s*\((V\.O\.|O\.S\.|O\.C\.|CONT'D|CONT’D|CONTINUING|PRE-LAP|[^)]*)\)\s*/gi;
const LINES_PER_PAGE = 55;

const isUpper = (s) => /[A-Z]/.test(s) && s === s.toUpperCase();

/* Strip [[notes]] and /* boneyard *\/ while keeping line numbers stable. */
const stripNotes = (text) =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ""))
    .replace(/\[\[[\s\S]*?\]\]/g, (m) => m.replace(/[^\n]/g, ""));

export const parseHeading = (raw) => {
  let line = raw.trim().replace(/^\./, "");
  let number = null;
  const num = line.match(/\s*#([^#]+)#\s*$/);
  if (num) {
    number = num[1];
    line = line.slice(0, num.index).trim();
  }
  const m = line.match(/^(INT\.?\/EXT|EXT\.?\/INT|I\/E|INT|EXT|EST)[.\s]+(.*)$/i);
  let intExt = null;
  let rest = line;
  if (m) {
    const p = m[1].toUpperCase().replace(/\./g, "");
    intExt = p === "I/E" || p === "INT/EXT" || p === "EXT/INT" ? "INT/EXT" : p;
    rest = m[2];
  }
  const dash = rest.lastIndexOf(" - ");
  const location = (dash >= 0 ? rest.slice(0, dash) : rest).trim().toUpperCase();
  const timeOfDay = dash >= 0 ? rest.slice(dash + 3).trim().toUpperCase() : null;
  return { heading: line.toUpperCase(), intExt, location, timeOfDay, number };
};

const cleanCue = (line) =>
  line.replace(/^@/, "").replace(/\^$/, "").replace(EXTENSION_RE, " ").replace(/\s+/g, " ").trim().toUpperCase();

const isCue = (line, prevBlank, nextLine) => {
  const t = line.trim();
  if (!prevBlank || !nextLine || !nextLine.trim()) return false;
  if (t.startsWith("@")) return true;
  if (t.startsWith("!") || HEADING_RE.test(t) || TRANSITION_RE.test(t)) return false;
  const name = t.replace(EXTENSION_RE, "").replace(/\^$/, "").trim();
  if (!name || name.length > 38 || !isUpper(name)) return false;
  return /^[A-Z0-9 .'’#-]+$/.test(name) && /[A-Z]/.test(name);
};

/* Optional Fountain title page: "Key: value" lines before the first blank line. */
const titlePageEnd = (lines) => {
  if (!/^[A-Za-z][\w ]*:/.test(lines[0] || "")) return 0;
  const blank = lines.findIndex((l) => !l.trim());
  return blank === -1 ? 0 : blank + 1;
};

const levenshtein = (a, b) => {
  if (a === b) return 0;
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
};

/* Pairwise spelling check. Names that differ only in digits ("ROOM 1",
   "ROOM 2") are distinct on purpose. Capped so huge scripts stay fast. */
const MAX_NAME_CHECK = 400;
const nearDuplicates = (names, kind) => {
  const out = [];
  const list = names.slice(0, MAX_NAME_CHECK);
  for (let i = 0; i < list.length; i++)
    for (let j = i + 1; j < list.length; j++) {
      const [a, b] = [list[i], list[j]];
      if (a.replace(/\d+/g, "#") === b.replace(/\d+/g, "#")) continue;
      if (Math.abs(a.length - b.length) > 2) continue;
      const limit = Math.min(a.length, b.length) <= 4 ? 1 : 2;
      if (levenshtein(a, b) <= limit)
        out.push({ type: `${kind}-name-variant`, message: `"${a}" and "${b}" look like the same ${kind} spelled differently.`, names: [a, b] });
    }
  return out;
};

export function parseScreenplay(text = "") {
  const lines = stripNotes(String(text).replace(/\r\n?/g, "\n")).split("\n");
  const start = titlePageEnd(lines);
  const scenes = [];
  const transitions = [];
  let scene = null;
  let speaker = null;

  const ensureScene = (lineNo) => {
    if (!scene) {
      scene = {
        index: scenes.length,
        heading: null,
        intExt: null,
        location: null,
        timeOfDay: null,
        number: null,
        startLine: lineNo,
        endLine: lineNo,
        speakers: [],
        dialogue: [],
        action: [],
        callouts: [],
        implicit: true,
      };
      scenes.push(scene);
    }
    return scene;
  };

  for (let i = start; i < lines.length; i++) {
    const raw = lines[i];
    const t = raw.trim();
    const lineNo = i + 1;
    if (!t) {
      speaker = null;
      continue;
    }
    const prevBlank = i === start || !lines[i - 1].trim();

    if ((HEADING_RE.test(t) || /^\.[A-Za-z0-9]/.test(t)) && prevBlank) {
      scene = { ...parseHeading(t), index: scenes.length, startLine: lineNo, endLine: lineNo, speakers: [], dialogue: [], action: [], callouts: [], implicit: false };
      scenes.push(scene);
      speaker = null;
      continue;
    }
    if (!speaker && ((TRANSITION_RE.test(t) && prevBlank) || (t.startsWith(">") && !t.endsWith("<")))) {
      transitions.push({ text: t.replace(/^>\s*/, ""), line: lineNo, afterScene: scene ? scene.index : null });
      continue;
    }
    const s = ensureScene(lineNo);
    s.endLine = lineNo;

    if (speaker) {
      if (/^\(.*\)$/.test(t)) speaker.parentheticals.push(t);
      else {
        speaker.text += (speaker.text ? " " : "") + t;
        speaker.endLine = lineNo;
      }
      continue;
    }
    if (isCue(t, prevBlank, lines[i + 1])) {
      const name = cleanCue(t);
      speaker = { character: name, text: "", parentheticals: [], line: lineNo, endLine: lineNo };
      s.dialogue.push(speaker);
      if (!s.speakers.includes(name)) s.speakers.push(name);
      continue;
    }
    const action = t.replace(/^!/, "");
    s.action.push({ text: action, line: lineNo });
    for (const w of action.match(/\b[A-Z][A-Z'’-]{2,}(?:\s+[A-Z][A-Z'’-]{2,})*\b/g) || [])
      if (!s.callouts.includes(w)) s.callouts.push(w);
  }

  const explicit = scenes.filter((s) => !s.implicit).length;
  const format = explicit > 0 ? "screenplay" : "prose";

  /* Characters: speakers, plus anyone named in action lines (screenplays
     capitalise a character's first appearance). */
  const characters = new Map();
  const touch = (name, s, how) => {
    if (!characters.has(name))
      characters.set(name, { name, sceneIndexes: [], lines: 0, words: 0, mentions: 0, firstLine: Infinity });
    const c = characters.get(name);
    if (!c.sceneIndexes.includes(s.index)) c.sceneIndexes.push(s.index);
    if (how === "speak") c.lines += 1;
    else c.mentions += 1;
  };
  for (const s of scenes)
    for (const d of s.dialogue) {
      touch(d.character, s, "speak");
      const c = characters.get(d.character);
      c.words += d.text.split(/\s+/).filter(Boolean).length;
      c.firstLine = Math.min(c.firstLine, d.line);
    }
  const speakerNames = [...characters.keys()];
  for (const s of scenes) {
    const actionText = s.action.map((a) => a.text.toUpperCase()).join(" ");
    s.present = [...s.speakers];
    for (const name of speakerNames) {
      if (s.present.includes(name)) continue;
      const re = new RegExp(`(^|[^A-Z])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^A-Z]|$)`);
      if (re.test(actionText)) {
        touch(name, s, "mention");
        s.present.push(name);
      }
    }
    s.callouts = s.callouts.filter((w) => !speakerNames.includes(w) && w !== s.location);
  }

  /* Prose stories: no cues, so offer recurring capitalised names as
     *candidate* characters and say plainly that it is a heuristic. */
  const candidates = [];
  if (format === "prose") {
    const counts = {};
    const STOP = new Set(["The", "A", "An", "And", "But", "He", "She", "They", "It", "I", "We", "You", "His", "Her", "Their", "Then", "When", "There", "This", "That", "In", "On", "At", "As", "If", "So", "Of", "For", "With", "One"]);
    for (const m of text.matchAll(/(?<![.!?]\s)(?<!^)\b([A-Z][a-z]{2,})\b/gm)) {
      if (!STOP.has(m[1])) counts[m[1]] = (counts[m[1]] || 0) + 1;
    }
    for (const [name, n] of Object.entries(counts)) if (n >= 2) candidates.push({ name: name.toUpperCase(), occurrences: n, confidence: "heuristic" });
  }

  const outScenes = scenes.map((s) => {
    const lineSpan = s.endLine - s.startLine + 1;
    const eighths = Math.max(1, Math.round((lineSpan / LINES_PER_PAGE) * 8));
    const dialogueWords = s.dialogue.reduce((n, d) => n + d.text.split(/\s+/).filter(Boolean).length, 0);
    const actionWords = s.action.reduce((n, a) => n + a.text.split(/\s+/).filter(Boolean).length, 0);
    return {
      index: s.index,
      number: s.number || String(s.index + 1),
      heading: s.heading || (format === "prose" ? `PASSAGE ${s.index + 1}` : "UNTITLED OPENING"),
      intExt: s.intExt,
      location: s.location,
      timeOfDay: s.timeOfDay,
      speakers: s.speakers,
      present: s.present,
      dialogueCount: s.dialogue.length,
      dialogue: s.dialogue.map(({ character, text, parentheticals, line }) => ({ character, text, parentheticals, line })),
      action: s.action,
      callouts: s.callouts,
      dialogueWords,
      actionWords,
      pageEighths: eighths,
      source: { startLine: s.startLine, endLine: s.endLine },
      implicit: s.implicit,
    };
  });

  /* Prose: split the single implicit block into paragraph passages. */
  let finalScenes = outScenes;
  if (format === "prose" && text.trim()) {
    const paras = [];
    let cur = null;
    lines.forEach((l, i) => {
      if (l.trim()) {
        if (!cur) paras.push((cur = { start: i + 1, end: i + 1, text: [] }));
        cur.end = i + 1;
        cur.text.push(l.trim());
      } else cur = null;
    });
    finalScenes = paras.map((p, i) => {
      const body = p.text.join(" ");
      const words = body.split(/\s+/).filter(Boolean).length;
      return {
        index: i, number: String(i + 1), heading: `PASSAGE ${i + 1}`, intExt: null, location: null, timeOfDay: null,
        speakers: [], present: candidates.filter((c) => body.toUpperCase().includes(c.name)).map((c) => c.name),
        dialogueCount: (body.match(/[“"][^”"]+[”"]/g) || []).length, dialogue: [],
        action: [{ text: body, line: p.start }], callouts: [], dialogueWords: 0, actionWords: words,
        pageEighths: Math.max(1, Math.round(((p.end - p.start + 1) / LINES_PER_PAGE) * 8)),
        source: { startLine: p.start, endLine: p.end }, implicit: true,
      };
    });
  }

  const charList = [...characters.values()]
    .map((c) => ({
      ...c,
      sceneIndexes: c.sceneIndexes.sort((a, b) => a - b),
      firstScene: Math.min(...c.sceneIndexes),
      lastScene: Math.max(...c.sceneIndexes),
      firstLine: Number.isFinite(c.firstLine) ? c.firstLine : null,
    }))
    .sort((a, b) => b.lines - a.lines || a.firstScene - b.firstScene);

  const locations = new Map();
  for (const s of finalScenes) {
    if (!s.location) continue;
    if (!locations.has(s.location)) locations.set(s.location, { name: s.location, intExt: [], timesOfDay: [], sceneIndexes: [] });
    const l = locations.get(s.location);
    if (s.intExt && !l.intExt.includes(s.intExt)) l.intExt.push(s.intExt);
    if (s.timeOfDay && !l.timesOfDay.includes(s.timeOfDay)) l.timesOfDay.push(s.timeOfDay);
    l.sceneIndexes.push(s.index);
  }

  const warnings = [];
  if (!String(text).trim()) warnings.push({ type: "empty", message: "There is no text to analyse yet." });
  else if (format === "prose")
    warnings.push({ type: "no-headings", message: "No scene headings (INT./EXT.) found, so this was read as prose: passages are paragraphs and characters are guesses." });
  for (const s of finalScenes) {
    if (!s.implicit && !s.action.length && !s.dialogue.length)
      warnings.push({ type: "empty-scene", message: `Scene ${s.number} (${s.heading}) has no action or dialogue.`, scene: s.index });
    if (!s.implicit && !s.timeOfDay)
      warnings.push({ type: "no-time-of-day", message: `Scene ${s.number} has no time of day — lighting and scheduling need one.`, scene: s.index });
  }
  for (const w of nearDuplicates(charList.map((c) => c.name), "character")) warnings.push(w);
  for (const w of nearDuplicates([...locations.keys()], "location")) warnings.push(w);
  if (charList.length > MAX_NAME_CHECK || locations.size > MAX_NAME_CHECK)
    warnings.push({ type: "spelling-check-truncated", message: `Spelling-variant check covered the first ${MAX_NAME_CHECK} names only.` });

  return {
    format,
    scenes: finalScenes,
    characters: charList,
    candidateCharacters: candidates,
    locations: [...locations.values()],
    transitions,
    warnings,
    stats: {
      lines: lines.length,
      scenes: finalScenes.length,
      characters: charList.length,
      locations: locations.size,
      estimatedPages: +(finalScenes.reduce((n, s) => n + s.pageEighths, 0) / 8).toFixed(2),
    },
  };
}
