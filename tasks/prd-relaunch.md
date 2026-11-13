# PRD: Relaunch "Which UFC Fighter Are You?"

> Rebuild the quiz around today's active UFC roster, give every result its own shareable page with a social preview image, and let people put their name on it. No sign-up, no per-visit API calls, no image rendering on request.

**Owner:** Aris · **Status:** Building · **Date:** 2026-11-13
**Builds on:** `ufc-fighter-quiz.jsx` (the whole app today), `index.html` (meta tags, GA4), `worker/worker.js` (the `ufc-quiz-proxy` Worker), the UFC Stats API at `ufcapi.aristotle.me`.

## Scope decisions (confirmed 2026-11-13)

| # | Decision | Why |
|---|---|---|
| 1 | **Fighter data is baked in at build time**, not fetched on every visit. A build script pulls the roster from the public API (10 paged calls), picks the active pool and writes one small JSON file the app ships with. | Every visit today downloads 6.1 MB of JSON through the proxy (measured). The baked file is ~60 KB, needs no API key in the browser path and costs nothing per visit. |
| 2 | **"Active" means a UFC fight in the last 18 months and at least 4 UFC fights with recorded stats.** The pool is the 18 most prominent fighters in each of the 11 divisions, plus every current champion, topped up so each type has at least 14 men and 6 women where that many exist (225 fighters today). | 519 fighters pass the active test; the top 18 per division are the names people recognise (all 12 champions are in). The top-up stops a handful of fighters collecting every answer of a rare type. Retired fighters (Jon Jones, Khabib, GSP) can no longer come up. |
| 3 | **"Prominence" comes from the data**, not the hand-typed star list: champion flag, five-round fights (main events and title fights), UFC wins and win rate. | The old `STAR_POWER` list (`ufc-fighter-quiz.jsx:74`) was 2024-era and full of retired names. The data version updates itself every rebuild. |
| 4 | **Eight personality types from three axes**: Striker or Grappler, Pressure or Counter, Finisher or Decision. Each fighter's type comes from their stats; each person's type comes from their answers. | A median split on each axis gives eight types that all have real current fighters in them. People get a label they can repeat ("I'm a Sniper"). |
| 5 | **Matching is deterministic**: the same answers always give the same fighter. | The old code rolled dice over the top 5, so retaking gave a different fighter. A result you can share should be repeatable. |
| 6 | **Share links look like `ufc.aristotle.me/r/justin-gaethje?n=Aris&a=021301`**: fighter slug in the path, optional name, and the six answers. | Opens straight to the result. The answers let the page rebuild the full result (type, match %, runners-up) and power "You vs Aris" when a friend takes it. |
| 7 | **The preview image is pre-rendered once per fighter at build time** (225 PNGs, about 60 seconds of build time). The person's name goes in the preview's title text ("Aris fights like Justin Gaethje"), not in the image. | No image is ever drawn on request, so cost is flat no matter how often a link is shared. The title is set by a tiny Pages Function that rewrites the meta tags; it does no rendering and no storage. |
| 8 | **The "X people took the quiz" counter is removed from the app** for now. | It needs a write endpoint, and the current one has no bot protection (only an Origin check, which anyone can fake) and does a KV write on every request for its rate limiter. Today's total is 62 quizzes. A safe v2 is in Recommendations. Replaced by a free stat from the roster: "only 6% of active fighters are Snipers". |
| 9 | **The proxy Worker code in the repo is reconciled to the live, locked-down version.** After this ships the app no longer calls it. Retiring it is your call (below). | The repo copy still forwarded any `/api/fighters*` path with the admin key. |
| 10 | **Weekly refresh is a GitHub Action that calls a Cloudflare Pages deploy hook** on Tuesdays, after the API's Sunday/Monday refresh. It does nothing until you create the hook and add it as a repo secret. | Keeps the roster current with no server. Needs your yes because it creates things on Cloudflare and GitHub. |
| 11 | **Name is optional, on the start screen**, stored only in the browser and the share link. | Fewest steps: one optional field, no account. |
| 12 | **Division filter on the start screen** (Anyone / Men's / Women's), defaulting to Anyone. | One tap, no extra screen, and it fixes the most common "that's not me" complaint. |

## 1. Introduction / Overview

The quiz at ufc.aristotle.me asks 5 questions and names a UFC fighter. It is due a relaunch now that the UFC Stats API is back, but four things hold it back:

1. **The matches are stale.** The score is dominated by a hand-typed star bonus (+150 for Jon Jones, Khabib, GSP…), so retired legends win. Live stats today: 62 quizzes, top results Jose Aldo (24%) and Tom Aspinall (19%).
2. **The "active fighter" check never worked.** It reads `fight.event_date` (`ufc-fighter-quiz.jsx:365`), but the API calls the field `date`, so every fighter counted as inactive.
3. **Sharing is weak.** Share links (`?result=jon-jones&from=Aris`) all show the same generic preview image, and the result page cannot be reopened. Nobody can enter their name in the app; `from` was never set by any button.
4. **It is heavy and fragile.** Each visit pulls all 4,628 fighters (6.1 MB) through a proxy that holds the API admin key and writes to KV on every request.

## 2. Goals

- Every result is a current fighter: active in the last 18 months, recognisable, in the person's chosen divisions.
- A result has its own URL that opens straight to it, with a preview card showing the fighter and type, and the person's name in the title.
- The quiz loads in under a second on mobile (no runtime data call).
- Cost stays flat with traffic: no per-visit API call, no KV writes, no on-request image rendering.
- Sharing loop: a friend who opens a link sees "Aris fights like X", takes the quiz, and gets "You vs Aris".

## 3. User Stories

### US-001: Current, relevant matches
As a quiz taker, I want a fighter who is fighting now, so the result means something.

- [ ] Build script fetches all fighters from `https://ufcapi.aristotle.me/api/fighters` (anonymous, `limit=500`, paged by `offset`), spaced to stay under 30 requests a minute, with at most 3 tries per page.
- [ ] If the fetch fails, the build keeps the committed `src/data/roster.json` and still succeeds.
- [ ] Active = last UFC fight within 548 days of the newest fight in the data, at least 4 UFC fights, `slpm > 0`, a real division (not Catch Weight).
- [ ] Pool = top 18 per division by prominence, plus all `is_champion` fighters, plus the per-type top-up.
- [ ] *Verifiable:* `npm test` checks, over all 4,096 answer combinations and each division filter: no fighter gets more than 8% of combinations (10% for the smaller women's pool); at least 60 different fighters are reachable (40 for women's); all 8 types are reachable (Anyone and Men's; the women's roster has no Snipers today); every result is in the requested gender's divisions.

### US-002: Name and division
- [ ] Optional name field on the start screen (max 20 characters, letters, spaces, `'`, `-`, `.`); Enter starts the quiz; remembered in the browser.
- [ ] Division choice: Anyone / Men's / Women's.
- [ ] *Verifiable:* a name with `<script>` or emoji is reduced to its allowed characters in the URL, the page and the preview title.

### US-003: Shareable result URL
- [ ] Finishing the quiz moves the address bar to `/r/<slug>?n=<name>&a=<answers>&d=<division>` without a reload.
- [ ] Opening that URL in a new browser shows the same result: fighter, type, match %, why-you-match bullets, runners-up.
- [ ] Opening it without `a` (or with a bad one) still shows the fighter, their type and stats, with a "Find your fighter" button.
- [ ] An unknown slug shows the start screen with a short note.
- [ ] Old links (`/?result=<slug>&from=<name>`) redirect to the new format when the fighter is in the pool.
- [ ] Share buttons: native share sheet on phones, Copy link, Post on X, Save image.

### US-004: Social preview image
- [ ] The build renders a 1200×630 PNG per pool fighter to `/og/<slug>.png` (fighter, nickname, type, division, record, 4 key stats, site address).
- [ ] A Pages Function on `/r/*` only serves `index.html` with `og:title`, `og:description`, `og:image`, `og:url` and Twitter tags filled in: "Aris fights like Justin Gaethje" (or "I fight like…" without a name).
- [ ] The function never renders images, never writes storage and never calls the UFC API.
- [ ] *Verifiable:* `wrangler pages dev dist` + `curl /r/<slug>?n=Aris` shows the filled meta tags; the PNG URL returns `image/png`.

### US-005: Friend challenge
- [ ] When someone opens a share link and then takes the quiz, their result shows "You vs Aris": both fighters, both types, and the three axes side by side.

### US-006: Weekly roster refresh
- [ ] `.github/workflows/weekly-refresh.yml` runs Tuesdays 12:00 UTC and on demand, calls the deploy hook from secret `CF_PAGES_DEPLOY_HOOK`, and skips cleanly when the secret is missing.

### US-007: Gate
- [ ] `npm run build` and `npm test` pass on Node 22.
- [ ] The production bundle has no API key and makes no request to the proxy Worker.

## 4. Functional Requirements

- **FR-1** `scripts/build-roster.mjs` writes `src/data/roster.json` with `snapshot`, `typeShare` and `fighters`. Each fighter carries identity (slug, name, nickname, division, champion flag), record and UFC win methods, the six API stats the app shows, its axes, type, prominence and last fight date.
- **FR-2** Fighter axes, each in −1…1, using percentiles across the active set (not just the pool):
  - **R** (striker +, grappler −) = (0.65·pct(slpm) + 0.35·pct(str_acc)) − (0.6·pct(td_avg) + 0.4·pct(sub_avg))
  - **T** (pressure +, counter −) = 0.6·(2·pct(slpm+sapm) − 1) + 0.4·(1 − 2·pct(str_def))
  - **F** (finisher +, decision −) = 2·pct(finish rate of UFC wins) − 1
  - **W** (knockout +, submission −) = (KO wins − SUB wins) ÷ finishes, 0 when no finishes
  - R, T, F are re-centred on the active-set median so the eight types split fairly.
- **FR-3** Type = the signs of R, T, F. Names: SPF The Knockout Artist · SPD The Volume Machine · SCF The Sniper · SCD The Technician · GPF The Mauler · GPD The Grinder · GCF The Submission Artist · GCD The Chess Master.
- **FR-4** Six style questions, four options each; each option moves R, T, F (and W). The person's axes are the sums divided by the largest possible sum per axis.
- **FR-5** Score per pool fighter = 1 − d/dmax + 0.12 if same type + 0.05 × prominence (0…1), where d is weighted distance (R 1.0, T 0.8, F 0.7, W 0.4 × how much the person wants a finish). Fighters within 0.035 of the top score count as tied, and a hash of the answers picks among them: still deterministic, but edge-of-the-map fighters no longer win every extreme answer set. Match % = round(100 × (1 − d/dmax)). The displayed type is the matched fighter's type, so the page, the preview and the fighter always agree.
- **FR-6** Result page: type name and one-line description, fighter (nickname, name, record, division, champion badge), match %, three "why you match" bullets built from the fighter's real numbers, the person's three axis bars against the fighter's, two runners-up (no percentage, since a near-tie runner-up can score a point or two higher on raw style), roster rarity of the type, share buttons, retake.
- **FR-7** `functions/r/[slug].js` (Cloudflare Pages Function) rewrites meta tags with `HTMLRewriter`; it imports the roster JSON, sanitises `n`, and returns `Cache-Control: public, max-age=300`.
- **FR-8** `scripts/render-og.mjs` uses Satori + resvg with the bundled Bebas Neue and Oswald fonts (SIL Open Font License) after `vite build`, writing to `dist/og/`.
- **FR-9** GA4 events: `quiz_start`, `quiz_complete` (type, fighter), `share` (method), `shared_view` (fighter).

## 5. Non-Goals (Out of Scope)

- No fighter photos (licensing).
- No accounts, no saving results on a server.
- No quiz-count or "% of people got this fighter" stats (see Recommendations).
- No on-request image rendering, so the name is not drawn into the preview image.
- No change to the UFC Stats API or the jobs that refresh it.
- No Cloudflare, GitHub-settings or GA changes in this PR; those are listed under Open Questions for your yes.

## 6. Design Considerations

- Keep the current look: near-black, gold `#d4af37`, fight-night red, Bebas Neue for display and Oswald for text. Move from 1,700 lines of inline styles to components plus one stylesheet.
- Mobile first: the result fits a phone screen with the share buttons reachable by thumb.
- Respect `prefers-reduced-motion`; all choices are real buttons with focus rings.
- "Save image" draws a 1080×1350 card in the browser (Canvas, no library) with the person's name on it, so the name *can* appear on an image without any server cost. On phones it opens the share sheet with the image attached when the browser allows it.

## 7. Technical Considerations

**Hosting (verified 2026-11-13 through the Cloudflare API, read-only).** ufc.aristotle.me is the Cloudflare Pages project `ufc-figher-quiz` in the personal account, linked to this GitHub repo. Production branch `main`, build `npm run build`, output `dist`, build image v3 (Node 22). Every branch gets a preview deployment, so this PR gets a preview URL automatically. **Merging the PR deploys it.**

**UFC Stats API (verified live).** `GET /api/fighters` returns `{total, limit, offset, data}`; anonymous requests are capped at 500 rows, so the script pages with `offset` (10 calls for 4,628 fighters). Each row includes `fights[]` with `date`, `ufc`, `result`, `method` (`KO/TKO`, `SUB`, `U-DEC`, `S-DEC`, `M-DEC`, …), `round`. Twelve fighters have `is_champion: true` today. Newest fight in the data: 2026-11-07.

**Proxy Worker `ufc-quiz-proxy`.** The live code (read 2026-11-13) only changes two lines from the repo: it matches `/api/fighters` exactly and always fetches `?limit=10000` upstream. Its stats endpoints are still live. The repo copy now matches it. After this ships nothing in the app calls it.

**Cost guardrails.**
- Per visit: static files only. The only server code is the `/r/*` function: one invocation per share-link view (people and link-preview bots), no storage, no outbound calls. Pages only routes `/r/*` to it, so all other files stay free.
- No image rendering on request; ~200 PNGs are drawn once per build.
- Build makes 10 API calls with a fixed retry limit (3 per page) and no loop that can feed itself.
- The weekly refresh fires one deploy per week; a deploy cannot trigger another.
- No write path ships in the app, so there is nothing for bots to spam.

**Risks.** If the account is on the Workers Free plan and `/r/*` passes 100,000 views a day, the function errors for the rest of that day (static pages still work). Name text in previews is whatever the sharer typed, limited to letters and 20 characters; there is no profanity filter.

## 8. Success Metrics

- Share-link opens per completed quiz (GA4 `shared_view` ÷ `quiz_complete`) above 0.3 within a month.
- No single fighter above 8% of real results (GA4 `quiz_complete` by fighter).
- Page weight on first load under 300 KB (was 6.1 MB of JSON alone). Built today: 73 KB of JavaScript and 3 KB of CSS, gzipped.

## 9. Open Questions (need your yes; nothing here is done yet)

1. **Weekly refresh hook.** Create a Cloudflare Pages deploy hook named `weekly-roster-refresh` on project `ufc-figher-quiz` (branch `main`), and add its URL as the GitHub Actions secret `CF_PAGES_DEPLOY_HOOK` on `malichetty/ufc-figher-quiz`. *I'd pick yes: without it the roster only updates when something is merged.*
2. **Retire the proxy Worker** a week after launch: delete Worker `ufc-quiz-proxy`, its route `ufc-quiz-proxy.aristotle.me/*`, its secret `UFC_API_KEY`, and KV namespace `STATS` (back up the `quiz_stats` key first). *I'd pick yes: it holds the admin key and nothing will call it.*

## 10. Recommendations to make it the best version of this app (my pick first)

1. **Ship the share loop first (this PR).** Name in the preview title, a page per result, "You vs Aris". Quizzes like this live or die on how good the link looks in a group chat.
2. **Live "people like you" stats, done safely (v2).** A Durable Object counter per type and fighter (one write per finished quiz, no read-modify-write races), Cloudflare Turnstile in invisible mode on the record call, and the Workers Rate Limiting binding instead of KV writes. Then: "18% of quiz takers are Snipers; you're 1 of 41 Gaethjes."
3. **Fight-week moments.** Before each UFC event, a banner "Fighting this Saturday: your match vs X", using the events endpoint at build time. Gives people a reason to come back weekly.
4. **Division-size question** ("How big are you?") to match by weight as well as style, for people who care about realism.
5. **Name in the image (bounded).** If the title-only name isn't enough, render named images on request with a hard cap: cache each (fighter, name) image in R2 forever, refuse past N new renders a day, fall back to the plain fighter image.
6. **More questions, adaptive.** Ask a 7th question only when the top two matches are within 2%.
