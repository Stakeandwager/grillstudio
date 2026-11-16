/* Generated storyboard frames live in IndexedDB (images are too big for
   localStorage). Falls back to memory when IndexedDB is unavailable.
   Record: { key, projectId, shotId, provider, prompt, seed, at, url?, blob? } */

const DB = "grillstudio-media";
const STORE = "frames";

const memory = new Map();

const open = () =>
  new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => {
        const s = req.result.createObjectStore(STORE, { keyPath: "key" });
        s.createIndex("projectId", "projectId");
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });

let dbp = null;
const db = () => (dbp ??= open());

const tx = async (mode, fn) => {
  const d = await db();
  if (!d) return fn(null);
  return new Promise((resolve, reject) => {
    const t = d.transaction(STORE, mode);
    const out = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(out?.result ?? out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error("Storage aborted (is the disk full?)"));
  });
};

export const frameKey = (projectId, shotId) => `${projectId}:${shotId}`;

export async function saveFrame(rec) {
  const r = { ...rec, key: frameKey(rec.projectId, rec.shotId), at: rec.at || new Date().toISOString() };
  const d = await db();
  if (!d) {
    memory.set(r.key, r);
    return r;
  }
  await tx("readwrite", (s) => s.put(r));
  return r;
}

export async function loadFrames(projectId) {
  const d = await db();
  if (!d) return [...memory.values()].filter((r) => r.projectId === projectId);
  return new Promise((resolve) => {
    const out = [];
    const t = d.transaction(STORE, "readonly");
    const req = t.objectStore(STORE).index("projectId").openCursor(IDBKeyRange.only(projectId));
    req.onsuccess = () => {
      const c = req.result;
      if (c) {
        out.push(c.value);
        c.continue();
      } else resolve(out);
    };
    req.onerror = () => resolve(out);
  });
}

export async function deleteFrame(projectId, shotId) {
  const key = frameKey(projectId, shotId);
  const d = await db();
  if (!d) return memory.delete(key);
  await tx("readwrite", (s) => s.delete(key));
}
