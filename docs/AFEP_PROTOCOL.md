# AFEP — the filmmaking protocol

AFEP is the shared workflow every GrillStudio project follows, whatever the production method. Implemented in
`src/engine/workflow.js`, tested in `tests/engine/protocol.test.js`.

```
Understand → Interpret → Plan → Approve → Produce → Observe → Evaluate ─┬→ Verify → Deliver
                           ▲                  ▲                          │      │
                           └──── Correct ◄────┴──────────────────────────┘◄─────┘
```

## Gates (a move is refused with plain-language reasons until justified)

| Into | Requires |
|---|---|
| Interpret | Filmmaker intent **and** audience feeling written. |
| Plan | A story, treatment or screenplay. |
| Approve | A breakdown with at least one scene. |
| Produce | Explicit approval: a named approver at the Approve stage. |
| Correct / Verify | At least one evaluation. |
| Deliver | Latest evaluation passes both intention-critical criteria. |

- Going **back** is always allowed. Going back to Approve or earlier **revokes** the approval (the previous approval is kept for history).
- Editing the story after approval also revokes it.
- Every transition is logged in `project.stageLog`.

## The project distinguishes

| Question | Field |
|---|---|
| What the filmmaker intends | `intention.filmmakerIntent` |
| What the audience should feel | `intention.audienceFeeling` |
| What the story communicates | `intention.storyCommunicates` |
| What images and sounds are needed | `intention.imagesAndSounds` + breakdown needs |
| What production method can achieve it | `intention.productionMethod`, `mode` |
| Whether the result achieves it | `evaluations[]` |

## Evaluation

Criteria (★ = intention-critical): emotional impact ★, narrative coherence ★, character continuity, visual consistency,
performance, sound, pacing, technical delivery. Scores are 1–5 and **must include evidence**. Verdicts:

- `incomplete` — a ★ criterion is unscored (e.g. only "it exported fine" was judged);
- `misses-intention` — a ★ criterion scored below 4;
- `achieves-intention-with-issues` — ★ pass, others below 4 (deliverable, issues reported);
- `achieves-intention`.

Each evaluation stores a snapshot of the intention it was judged against.

## Shared model across live action and animation

The breakdown computes **both** live-action needs (location, cast, sync sound, lighting, schedule windows, exterior
logistics) and animation needs (environments, character assets, lip sync, lighting setup, virtual camera) for every scene.
`mode` only chooses which the UI shows; hybrid shows both. Each need carries a `why`.
