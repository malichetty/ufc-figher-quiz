# ufc-quiz-proxy Worker (legacy)

This Worker served the fighter list to the old quiz (using the UFC Stats API admin key) and kept quiz stats in KV.

Since the relaunch, the app no longer calls it: the roster is baked in at build time from the public API (`scripts/build-roster.mjs`). This file matches what is deployed, including the lock-down that only allows `GET /api/fighters` and always fetches one fixed upstream URL.

Planned: retire the Worker, its route, its secret and its KV namespace once the relaunch has been live for a week (see `tasks/prd-relaunch.md`, Open Questions).

Deploy (only with the owner's go-ahead):

```bash
cd worker
npx wrangler deploy
```
