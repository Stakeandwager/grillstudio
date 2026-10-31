# Test strategy

```
npm run verify   # oxlint → vitest (all) → vite build → secret scan
npm test         # vitest only
```

| Layer | Location | Environment | What it proves |
|---|---|---|---|
| Engine unit | `tests/engine/*.test.js` | node | Parser, workflow gates, breakdown, evaluation, history, lessons, storage behave as specified. Deterministic via `createSequence()` clock. |
| Security | `tests/security/*.test.js` | node | Proxy hardening; no credentials in shipped files. |
| UI journeys | `tests/ui/*.test.jsx` | jsdom | App shell restores Create/Grow; Film journey create → intention → analyse → approve → reload persists; lessons surface on matching scenes; evaluation refuses evidence-less scores. |
| Built app | manual script (Playwright + Chrome) | headless browser | Production bundle renders with no page errors at 1280px and 390px; no horizontal scroll. |
| User acceptance | Netlify Deploy Preview | user's browser | The user tests and reports problems in ordinary language → TASKS.md. |

## Limit scenarios (directive §10) — current coverage

| Scenario | Covered by | Status |
|---|---|---|
| Long screenplays | 2,000-scene script (20,000 lines) parses in 66 ms | Covered |
| Conflicting character references / name variants | spelling-variant warnings | Covered |
| Corrupted stored data | repository corrupt-record test | Covered |
| Insufficient storage | quota error surfaced, not silent | Covered |
| Invalid API credentials / provider failure | proxy pass-through 401, unreachable → 502 | Covered |
| Mobile and desktop layouts | headless screenshots | Manual |
| Very large / corrupted / unsupported video, missing audio | Create already guards missing audio; no automated media tests yet | **Gap** (Phase 2 fixtures) |
| Interrupted jobs, concurrent operations, large reference libraries | — | **Gap** (needs Phase 2/3 infrastructure) |

Performance numbers are only published when measured; see BUILDER_CAPABILITY_TESTS.md.
