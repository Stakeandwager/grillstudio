# Architecture

_Last updated: 2026-10-31 (Phase 0 + Phase 1)._

## As found (Phase 0 inspection, commit `89705d2`)

| Part | State |
|---|---|
| `src/main.jsx` → `src/App.jsx` | Entry point. `App.jsx` had been replaced (Oct 21) by a **static mock**: hard-coded scenes/assets, a fake timeline, and an "Export Blender" button that only called `alert()`. |
| `src/CreateStudio.jsx` | Real, working browser editor (ffmpeg.wasm): trim, text, SRT captions, Jamendo CC music, polish, 16:9 and 9:16 export. **Orphaned** — not imported anywhere. |
| `src/GrowStudio.jsx` | Real YouTube research (outliers, keyword competition) + Claude idea engine. **Orphaned.** |
| `src/App.css` | Main stylesheet deleted in commit `5f37493` ("checkpoint before refactor"); only an "append to your existing stylesheet" fragment remained, and nothing imported it. |
| `netlify/functions/claude.mjs` | Anthropic proxy holding `ANTHROPIC_API_KEY`. **Open relay**: any client could spend the key. |
| Repo root | Five zero-byte junk files (`(`, `{`, `alert('Blender`, …) from a mis-quoted shell command; `git_runner.py` that commits everything and pushes straight to `main`; `make_app.py` (no-op). |
| Tests / CI / lint | None. `.oxlintrc.json` existed but oxlint wasn't installed. |
| Deployment | Netlify: `npm run build` → `dist/`, functions in `netlify/functions`, COOP/COEP headers for ffmpeg.wasm. |

## Now

```
Browser (React 18 + Vite 5, static on Netlify)
├── App shell  — Film | Create | Grow   (?studio= deep link)
├── film/      — Film workspace UI (React)
│   └── useFilmStore  ──► engine/storage  (repository interface)
│                            └── localStorage backend (today)
├── engine/    — framework-free filmmaking engine (pure JS, unit-tested)
│   ├── model        shared project model, intention, production modes
│   ├── workflow     AFEP stages, gates, approval
│   ├── screenplay   Fountain/prose reader with source line refs
│   ├── breakdown    per-mode requirements with reasons, continuity checks
│   ├── evaluation   evidence-required scoring, intention verdict
│   ├── history      append-only versions, content hash, diff, restore
│   ├── lessons      correction memory + explainable lexical retrieval
│   └── storage      repository adapter, migrations, quota/corrupt handling
├── CreateStudio — ffmpeg.wasm editor (unchanged behaviour)
└── GrowStudio   — YouTube research + idea engine (unchanged behaviour)

Netlify Function /api/claude — hardened proxy (origin check, shape/size caps)
```

The engine has no React or browser dependency, so the same code can run in a future server API or media worker.

## Target (replaceable services)

| Service | Phase | Candidate (free-first) | Notes |
|---|---|---|---|
| Auth + ownership | 2 | Netlify Identity / Supabase Auth | Needed before any server-side storage. |
| Server API | 2 | Netlify Functions | Short requests only (Netlify sync functions time out in seconds). |
| Database | 2 | Supabase Postgres (+ pgvector) or Netlify Blobs for JSON | Implements the same repository interface as `engine/storage`. |
| Media object storage | 2 | Cloudflare R2 / Supabase Storage / S3 | Originals immutable; derived files under a separate prefix. Never in Git or `dist/`. |
| Media workers | 2 | Container with FFmpeg (Fly.io/Render/self-host) or in-browser ffmpeg.wasm for small files | Netlify is not a long-running worker. Background jobs with progress/retry. |
| Vision / transcription adapters | 2 | Local first (whisper.cpp / transformers.js in browser), paid APIs only with approval | Provider-independent adapter interface. |
| Search index / semantic retrieval | 2–3 | pgvector or in-browser embeddings | Replaces lexical `scoreLesson` behind the same API. |
| Research providers | 3 | Openverse, Wikimedia Commons, Internet Archive, YouTube Data API, Vimeo | Official APIs only; licence + attribution stored. |
| 3D/animation tools | 5 | Blender (Python script export), Godot | Adapters generate scripts/files; GrillStudio doesn't embed them. |

Costs and limits must be measured and recorded in DECISIONS.md before any paid service is used, and the user must authorize spending.
