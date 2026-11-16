import { useState } from "react";
import { Icon } from "./icons.jsx";
import CreateStudio from "./CreateStudio.jsx";
import GrowStudio from "./GrowStudio.jsx";
import FilmStudio from "./film/FilmStudio.jsx";
import "./App.css";
import "./film/film.css";

/* Restored shell (see docs/DECISIONS.md D-001): the October commits
   replaced this with a static mock that orphaned the real editor and the
   research tools. Create and Grow are back; Film is the new engine. */

const MODES = {
  film: "Plan a film: intention, story breakdown, approval, evaluation and the lessons it learns.",
  create: "Turn your footage into finished cuts — right in the browser. Nothing gets uploaded.",
  grow: "Research, ideas and insight — fuel for your next upload.",
};

function App() {
  const [mode, setMode] = useState(() => {
    const m = new URLSearchParams(window.location.search).get("studio");
    return MODES[m] ? m : "create";
  });
  const pick = (m) => {
    setMode(m);
    const url = new URL(window.location.href);
    url.searchParams.set("studio", m);
    window.history.replaceState(null, "", url);
  };
  return (
    <div className="app">
      <header className="header">
        <div className="header-row">
          <div className="wordmark">
            {Icon.flame}
            <h1><span className="ember-text">Grill</span>Studio</h1>
          </div>
          <nav className="mode-switch" aria-label="Studio mode">
            {[["film", "Film"], ["create", "Create"], ["grow", "Grow"]].map(([id, label]) => (
              <button key={id} className={mode === id ? "mode-tab active" : "mode-tab"} aria-pressed={mode === id} onClick={() => pick(id)}>
                {label}
              </button>
            ))}
          </nav>
        </div>
        <p>{MODES[mode]}</p>
      </header>
      <main className={mode === "film" ? "editor wide" : "editor"}>
        {mode === "film" ? <FilmStudio /> : mode === "create" ? <CreateStudio /> : <GrowStudio />}
      </main>
    </div>
  );
}

export default App;
