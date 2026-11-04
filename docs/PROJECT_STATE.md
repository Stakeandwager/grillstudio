# Project state

_Updated 2026-10-31 — end of session 1 (Phase 0 complete, Phase 1 complete)._

## What works (verified)

| Area | Status | Evidence |
|---|---|---|
| Create — browser video editor | Restored to the app (was orphaned) | UI test renders it; code unchanged except one rename |
| Grow — YouTube research + idea engine | Restored | UI test renders it |
| Film — intention, AFEP workflow with gates and named approval | New | protocol tests + UI journey |
| Film — screenplay/prose analysis → scenes, characters, locations, continuity | New | screenplay + breakdown tests |
| Film — live-action and animation needs from one story | New | breakdown tests |
| Film — evaluation against intention (evidence required) | New | evaluation tests + UI test |
| Film — corrections → lessons → shown on matching scenes | New | memory tests + UI test |
| Film — versions (append-only), compare, restore; backups export/import | New | memory tests |
| `/api/claude` hardened | Fixed | 8 proxy tests |
| `npm run verify` | 0 lint issues, 55/55 tests, build OK, 0 secrets | run 2026-10-31 |

## Progress against the definition of success

| # | Capability | State |
|---|---|---|
| 1 | Understand the creative intention | ✅ captured and enforced by gates |
| 2 | Analyse supplied material | ◐ text only (screenplay/prose); images/video not yet |
| 3 | Find visual references | ❌ Phase 3 |
| 4 | Coherent production plan | ◐ scene breakdown + needs; no shot list, schedule or budget yet |
| 5 | Live action or animation | ◐ shared model and needs; no production tooling yet |
| 6 | Help create material | ◐ Create editor (finishing only) |
| 7 | Evaluate the result | ◐ structured human evaluation |
| 8 | Receive corrections | ✅ |
| 9 | Preserve approved knowledge | ✅ local persistence |
| 10 | Apply lessons later | ◐ retrieved and shown; no recommender to change yet |

## Where to look
- Code: `src/engine/` (rules), `src/film/` (UI), `netlify/functions/claude.mjs`.
- Next tasks: [TASKS.md](TASKS.md). Why things are the way they are: [DECISIONS.md](DECISIONS.md).

## Branches
- `main` — production (unchanged this session).
- `dev/phase-0-1-foundation` — this work; PR #1 open; Deploy Preview built successfully: https://deploy-preview-1--grillstudio.netlify.app
