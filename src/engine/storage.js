/* ------------------------------------------------------------------ *
 * Project repository — a replaceable storage adapter.
 *
 * The app talks to this interface only. Today it is backed by the
 * browser's localStorage (project JSON is small); a server database
 * adapter can implement the same methods later. Media files never go in
 * here — they belong in object storage (see docs/ARCHITECTURE.md).
 * ------------------------------------------------------------------ */

import { validateProject, SCHEMA_VERSION } from "./model.js";

export class StorageError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

export const createMemoryBackend = () => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
    keys: () => [...m.keys()],
  };
};

/* Wrap window.localStorage with a keys() helper. */
export const localStorageBackend = (ls) => ({
  getItem: (k) => ls.getItem(k),
  setItem: (k, v) => ls.setItem(k, v),
  removeItem: (k) => ls.removeItem(k),
  keys: () => Array.from({ length: ls.length }, (_, i) => ls.key(i)),
});

const isQuota = (e) => e && (e.name === "QuotaExceededError" || e.code === 22 || e.code === 1014 || /quota/i.test(e.message || ""));

/* Upgrade older saved projects to the current schema. */
export const migrate = (p) => {
  const out = { ...p };
  if (out.schemaVersion == null) out.schemaVersion = 1;
  out.lessons ??= [];
  out.evaluations ??= [];
  out.characterNotes ??= {};
  out.stageLog ??= [];
  out.approval ??= { approved: false };
  return out;
};

export function createRepository(backend, namespace = "grillstudio") {
  const k = {
    index: `${namespace}:projects`,
    project: (id) => `${namespace}:project:${id}`,
    history: (id) => `${namespace}:history:${id}`,
    lessons: `${namespace}:lessons:global`,
  };

  const read = (key, fallback) => {
    const raw = backend.getItem(key);
    if (raw == null) return fallback;
    try {
      return JSON.parse(raw);
    } catch {
      throw new StorageError(`Stored data at ${key} is corrupted.`, "corrupt");
    }
  };
  const write = (key, value) => {
    try {
      backend.setItem(key, JSON.stringify(value));
    } catch (e) {
      if (isQuota(e)) throw new StorageError("Browser storage is full. Export a project backup, then delete old versions or projects.", "quota");
      throw new StorageError(e.message || "Could not save.", "write");
    }
  };

  const readIndex = () => {
    try {
      const idx = read(k.index, []);
      return Array.isArray(idx) ? idx : [];
    } catch {
      return [];
    }
  };

  return {
    schemaVersion: SCHEMA_VERSION,

    listProjects() {
      return readIndex()
        .map((id) => {
          try {
            const p = read(k.project(id), null);
            return p ? { id, title: p.title, mode: p.mode, stage: p.stage, updatedAt: p.updatedAt } : null;
          } catch {
            return { id, title: "(unreadable project)", corrupt: true };
          }
        })
        .filter(Boolean)
        .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
    },

    loadProject(id) {
      const p = read(k.project(id), null);
      if (!p) return null;
      const m = migrate(p);
      const errors = validateProject(m);
      if (errors.length) throw new StorageError(`Project ${id} is invalid: ${errors.join(" ")}`, "invalid");
      return m;
    },

    saveProject(project) {
      const errors = validateProject(project);
      if (errors.length) throw new StorageError(`Refusing to save an invalid project: ${errors.join(" ")}`, "invalid");
      write(k.project(project.id), project);
      const idx = readIndex();
      if (!idx.includes(project.id)) write(k.index, [...idx, project.id]);
      return project;
    },

    /* Removes a project and its history. The UI must confirm first. */
    deleteProject(id) {
      backend.removeItem(k.project(id));
      backend.removeItem(k.history(id));
      write(k.index, readIndex().filter((x) => x !== id));
    },

    listVersions(projectId) {
      try {
        return read(k.history(projectId), []);
      } catch {
        return [];
      }
    },

    appendVersion(version) {
      if (!version) return null;
      const list = this.listVersions(version.projectId);
      write(k.history(version.projectId), [...list, version]);
      return version;
    },

    loadGlobalLessons() {
      try {
        return read(k.lessons, []);
      } catch {
        return [];
      }
    },

    saveGlobalLessons(lessons) {
      write(k.lessons, lessons);
    },

    /* Bytes used by this namespace (UTF-16 ≈ 2 bytes/char). */
    usage() {
      let chars = 0;
      for (const key of backend.keys()) if (key && key.startsWith(`${namespace}:`)) chars += (backend.getItem(key) || "").length + key.length;
      return { bytes: chars * 2 };
    },

    exportProject(id) {
      return { format: "grillstudio-project", schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), project: this.loadProject(id), versions: this.listVersions(id) };
    },

    /* Imports a backup. An existing project with the same id is never
       overwritten; the import gets a new id instead. */
    importProject(bundle, clock) {
      if (bundle?.format !== "grillstudio-project") throw new StorageError("Not a GrillStudio project file.", "format");
      let p = migrate(bundle.project);
      const errors = validateProject(p);
      if (errors.length) throw new StorageError(`Backup is invalid: ${errors.join(" ")}`, "invalid");
      const clash = readIndex().includes(p.id);
      if (clash) p = { ...p, id: clock.id("prj"), title: `${p.title} (imported)` };
      this.saveProject(p);
      const versions = (bundle.versions || []).map((v) => ({ ...v, projectId: p.id }));
      if (versions.length) write(k.history(p.id), versions);
      return p;
    },
  };
}
