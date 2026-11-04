/* Identifier + time helpers. Injected (not global) so tests are deterministic. */

export const makeId = (prefix = "id") => {
  const rand =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 12)
      : Math.random().toString(36).slice(2, 14);
  return `${prefix}_${rand}`;
};

export const nowIso = () => new Date().toISOString();

/* Deterministic id/time source for tests and reproducible fixtures. */
export const createSequence = (start = 1, epoch = Date.UTC(2026, 0, 1)) => {
  let n = start;
  let t = epoch;
  return {
    id: (prefix = "id") => `${prefix}_${String(n++).padStart(4, "0")}`,
    now: () => new Date((t += 1000)).toISOString(),
  };
};

export const defaultClock = { id: makeId, now: nowIso };
