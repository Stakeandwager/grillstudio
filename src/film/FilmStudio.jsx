import { useRef, useState } from "react";
import { useFilmStore } from "./useFilmStore.js";
import { WorkflowBar } from "./WorkflowBar.jsx";
import { IntentionPanel, StoryPanel, BreakdownPanel, CharactersPanel, EvaluatePanel, LessonsPanel, HistoryPanel } from "./panels.jsx";
import { PRODUCTION_MODES, setMode } from "../engine/index.js";

const SECTIONS = [
  ["intention", "Intention"],
  ["story", "Story"],
  ["breakdown", "Breakdown"],
  ["characters", "Characters"],
  ["evaluate", "Evaluate"],
  ["lessons", "Lessons"],
  ["history", "History"],
];

const SAMPLE = `EXT. CITY STREET - NIGHT

Rain hammers the empty street. MAYA (30s, soaked coat) walks alone under dead neon.

She stops at a shuttered grill house. The sign still reads OPEN.

MAYA
(to herself)
Of course it does.

INT. GRILL HOUSE - NIGHT

Embers still glow in the charcoal pit. TUNDE (60s) wipes the counter.

TUNDE
We're closed.

MAYA
The sign says open.

TUNDE
The sign is a liar. Like most things.

Maya sits anyway. Tunde drops a skewer on the grill. It HISSES.

EXT. ROOFTOP - DAWN

Maya and Tunde watch the rain stop. Neither speaks.`;

function NewProject({ onCreate, first }) {
  const [title, setTitle] = useState("");
  const [mode, setModeValue] = useState("live-action");
  return (
    <form
      className="panel film-new"
      onSubmit={(e) => {
        e.preventDefault();
        if (onCreate({ title, mode })) setTitle("");
      }}
    >
      <h2>{first ? "Start your first film" : "New film"}</h2>
      {first && (
        <p className="panel-note">
          A film project holds one story and one intention. Live action and animation are just two ways of
          producing it, so you can switch later without starting over.
        </p>
      )}
      <label className="film-label" htmlFor="new-title">Working title</label>
      <input id="new-title" className="text-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. The Long Way Home" />
      <fieldset className="film-modes">
        <legend className="film-label">How will it be made?</legend>
        {Object.entries(PRODUCTION_MODES).map(([id, m]) => (
          <label key={id} className={mode === id ? "film-mode active" : "film-mode"}>
            <input type="radio" name="mode" value={id} checked={mode === id} onChange={() => setModeValue(id)} />
            <strong>{m.label}</strong>
            <span>{m.summary}</span>
          </label>
        ))}
      </fieldset>
      <button className="ember-button" type="submit" disabled={!title.trim()}>Create project</button>
    </form>
  );
}

export default function FilmStudio() {
  const store = useFilmStore();
  const { project, projects, error, setError, persistent, usage } = store;
  const [section, setSection] = useState("intention");
  const [showNew, setShowNew] = useState(false);
  const importRef = useRef(null);
  /* Remount draft-holding panels when the project or its restored version changes. */
  const panelKey = `${project?.id}:${store.versions.length}`;

  const exportProject = () => {
    const bundle = store.repo.exportProject(project.id);
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${project.title.replace(/[^\w-]+/g, "_")}.grillstudio.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const importProject = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      store.importBundle(JSON.parse(await file.text()));
    } catch {
      setError("That file isn't a readable GrillStudio project backup.");
    }
  };

  const del = () => {
    if (window.confirm(`Delete "${project.title}" and all its saved versions from this browser? Export a backup first if you might want it back.`))
      store.remove(project.id);
  };

  return (
    <div className="film">
      {!persistent && (
        <div className="status error" role="alert">
          This browser is blocking storage, so projects will be lost when you close the tab. Export a backup before leaving.
        </div>
      )}
      {error && (
        <div className="status error" role="alert">
          {error} <button className="link-button" onClick={() => setError("")}>Dismiss</button>
        </div>
      )}

      <div className="film-projectbar">
        {projects.length > 0 && (
          <select
            aria-label="Open project"
            className="film-select"
            value={project?.id || ""}
            onChange={(e) => {
              store.open(e.target.value);
              setShowNew(false);
            }}
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id} disabled={p.corrupt}>
                {p.title}
                {p.corrupt ? "" : ` — ${PRODUCTION_MODES[p.mode]?.label || p.mode}, ${p.stage}`}
              </option>
            ))}
          </select>
        )}
        <button className="ghost-button small" onClick={() => setShowNew((s) => !s)}>{showNew ? "Cancel" : "+ New film"}</button>
        <button className="ghost-button small" onClick={() => importRef.current?.click()}>Import backup</button>
        <input ref={importRef} type="file" accept="application/json,.json" hidden onChange={importProject} />
        {project && (
          <>
            <button className="ghost-button small" onClick={exportProject}>Export backup</button>
            <button className="ghost-button small danger" onClick={del}>Delete</button>
          </>
        )}
        <span className="film-usage" title="Space this browser is using for GrillStudio projects">
          {(usage.bytes / 1024).toFixed(0)} KB stored{persistent ? " in this browser" : " (not saved)"}
        </span>
      </div>

      {(showNew || !project) && (
        <NewProject
          first={!project}
          onCreate={(input) => {
            const p = store.create(input);
            if (p) {
              setShowNew(false);
              setSection("intention");
            }
            return p;
          }}
        />
      )}

      {project && !showNew && (
        <>
          <div className="film-titlebar">
            <h2>{project.title}</h2>
            <label className="film-inline">
              Made as
              <select
                className="film-select"
                value={project.mode}
                onChange={(e) => store.apply(setMode, [e.target.value], `Production mode → ${PRODUCTION_MODES[e.target.value].label}`)}
              >
                {Object.entries(PRODUCTION_MODES).map(([id, m]) => (
                  <option key={id} value={id}>{m.label}</option>
                ))}
              </select>
            </label>
          </div>

          <WorkflowBar store={store} onNavigate={setSection} />

          <nav className="toolbar film-sections" role="tablist" aria-label="Film sections">
            {SECTIONS.map(([id, label]) => (
              <button key={id} role="tab" aria-selected={section === id} className={section === id ? "tab active" : "tab"} onClick={() => setSection(id)}>
                {label}
                {id === "breakdown" && project.breakdown ? ` (${project.breakdown.scenes.length})` : ""}
                {id === "evaluate" && project.evaluations.length ? ` (${project.evaluations.length})` : ""}
                {id === "lessons" && project.lessons.length ? ` (${project.lessons.length})` : ""}
              </button>
            ))}
          </nav>

          {section === "intention" && <IntentionPanel key={panelKey} store={store} />}
          {section === "story" && <StoryPanel key={panelKey} store={store} sample={SAMPLE} onAnalysed={() => setSection("breakdown")} />}
          {section === "breakdown" && <BreakdownPanel store={store} onGoStory={() => setSection("story")} />}
          {section === "characters" && <CharactersPanel key={panelKey} store={store} />}
          {section === "evaluate" && <EvaluatePanel store={store} />}
          {section === "lessons" && <LessonsPanel store={store} />}
          {section === "history" && <HistoryPanel store={store} />}
        </>
      )}
    </div>
  );
}
