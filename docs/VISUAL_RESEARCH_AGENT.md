# Visual research agent

_Status: **not started** (Phase 3). Existing related code: Jamendo CC music search (Create) and YouTube Data API research (Grow)._

## Design

1. Natural-language request → intention extraction (subject, mood, lighting, camera, era, medium).
2. Query planning per provider.
3. Parallel search through **official APIs only**, each behind a provider adapter with rate-limit awareness.
4. Normalised result: `{provider, sourceUrl, thumbnailUrl?, title, creator, licence, licenceUrl, reuse: "permitted"|"view-only"|"unknown", retrievedAt, relevance, why}`.
5. Save to project library stores **metadata + link**; media is copied only when the licence permits it.

## Candidate providers (free)

| Provider | Content | Licence data | Key needed |
|---|---|---|---|
| Openverse | CC images & audio | Yes, per item | No (rate limited); key for higher quota |
| Wikimedia Commons | Images, video | Yes | No |
| Internet Archive | Public-domain film, video | Partial | No |
| YouTube Data API | Video references | Standard licence / CC flag | Yes (user's own, already used by Grow) |
| Vimeo API | Video references | CC flag | Yes |
| Jamendo | CC music | Yes | Yes (already integrated) |

## Non-negotiables

- No bypassing logins, CAPTCHAs, paywalls, robots rules or rate limits; no scraping private accounts.
- A search result is not permission to download, reproduce, train on or publish.
- Unknown licence is shown as unknown — never assumed.

## Test plan

The five directive queries (rainy night city, charcoal-grill food photography, fear without dialogue, tension camera
moves, low-budget night lighting) run against recorded fixtures in CI and live providers manually, measuring relevance,
attribution completeness, broken links and failures.
