# Media knowledge library

_Status: **story/screenplay knowledge and correction memory implemented**; image/video/audio ingestion **not started** (Phase 2)._

## Implemented (Phase 1)

| Capability | Where | Notes |
|---|---|---|
| Screenplay reading (Fountain) | `engine/screenplay.js` | Scene headings, int/ext, location, time of day, scene numbers, character cues with extensions stripped, dialogue, parentheticals, transitions, `[[notes]]`/boneyard removed, title page skipped. |
| Prose story reading | same | Paragraph passages; recurring capitalised names offered as **heuristic** candidate characters. |
| Source references | same | Every scene, dialogue line and action line keeps its line number in the original text. |
| Characters, locations, continuity | `engine/breakdown.js` | Scene appearances, line counts, non-speaking characters, long absences, missing visual references, misspelled name variants. |
| Character references | `project.characterNotes` | Look / wardrobe / voice notes per character, used by continuity checks. |
| Correction memory | `engine/lessons.js` | Records original, correction, what was wrong, lesson, tags, and context (project, mode, stage, audience feeling). Project or global scope. |
| Retrieval | same | Lexical token overlap with light stemming + tag/area/mode boosts. Each result says **why** it matched. Breakdown scenes show matching lessons. |

This is **memory and retrieval, not model training**.

## Planned (Phase 2) — design

```
upload ──► original store (immutable, content-hashed id) ──► job queue
                                                     ├─ probe (ffprobe metadata)
                                                     ├─ proxy + thumbnails
                                                     ├─ shot boundaries (ffmpeg scdet) + keyframes
                                                     ├─ audio: transcription (whisper), loudness, silence
                                                     ├─ visual analysis adapters (colour histograms locally; vision model optional)
                                                     └─ observations[] {assetId, t0, t1, kind, text, confidence, source}
                                       ──► search index (text + embeddings) ──► retrieval API
```

Rules: originals never modified; derived files stored separately; every observation references `assetId` + timestamps;
long videos processed in resumable stages; failures visible with retry. Free path first: in-browser ffmpeg.wasm for small
files, a container worker for long videos (requires infrastructure — see TASKS.md).

## Blockers

- No object storage or worker infrastructure yet (needs account setup and possibly cost → user authorization).
- Vision/transcription quality without paid models must be measured before claims are made.
