# Which UFC Fighter Are You?

![UFC Fighter Quiz](docs/UFC-Quiz.jpg)

> Six questions, no sign-up. Find out which active UFC fighter matches your fighting style, based on real fight stats.

🔗 **[Try it live → ufc.aristotle.me](https://ufc.aristotle.me)**

---

## Features

| | |
|---|---|
| 🥋 **Fighters people know** | ~210 fighters: today's champions and contenders plus the legends (GSP, Khabib, Jon Jones, Ronda…), refreshed from the API |
| 👥 **Live counter** | "1,234 people have found their fighter", bot-checked with Turnstile and capped per day |
| 🧠 **Eight fighting types** | Striker or grappler, pressure or counter, finisher or decision: you get a type and a fighter |
| 🔗 **A page per result** | `ufc.aristotle.me/r/<fighter>?n=<name>` opens straight to the result |
| 🖼️ **Social previews** | Every fighter has a preview image; the link title carries your name |
| ⚔️ **You vs your friend** | Open a friend's link, take the quiz, and see your styles side by side |
| 📸 **Save image** | A portrait card with your name, drawn in the browser |

---

## How it works

```
UFC Stats API ──(build)──► roster.json + one preview PNG per fighter ──► static site
Your answers ──► style axes ──► nearest active fighter ──► /r/<fighter>?n=…&a=…
```

1. `scripts/build-roster.mjs` pulls every fighter from the public API, keeps the active ones (a UFC fight in the last 18 months, 4+ UFC fights, winning record) plus the curated stars and legends in `src/data/stars.js`, and scores each on three axes from their stats.
2. Your six answers land on the same axes. The closest fighter wins; same answers, same fighter.
3. `scripts/render-og.mjs` draws a preview image per fighter once, at build time.
4. `functions/r/[slug].js` (a Cloudflare Pages Function) fills in the link-preview tags for share links. It renders nothing and stores nothing.
5. `functions/api/tally.js` counts finished quizzes in Cloudflare D1 after a Turnstile check (schema in `migrations/`). It stays off until the `DB` binding, the `TURNSTILE_SECRET` secret and the `VITE_TURNSTILE_SITE_KEY` build variable exist.

The full spec is in [`tasks/prd-relaunch.md`](tasks/prd-relaunch.md).

---

## Develop

```bash
npm install
npm run dev            # app on localhost:5173 (uses the committed roster)
npm test               # matching and share-link checks
npm run build          # refresh roster from the API, build, render previews
npm run build:offline  # same, without calling the API
```

To check the share-link previews locally: `npm run build && npx wrangler pages dev dist`.

---

## Tech stack

| | |
|---|---|
| Frontend | React + Vite |
| Hosting | Cloudflare Pages (+ one Pages Function for share links) |
| Preview images | Satori + resvg at build time |
| Data | [UFC Stats API](https://ufcapi.aristotle.me/docs) |
| Analytics | Google Analytics (GA4) |

Fonts: Bebas Neue and Oswald, SIL Open Font License (`assets/fonts/`).

---

## License

MIT. Not affiliated with the UFC.

---

<p align="center">
  Built by <a href="https://aristotle.me">Aristotle</a> 🥊
</p>
