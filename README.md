# Little Sunshine ☀️

A small, gentle daily happiness web app. A soft morning sky, a sun that rises as you
go, and a page that greets you by name.

Plain HTML, CSS and vanilla JavaScript: no frameworks, no build step. Everything is
saved in the browser (localStorage, keys starting with `littleSunshine:`); sounds are
made with the Web Audio API, so it works offline.

## Pages

| Page           | What it does                                                          |
|----------------|-----------------------------------------------------------------------|
| `index.html`   | Welcome flow: name → pick your sky → personal greeting                |
| `home.html`    | Today: quote, poem, tap for a smile, daily art, a tiny kindness, and arrived letters |
| `joy.html`     | Joy Jar: one good thing a day becomes a fairy-light star in a glass jar |
| `breathe.html` | Breathe: a breathing flower (Calm, Box, Sleep) and calm sounds        |
| `me.html`      | Me: mood check-in, your garden this week, favorites, settings         |
| `letters.html` | Letters to future me: write, seal, and open on the day                |

## Scripts and styles

| File                | What it does                                                    |
|---------------------|-----------------------------------------------------------------|
| `shared.js`         | Every page: profile, sky, toast, bottom nav, floating light, haptics |
| `app.js`            | Welcome flow logic, sun, themes, petals                          |
| `home.js`, `art.js` | Today page; `art.js` draws the daily art                         |
| `joy.js`            | Joy Jar                                                          |
| `breathe.js`        | Breathing sessions                                               |
| `calm-sounds.js`    | Rain, ocean, wind, and crickets, made in the browser             |
| `me.js`             | Me page                                                          |
| `letters-shared.js`, `letters.js` | Letters: storage and opening (shared), and the Letters page |
| `styles.css`        | All styles, sky themes (CSS variables + `@property`)             |
| `data/`             | Quotes, poems, compliments, and kindness ideas (JSON)            |
| `vercel.json`       | Vercel settings (clean URLs, a few safe headers)                 |

## Run locally

```bash
python -m http.server 5500
```

Then open <http://127.0.0.1:5500>. (VS Code Live Server works too.)

## Deploy on Vercel

1. Go to <https://vercel.com/new> and import this GitHub repo.
2. Framework Preset: **Other**. Leave Build Command and Output Directory empty.
3. Click **Deploy**.

Every push to `main` redeploys automatically.
