/* ------------------------------------------------------------------ *
 * Project history — append-only versions.
 *
 * A version is a full snapshot plus a content hash. Restoring never
 * deletes later versions; it creates a new version that says what it
 * restored. Nothing here can lose a past state.
 * ------------------------------------------------------------------ */

const VOLATILE = new Set(["updatedAt"]);

export const stableStringify = (value) => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  return `{${Object.keys(value)
    .filter((k) => value[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`)
    .join(",")}}`;
};

/* FNV-1a 32-bit: change detection, not security. */
export const hashString = (s) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
};

export const contentHash = (project) =>
  hashString(stableStringify(Object.fromEntries(Object.entries(project).filter(([k]) => !VOLATILE.has(k)))));

export function createVersion(project, { message, author = "filmmaker", previous = null, kind = "manual" }, clock) {
  const hash = contentHash(project);
  if (previous && previous.hash === hash) return null; // nothing changed
  return {
    id: clock.id("ver"),
    projectId: project.id,
    number: previous ? previous.number + 1 : 1,
    at: clock.now(),
    author,
    kind,
    message: message?.trim() || "Saved version",
    hash,
    parentHash: previous?.hash || null,
    snapshot: JSON.parse(JSON.stringify(project)),
  };
}

const short = (s, n = 40) => {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n)}…` : t || "(empty)";
};

/* Human-readable differences between two project states. */
export function diffProjects(a, b) {
  const changes = [];
  const push = (path, from, to) => changes.push({ path, from, to });
  for (const k of ["title", "mode", "stage"]) if (a[k] !== b[k]) push(k, a[k], b[k]);
  for (const k of new Set([...Object.keys(a.intention || {}), ...Object.keys(b.intention || {})]))
    if ((a.intention?.[k] || "") !== (b.intention?.[k] || "")) push(`intention.${k}`, short(a.intention?.[k]), short(b.intention?.[k]));
  if ((a.story?.source || "") !== (b.story?.source || "")) {
    const la = (a.story?.source || "").split("\n").length;
    const lb = (b.story?.source || "").split("\n").length;
    push("story", `${la} lines`, `${lb} lines`);
  }
  const sa = a.breakdown?.scenes?.length || 0;
  const sb = b.breakdown?.scenes?.length || 0;
  if (sa !== sb) push("breakdown.scenes", sa, sb);
  if (Boolean(a.approval?.approved) !== Boolean(b.approval?.approved))
    push("approval", a.approval?.approved ? "approved" : "not approved", b.approval?.approved ? "approved" : "not approved");
  if ((a.evaluations?.length || 0) !== (b.evaluations?.length || 0)) push("evaluations", a.evaluations?.length || 0, b.evaluations?.length || 0);
  if ((a.lessons?.length || 0) !== (b.lessons?.length || 0)) push("lessons", a.lessons?.length || 0, b.lessons?.length || 0);
  const ca = Object.keys(a.characterNotes || {}).length;
  const cb = Object.keys(b.characterNotes || {}).length;
  if (stableStringify(a.characterNotes || {}) !== stableStringify(b.characterNotes || {})) push("characterNotes", `${ca} notes`, `${cb} notes`);
  return changes;
}

/* Returns the project to load; the caller records a "restore" version. */
export const restoreVersion = (version, clock) => ({ ...JSON.parse(JSON.stringify(version.snapshot)), updatedAt: clock.now() });
