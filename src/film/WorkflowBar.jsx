import { useState } from "react";
import { STAGES, stageIndex, nextStages, transition, approvePlan } from "../engine/index.js";

const label = (id) => STAGES.find((s) => s.id === id)?.label || id;

/* Where each gate's missing work gets done, so a blocked reason is actionable. */
const FIX_SECTION = { interpret: "intention", plan: "story", approve: "story", correct: "evaluate", verify: "evaluate", deliver: "evaluate" };

export function WorkflowBar({ store, onNavigate }) {
  const { project, apply } = store;
  const [by, setBy] = useState("");
  const [note, setNote] = useState("");
  const current = stageIndex(project.stage);
  const stage = STAGES[current];
  const options = nextStages(project);
  const earlier = STAGES.slice(0, current);

  return (
    <section className="panel film-workflow" aria-label="Workflow">
      <ol className="film-stages">
        {STAGES.map((s, i) => (
          <li key={s.id} className={i === current ? "current" : i < current ? "done" : ""} aria-current={i === current ? "step" : undefined}>
            <span>{i + 1}</span>
            {s.label}
          </li>
        ))}
      </ol>
      <p className="film-stage-purpose">
        <strong>{stage.label}.</strong> {stage.purpose}
        {project.approval?.approved && (
          <span className="film-pill good"> Plan approved by {project.approval.by}</span>
        )}
        {!project.approval?.approved && project.approval?.revokedAt && (
          <span className="film-pill warn"> Approval revoked{project.approval.reason ? ` — ${project.approval.reason}` : " — the plan changed"}</span>
        )}
      </p>

      {project.stage === "approve" && !project.approval?.approved && (
        <form
          className="film-approve"
          onSubmit={(e) => {
            e.preventDefault();
            apply(approvePlan, [{ by, note }], `Plan approved by ${by.trim()}`);
          }}
        >
          <p className="panel-note">
            Approving says: this breakdown of {project.breakdown?.scenes?.length || 0} scene(s) is what should be produced.
            Changing the story or going back to planning revokes it.
          </p>
          <div className="film-row">
            <input className="text-input" aria-label="Approved by" placeholder="Your name" value={by} onChange={(e) => setBy(e.target.value)} />
            <input className="text-input" aria-label="Approval note" placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
            <button className="ember-button" type="submit" disabled={!by.trim()}>Approve plan</button>
          </div>
        </form>
      )}

      <div className="film-next">
        {options.map((o) => (
          <div key={o.to} className="film-next-item">
            <button
              className={o.ok ? "ember-button small" : "ghost-button small"}
              disabled={!o.ok}
              onClick={() => apply(transition, [o.to], `Stage → ${label(o.to)}`)}
            >
              Move to {label(o.to)}
            </button>
            {!o.ok && (
              <ul className="film-reasons">
                {o.reasons.map((r) => (
                  <li key={r}>
                    {r}{" "}
                    {FIX_SECTION[o.to] && (
                      <button className="link-button" onClick={() => onNavigate(FIX_SECTION[o.to])}>Fix this</button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
        {options.length === 0 && <p className="panel-note">Delivered. Go back to any stage to keep improving it.</p>}
        {earlier.length > 0 && (
          <label className="film-inline">
            Go back to
            <select
              className="film-select"
              value=""
              onChange={(e) => e.target.value && apply(transition, [e.target.value], `Stage ← ${label(e.target.value)}`)}
            >
              <option value="">choose…</option>
              {earlier.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          </label>
        )}
      </div>
    </section>
  );
}
