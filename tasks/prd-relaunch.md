# PRD: Relaunch "Which UFC Fighter Are You?"

> Rebuild the quiz around today's active UFC roster and the legends people know, and give every result its own shareable page with a social preview image. No sign-up, no inputs, no per-visit API calls, no image rendering on request.

**Owner:** Aris · **Status:** Building · **Date:** 2026-11-13
**Builds on:** `ufc-fighter-quiz.jsx` (the whole app today), `index.html` (meta tags, GA4), `worker/worker.js` (the `ufc-quiz-proxy` Worker), the UFC Stats API at `ufcapi.aristotle.me`.

## Scope decisions (confirmed 2026-11-13; 2 to 3b and 8 revised the same day after Aris's review; 2, 4, 6, 7, 11 and 12 revised 2026-11-18)

| # | Decision | Why |
|---|---|---|
| 1 | **Fighter data is baked in at build time**, not fetched on every visit. A build script pulls the roster from the public API (10 paged calls), picks the active pool and writes one small JSON file the app ships with. | Every visit today downloads 6.1 MB of JSON through the proxy (measured). The baked file is ~60 KB, needs no API key in the browser path and costs nothing per visit. |
| 2 | **One pool of names people know, men and women together.** Active means a UFC fight in the last 18 months and at least 4 UFC fights; current champions are always in. The pool is every champion, every curated star and legend (decision 3b), and the 5 best-known active fighters with a winning UFC record from each division. A type with fewer than 8 fighters is topped up with the next best-known active fighters of that type (today that adds 4 Volume Machines). 137 fighters today: 57 of them have not fought in 18 months (Jon Jones, Khabib, GSP, Ronda Rousey, Anderson Silva…). | People want to be compared to fighters they know and admire, not to an unknown with a losing record. Legends carry their career stats; current fighters keep the roster fresh. |
| 3 | **Prominence = data plus a curated floor.** From the data: champion flag, fights that went past round 3 (only five-round main events and title fights can), UFC wins and win rate. On top, curated names get a floor: icons 1.0, stars 0.75, champions 1.0. | The data alone ranks a busy contender above Conor McGregor. The floor fixes that without a hand-tuned score per fighter. |
| 3b | **A curated list of stars and legends** (`src/data/stars.js`): 29 icons (GSP, Khabib, Jon Jones, Conor, Ronda, Nunes, Pereira, Topuria…) and 83 stars (former champions, fan favourites, big current names). They join the pool whether or not they still fight; the build warns if a name stops matching the API. Shown as "Legend" (icons who have stopped) or "Last fought 2023" (others who have stopped). | Fame is what people share. Every answer set now lands on a champion, legend or star. |
| 4 | **Eight personality types from three axes**: Striker or Grappler, Pressure or Counter, Finisher or Decision. How a fighter wins counts: a knockout puncher is a striker even at low volume, and chaining takedowns counts as pressure. A grappler who finishes fights is named by how they finish: The Mauler for knockouts, The Submission Artist for submissions. Each fighter's type comes from their stats; each person's type comes from their answers, by the same rules. | A median split on each axis gives eight types that all have real fighters in them, and the label matches what fans know (Ngannou is a striker, Khabib a pressure grappler). People get a label they can repeat ("I'm a Sniper"). |
| 5 | **Matching is deterministic**: the same answers always give the same fighter. | The old code rolled dice over the top 5, so retaking gave a different fighter. A result you can share should be repeatable. |
| 6 | **Share links look like `ufc.aristotle.me/r/justin-gaethje?a=021301`**: fighter slug in the path and the six answers. Older links with a name (`n=`) or division (`d=`) still open; both are ignored. | Opens straight to the result. The answers let the page rebuild the full result (type, match %) and power "You vs Friend" when a friend takes it. |
| 7 | **The preview image is pre-rendered once per fighter at build time** (137 PNGs, about 40 seconds of build time). The preview title reads "I fight like Justin Gaethje 🥊". | No image is ever drawn on request, so cost is flat no matter how often a link is shared. The title is set by a tiny Pages Function that rewrites the meta tags; it does no rendering and no storage. |
| 8 | **The "X people matched" counter is back, rebuilt safely.** A Pages Function (`/api/tally`) counts finished quizzes in Cloudflare D1 (a small SQL database), after an invisible Turnstile bot check, with a daily cap of 15,000. It shows only on the start screen, under the button ("🔥 1,234 people matched"). It also keeps a count per fighter and per type; nothing shows those. It stays hidden until the database and bot check are set up (Open Questions). | Social proof makes people start the quiz. The old counter had no bot protection and a KV write per request; this one cannot be inflated by scripts, cannot lose counts to races, and its cost is capped. The old 62 quizzes carry over. |
| 9 | **The proxy Worker code in the repo is reconciled to the live, locked-down version.** After this ships the app no longer calls it. Retiring it is your call (below). | The repo copy still forwarded any `/api/fighters*` path with the admin key. |
| 10 | **Weekly refresh is a GitHub Action that calls a Cloudflare Pages deploy hook** on Tuesdays, after the API's Sunday/Monday refresh. It does nothing until you create the hook and add it as a repo secret. | Keeps the roster current with no server. Needs your yes because it creates things on Cloudflare and GitHub. |
| 11 | **No name field.** The start screen is the title, one "Find my fighter" button (sized to its words, not full width) and the counter under it. Results read "You fight like" for the person who took the quiz and "Your friend fights like" for anyone opening a shared link. | Fewest steps: one tap to start. Previews and posts read "I fight like…", which works for everyone. |
| 13 | **A real line from the fighter on the result card** (added 2026-11-19), under the type's description: the line in quotes and the fighter's short name under it ("— Khabib"). Only lines the fighter said in public, each backed by two published sources; swear words dashed out ("motherf---ers"); no slurs, and nothing about injuries, family tragedies, religion, nationality or race. 23 fighters have one today (about a quarter of all results); fighters without one show none, and the list grows only with sourced lines. | A real line people already know is funnier and more shareable than anything written for the quiz. |
| 12 | **No men/women filter.** Everyone is matched against one pool of men and women. | The pool is now only names people know, so a result from another division is still a fighter you recognise, and one pool keeps every type well stocked. |

## 1. Introduction / Overview

The quiz at ufc.aristotle.me asks 5 questions and names a UFC fighter. It is due a relaunch now that the UFC Stats API is back, but four things hold it back:

1. **The matches are stale.** The score is dominated by a hand-typed star bonus (+150 for Jon Jones, Khabib, GSP…), so retired legends win. Live stats today: 62 quizzes, top results Jose Aldo (24%) and Tom Aspinall (19%).
2. **The "active fighter" check never worked.** It reads `fight.event_date` (`ufc-fighter-quiz.jsx:365`), but the API calls the field `date`, so every fighter counted as inactive.
3. **Sharing is weak.** Share links (`?result=jon-jones&from=Aris`) all show the same generic preview image, and the result page cannot be reopened. Nobody can enter their name in the app; `from` was never set by any button.
4. **It is heavy and fragile.** Each visit pulls all 4,628 fighters (6.1 MB) through a proxy that holds the API admin key and writes to KV on every request.

## 2. Goals

- Every result is a fighter people know: a champion, a curated star or legend, or one of the best-known active fighters.
- A result has its own URL that opens straight to it, with a preview card showing the fighter and type.
- The quiz loads in under a second on mobile (no runtime data call).
- Cost stays flat with traffic: no per-visit API call, no KV writes, no on-request image rendering.
- Sharing loop: a friend who opens a link sees "Your friend fights like X", takes the quiz, and gets "You vs Friend".

## 3. User Stories

### US-001: Current, relevant matches
As a quiz taker, I want a fighter who is fighting now, so the result means something.

- [ ] Build script fetches all fighters from `https://ufcapi.aristotle.me/api/fighters` (anonymous, `limit=500`, paged by `offset`), spaced to stay under 30 requests a minute, with at most 3 tries per page.
- [ ] If the fetch fails, the build keeps the committed `src/data/roster.json` and still succeeds.
- [ ] Active = last UFC fight within 548 days of the newest fight in the data, at least 4 UFC fights (champions exempt from both rules), `slpm > 0`, a real division (not Catch Weight).
- [ ] Pool = top 5 per division by prominence, plus all `is_champion` fighters, plus every curated name, plus the per-type top-up to 8.
- [ ] *Verifiable:* `npm test` checks, over all 4,096 answer combinations: no fighter gets more than 5% of combinations; at least 100 different fighters are reachable; all 8 types are reachable.

### US-002: One tap to start, labels that fit
- [ ] The start screen has no inputs: "Six questions", the title, one "Find my fighter" button about 290 px wide (not full width, except on phones about 320 px wide or less, where it fills the space inside the margins), and "🔥 N people matched" under it once the counter has a total.
- [ ] A fighter's label matches how they win: no Submission Artist with more knockouts than submissions or with no submission wins; no Knockout Artist or Sniper with more submission wins than knockouts; no grappler type for a fighter with under 1 takedown and under 0.5 submission attempts per 15 minutes.
- [ ] Known strikers (Ngannou, Liddell, Bisping, Conor, Pereira, Gaethje, Holloway, O'Malley, Adesanya…) are strikers; known grapplers (Khabib, Islam, GSP, Khamzat, Merab, Demetrious Johnson, Ronda, Oliveira, Kayla Harrison…) are grapplers; Khabib, Khamzat and Merab are pressure fighters.
- [ ] Every icon and champion is the result for at least 8 answer sets; Conor, Khabib, Pereira, Topuria and Jon Jones for at least 20 each.
- [ ] Wrestling answers every time give a known grappler; knockout answers every time give a known striker.
- [ ] *Verifiable:* `npm test` (test/matching.test.mjs).

### US-003: Shareable result URL
- [ ] Finishing the quiz moves the address bar to `/r/<slug>?a=<answers>` without a reload.
- [ ] Opening that URL in a new browser shows the same result: fighter, type, match %.
- [ ] Opening it without `a` (or with a bad one) still shows the fighter and their type, with a "Find my fighter" button.
- [ ] An unknown slug shows the start screen with a short note.
- [ ] Old links (`/?result=<slug>&from=<name>`) redirect to the new format when the fighter is in the pool; the name is dropped. `n=` and `d=` on a `/r/` link are ignored.
- [ ] Sharing: one big button (the share sheet where the browser has one, otherwise Copy my link), then one line of small text links: Copy link (only when the big button is the share sheet), Post on X, Save image. Each link is a real button with a tap target at least 40 px tall.

### US-004: Social preview image
- [ ] The build renders a 1200×630 PNG per pool fighter to `/og/<slug>.png` (fighter, nickname, type, division, record, 4 key stats, site address).
- [ ] A Pages Function on `/r/*` only serves `index.html` with `og:title`, `og:description`, `og:image`, `og:url` and Twitter tags filled in: "I fight like Justin Gaethje 🥊", with the page title "I fight like Justin Gaethje | Which UFC Fighter Are You?".
- [ ] The function never renders images, never writes storage and never calls the UFC API.
- [ ] *Verifiable:* `wrangler pages dev dist` + `curl /r/<slug>?a=021301` shows the filled meta tags; the PNG URL returns `image/png`.

### US-005: Friend challenge
- [ ] When someone opens a share link that carries the friend's answers and then takes the quiz, their result shows "You vs Friend": both fighters and one line on the biggest difference in style, compared on R, T, F and W (FR-2): "Biggest difference: you're more of a grappler than your friend." The roles are striker or grappler, pressure fighter or counter fighter, finisher or points fighter, knockout hunter or submission hunter. When the two are under 0.35 apart on every axis, it reads "You and your friend fight almost the same way. That's a five-round war." Before they start, the start screen says "Your friend got <fighter>. Your turn." above the title.

### US-006: Weekly roster refresh
- [ ] `.github/workflows/weekly-refresh.yml` runs Tuesdays 12:00 UTC and on demand, calls the deploy hook from secret `CF_PAGES_DEPLOY_HOOK`, and skips cleanly when the secret is missing.

### US-008: Legends and fame (added 2026-11-13)
- [ ] Curated icons and stars are in the pool whether or not they still fight, with their career stats.
- [ ] No uncurated, non-champion fighter in the pool has a losing UFC record.
- [ ] *Verifiable:* `npm test`: Jon Jones, Khabib, GSP, Ronda Rousey and Amanda Nunes are in; at least 90% of answer sets land on a champion, icon or star; no fighter above 5%; at least 100 fighters reachable.

### US-009: Quiz counter (added 2026-11-13)
- [ ] A finished quiz is counted once, only after a valid Turnstile token, only for a known fighter and type.
- [ ] Past 15,000 counts in a day, it stops counting (and writing) and answers 429.
- [ ] Without the D1 binding or the Turnstile secret, the API answers `{enabled:false}` and the app shows no counter.
- [ ] Reads are cached at the edge for 60 seconds.
- [ ] *Verifiable:* `npm test` (test/tally.test.mjs) and a local `wrangler pages dev` run with Cloudflare's Turnstile test keys.

### US-010: A real line from the fighter (added 2026-11-19)
As a quiz taker, I want to see something my fighter actually said, so the result is funny enough to share.

- [ ] When the matched fighter has a line, the card shows it under the type's description: the line in curly quotes, then "— <short name>" in gold. It shows on your own result and on a friend's link. A challenge result leaves it out: that card already ends on the "You vs Friend" line, and the extra lines would push the share links off the first screen.
- [ ] Screen readers read it as a quotation (a figure with a blockquote and a caption).
- [ ] A fighter without a line shows a card exactly as before.
- [ ] Every line is at most 12 words and 80 characters, has a short name under it, belongs to a fighter in the pool, and has no undashed swear word.
- [ ] *Verifiable:* `npm test` (test/matching.test.mjs); the sources for each line are noted next to it in `src/data/quotes.js`.

### US-007: Gate
- [ ] `npm run build` and `npm test` pass on Node 22.
- [ ] The production bundle has no API key and makes no request to the proxy Worker.

## 4. Functional Requirements

- **FR-1** `scripts/build-roster.mjs` writes `src/data/roster.json` with `snapshot`, `activeCount`, `source` and `fighters`. Each fighter carries identity (slug, name, nickname, division, champion flag), record and UFC win methods, six API stats (they feed the scoring; the preview pictures and the Save image card show a few of them, the result page shows none), its axes, type, prominence and last fight date.
- **FR-2** Fighter axes, each in −1…1, using percentiles across the active set (not just the pool):
  - **R** (striker +, grappler −) = (0.65·pct(slpm) + 0.35·pct(str_acc)) − (0.6·pct(td_avg) + 0.4·pct(sub_avg)) + 2.2·(KO wins − SUB wins) ÷ UFC wins. The last term is how the fighter actually wins, so a low-volume knockout puncher is still a striker.
  - **T** (pressure +, counter −) = 0.5·(2·pct(slpm+sapm) − 1) + 0.3·(1 − 2·pct(str_def)) + 1.2·max(0, 2·pct(td_avg) − 1). Takedown rates above the median count as pressure; a striker who never shoots loses nothing for it.
  - **F** (finisher +, decision −) = 2·pct(finish rate of UFC wins) − 1
  - **W** (knockout +, submission −) = (KO wins − SUB wins) ÷ finishes, 0 when no finishes
  - R, T, F are re-centred on the active-set median so the eight types split fairly.
- **FR-3** Type = the signs of R, T, F, with one exception: a grappler who finishes (R < 0, F ≥ 0) takes the middle letter from W, so W < 0 gives GCF and W > 0 gives GPF (W exactly 0 falls back to T). The same rule types a person from their answers. Names: SPF The Knockout Artist · SPD The Volume Machine · SCF The Sniper · SCD The Technician · GPF The Mauler · GPD The Grinder · GCF The Submission Artist · GCD The Chess Master.
- **FR-4** Six style questions, four options each; each option moves R, T, F (and W). The person's axes are the sums divided by the largest possible sum per axis, stretched by 1.4 and capped at ±1, so answers use the same range as fighters.
- **FR-5** Score per pool fighter = 1 − d/dmax + 0.20 if same type + 0.25 × prominence (0…1), where d is weighted distance (R 1.0, T 0.8, F 0.7, W 0.4 × how much the person wants a finish). Fighters within 0.09 of the top score count as tied, and a hash of the answers picks among them: still deterministic, but edge-of-the-map fighters no longer win every extreme answer set. Match % = round(100 × (1 − d/dmax)). The displayed type is the matched fighter's type, so the page, the preview and the fighter always agree.
- **FR-6** Result page. The card shows, top to bottom, and nothing else: "You fight like" (or "Your friend fights like" on a shared link); the nickname in quotes, when the fighter has one; the name; division · record with the Champion / Legend / Last fought badge; the type name and match % on one row where they fit, the match % on its own line under the label where they do not (on phones 700 px tall or more, three or four of the eight labels, at their full 24 px size); the type's one-line description (written without a subject, so it reads after "You fight like", "Your friend fights like" and "I fight like"); a real line the fighter said, with their short name under it, when we have one (decision 13), on your own result and on a friend's link; or, after a challenge, the "You vs Friend" box with its one sentence in its place (that card shows no fighter line, and its name is set a little smaller to make room). Under the card, on your own result: the big share button, one line of small links (Copy link · Post on X · Save image) and "Take it again". On a friend's link: one "Find my fighter" button. The result page shows no stats, no runners-up and no count, and does not read the counter.
- **FR-7** `functions/r/[slug].js` (Cloudflare Pages Function) rewrites meta tags with `HTMLRewriter`; it imports the roster JSON, validates `a` for `og:url`, ignores every other parameter, and keeps Pages' default HTML caching (revalidate every time), so a deploy never leaves a cached page pointing at old asset files.
- **FR-8** `scripts/render-og.mjs` uses Satori + resvg with the bundled Bebas Neue and Oswald fonts (SIL Open Font License) after `vite build`, writing to `dist/og/`.
- **FR-10** `functions/api/tally.js` + `src/lib/tally-core.js`: GET returns `total` and `typed` (and `fighter`, `type` for a known slug and type), cached 60 s under a canonical key, and only when both the database and the Turnstile secret exist. The app reads only `total`, on the start screen. POST `{slug, type, token}` verifies the token with Turnstile siteverify (5 s timeout), bumps `day:<date>` only while under the cap, then bumps `total`, `typed`, `fighter:<slug>`, `type:<code>` in one D1 batch. `typed` is the total without the 62 seeded quizzes; it and the per-fighter and per-type counts are stored for later and the app shows none of them. Schema: `migrations/0001_tally.sql`. The browser loads Turnstile only when the quiz starts and only when `VITE_TURNSTILE_SITE_KEY` is set at build time; a retake with the same answers is not counted again.
- **FR-9** GA4 events: `quiz_start`, `quiz_complete` (type, fighter), `share` (method, fighter), `shared_view` (fighter).

## 5. Non-Goals (Out of Scope)

- No fighter photos (licensing).
- No accounts, no saving results on a server.
- No on-request image rendering.
- No name field and no men/women filter.
- No change to the UFC Stats API or the jobs that refresh it.
- No Cloudflare, GitHub-settings or GA changes in this PR; those are listed under Open Questions for your yes.

## 6. Design Considerations

- Keep the current look: near-black, gold `#d4af37`, fight-night red, Bebas Neue for display and Oswald for text. Move from 1,700 lines of inline styles to components plus one stylesheet.
- One layout at every size: a single centred column at most 560 px wide with 20 px side margins, centred between the top of the screen and the footer (a screen taller than that scrolls from the top). The desktop result is the same column as the phone: the card, the big button at full width, the links line, "Take it again". There are no height breakpoints.
- One spacing scale: every margin, padding and gap is 4, 8, 12, 16, 24, 32, 48 or 64 px on a screen at least 390 px wide and 800 px tall. On smaller screens type and spacing shrink together, faster with height than with width (spacing down to half on a 568 px tall phone). Things that belong together sit closer: the big button is 16 px under the card, the links line 12 px under the button, "Take it again" 8 px under the links. No gap inside a screen is more than 32 px.
- Type fills the screen instead of new things. On a 390 × 844 phone the start title is three lines ("Which UFC" / "fighter" / "are you?") at 98 px, and the start screen fills 54% of the height; on a 1280 × 800 desktop it is two lines at 128 px (53%), the one thing allowed wider than the column (up to 760 px) so it sets in two lines. The fighter's name is the biggest thing on the card: 63 to 68 px on a 390 px phone, 100 px on desktop, at most two lines and never split inside a word (checked for all 137 fighters at 320, 390 and 1280 px wide; Khabib Nurmagomedov, the longest surname, drops to 58 px on a 390 px phone so it still fits). Your own result fills 70% of a 390 × 844 phone and 78% of a 1280 × 800 desktop.
- The main button (Share my result, or Find my fighter on a friend's link) and the line of share links are on the first screen with the browser toolbars showing. Measured on a You vs Friend result (the tallest result) for the 43 fighters with the longest names, against two long-named friends, at 120 sizes from 320 to 430 px wide and 480 to 900 px tall: both are on the first screen at every size, and from 568 px tall up the links have at least 33 px to spare. On that card the fighter's name is set a little smaller to make room. Nothing is hidden on short screens.
- The fighter's line sits 16 px under the description, in the text font a little smaller than the description, in the same off-white, centred and balanced over at most two lines; the short name under it is gold, at the size of "You fight like", 4 px under the line. No box, border, icon or big quote mark.
- Respect `prefers-reduced-motion`; all choices are real buttons with focus rings.
- "Save image" draws a 1080×1350 card in the browser (Canvas, no library) headed "I fight like", with no server cost. On phones it opens the share sheet with the image attached when the browser allows it.

## 7. Technical Considerations

**Hosting (verified 2026-11-13 through the Cloudflare API, read-only).** ufc.aristotle.me is the Cloudflare Pages project `ufc-figher-quiz` in the personal account, linked to this GitHub repo. Production branch `main`, build `npm run build`, output `dist`, build image v3 (Node 22). Every branch gets a preview deployment, so this PR gets a preview URL automatically. **Merging the PR deploys it.**

**UFC Stats API (verified live).** `GET /api/fighters` returns `{total, limit, offset, data}`; anonymous requests are capped at 500 rows, so the script pages with `offset` (10 calls for 4,628 fighters). Each row includes `fights[]` with `date`, `ufc`, `result`, `method` (`KO/TKO`, `SUB`, `U-DEC`, `S-DEC`, `M-DEC`, …), `round`. Twelve fighters have `is_champion: true` today. Newest fight in the data: 2026-11-07.

**Proxy Worker `ufc-quiz-proxy`.** The live code (read 2026-11-13) only changes two lines from the repo: it matches `/api/fighters` exactly and always fetches `?limit=10000` upstream. Its stats endpoints are still live. The repo copy now matches it. After this ships nothing in the app calls it.

**Cost guardrails.**
- Per start-screen view: static files plus one cached counter read (`GET /api/tally`, edge-cached 60 s, one indexed D1 lookup per minute per location). A result page reads nothing from the counter. The `/r/*` function runs once per share-link view (people and link-preview bots) with no storage and no outbound calls. Pages routes only `/r/*` and `/api/*` to functions, so all other files stay free.
- No image rendering on request; ~140 PNGs are drawn once per build.
- Build makes 10 API calls with a fixed retry limit (3 per page) and no loop that can feed itself.
- The weekly refresh fires one deploy per week; a deploy cannot trigger another.
- The one write path (`POST /api/tally`) needs a single-use Turnstile token, accepts only known fighter and type keys, writes five rows per quiz, and stops at 15,000 counts a day (at most 75,000 D1 row writes, under the free plan's 100,000). It is off until the database and secret exist.

**Risks.** Every start-screen view runs a Pages Function (`/api/tally`), even when the counter read is cached, and every share-link view runs one (`/r/*`); a result page itself does not read the counter. On the Workers Free plan that is 100,000 function calls a day; past it, functions error for the rest of the day while static pages keep working, so the counter disappears and share previews fall back to the generic card.

## 8. Success Metrics

- Share-link opens per completed quiz (GA4 `shared_view` ÷ `quiz_complete`) above 0.3 within a month.
- No single fighter above 8% of real results (GA4 `quiz_complete` by fighter).
- Page weight on first load under 300 KB (was 6.1 MB of JSON alone). Built today: 65 KB of JavaScript and 2 KB of CSS, gzipped.

## 9. Open Questions (need your yes; nothing here is done yet)

1. **Weekly refresh hook.** Create a Cloudflare Pages deploy hook named `weekly-roster-refresh` on project `ufc-figher-quiz` (branch `main`), and add its URL as the GitHub Actions secret `CF_PAGES_DEPLOY_HOOK` on `malichetty/ufc-figher-quiz`. *I'd pick yes: without it the roster only updates when something is merged.*
2. **Switch on the counter.** On the personal Cloudflare account: create D1 database `ufc-quiz-stats` and apply `migrations/0001_tally.sql` (seeds the total at 62); create a Turnstile widget `ufc-quiz` for `ufc.aristotle.me` and `ufc-figher-quiz.pages.dev` in Managed mode; on Pages project `ufc-figher-quiz` (production and preview) bind the database as `DB`, add the secret `TURNSTILE_SECRET` (the widget's secret key) and the build variable `VITE_TURNSTILE_SITE_KEY` (its public site key); then redeploy. *I'd pick yes: it is the social proof you asked for, and the code is already in place and tested.*
3. **Retire the proxy Worker** a week after launch: delete Worker `ufc-quiz-proxy`, its route `ufc-quiz-proxy.aristotle.me/*`, its secret `UFC_API_KEY`, and KV namespace `STATS` (back up the `quiz_stats` key first). *I'd pick yes: it holds the admin key and nothing will call it.*

## 10. Recommendations to make it the best version of this app (my pick first)

1. **Ship the share loop first (this PR).** A page per result, a preview image per fighter, "You vs Friend". Quizzes like this live or die on how good the link looks in a group chat.
2. **Switch on the counter (built in this PR; Open Question 2).** Social proof on the start screen.
3. **Fight-week moments.** Before each UFC event, a banner "Fighting this Saturday: your match vs X", using the events endpoint at build time. Gives people a reason to come back weekly.
4. **Division-size question** ("How big are you?") to match by weight as well as style, for people who care about realism.
5. **More questions, adaptive.** Ask a 7th question only when the top two matches are within 2%.
