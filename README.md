# Little Sunshine ☀️

A small, gentle daily happiness web app. A soft morning sky, a sun that rises as you
go, and a page that greets you by name.

Plain HTML, CSS and vanilla JavaScript: no frameworks, no build step. Everything is
saved in the browser (localStorage, keys starting with `littleSunshine:`). It installs
like an app and works fully offline: fonts, icons and data are saved with it, sounds
are made with the Web Audio API, and a service worker keeps a copy of every file.

Live: <https://my-day-vibes.vercel.app/>

Made with ♡ by Debasish.

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
| `shared.js`         | Every page: profile, sky, toast, bottom nav, floating light, haptics, offline updates. Also holds `SITE_URL` |
| `app.js`            | Welcome flow logic, sun, themes, petals                          |
| `home.js`, `art.js` | Today page; `art.js` draws the daily art                         |
| `joy.js`            | Joy Jar                                                          |
| `breathe.js`        | Breathing sessions                                               |
| `calm-sounds.js`    | Rain, ocean, wind, and crickets, made in the browser             |
| `me.js`             | Me page                                                          |
| `letters-shared.js`, `letters.js` | Letters: storage and opening (shared), and the Letters page |
| `styles.css`        | All styles, sky themes (CSS variables + `@property`)             |
| `data/`             | Quotes, poems, compliments, and kindness ideas (JSON)            |
| `service-worker.js` | Offline: saves every file (`APP_FILES`), cache first, then network |
| `manifest.json`     | Install as an app (name, colors, icons)                          |
| `fonts/`            | Fraunces, Nunito, and Dancing Script (the signature only), as woff2, loaded with `@font-face` in `styles.css` |
| `icons/`            | App icon (SVG + 180, 192, 512 and maskable 512 PNGs); `favicon.ico` |
| `images/preview.png`| Link preview picture (1200×630)                                  |
| `lib/qrcode.js`     | QR codes for "Share Little Sunshine" (MIT, by Kazuhiko Arase)    |
| `vercel.json`       | Vercel settings (clean URLs, a few safe headers)                 |

## Changing anything? Bump the version

Every time you change **any** file, open `service-worker.js` and change
`CACHE_VERSION` (it is `sunshine-v4` now, so next time `sunshine-v5`). Phones then download the
new version in the background and show "A fresh version is ready. Tap to refresh."
If you add a new file, also add it to `APP_FILES` in the same file.

If the website address changes, update `SITE_URL` in `shared.js` and the two lines
marked "site link" in `index.html` (`og:url`, `og:image`).

## Run locally

```bash
python -m http.server 5500
```

Then open <http://127.0.0.1:5500>. (VS Code Live Server works too.)

While developing, the service worker serves saved copies first. In Chrome DevTools →
**Application → Service Workers**, tick **Update on reload** so you always see your
latest changes.

### Check it works offline (Chrome DevTools)

1. Open the site, then DevTools (F12) → **Application → Service Workers**: the worker
   should be *activated and is running*. Under **Cache Storage** you'll see
   `sunshine-v…` with every file.
2. **Network** tab → change *No throttling* to **Offline** (or tick *Offline* in
   Application → Service Workers).
3. Reload each page (`index.html`, `home.html`, `joy.html`, `breathe.html`, `me.html`,
   `letters.html`). They should all load, with the right fonts.
4. Turn Offline off again when you're done.

## Deploy on Vercel

1. Go to <https://vercel.com/new> and import this GitHub repo.
2. Framework Preset: **Other**. Leave Build Command and Output Directory empty.
3. Click **Deploy**.

Every push to `main` redeploys automatically.
