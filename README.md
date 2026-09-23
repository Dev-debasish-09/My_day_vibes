# Little Sunshine ☀️

A small, gentle daily happiness web app. A soft morning sky, a sun that rises as you
go, and a page that greets you by name.

Plain HTML, CSS and vanilla JavaScript: no frameworks, no build step.

## Files

| File         | What it does                                              |
|--------------|-----------------------------------------------------------|
| `index.html` | Welcome flow: name → pick your sky → personal greeting    |
| `styles.css` | All styles, sky themes (CSS variables + `@property`)      |
| `app.js`     | Welcome flow logic, sun, themes, petals, localStorage     |
| `vercel.json`| Vercel settings (clean URLs, a few safe headers)          |

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
