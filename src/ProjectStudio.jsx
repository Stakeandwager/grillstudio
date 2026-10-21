import { useEffect, useMemo, useRef, useState } from "react";
import { parseScreenplay } from "./filmProject.js";
import AnimaticStudio from "./AnimaticStudio.jsx";

const STORAGE_KEY = "grillstudio.film-project.v1";
const emptyProject = () => ({
  version: 1,
  id: crypto.randomUUID(),
  title: "Untitled film",
  screenplay: "",
  scenes: [],
  updatedAt: new Date().toISOString(),
});

function loadProject() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved?.version === 1 && typeof saved.title === "string" && typeof saved.screenplay === "string" && Array.isArray(saved.scenes)) {
      return { ...emptyProject(), ...saved };
    }
  } catch {
    // Keep the editor available if browser storage is blocked or corrupted.
  }
  return emptyProject();
}

function persistProject(value) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}

function ProjectStudio() {
  const [project, setProject] = useState(loadProject);
  const [storageError, setStorageError] = useState(false);
  const [showAnimatic, setShowAnimatic] = useState(false);
  const importRef = useRef(null);
  const scriptRef = useRef(null);
  const scenes = useMemo(() => parseScreenplay(project.screenplay, project.scenes), [project.screenplay, project.scenes]);
  const latestProject = useRef(project);
  latestProject.current = { ...project, scenes };
  const coveredCount = scenes.filter((scene) => scene.status === "covered").length;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const next = { ...project, scenes, updatedAt: new Date().toISOString() };
        persistProject(next);
        setStorageError(false);
      } catch {
        setStorageError(true);
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [project, scenes]);

  useEffect(() => () => {
    try {
      persistProject({ ...latestProject.current, updatedAt: new Date().toISOString() });
    } catch {
      // The visible autosave warning is shown while the editor is mounted.
    }
  }, []);

  const update = (changes) => setProject((current) => ({ ...current, ...changes }));
  const updateScene = (key, changes) => update({ scenes: scenes.map((scene) => scene.key === key ? { ...scene, ...changes } : scene) });

  const exportProject = () => {
    const payload = { ...project, scenes, updatedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${(project.title || "film-project").trim().replace(/[^\w.-]+/g, "-")}.grillstudio.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const importProject = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      if (file.size > 5_000_000) throw new Error("Project file is larger than 5 MB.");
      const parsed = JSON.parse(await file.text());
      if (parsed?.version !== 1 || typeof parsed.title !== "string" || typeof parsed.screenplay !== "string" || !Array.isArray(parsed.scenes)) {
        throw new Error("That file is not a supported GrillStudio film project.");
      }
      setProject({ ...emptyProject(), ...parsed, id: crypto.randomUUID() });
      setStorageError(false);
    } catch (error) {
      window.alert(error.message || "Couldn't open that project file.");
    }
  };

  const importScreenplay = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 5_000_000) {
      window.alert("Screenplay files must be 5 MB or smaller.");
      return;
    }
    try {
      update({ screenplay: await file.text() });
    } catch {
      window.alert("Couldn't read that screenplay file. Try a plain text .txt file.");
    }
  };

  if (showAnimatic) {
    return <div className="project-studio"><AnimaticStudio scenes={scenes} projectTitle={project.title} onUpdateScene={updateScene} onClose={() => setShowAnimatic(false)} /></div>;
  }

  return (
    <div className="project-studio">
      <section className="panel">
        <div className="project-heading-row">
          <div>
            <h2>Film project</h2>
            <p className="panel-note">Paste a screenplay or import a plain text script. Scene headings beginning with INT. or EXT. become a coverage checklist.</p>
          </div>
          <div className="project-actions">
            <button className="ghost-button" disabled={!scenes.length} onClick={() => setShowAnimatic(true)}>Preview animatic</button>
            <button className="ghost-button" onClick={() => importRef.current?.click()}>Open project</button>
            <button className="ember-button" onClick={exportProject}>Save project file</button>
            <input ref={importRef} type="file" accept="application/json,.json" hidden onChange={importProject} />
          </div>
        </div>
        <label className="project-label" htmlFor="project-title">Project name</label>
        <input id="project-title" className="text-input" maxLength={120} value={project.title} onChange={(event) => update({ title: event.target.value })} />
        <label className="project-label" htmlFor="screenplay">Screenplay</label>
        <div className="script-import-row">
          <button className="ghost-button small" onClick={() => scriptRef.current?.click()}>Import screenplay text</button>
          <span>Plain text, up to 5 MB</span>
          <input ref={scriptRef} type="file" accept="text/plain,.txt,.fountain" hidden onChange={importScreenplay} />
        </div>
        <textarea id="screenplay" className="text-input screenplay-input" placeholder={"INT. KITCHEN - NIGHT\nA cook prepares dinner.\n\nEXT. BACKYARD - NIGHT\nThe guests arrive."} value={project.screenplay} onChange={(event) => update({ screenplay: event.target.value })} />
        {storageError ? <div className="status error" role="alert">Browser storage is unavailable or full. Export a project file to keep a copy of your work.</div> : <div className="status" role="status">Autosaved on this device. Screenplay and notes stay in this browser unless you export or import a project file.</div>}
      </section>

      <section className="panel">
        <div className="project-heading-row">
          <div>
            <h2>Scene coverage</h2>
            <p className="panel-note">{scenes.length ? `${coveredCount} of ${scenes.length} scenes marked covered` : "Add screenplay scene headings to start the inventory."}</p>
          </div>
          <span className="coverage-count">{scenes.length ? `${coveredCount}/${scenes.length}` : "0 scenes"}</span>
        </div>
        {scenes.length > 0 ? <div className="scene-list">
          {scenes.map((scene, index) => (
            <article className="scene-card" key={scene.key}>
              <div className="scene-card-heading">
                <strong><span className="scene-number">{String(index + 1).padStart(2, "0")}</span>{scene.heading}</strong>
                <label className="scene-status-label" htmlFor={`scene-status-${index}`}>Footage status</label>
                <select id={`scene-status-${index}`} value={scene.status} onChange={(event) => updateScene(scene.key, { status: event.target.value })}>
                  <option value="missing">Missing</option>
                  <option value="planned">Planned</option>
                  <option value="covered">Covered</option>
                  <option value="review">Needs review</option>
                </select>
              </div>
              {scene.synopsis.length > 0 && <p className="scene-synopsis">{scene.synopsis.slice(0, 3).join(" ").slice(0, 360)}</p>}
              <label className="project-label" htmlFor={`scene-footage-${index}`}>Footage file or production note</label>
              <input id={`scene-footage-${index}`} className="text-input" maxLength={500} placeholder="e.g. kitchen_take_03.mp4 · close-up of the pan" value={scene.footage} onChange={(event) => updateScene(scene.key, { footage: event.target.value })} />
            </article>
          ))}
        </div> : <div className="empty-scenes">Scene headings such as <code>INT. APARTMENT - DAY</code> or <code>EXT. STREET - NIGHT</code> will appear here.</div>}
      </section>
    </div>
  );
}

export default ProjectStudio;
