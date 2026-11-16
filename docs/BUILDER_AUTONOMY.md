# Builder autonomy

How an autonomous builder works on this repository, and how to resume.

## Resume checklist (new session)

1. Read `docs/PROJECT_STATE.md`, then `docs/TASKS.md`, then the latest entries in `docs/DECISIONS.md`.
2. `npm ci && npm run verify` (lint → tests → build → secret scan). It must pass before new work.
3. Work on a `dev/<topic>` branch. Never push directly to `main`.
4. Open a PR — Netlify builds a Deploy Preview for the user to test.
5. Update PROJECT_STATE, TASKS, DECISIONS and BUILDER_CAPABILITY_TESTS before finishing.

## May do without asking

Read/modify code, add tests and docs, add open-source dependencies, run builds/tests, fix bugs, create dev branches and
commits, open PRs (deploy previews), create fixtures.

## Must ask first

Spending money or subscriptions; paid AI/API use; publishing on the user's behalf; uploading private media externally;
using anyone's face/voice/likeness; deleting original media or project data; merging to `main` / replacing production;
irreversible account, domain or repository changes.

## Known limits of the builder environment (measured 2026-10-31)

| Limit | Effect |
|---|---|
| Live site `grillstudio.netlify.app` not reachable from the build sandbox (proxy 403) | Cannot verify production directly; relies on PR deploy previews + user checks. |
| No Netlify credentials | Cannot read deploy logs or set env vars. Deploy *status* is readable via GitHub: `gh api repos/Stakeandwager/grillstudio/commits/<branch>/status`. |
| `gh` CLI GraphQL unavailable; REST works through the session proxy | PRs created via REST. |
| Google Fonts blocked in headless browser checks | Screenshots use fallback fonts. |
| No GPU; no paid model access | Media analysis must use local/free tools or be BLOCKED. |

## Lessons from the October 2026 attempt (do not repeat)

- A script committed `git add .` and pushed to `main` with a generic message five times; one commit added junk files from a
  broken shell command; another replaced the working app with a mock. **Fixes:** branch + PR only, read the diff before
  committing, run `npm run verify`, never claim a feature that only shows an `alert()`.
