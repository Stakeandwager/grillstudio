# Release history

## 1.1.0-dev — 2026-10-31 (Deploy Preview only, not in production)

**For testers:** open the Deploy Preview, click **Film**, create a project, fill in the intention, paste a screenplay (or load
the sample), analyse it, and walk the workflow. Create and Grow are back as they were in August.

- Restored the working video editor (Create) and YouTube research tools (Grow), which the October update had disconnected.
- New Film workspace: creative intention, 10-stage workflow with explicit approval, screenplay/story breakdown for live
  action and animation, character continuity references, evaluation against the intention, corrections → lessons, versions
  and backups.
- Security: the hosted AI endpoint can no longer be used freely by other sites.
- Removed junk files and an unsafe auto-push script.
- Added 55 automated tests, linting and a secret scanner.

Pre-release checks: build ✅ · tests ✅ · lint ✅ · secrets ✅ · headless browser check ✅ · no user media touched (no media
storage exists yet) ✅. Production deployment awaits the user's approval.

## Earlier (reconstructed from git)
- 2026-10-21 — five "Autonomous update" commits: replaced the app with a static mock (reverted by 1.1.0).
- 2026-08-24 — "checkpoint before refactor" (stylesheet truncated).
- 2026-08-08 — v1: browser editor + YouTube research toolkit.
