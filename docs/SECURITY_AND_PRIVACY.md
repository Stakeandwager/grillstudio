# Security and privacy

## Findings (Phase 0, 2026-10-31)

| ID | Finding | Severity | Status |
|---|---|---|---|
| S-1 | `/api/claude` was an open relay: any client could send any messages and up to 2048 tokens on the owner's Anthropic key. | High (cost abuse) | **Mitigated** — see below. Residual risk remains. |
| S-2 | Upstream/internal error text was echoed to clients. | Low | **Fixed** — generic 502. |
| S-3 | `git_runner.py` committed everything and pushed straight to `main`. | Medium (process) | **Removed.** |
| S-4 | Credentials in source, built bundle, docs or git history. | — | **None found** (scanner + full history scan: 6,874 diff lines). |
| S-5 | npm audit: moderate `esbuild` (dev server only) and high `source-map-js` in dev tooling. | Low (dev only, `npm audit --omit=dev` = 0) | Open — upgrade with Vite 6+ (TASKS T-9). |
| S-6 | YouTube/Jamendo/Anthropic user keys typed in the UI live only in React state (not persisted). Direct browser→Anthropic calls use the user's own key. | Info | Accepted; documented in README. |

## `/api/claude` hardening (S-1)

- Requires a same-site `Origin` (or one listed in `GRILLSTUDIO_ALLOWED_ORIGINS`).
- Body ≤ 32 KB; 1–6 messages; user/assistant text only; ≤ 6,000 chars each; first message from user.
- Client cannot choose model, system prompt or tools; `max_tokens` ≤ 1024; model from `GRILLSTUDIO_CLAUDE_MODEL` env.
- **Residual risk:** a non-browser client can forge `Origin`. Proper protection = user auth + per-user rate limit (TASKS T-3).
  Until then, keep a spending limit on the Anthropic account, or unset `ANTHROPIC_API_KEY` to disable the hosted engine.
- Deploy previews have a different origin; add the preview URL to `GRILLSTUDIO_ALLOWED_ORIGINS` to test the hosted engine there.

## Data handling

- Film projects are stored in the browser's `localStorage`, namespaced `grillstudio:`. Nothing is sent to a server.
- Video/audio in Create never leaves the browser (ffmpeg.wasm).
- Deleting a project requires confirmation; export/import gives users their own backups. Import never overwrites an existing project.
- The repository supports namespaces so per-user separation is ready for when auth exists. Real cross-user isolation needs server-side auth (Phase 2).

## Controls in CI / `npm run verify`

- `scripts/check-secrets.mjs` scans `src`, `public`, `netlify`, `dist`, `docs`, `README.md`.
- `tests/security/proxy.test.js` covers origin, shape, caps, error leakage, provider errors.
