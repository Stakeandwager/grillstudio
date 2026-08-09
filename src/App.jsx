import { useState } from "react";
import { Icon } from "./icons.jsx";
import CreateStudio from "./CreateStudio.jsx";
import GrowStudio from "./GrowStudio.jsx";
import "./App.css";

function App() {
  const [mode, setMode] = useState("create");
  return (
    <div className="app">
      <header className="header">
        <div className="header-row">
          <div className="wordmark">
            {Icon.flame}
            <h1><span className="ember-text">Grill</span>Studio</h1>
          </div>
          <nav className="mode-switch" aria-label="Studio mode">
            <button className={mode === "create" ? "mode-tab active" : "mode-tab"} onClick={() => setMode("create")}>Create</button>
            <button className={mode === "grow" ? "mode-tab active" : "mode-tab"} onClick={() => setMode("grow")}>Grow</button>
          </nav>
        </div>
        <p>{mode === "create" ? "Turn your grill footage into Shorts — right in the browser. Nothing gets uploaded." : "Research, ideas and insight — fuel for your next upload."}</p>
      </header>
      <main className="editor">{mode === "create" ? <CreateStudio /> : <GrowStudio />}</main>
    </div>
  );
}
export default App;