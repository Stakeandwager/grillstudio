# Decisions

Newest last. Each entry: context → decision → consequences.

### D-001 · 2026-10-31 · Restore the real app shell
The Oct 21 commits replaced `App.jsx` with a static mock that orphaned the working editor (CreateStudio) and research tools
(GrowStudio). **Decision:** restore the pre-mock shell (`5f37493`), add a third "Film" mode for the new engine, keep Create as
the default so existing users see the same first screen. `?studio=film|create|grow` deep-links. The mock's features (fake
assets, fake timeline, `alert()` export) were not real and are not carried over.

### D-002 · Restore the stylesheet
`App.css` was cut to a fragment in `5f37493`. **Decision:** restore the full sheet from `b9402fd` and append the fragment plus the
missing `.crop-mask/.crop-window` styles. Verified every class used by Create/Grow now exists.

### D-003 · Remove junk and the push-to-main script
Deleted the five zero-byte files, `make_app.py` and `git_runner.py`. All recoverable from git history.

### D-004 · Engine as framework-free pure functions
`src/engine/*` has no React/browser dependency and takes an injected clock (`{id, now}`). Reason: unit-testable, reusable in a
future server API/worker, deterministic fixtures.

### D-005 · Fountain as the screenplay format; rule-based reading first
Fountain is the open plain-text screenplay standard. Rule-based parsing works offline, is free and traceable to source lines.
Language-model interpretation can be layered later through an adapter, never replacing the traceable layer.

### D-006 · Parser fixes found by tests
Transitions (e.g. `FADE IN:`) were creating a phantom first scene; the spelling-variant check was O(n²) and overflowed the stack
on 2,000 locations via array spread. **Fix:** handle transitions before scene creation; skip digit-only differences
("ROOM 1"/"ROOM 2"), length-prefilter, cap at 400 names with a visible "truncated" warning, no spreads.

### D-007 · Approval is explicit, named, and revocable
Producing requires a named approval at the Approve stage. Going back to Approve or earlier, or changing the story, revokes it
(previous approval retained). Reason: directive "Plan → Approve → Produce" and "the engine must not run ahead of the filmmaker".

### D-008 · Evaluation requires evidence; two criteria are intention-critical
Emotional impact and narrative coherence decide the verdict; an evaluation that only scores technical delivery is
`incomplete`. Non-critical issues allow delivery but are reported.

### D-009 · Versions are full snapshots, append-only
Simple and safe; restore adds a version. Cost: storage grows linearly. Acceptable in localStorage for now; revisit with
server storage (delta storage or pruning only with user consent).

### D-010 · Lessons use lexical retrieval behind a replaceable scorer
No embedding model is available for free in this phase without adding a large browser download. `scoreLesson` returns
score + reasons; an embedding retriever can replace it with the same output. Documented as memory, not training.

### D-011 · Local-first storage via a repository adapter
`localStorage` with namespaces, schema version + `migrate()`, quota and corruption handling, export/import backups.
Server persistence will implement the same interface once auth exists.

### D-012 · Harden `/api/claude` instead of disabling it
Disabling would break the hosted Idea engine. Origin check + strict shape/size caps cut abuse substantially; residual risk
documented and tracked (T-3).

### D-013 · Tooling: Vitest + Testing Library + oxlint
Vitest shares Vite's config; oxlint was already configured. `npm run verify` is the release gate.
