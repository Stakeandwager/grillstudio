import { useMemo, useState } from "react";
import {
  INTENTION_FIELDS,
  PRODUCTION_MODES,
  CRITERIA,
  VERDICT_TEXT,
  LESSON_AREAS,
  updateIntention,
  updateStory,
  analyseProject,
  setCharacterNote,
  addEvaluation,
  recordCorrection,
  retrieveLessons,
  sceneQuery,
  diffProjects,
  restoreVersion,
  createVersion,
  breakdownIsStale,
} from "../engine/index.js";

const when = (iso) => (iso ? new Date(iso).toLocaleString() : "");

/* ---------------- Intention ---------------- */
export function IntentionPanel({ store }) {
  const { project, apply } = store;
  const [draft, setDraft] = useState(project.intention);
  const dirty = INTENTION_FIELDS.some((f) => (draft[f.key] || "") !== (project.intention[f.key] || ""));
  return (
    <section className="panel">
      <h2>Creative intention</h2>
      <p className="panel-note">
        Everything later — the breakdown, the approval, the evaluation — is judged against these answers. Write them
        plainly; a sentence each is enough to start.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          apply(updateIntention, [draft], "Intention updated");
        }}
      >
        {INTENTION_FIELDS.map((f) => (
          <div key={f.key} className="film-field">
            <label className="film-label" htmlFor={`int-${f.key}`}>{f.label}</label>
            <textarea id={`int-${f.key}`} className="text-input" rows={2} placeholder={f.hint} value={draft[f.key] || ""} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })} />
          </div>
        ))}
        <button className="ember-button" type="submit" disabled={!dirty}>{dirty ? "Save intention" : "Saved"}</button>
      </form>
    </section>
  );
}

/* ---------------- Story ---------------- */
export function StoryPanel({ store, sample, onAnalysed }) {
  const { project, apply, clock } = store;
  const [text, setText] = useState(project.story.source);
  const dirty = text !== project.story.source;
  const analyse = () => {
    const withStory = updateStory(project, text, clock);
    const done = store.commit(analyseProject(withStory, clock), "Story analysed");
    if (done) onAnalysed();
  };
  return (
    <section className="panel">
      <h2>Story or screenplay</h2>
      <p className="panel-note">
        Paste a screenplay (scene headings like <code>INT. KITCHEN - NIGHT</code>, character names in capitals above their lines —
        the plain-text Fountain format) or just write the story as prose. Prose works too; it's read as passages.
      </p>
      <textarea className="text-input film-script" rows={16} value={text} onChange={(e) => setText(e.target.value)} aria-label="Story text" spellCheck={false} />
      <div className="panel-actions">
        <button className="ember-button" onClick={analyse} disabled={!text.trim()}>Analyse into scenes</button>
        <button className="ghost-button" onClick={() => apply(updateStory, [text], "Story saved")} disabled={!dirty}>Save without analysing</button>
        {!text.trim() && (
          <button className="ghost-button" onClick={() => setText(sample)}>Load a short sample scene</button>
        )}
        <label className="ghost-button as-label">
          Open .fountain / .txt
          <input type="file" accept=".fountain,.txt,.md,text/plain" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) setText(await f.text()); e.target.value = ""; }} />
        </label>
      </div>
      {project.approval?.approved && dirty && (
        <div className="status" role="note">Saving a changed story will revoke the current plan approval.</div>
      )}
    </section>
  );
}

/* ---------------- Breakdown ---------------- */
function Needs({ list }) {
  if (!list.length) return <p className="panel-note">Nothing derived for this scene.</p>;
  return (
    <ul className="film-needs">
      {list.map((n, i) => (
        <li key={i}>
          <span className={`film-kind k-${n.kind}`}>{n.kind.replace(/-/g, " ")}</span>
          <strong>{n.item}</strong>
          <span className="film-why">{n.why}</span>
        </li>
      ))}
    </ul>
  );
}

export function BreakdownPanel({ store, onGoStory }) {
  const { project, globalLessons } = store;
  const b = project.breakdown;
  const [open, setOpen] = useState(0);
  const modes = project.mode === "hybrid" ? ["live-action", "animation"] : [project.mode];
  const allLessons = useMemo(() => [...project.lessons, ...globalLessons], [project.lessons, globalLessons]);
  if (!b)
    return (
      <section className="panel">
        <h2>Breakdown</h2>
        <p className="panel-note">No breakdown yet.</p>
        <button className="ember-button" onClick={onGoStory}>Add and analyse a story</button>
      </section>
    );
  const stale = breakdownIsStale(project);
  return (
    <section className="panel">
      <h2>Breakdown</h2>
      <div className="metric-row film-metrics">
        <div className="metric"><strong>{b.stats.scenes}</strong><span>{b.format === "prose" ? "passages" : "scenes"}</span></div>
        <div className="metric"><strong>{b.stats.characters || b.candidateCharacters.length}</strong><span>characters</span></div>
        <div className="metric"><strong>{b.stats.locations}</strong><span>locations</span></div>
        <div className="metric"><strong>~{b.totals.estimatedScreenMinutes}</strong><span>min (1 page ≈ 1 min)</span></div>
      </div>
      {stale ? (
        <div className="status" role="note">
          The story has changed since this breakdown was made ({when(b.analysedAt)}).{" "}
          <button className="link-button" onClick={onGoStory}>Analyse again</button>
        </div>
      ) : (
        <p className="panel-note">Analysed {when(b.analysedAt)} from the current story.</p>
      )}

      {(b.warnings.length > 0 || b.continuity.length > 0) && (
        <div className="film-warnings">
          <h3>Check these</h3>
          <ul>
            {b.warnings.map((w, i) => <li key={`w${i}`}>{w.message}</li>)}
            {b.continuity.map((c, i) => <li key={`c${i}`}>{c.message}</li>)}
          </ul>
        </div>
      )}

      <div className="film-scenes">
        {b.scenes.map((s, i) => {
          const lessons = retrieveLessons(allLessons, sceneQuery(s, project), { limit: 3 });
          const isOpen = open === i;
          return (
            <article key={i} className={isOpen ? "film-scene open" : "film-scene"}>
              <button className="film-scene-head" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? -1 : i)}>
                <span className="timecode">{s.number}</span>
                <strong>{s.heading}</strong>
                <span className="film-scene-meta">
                  {s.present.length ? s.present.join(", ") : "no named characters"} · {s.pageEighths}/8 pg
                  {lessons.length ? ` · ${lessons.length} lesson${lessons.length > 1 ? "s" : ""}` : ""}
                </span>
              </button>
              {isOpen && (
                <div className="film-scene-body">
                  {s.action.length > 0 && <p className="film-action">{s.action.map((a) => a.text).join(" ").slice(0, 400)}{s.action.map((a) => a.text).join(" ").length > 400 ? "…" : ""}</p>}
                  {s.dialogue.length > 0 && (
                    <p className="panel-note">{s.dialogue.length} line(s) of dialogue: {[...new Set(s.dialogue.map((d) => d.character))].join(", ")}</p>
                  )}
                  {modes.map((m) => (
                    <div key={m}>
                      <h4>{PRODUCTION_MODES[m].label} needs</h4>
                      <Needs list={s.needs[m]} />
                    </div>
                  ))}
                  {lessons.length > 0 && (
                    <div className="film-lessons-hit">
                      <h4>Lessons that may apply</h4>
                      {lessons.map((l) => (
                        <p key={l.lesson.id}><strong>{l.lesson.lesson}</strong> <span className="film-why">({l.why.join("; ")})</span></p>
                      ))}
                    </div>
                  )}
                  <p className="film-source">Source: story lines {s.source.startLine}–{s.source.endLine}</p>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

/* ---------------- Characters ---------------- */
export function CharactersPanel({ store }) {
  const { project, commit, clock } = store;
  const b = project.breakdown;
  const people = b ? (b.characters.length ? b.characters : b.candidateCharacters.map((c) => ({ ...c, sceneIndexes: [], lines: 0, guess: true }))) : [];
  const [drafts, setDrafts] = useState({});
  if (!people.length)
    return (
      <section className="panel">
        <h2>Characters</h2>
        <p className="panel-note">Analyse a story first — characters are found from who speaks and who is named.</p>
      </section>
    );
  const save = (name) => {
    const d = drafts[name] || {};
    let next = setCharacterNote(project, name, d, clock);
    if (next.breakdown) next = analyseProject(next, clock);
    commit(next, `Continuity reference for ${name}`);
  };
  return (
    <section className="panel">
      <h2>Characters & continuity</h2>
      <p className="panel-note">
        Write how each character looks, dresses and sounds. These references are what keeps them consistent from scene
        to scene — for actors and for animated models alike.
      </p>
      {people.map((c) => {
        const note = { ...project.characterNotes?.[c.name], ...drafts[c.name] };
        const set = (k, v) => setDrafts({ ...drafts, [c.name]: { ...drafts[c.name], [k]: v } });
        return (
          <div key={c.name} className="film-character">
            <div className="film-character-head">
              <strong>{c.name}</strong>
              <span className="film-scene-meta">
                {c.guess ? "possible character (guessed from prose)" : `${c.lines} line(s) · scenes ${c.sceneIndexes.map((n) => n + 1).join(", ")}`}
              </span>
            </div>
            <div className="film-row">
              <input className="text-input" aria-label={`${c.name} look`} placeholder="Look: face, hair, build, age" value={note.look || ""} onChange={(e) => set("look", e.target.value)} />
              <input className="text-input" aria-label={`${c.name} wardrobe`} placeholder="Wardrobe & props" value={note.wardrobe || ""} onChange={(e) => set("wardrobe", e.target.value)} />
              <input className="text-input" aria-label={`${c.name} voice`} placeholder="Voice & manner" value={note.voice || ""} onChange={(e) => set("voice", e.target.value)} />
            </div>
            <button className="ghost-button small" onClick={() => save(c.name)} disabled={!drafts[c.name]}>Save reference</button>
          </div>
        );
      })}
    </section>
  );
}

/* ---------------- Evaluate ---------------- */
export function EvaluatePanel({ store }) {
  const { project, apply } = store;
  const [subject, setSubject] = useState("");
  const [scores, setScores] = useState({});
  const set = (id, k, v) => setScores({ ...scores, [id]: { ...scores[id], [k]: v } });
  return (
    <section className="panel">
      <h2>Evaluate against the intention</h2>
      <div className="film-intent-recap">
        <p><span>Intended:</span> {project.intention.filmmakerIntent || <em>not written yet</em>}</p>
        <p><span>Audience should feel:</span> {project.intention.audienceFeeling || <em>not written yet</em>}</p>
      </div>
      <p className="panel-note">
        A clean export isn't a successful film. Score what you saw — 1 (fails) to 5 (fully works) — and say where you saw it.
        The two starred criteria decide whether it achieves the intention.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const ok = apply(addEvaluation, [{ subject, scores }], `Evaluation: ${subject}`);
          if (ok) {
            setScores({});
            setSubject("");
          }
        }}
      >
        <input className="text-input" aria-label="What is being evaluated" placeholder="What are you evaluating? e.g. Rough cut v1, Scene 3 animatic" value={subject} onChange={(e) => setSubject(e.target.value)} />
        <div className="film-criteria">
          {CRITERIA.map((c) => (
            <div key={c.id} className="film-criterion">
              <label className="film-label" htmlFor={`sc-${c.id}`}>{c.label}{c.critical ? " ★" : ""}</label>
              <span className="film-why">{c.question}</span>
              <div className="film-row">
                <select id={`sc-${c.id}`} className="film-select" value={scores[c.id]?.score ?? ""} onChange={(e) => set(c.id, "score", e.target.value)}>
                  <option value="">—</option>
                  {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
                <input className="text-input" aria-label={`${c.label} evidence`} placeholder="Evidence: what you saw or heard, and where (timecode, scene)" value={scores[c.id]?.evidence || ""} onChange={(e) => set(c.id, "evidence", e.target.value)} />
              </div>
            </div>
          ))}
        </div>
        <button className="ember-button" type="submit" disabled={!subject.trim()}>Record evaluation</button>
      </form>
      {project.evaluations.length > 0 && (
        <div className="text-layers">
          <h3>Evaluations</h3>
          {[...project.evaluations].reverse().map((ev) => (
            <div key={ev.id} className={`result-card verdict ${ev.verdict === "achieves-intention" ? "good" : ev.verdict === "misses-intention" ? "fix" : "ok"}`}>
              <div className="layer-info">
                <strong>{ev.subject}</strong>
                <span>{VERDICT_TEXT[ev.verdict]} {ev.average != null && `Average ${ev.average}/5.`}</span>
                <span className="timecode">{when(ev.at)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/* ---------------- Lessons ---------------- */
export function LessonsPanel({ store }) {
  const { project, commit, clock, globalLessons, saveGlobalLessons, setError } = store;
  const blank = { area: "visual-style", original: "", correction: "", whatWasWrong: "", lesson: "", tags: "", scope: "project" };
  const [f, setF] = useState(blank);
  const [q, setQ] = useState("");
  const all = [...project.lessons, ...globalLessons];
  const hits = q.trim() ? retrieveLessons(all, { query: q, mode: project.mode }, { limit: 10, minScore: 0.01 }) : null;
  const submit = (e) => {
    e.preventDefault();
    try {
      const input = { ...f, tags: f.tags.split(",") };
      const { project: next, lesson } = recordCorrection(project, input, clock);
      if (lesson.scope === "global") saveGlobalLessons([...globalLessons, lesson]);
      commit(lesson.scope === "global" ? { ...next, lessons: project.lessons } : next, `Lesson: ${lesson.lesson.slice(0, 40)}`);
      setF(blank);
    } catch (err) {
      setError(err.reasons ? err.reasons.join(" ") : err.message);
    }
  };
  const field = (k, label, ph, rows = 2) => (
    <div className="film-field">
      <label className="film-label" htmlFor={`ls-${k}`}>{label}</label>
      <textarea id={`ls-${k}`} className="text-input" rows={rows} placeholder={ph} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
    </div>
  );
  return (
    <section className="panel">
      <h2>Corrections & lessons</h2>
      <p className="panel-note">
        When something GrillStudio suggested was wrong, record the correction here. Lessons are stored and searched, and the
        breakdown shows the ones that match each scene. This is memory, not AI retraining — nothing is sent anywhere.
      </p>
      <form onSubmit={submit}>
        <div className="film-row">
          <label className="film-inline">Area
            <select className="film-select" value={f.area} onChange={(e) => setF({ ...f, area: e.target.value })}>
              {LESSON_AREAS.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </label>
          <label className="film-inline">Applies to
            <select className="film-select" value={f.scope} onChange={(e) => setF({ ...f, scope: e.target.value })}>
              <option value="project">this film only</option>
              <option value="global">all my films</option>
            </select>
          </label>
        </div>
        {field("original", "What was suggested or done", "e.g. Bright, even lighting on the rain walk")}
        {field("correction", "What it should be", "e.g. One sodium streetlight, deep shadows, wet reflections")}
        {field("whatWasWrong", "Why it was wrong", "e.g. Bright light killed the loneliness")}
        {field("lesson", "The lesson to remember", "e.g. Lonely night exteriors need low-key light from one motivated source")}
        <input className="text-input" aria-label="Tags" placeholder="Tags, comma-separated (night, lonely, lighting)" value={f.tags} onChange={(e) => setF({ ...f, tags: e.target.value })} />
        <button className="ember-button" type="submit">Save lesson</button>
      </form>

      <div className="text-layers">
        <h3>Search lessons</h3>
        <input className="text-input" aria-label="Search lessons" placeholder="e.g. night lighting" value={q} onChange={(e) => setQ(e.target.value)} />
        {(hits ? hits.map((h) => ({ l: h.lesson, why: h.why })) : all.map((l) => ({ l }))).map(({ l, why }) => (
          <div key={l.id} className="layer-card">
            <div className="layer-info">
              <strong>{l.lesson}</strong>
              <span>{l.area} · {l.scope === "global" ? "all films" : "this film"}{l.tags.length ? ` · ${l.tags.join(", ")}` : ""}</span>
              {why && <span className="film-why">Matched: {why.join("; ")}</span>}
            </div>
          </div>
        ))}
        {hits && hits.length === 0 && <p className="panel-note">No stored lesson matches that.</p>}
        {!hits && all.length === 0 && <p className="panel-note">No lessons yet.</p>}
      </div>
    </section>
  );
}

/* ---------------- History ---------------- */
export function HistoryPanel({ store }) {
  const { project, versions, commit, repo, clock } = store;
  const [msg, setMsg] = useState("");
  const [compare, setCompare] = useState(null);
  const saveVersion = () => {
    const last = versions[versions.length - 1] || null;
    const v = createVersion(project, { message: msg || "Saved version", previous: last, kind: "manual" }, clock);
    if (!v) {
      store.setError("Nothing has changed since the last version.");
      return;
    }
    commit(project, msg || "Saved version", "manual");
    setMsg("");
  };
  const restore = (v) => {
    if (!window.confirm(`Restore version ${v.number} ("${v.message}")? Your current state stays in history as well.`)) return;
    const last = versions[versions.length - 1] || null;
    if (last && createVersion(project, { previous: last }, clock)) {
      repo.appendVersion(createVersion(project, { message: "Before restore", previous: last, kind: "auto" }, clock));
    }
    commit(restoreVersion(v, clock), `Restored version ${v.number}`, "restore");
  };
  const diff = compare ? diffProjects(compare.snapshot, project) : null;
  return (
    <section className="panel">
      <h2>Versions</h2>
      <p className="panel-note">Every important step is saved as a version. Restoring never deletes anything — it adds a new version.</p>
      <div className="lib-search-row">
        <input className="text-input" aria-label="Version message" placeholder="Describe this version (optional)" value={msg} onChange={(e) => setMsg(e.target.value)} />
        <button className="ember-button" onClick={saveVersion}>Save version</button>
      </div>
      {diff && (
        <div className="film-warnings">
          <h3>Version {compare.number} → now</h3>
          {diff.length === 0 ? <p className="panel-note">No differences.</p> : (
            <ul>{diff.map((d) => <li key={d.path}><code>{d.path}</code>: {String(d.from)} → {String(d.to)}</li>)}</ul>
          )}
          <button className="link-button" onClick={() => setCompare(null)}>Close</button>
        </div>
      )}
      <div className="text-layers">
        {[...versions].reverse().map((v) => (
          <div key={v.id} className="layer-card">
            <div className="layer-info">
              <strong>v{v.number} · {v.message}</strong>
              <span className="timecode">{when(v.at)} · {v.kind} · {v.hash}</span>
            </div>
            <div className="lib-actions">
              <button className="ghost-button small" onClick={() => setCompare(v)}>Compare</button>
              <button className="ghost-button small" onClick={() => restore(v)}>Restore</button>
            </div>
          </div>
        ))}
        {versions.length === 0 && <p className="panel-note">No versions yet.</p>}
      </div>
    </section>
  );
}
