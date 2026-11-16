import { useEffect, useMemo, useRef, useState } from "react";
import {
  planShots,
  applyOverrides,
  setShotOverride,
  shotListCsv,
  buildImagePrompt,
  frameSeed,
  SHOT_SIZES,
  MOVEMENTS,
  ANGLES,
  PRODUCTION_MODES,
} from "../engine/index.js";
import { PROVIDERS, generateImage } from "../media/imageProviders.js";
import { saveFrame, loadFrames, deleteFrame } from "../media/frameStore.js";
import StoryboardSketch from "./StoryboardSketch.jsx";

const download = (name, text, type) => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};

/* Turns a stored frame record into something <img> can show. */
const useFrameUrls = (frames) => {
  const { urls, made } = useMemo(() => {
    const made = [];
    const urls = {};
    for (const f of Object.values(frames)) {
      if (f.url) urls[f.shotId] = f.url;
      else if (f.blob) {
        const u = URL.createObjectURL(f.blob);
        made.push(u);
        urls[f.shotId] = u;
      }
    }
    return { urls, made };
  }, [frames]);
  useEffect(() => () => made.forEach((u) => URL.revokeObjectURL(u)), [made]);
  return urls;
};

function ImageSettings({ provider, setProvider, apiKey, setApiKey }) {
  const p = PROVIDERS[provider];
  return (
    <div className="sb-settings">
      <label className="film-inline">
        AI images
        <select className="film-select" value={provider} onChange={(e) => setProvider(e.target.value)} aria-label="Image provider">
          <option value="off">Off — sketches only</option>
          {Object.entries(PROVIDERS).map(([id, x]) => (
            <option key={id} value={id}>{x.label}</option>
          ))}
        </select>
      </label>
      {p?.needsKey && (
        <input
          className="text-input"
          type="password"
          autoComplete="off"
          aria-label="Image API key"
          placeholder={p.keyHint}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
        />
      )}
      {p && <p className="panel-note">{p.cost} {p.needsKey && "Your key stays in this tab's memory and goes only to that provider."}</p>}
    </div>
  );
}

export default function ShotsPanel({ store, onGoStory }) {
  const { project, commit, apply, clock, globalLessons } = store;
  const [provider, setProvider] = useState("off");
  const [apiKey, setApiKey] = useState("");
  const [frames, setFrames] = useState({});
  const [busy, setBusy] = useState({});
  const [errors, setErrors] = useState({});
  const [editing, setEditing] = useState(null);
  const [look, setLook] = useState(project.visualStyle || "");
  const [queue, setQueue] = useState(null);
  const cancelRef = useRef(false);
  const urls = useFrameUrls(frames);

  useEffect(() => {
    let live = true;
    loadFrames(project.id).then((list) => live && setFrames(Object.fromEntries(list.map((f) => [f.shotId, f]))));
    return () => {
      live = false;
    };
  }, [project.id]);

  const plan = useMemo(
    () => (project.breakdown ? applyOverrides(planShots(project, { globalLessons }), project.shotOverrides) : null),
    [project, globalLessons]
  );

  if (!plan)
    return (
      <section className="panel">
        <h2>Shots & storyboard</h2>
        <p className="panel-note">Shots are planned from your analysed story and your intention.</p>
        <button className="ember-button" onClick={onGoStory}>Add and analyse a story</button>
      </section>
    );

  const sceneOf = (i) => project.breakdown.scenes[i];

  const generate = async (shot, scenePlan) => {
    const scene = sceneOf(scenePlan.scene);
    const prompt = buildImagePrompt(shot, scenePlan, scene, project);
    const seed = frameSeed(project, shot);
    setBusy((b) => ({ ...b, [shot.id]: true }));
    setErrors((e) => ({ ...e, [shot.id]: "" }));
    try {
      const out = await generateImage(provider, { prompt, seed, apiKey });
      const rec = await saveFrame({ projectId: project.id, shotId: shot.id, provider, prompt, seed, ...(out.kind === "url" ? { url: out.url } : { blob: out.blob }) });
      setFrames((f) => ({ ...f, [shot.id]: rec }));
      return true;
    } catch (e) {
      setErrors((x) => ({ ...x, [shot.id]: e.message }));
      return false;
    } finally {
      setBusy((b) => ({ ...b, [shot.id]: false }));
    }
  };

  const generateScene = async (scenePlan) => {
    cancelRef.current = false;
    const todo = scenePlan.shots.filter((s) => !frames[s.id]);
    setQueue({ done: 0, total: todo.length });
    for (let i = 0; i < todo.length; i++) {
      if (cancelRef.current) break;
      await generate(todo[i], scenePlan);
      setQueue({ done: i + 1, total: todo.length });
      if (provider === "pollinations" && i < todo.length - 1) await new Promise((r) => setTimeout(r, 5500));
    }
    setQueue(null);
  };

  const removeFrame = async (shot) => {
    await deleteFrame(project.id, shot.id);
    setFrames(({ [shot.id]: _gone, ...rest }) => rest);
  };

  const save = (shot, fields, note) => {
    commit(setShotOverride(project, shot.id, { fields, note }, clock), `Shot ${shot.id} edited`);
    setEditing(null);
  };

  return (
    <section className="panel">
      <h2>Shots & storyboard</h2>
      <div className="sb-summary">
        <p>
          <strong>{plan.totalShots} shots</strong> across {plan.scenes.length} scene{plan.scenes.length === 1 ? "" : "s"}, about{" "}
          {plan.estimatedMinutes} min, planned for <strong>{PRODUCTION_MODES[project.mode].label.toLowerCase()}</strong>.
        </p>
        <p className="panel-note">
          Visual approach from your intention:{" "}
          {plan.tones.map((t, i) => (
            <span key={t.id}>
              {i > 0 && " → "}
              <strong>{t.label}</strong>
              {t.matched.length ? ` (“${t.matched.join("”, “")}”)` : ""}
            </span>
          ))}
          {plan.arc && " — the look shifts across the film as the feeling changes."}
          {plan.tones[0].id === "neutral" && " Write what the audience should feel in Intention to shape the shots."}
        </p>
      </div>

      <div className="film-row">
        <input
          className="text-input"
          aria-label="Look of the film"
          placeholder="Look of the film, e.g. muted teal and amber, rain-soaked, Wong Kar-wai neon (used in AI images)"
          value={look}
          onChange={(e) => setLook(e.target.value)}
        />
        <button className="ghost-button small" disabled={look === (project.visualStyle || "")} onClick={() => apply((p, v, c) => ({ ...p, visualStyle: v, updatedAt: c.now() }), [look], "Look of the film updated")}>
          Save look
        </button>
      </div>

      <ImageSettings provider={provider} setProvider={setProvider} apiKey={apiKey} setApiKey={setApiKey} />

      <div className="panel-actions">
        <button className="ghost-button small" onClick={() => download(`${project.title.replace(/[^\w-]+/g, "_")}_shotlist.csv`, shotListCsv(plan), "text/csv")}>
          Download shot list (CSV)
        </button>
        <button className="ghost-button small" onClick={() => window.print()}>Print storyboard</button>
        {queue && (
          <span className="film-usage">
            Generating {queue.done}/{queue.total}…{" "}
            <button className="link-button" onClick={() => (cancelRef.current = true)}>Stop</button>
          </span>
        )}
      </div>

      {plan.scenes.map((sp) => {
        const scene = sceneOf(sp.scene);
        return (
          <article key={sp.scene} className="sb-scene">
            <header className="sb-scene-head">
              <div>
                <span className="timecode">{scene.number}</span> <strong>{sp.heading}</strong>
                <p className="film-why">
                  {sp.tone.label} · {sp.lighting}
                </p>
              </div>
              {provider !== "off" && (
                <button className="ember-button small" disabled={!!queue || (PROVIDERS[provider]?.needsKey && !apiKey)} onClick={() => generateScene(sp)}>
                  Generate scene images
                </button>
              )}
            </header>
            {sp.lessonsApplied.some((l) => l.changed.length) && (
              <div className="film-lessons-hit">
                {sp.lessonsApplied.filter((l) => l.changed.length).map((l) => (
                  <p key={l.lessonId}>
                    <strong>Lesson applied:</strong> {l.lesson} — changed {l.changed.join(", ")} (matches this scene's {l.matchedOn.join(", ")})
                  </p>
                ))}
              </div>
            )}
            <div className="sb-grid">
              {sp.shots.map((s) => {
                const img = urls[s.id];
                return (
                  <div key={s.id} className={s.edited ? "sb-card edited" : "sb-card"}>
                    <div className="sb-image">
                      {img ? (
                        <img
                          src={img}
                          alt={`AI frame: ${s.description}`}
                          loading="lazy"
                          onError={() => setErrors((x) => ({ ...x, [s.id]: "The image service didn't return a picture. Try again in a moment." }))}
                        />
                      ) : (
                        <StoryboardSketch shot={s} scene={scene} title={s.description} />
                      )}
                      {busy[s.id] && <div className="sb-busy">Drawing…</div>}
                    </div>
                    <div className="sb-meta">
                      <strong>
                        {s.n}. {SHOT_SIZES[s.size]?.label || s.size}
                      </strong>{" "}
                      <span className="film-kind">{s.purpose}</span>
                      <p>{s.description}</p>
                      <p className="film-why">
                        {s.angle} · {s.camera.text} · ~{s.seconds}s
                      </p>
                      <details>
                        <summary>Why this shot</summary>
                        <p className="film-why">{s.why}</p>
                        {s.adjustedBy.map((a) => (
                          <p key={a.lessonId} className="film-why">
                            Changed by your lesson “{a.lesson}” (was {Object.entries(a.before).map(([k, v]) => `${k}: ${v}`).join(", ")}).
                          </p>
                        ))}
                        {s.alternatives.length > 0 && (
                          <>
                            <p className="film-why"><strong>Alternatives</strong></p>
                            {s.alternatives.map((alt, i) => (
                              <div key={i} className="sb-alt">
                                <span className="film-why">
                                  {SHOT_SIZES[alt.size]?.label || alt.size}
                                  {alt.movement ? `, ${alt.movement}` : ""}
                                  {alt.angle ? `, ${alt.angle}` : ""} — {alt.why}
                                </span>
                                <button
                                  className="link-button"
                                  onClick={() => save(s, Object.fromEntries(Object.entries({ size: alt.size, movement: alt.movement, angle: alt.angle }).filter(([, v]) => v)), `Chose alternative: ${alt.why}`)}
                                >
                                  Use this
                                </button>
                              </div>
                            ))}
                          </>
                        )}
                        {frames[s.id]?.prompt && <p className="film-why sb-prompt">Image prompt: {frames[s.id].prompt}</p>}
                      </details>
                      {s.note && <p className="film-why">Note: {s.note}</p>}
                      {errors[s.id] && <p className="sb-error" role="alert">{errors[s.id]}</p>}
                      <div className="lib-actions">
                        {provider !== "off" && (
                          <button className="ghost-button small" disabled={busy[s.id] || !!queue || (PROVIDERS[provider]?.needsKey && !apiKey)} onClick={() => generate(s, sp)}>
                            {img ? "Regenerate" : "Generate image"}
                          </button>
                        )}
                        {img && <button className="ghost-button small" onClick={() => removeFrame(s)}>Use sketch</button>}
                        <button className="ghost-button small" onClick={() => setEditing(editing === s.id ? null : s.id)}>Edit</button>
                        <button className="ghost-button small danger" onClick={() => commit(setShotOverride(project, s.id, { removed: true }, clock), `Shot ${s.id} removed`)}>
                          Remove
                        </button>
                      </div>
                      {editing === s.id && <ShotEditor shot={s} onSave={save} />}
                    </div>
                  </div>
                );
              })}
            </div>
          </article>
        );
      })}
      {project.shotOverrides && Object.values(project.shotOverrides).some((o) => o.removed) && (
        <button className="link-button" onClick={() => commit({ ...project, shotOverrides: Object.fromEntries(Object.entries(project.shotOverrides).filter(([, o]) => !o.removed)) }, "Restored removed shots")}>
          Restore removed shots
        </button>
      )}
    </section>
  );
}

function ShotEditor({ shot, onSave }) {
  const [f, setF] = useState({ size: shot.size, angle: shot.angle, movement: shot.movement, description: shot.description });
  const [note, setNote] = useState(shot.note || "");
  return (
    <div className="sb-editor">
      <div className="film-row">
        <select className="film-select" aria-label="Shot size" value={f.size} onChange={(e) => setF({ ...f, size: e.target.value })}>
          {Object.entries(SHOT_SIZES).map(([id, s]) => <option key={id} value={id}>{s.label}</option>)}
        </select>
        <select className="film-select" aria-label="Angle" value={f.angle} onChange={(e) => setF({ ...f, angle: e.target.value })}>
          {[...new Set([...ANGLES, "over-the-shoulder", f.angle])].map((a) => <option key={a}>{a}</option>)}
        </select>
        <select className="film-select" aria-label="Movement" value={f.movement} onChange={(e) => setF({ ...f, movement: e.target.value })}>
          {[...new Set([...MOVEMENTS, f.movement])].map((m) => <option key={m}>{m}</option>)}
        </select>
      </div>
      <input className="text-input" aria-label="Shot description" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
      <input className="text-input" aria-label="Shot note" placeholder="Why you changed it (tip: also save it as a Lesson so future plans learn)" value={note} onChange={(e) => setNote(e.target.value)} />
      <button className="ember-button small" onClick={() => onSave(shot, f, note)}>Save shot</button>
    </div>
  );
}
