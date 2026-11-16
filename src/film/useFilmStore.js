/* State + persistence for the Film workspace. All rules live in the
   engine; this hook only wires them to React and to storage. */
import { useCallback, useMemo, useState } from "react";
import {
  createRepository,
  createMemoryBackend,
  localStorageBackend,
  createProject,
  createVersion,
  defaultClock,
} from "../engine/index.js";

const openRepository = () => {
  try {
    const ls = window.localStorage;
    const probe = "grillstudio:probe";
    ls.setItem(probe, "1");
    ls.removeItem(probe);
    return { repo: createRepository(localStorageBackend(ls)), persistent: true };
  } catch {
    return { repo: createRepository(createMemoryBackend()), persistent: false };
  }
};

export function useFilmStore(clock = defaultClock) {
  const [{ repo, persistent }] = useState(openRepository);
  const [projects, setProjects] = useState(() => repo.listProjects());
  const [project, setProject] = useState(() => {
    const first = repo.listProjects().find((p) => !p.corrupt);
    try {
      return first ? repo.loadProject(first.id) : null;
    } catch {
      return null;
    }
  });
  const [versions, setVersions] = useState(() => (project ? repo.listVersions(project.id) : []));
  const [globalLessons, setGlobalLessons] = useState(() => repo.loadGlobalLessons());
  const [error, setError] = useState("");

  const refresh = useCallback(() => setProjects(repo.listProjects()), [repo]);

  const guard = useCallback((fn) => {
    try {
      setError("");
      return fn();
    } catch (e) {
      setError(e.reasons ? e.reasons.join(" ") : e.message);
      return undefined;
    }
  }, []);

  /* Persist a new project state; optionally record a version. */
  const commit = useCallback(
    (next, versionMessage, kind = "auto") =>
      guard(() => {
        repo.saveProject(next);
        setProject(next);
        if (versionMessage) {
          const list = repo.listVersions(next.id);
          const v = createVersion(next, { message: versionMessage, previous: list[list.length - 1] || null, kind }, clock);
          if (v) repo.appendVersion(v);
          setVersions(repo.listVersions(next.id));
        }
        refresh();
        return next;
      }),
    [repo, guard, refresh, clock]
  );

  /* Apply an engine function (project, ...args, clock) and save. */
  const apply = useCallback(
    (fn, args = [], versionMessage) =>
      guard(() => {
        const next = fn(project, ...args, clock);
        return commit(next, versionMessage);
      }),
    [project, commit, guard, clock]
  );

  const open = useCallback(
    (id) =>
      guard(() => {
        const p = repo.loadProject(id);
        setProject(p);
        setVersions(repo.listVersions(id));
      }),
    [repo, guard]
  );

  const create = useCallback(
    (input) =>
      guard(() => {
        const p = createProject(input, clock);
        commit(p, "Project created", "create");
        return p;
      }),
    [guard, commit, clock]
  );

  const remove = useCallback(
    (id) =>
      guard(() => {
        repo.deleteProject(id);
        const rest = repo.listProjects().filter((p) => !p.corrupt);
        refresh();
        if (project?.id === id) {
          const next = rest[0] ? repo.loadProject(rest[0].id) : null;
          setProject(next);
          setVersions(next ? repo.listVersions(next.id) : []);
        }
      }),
    [repo, guard, refresh, project]
  );

  const saveGlobalLessons = useCallback(
    (list) =>
      guard(() => {
        repo.saveGlobalLessons(list);
        setGlobalLessons(list);
      }),
    [repo, guard]
  );

  const importBundle = useCallback(
    (bundle) =>
      guard(() => {
        const p = repo.importProject(bundle, clock);
        refresh();
        setProject(p);
        setVersions(repo.listVersions(p.id));
        return p;
      }),
    [repo, guard, refresh, clock]
  );

  const usage = useMemo(() => repo.usage(), [repo, projects, versions]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    repo, persistent, projects, project, versions, globalLessons, error, setError, usage, clock,
    commit, apply, open, create, remove, saveGlobalLessons, importBundle,
  };
}
