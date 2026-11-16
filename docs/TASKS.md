# Tasks

Status: ☐ open · ◐ in progress · ☑ done · ⛔ blocked (needs user)

## Done this session
☑ T-0 Phase 0 inspection report and architecture map
☑ T-1 Restore Create + Grow + stylesheet; remove junk files and push-to-main script
☑ T-2 Harden `/api/claude`; secret scanner; lint/test/build `verify` gate
☑ Phase 1 engine: project model, intention, AFEP workflow + approval, screenplay reader, breakdown, evaluation, history, lessons, storage
☑ Film workspace UI with persistence, backups, versions

## Done 2026-11-16
☑ T-6 Shot planning + storyboard (sketch frames, AI images via Pollinations/OpenAI/Gemini, CSV, print)
☑ T-14 Lesson effect test: a recorded lesson now changes later shot recommendations (tests/engine/shots.test.js)

## Next (no paid services needed)
☐ T-16 Character reference images: generate/attach one image per character and reuse it for consistency.
☐ T-17 Animatic: play storyboard frames with timings and temp sound (salvage from `codex/film-project-foundation`).
☐ T-18 Schedule + budget estimate from breakdown and shot list.
☐ T-7 Media test fixtures (tiny MP4 with/without audio, corrupt file) + automated ffmpeg.wasm export test for Create.
☐ T-8 Phase 2 in-browser ingestion for small files: image/video metadata, thumbnails, scene-change keyframes via ffmpeg.wasm, observations with timestamps, stored in IndexedDB (originals untouched).
☐ T-9 Upgrade Vite/Vitest to clear dev-only audit findings.
☐ T-11 GitHub Actions: run `npm run verify` on every PR.
☐ T-12 Blender adapter: export the breakdown as a real Blender Python script (scenes → collections, cameras, placeholder characters).
☐ T-13 Phase 3 research agent with Openverse + Wikimedia Commons (no keys required).

## Needs user decision / authorization
⛔ T-3 Auth + per-user rate limit for `/api/claude` (choose Netlify Identity vs Supabase; may involve accounts).
⛔ T-4 Media object storage provider (R2 / Supabase / S3) — account + possible cost.
⛔ T-5 Long-video worker hosting (container with FFmpeg) — account + possible cost.
⛔ T-10 Deploy build status is readable via GitHub (done); runtime checks of netlify.app still need the user. add Deploy Preview URL to `GRILLSTUDIO_ALLOWED_ORIGINS` if testing the Idea engine on previews.
⛔ T-15 Merge PR to `main` (production release) — user approval after testing the Deploy Preview.

## User feedback inbox
_(Problems reported in ordinary language become tasks here.)_
