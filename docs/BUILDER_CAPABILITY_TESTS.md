# Builder capability tests

Run: 2026-10-31, branch `dev/phase-0-1-foundation`, builder: Claude (Opus 5.5). No PASS without evidence.

| ID | Objective | Expected | Actual | Result | Evidence | Limitation / next action |
|---|---|---|---|---|---|---|
| BC-R1 | Inspect whole repository | All files read | 28 files read incl. history of 8 commits | PASS | ARCHITECTURE.md "As found" table | — |
| BC-R2 | Identify entry points & deps | Entry, build, functions mapped | `index.html → main.jsx → App.jsx`; Netlify function; ffmpeg.wasm | PASS | ARCHITECTURE.md | — |
| BC-R3 | Detect unfinished/duplicated features | Find mocks/orphans | Found mock App, orphaned Create/Grow, deleted CSS, junk files | PASS | DECISIONS D-001, D-002 | — |
| BC-A1 | Plan and implement a feature unaided | Working Phase 1 engine | 8 engine modules + Film UI | PASS | `src/engine`, `src/film`, 55 tests | — |
| BC-A2 | Write tests | Tests for each module | 55 tests, 6 files | PASS | `npm test`: 55 passed | — |
| BC-A3 | Diagnose & repair failing tests | Fix root cause, not test | 11 failures → implicit-scene bug from transitions + O(n²) stack overflow on 2,000 locations; fixed in parser. 1 wrong expectation in test corrected. | PASS | DECISIONS D-006 | — |
| BC-A4 | Resume from docs | New session can continue | Resume checklist written | NOT YET TESTED | BUILDER_AUTONOMY.md | Test at start of next session. |
| BC-E1 | Detect broken imports / lint | Lint clean | oxlint: 1 error (false hook positive `useTrack`), 3 warnings → 0 | PASS | `npm run lint` clean | — |
| BC-E2 | Identify security problems | Find real issues | Open proxy relay, error leakage, push-to-main script | PASS | SECURITY_AND_PRIVACY.md | Proxy residual risk until auth. |
| BC-E3 | Detect frontend secrets | Scanner + history | 0 findings in files and 6,874 history diff lines | PASS | `npm run check:secrets`; secrets.test.js | — |
| BC-E4 | Test API failures | 4xx/5xx paths covered | 8 proxy tests | PASS | proxy.test.js | — |
| BC-E5 | Avoid breaking existing features | Create/Grow still render | UI test asserts both; Create/Grow logic only renamed `useTrack→chooseTrack` and removed an unused helper | PASS (render) | app.test.jsx | Export/encode not automatically tested — needs media fixture (T-7). |
| BC-M1..M6 | Ingest image/video, keyframes, timestamps, sources | — | Not built | BLOCKED (scope: Phase 2) | — | Needs storage + worker decisions (T-4/T-5). |
| BC-M6b | Retrieve stored creative knowledge | Lesson retrievable after correction | Before: 0 hits; after recording: 1 hit with reasons; unrelated query: 0 | PASS (retrieval) | memory.test.js; UI lesson test | Does not yet prove *recommendations* improve — no recommender yet. |
| BC-S1..S4 | Multi-source research | — | Not built | BLOCKED (scope: Phase 3) | — | — |
| BC-P1 | Story → scene breakdown | Scenes, characters, locations w/ sources | Fountain fixture parsed exactly (5 scenes, 2 characters, misspelling flagged) | PASS | screenplay.test.js | Rule-based; no emotional analysis yet. |
| BC-P2 | Coherent shot plan | — | Not built | NOT STARTED (Phase 4) | — | — |
| BC-P3 | Character continuity | Continuity warnings | Missing references, long absences, non-speaking, name variants | PASS | protocol.test.js | Visual continuity needs media (Phase 2). |
| BC-P4 | Evaluate against intention | Evidence-required verdict | Implemented; export-only judgement → `incomplete` | PASS | protocol.test.js | Human-scored; no automated perception. |
| BC-D1 | Build | `vite build` succeeds | 59 modules, 1.1 s, bundle 252 KB (82 KB gz) | PASS | build output | — |
| BC-D2 | Built app works in a browser | No page errors, responsive | Chrome headless: Film journey works; no page errors; scrollWidth = viewport at 1280 and 390 | PASS | screenshots in PR | Fonts blocked in sandbox. |
| BC-D3 | Test production & preview | Reach live URLs | Sandbox proxy returns 403 for netlify.app | BLOCKED | curl output | User checks the Deploy Preview. |
| BC-D4 | Identify deployment failures / verify a release is live | Read deploy status | Netlify reports per-commit status to GitHub; read via REST: `netlify/grillstudio/deploy-preview: success` for PR #1 | PASS (preview build status) | GitHub commit status API | Can see build success/failure, not runtime behaviour on netlify.app (BC-D3). |

## Measured limits

| Measure | Value |
|---|---|
| Parse 2,000-scene screenplay (20,000 lines) | 66 ms mean of 5 warm runs, Node 22 (test budget 5 s) |
| Production JS bundle | 251.6 KB (82.1 KB gzip) |
| Storage after create → intention → analyse (4 versions, 3-scene story) | 35 KB of localStorage (browser quota typically ≈ 5 MB → roughly 100+ such projects; versions are full snapshots) |
