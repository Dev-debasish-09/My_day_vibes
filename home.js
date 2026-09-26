/* =====================================================================
   Little Sunshine: home.js (the "Today" page)
   Reads the saved profile, applies the sky, fills in the header, the
   quote of the day, today's poem, "Tap for a smile", today's art, the
   tiny kindness, and wires up the bottom navigation.
   The art itself is drawn by art.js (window.LittleSunshineArt); the
   profile, sky, toast, and bottom navigation come from shared.js
   (window.LittleSunshine).

   Loaded in <head> without defer, after shared.js. The top part runs
   right away (apply the sky before first paint); the rest waits for
   DOMContentLoaded.
   ===================================================================== */
(function () {
  'use strict';

  const { loadProfile, applySky, showToast, renderBottomNav, todayKey } = window.LittleSunshine;

  /* -------------------------------------------------------------------
     Settings
     ------------------------------------------------------------------- */
  const FAVORITES_KEY = 'littleSunshine:favorites';
  const KINDNESS_KEY = 'littleSunshine:kindness';
  const QUOTES_URL = 'data/quotes.json';
  const POEMS_URL = 'data/poems.json';
  const COMPLIMENTS_URL = 'data/compliments.json';
  const CHALLENGES_URL = 'data/challenges.json';

  // Used by "Tap for a smile" until compliments.json loads (or if it can't)
  const FALLBACK_SMILES = [
    "You're doing better than you think.",
    'Someone is glad you exist today.',
    "You're here, and that's enough.",
  ];

  // Burst particle colors: pink, peach, butter, lavender, mint (like the welcome petals)
  const PETAL_COLORS = ['#F7B9C8', '#FFCBA4', '#FFE8A3', '#D6C6F2', '#BFE3CC'];
  const BURST_COUNT = 12;

  // Wallpaper export size (portrait phone screen)
  const WALLPAPER = { width: 1080, height: 1920 };

  const GREETINGS = {
    morning:   'Good morning,',
    afternoon: 'Good afternoon,',
    evening:   'Good evening,',
    night:     'Hello, night owl,',
  };

  const root = document.documentElement;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');


  /* -------------------------------------------------------------------
     Storage (always wrapped in try/catch: private mode or blocked
     storage must never break the page)
     ------------------------------------------------------------------- */
  // Favorites are one shared list of { type, text, author, savedAt }.
  // `type` is "quote" or "poem" (a poem's text is its lines joined with line breaks).
  function loadFavorites() {
    try {
      const list = JSON.parse(localStorage.getItem(FAVORITES_KEY));
      return Array.isArray(list) ? list : [];
    } catch (err) {
      return [];
    }
  }

  function saveFavorites(list) {
    try {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(list));
      return true;
    } catch (err) {
      return false;
    }
  }


  function isFavorite(type, text) {
    return loadFavorites().some((f) => f.type === type && f.text === text);
  }

  // Adds the item if it isn't saved yet, removes it if it is.
  // Returns true/false for the new saved state, or null if storage failed.
  function toggleFavorite(item) {
    const list = loadFavorites();
    const index = list.findIndex((f) => f.type === item.type && f.text === item.text);
    if (index >= 0) {
      list.splice(index, 1);
    } else {
      list.push({
        type: item.type,
        text: item.text,
        author: item.author || '',
        savedAt: new Date().toISOString(),
      });
    }
    if (!saveFavorites(list)) return null;
    return index < 0;
  }


  // Tiny kindness: a list of the dates ("YYYY-MM-DD") it was done
  function loadKindnessDates() {
    try {
      const list = JSON.parse(localStorage.getItem(KINDNESS_KEY));
      return Array.isArray(list)
        ? list.filter((d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d))
        : [];
    } catch (err) {
      return [];
    }
  }

  function saveKindnessDates(list) {
    try {
      localStorage.setItem(KINDNESS_KEY, JSON.stringify(list));
      return true;
    } catch (err) {
      return false;
    }
  }


  /* -------------------------------------------------------------------
     "Today" helpers: the same pick all day, a new one tomorrow.
     Reused by the other cards later.
     ------------------------------------------------------------------- */

  // Turns today's date (e.g. "2026-09-24") into a whole number.
  // `salt` is optional: pass a card name ("quote", "poem") so different
  // cards don't all move in step with each other.
  function getTodaySeed(salt) {
    const text = todayKey() + (salt ? ':' + salt : '');
    let hash = 2166136261; // FNV-1a string hash
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  // Small seeded random generator (mulberry32): same seed, same numbers
  function seededRandom(seed) {
    let t = seed >>> 0;
    return function () {
      t = (t + 0x6D2B79F5) >>> 0;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Counts whole days since 1970 for today's local date, so something can
  // step through a list one item per day (e.g. the 5 art styles)
  function todayNumber() {
    const now = new Date();
    return Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86400000);
  }

  // Returns the same item all day, and a different one tomorrow
  function pickForToday(array, salt) {
    if (!array.length) return undefined;
    const random = seededRandom(getTodaySeed(salt));
    return array[Math.floor(random() * array.length)];
  }


  /* -------------------------------------------------------------------
     Small helpers
     ------------------------------------------------------------------- */
  function partOfDay(hour) {
    if (hour >= 5 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 17) return 'afternoon';
    if (hour >= 17 && hour < 22) return 'evening';
    return 'night';
  }

  // "Wednesday, 23 September"
  function formatDate(date) {
    const weekday = date.toLocaleDateString('en-GB', { weekday: 'long' });
    const month = date.toLocaleDateString('en-GB', { month: 'long' });
    return weekday + ', ' + date.getDate() + ' ' + month;
  }

  // Fetch a JSON array and keep only the items that pass `isValid`.
  // Throws if the file is missing, broken, or has no usable items.
  async function loadJsonList(url, isValid) {
    const response = await fetch(url);
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const data = await response.json();
    const clean = (Array.isArray(data) ? data : []).filter(isValid);
    if (!clean.length) throw new Error('No items in ' + url);
    return clean;
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Copy text to the clipboard. navigator.clipboard only works on https or
  // localhost, so fall back to the older method (e.g. when testing on a phone
  // over http://192.168.x.x).
  async function copyText(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (err) { /* try the fallback below */ }

    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      area.remove();
      return ok;
    } catch (err) {
      return false;
    }
  }


  /* -------------------------------------------------------------------
     Run immediately (shared.js has already sent visitors with no
     profile back to the welcome page)
     ------------------------------------------------------------------- */
  const profile = loadProfile();
  if (!profile) return;

  applySky(profile.sky);
  root.style.setProperty('--sun-rise', '1'); // sun high in the sky


  /* -------------------------------------------------------------------
     Everything below needs the page's elements
     ------------------------------------------------------------------- */
  document.addEventListener('DOMContentLoaded', function init() {
    const $ = (id) => document.getElementById(id);


    /* ---------------- Header ---------------- */
    function fillHeader() {
      const now = new Date();
      $('home-greeting').textContent = GREETINGS[partOfDay(now.getHours())];
      $('home-name').textContent = profile.name;
      $('home-date').textContent = formatDate(now);
    }


    // Heart buttons show their saved state with aria-pressed (CSS fills the heart)
    function setPressed(button, on) {
      button.setAttribute('aria-pressed', on ? 'true' : 'false');
    }


    /* ---------------- Quote of the day ---------------- */
    const quoteEls = {
      figure: $('quote'),
      text: $('quote-text'),
      author: $('quote-author'),
      fallback: $('quote-fallback'),
      actions: $('quote-actions'),
      save: $('quote-save'),
      copy: $('quote-copy'),
      share: $('quote-share'),
      another: $('quote-another'),
    };
    let quotes = [];
    let currentQuote = null;

    function isValidQuote(q) {
      return q && typeof q.text === 'string' && q.text.trim() !== '';
    }

    function formatQuote(quote) {
      return '“' + quote.text + '”' + (quote.author ? ' — ' + quote.author : '');
    }

    function renderQuote(quote) {
      currentQuote = quote;
      quoteEls.text.textContent = quote.text;
      quoteEls.author.textContent = quote.author || '';
      quoteEls.author.hidden = !quote.author;
      updateSaveButton();
    }

    function updateSaveButton() {
      setPressed(quoteEls.save, isFavorite('quote', currentQuote.text));
    }

    function toggleSaveQuote() {
      const saved = toggleFavorite({ type: 'quote', text: currentQuote.text, author: currentQuote.author });
      if (saved === null) {
        showToast("I couldn't save that on this device, sorry.");
        return;
      }
      setPressed(quoteEls.save, saved);
    }

    async function copyQuote() {
      const ok = await copyText(formatQuote(currentQuote));
      showToast(ok ? 'Copied' : "Couldn't copy, sorry.");
    }

    async function shareQuote() {
      try {
        await navigator.share({ title: 'Little Sunshine', text: formatQuote(currentQuote) });
      } catch (err) {
        // AbortError just means the share sheet was closed; nothing to do
        if (err && err.name !== 'AbortError') showToast("Couldn't share, sorry.");
      }
    }

    // Fade out, swap in a random different quote, fade back in
    async function showAnotherQuote() {
      if (quotes.length < 2) return;
      let next = currentQuote;
      while (next === currentQuote) {
        next = quotes[Math.floor(Math.random() * quotes.length)];
      }
      quoteEls.figure.classList.add('is-fading');
      await wait(reducedMotion.matches ? 0 : 260);
      renderQuote(next);
      quoteEls.figure.classList.remove('is-fading');
    }

    function showQuoteFallback() {
      quoteEls.figure.hidden = true;
      quoteEls.actions.hidden = true;
      quoteEls.another.hidden = true;
      quoteEls.fallback.hidden = false;
    }

    async function setupQuoteCard() {
      try {
        quotes = await loadJsonList(QUOTES_URL, isValidQuote);
      } catch (err) {
        showQuoteFallback();
        return;
      }

      renderQuote(pickForToday(quotes, 'quote'));
      quoteEls.figure.hidden = false;
      quoteEls.actions.hidden = false;
      quoteEls.another.hidden = quotes.length < 2;
      quoteEls.share.hidden = typeof navigator.share !== 'function';

      quoteEls.save.addEventListener('click', toggleSaveQuote);
      quoteEls.copy.addEventListener('click', copyQuote);
      quoteEls.share.addEventListener('click', shareQuote);
      quoteEls.another.addEventListener('click', showAnotherQuote);
    }


    /* ---------------- Today's little poem ---------------- */
    const poemEls = {
      poem: $('poem'),
      fallback: $('poem-fallback'),
      actions: $('poem-actions'),
      save: $('poem-save'),
    };
    let poemText = '';

    function isValidPoem(p) {
      return p && Array.isArray(p.lines) && p.lines.length > 0 &&
        p.lines.every((line) => typeof line === 'string');
    }

    // One <span> per line; CSS puts each on its own line
    function renderPoem(poem) {
      poemEls.poem.replaceChildren(...poem.lines.map((line) => {
        const span = document.createElement('span');
        span.className = 'poem__line';
        span.textContent = line;
        return span;
      }));
      poemText = poem.lines.join('\n');
      setPressed(poemEls.save, isFavorite('poem', poemText));
    }

    function toggleSavePoem() {
      const saved = toggleFavorite({ type: 'poem', text: poemText });
      if (saved === null) {
        showToast("I couldn't save that on this device, sorry.");
        return;
      }
      setPressed(poemEls.save, saved);
    }

    async function setupPoemCard() {
      let poems;
      try {
        poems = await loadJsonList(POEMS_URL, isValidPoem);
      } catch (err) {
        poemEls.fallback.hidden = false;
        return;
      }

      renderPoem(pickForToday(poems, 'poem'));
      poemEls.poem.hidden = false;
      poemEls.actions.hidden = false;
      poemEls.save.addEventListener('click', toggleSavePoem);
    }


    /* ---------------- Tap for a smile ---------------- */
    const smileEls = {
      button: $('smile-btn'),
      burst: $('smile-burst'),
      message: $('smile-message'),
    };
    let smiles = FALLBACK_SMILES;
    let lastSmile = '';

    // Any item from the list except the one shown last time
    function pickDifferent(list, previous) {
      const options = list.length > 1 ? list.filter((item) => item !== previous) : list;
      return options[Math.floor(Math.random() * options.length)];
    }

    // Restart a CSS animation class, even if it's already on the element
    function replayClass(el, className) {
      el.classList.remove(className);
      void el.offsetWidth; // force a reflow so the animation starts again
      el.classList.add(className);
    }

    function createParticle(index) {
      const particle = document.createElement('span');
      const isHeart = index % 2 === 0;
      // Evenly spread around the circle, with a little wobble
      const angle = (index / BURST_COUNT) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
      const distance = 110 + Math.random() * 40; // px from the center (button radius is 80)

      particle.className = 'smile-particle ' + (isHeart ? 'smile-particle--heart' : 'smile-particle--petal');
      particle.style.setProperty('--dx', (Math.cos(angle) * distance).toFixed(1) + 'px');
      particle.style.setProperty('--dy', (Math.sin(angle) * distance).toFixed(1) + 'px');
      particle.style.setProperty('--rot', Math.round((Math.random() - 0.5) * 120) + 'deg');
      particle.style.setProperty('--delay', Math.round(Math.random() * 60) + 'ms');
      if (!isHeart) {
        particle.style.setProperty('--c', PETAL_COLORS[index % PETAL_COLORS.length]);
      }
      return particle;
    }

    // 12 hearts and petals fly out of the sun, then clean themselves up
    function burst() {
      const group = document.createElement('div');
      group.className = 'smile-burst-group';
      for (let i = 0; i < BURST_COUNT; i++) group.appendChild(createParticle(i));
      smileEls.burst.appendChild(group);
      setTimeout(() => group.remove(), 1100);
    }

    function showSmile() {
      const message = pickDifferent(smiles, lastSmile);
      lastSmile = message;
      smileEls.message.textContent = message;

      if (reducedMotion.matches) return; // just change the message
      replayClass(smileEls.button, 'is-squished');
      replayClass(smileEls.message, 'is-new');
      burst();
    }

    async function setupSmile() {
      smileEls.button.addEventListener('click', showSmile);
      try {
        smiles = await loadJsonList(COMPLIMENTS_URL, (m) => typeof m === 'string' && m.trim() !== '');
      } catch (err) {
        // Keep the small built-in list; the button still works
      }
    }


    /* ---------------- Today's art ---------------- */
    const artEls = {
      frame: $('art-frame'),
      fallback: $('art-fallback'),
      actions: $('art-actions'),
      makeNew: $('art-new'),
      save: $('art-save'),
    };
    const art = { seed: 0, style: 0 };

    // The current sky's colors, straight from the CSS variables
    function readSkyColors() {
      const css = getComputedStyle(root);
      const read = (name) => css.getPropertyValue(name).trim();
      return {
        skyTop: read('--sky-top'),
        skyBottom: read('--sky-bottom'),
        hillBack: read('--hill-back'),
        hillFront: read('--hill-front'),
        sunCore: read('--sun-core'),
        sunEdge: read('--sun-edge'),
        accent: read('--button'),
      };
    }

    function drawArt() {
      const { generateArt, STYLE_NAMES } = window.LittleSunshineArt;
      artEls.frame.innerHTML = generateArt(art.seed, readSkyColors(), { style: art.style });
      artEls.frame.setAttribute('aria-label', "Today's art: " + STYLE_NAMES[art.style].toLowerCase());
    }

    // "Make a new one": random seed and random style, with a quick fade
    async function makeNewArt() {
      art.seed = Math.floor(Math.random() * 4294967296);
      art.style = Math.floor(Math.random() * window.LittleSunshineArt.STYLE_NAMES.length);
      artEls.frame.classList.add('is-fading');
      await wait(reducedMotion.matches ? 0 : 220);
      drawArt();
      artEls.frame.classList.remove('is-fading');
    }

    // Draws the current art onto a 1080x1920 canvas and downloads it as a PNG
    function saveWallpaper() {
      const svg = window.LittleSunshineArt.generateArt(art.seed, readSkyColors(), {
        style: art.style,
        width: WALLPAPER.width,
        height: WALLPAPER.height,
      });
      const image = new Image();
      artEls.save.disabled = true;

      image.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = WALLPAPER.width;
        canvas.height = WALLPAPER.height;
        canvas.getContext('2d').drawImage(image, 0, 0, WALLPAPER.width, WALLPAPER.height);
        canvas.toBlob((blob) => {
          artEls.save.disabled = false;
          if (!blob) {
            showToast("I couldn't make the wallpaper, sorry.");
            return;
          }
          downloadBlob(blob, 'little-sunshine-' + todayKey() + '.png');
          showToast('Your wallpaper is on its way.');
        }, 'image/png');
      };
      image.onerror = () => {
        artEls.save.disabled = false;
        showToast("I couldn't make the wallpaper, sorry.");
      };
      image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    }

    function downloadBlob(blob, filename) {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function setupArtCard() {
      if (!window.LittleSunshineArt) {
        artEls.frame.hidden = true;
        artEls.actions.hidden = true;
        artEls.fallback.hidden = false;
        return;
      }
      // Today's art: seeded by the date, style steps through the 5 styles day by day
      art.seed = getTodaySeed('art');
      art.style = todayNumber() % window.LittleSunshineArt.STYLE_NAMES.length;
      drawArt();

      artEls.makeNew.addEventListener('click', makeNewArt);
      artEls.save.addEventListener('click', saveWallpaper);
    }


    /* ---------------- A tiny kindness ---------------- */
    const kindEls = {
      wrap: $('kindness'),
      check: $('kindness-check'),
      task: $('kindness-task'),
      done: $('kindness-done'),
      count: $('kindness-count'),
      fallback: $('kindness-fallback'),
    };

    // Gentle running total. Only ever counts what was done, never what wasn't.
    function updateKindnessCount() {
      const total = loadKindnessDates().length;
      kindEls.count.hidden = total === 0;
      kindEls.count.textContent = "You've done " + total + ' kind ' +
        (total === 1 ? 'thing' : 'things') + ' for yourself.';
    }

    function showKindnessDone(isDone) {
      kindEls.done.textContent = isDone ? 'Done. That was kind of you.' : '';
    }

    // Checking adds today's date; unchecking (a mis-tap) takes it back out
    function onKindnessChange() {
      const today = todayKey();
      const dates = loadKindnessDates().filter((d) => d !== today);
      if (kindEls.check.checked) dates.push(today);

      if (!saveKindnessDates(dates)) {
        showToast("I couldn't save that on this device, sorry.");
      }
      showKindnessDone(kindEls.check.checked);
      updateKindnessCount();
    }

    async function setupKindnessCard() {
      let challenges;
      try {
        challenges = await loadJsonList(CHALLENGES_URL, (c) => typeof c === 'string' && c.trim() !== '');
      } catch (err) {
        kindEls.fallback.hidden = false;
        return;
      }

      kindEls.task.textContent = pickForToday(challenges, 'kindness');

      // Already done today? Show it checked, without replaying the animation
      const doneToday = loadKindnessDates().includes(todayKey());
      kindEls.check.checked = doneToday;
      showKindnessDone(doneToday);
      updateKindnessCount();
      kindEls.wrap.hidden = false;

      kindEls.check.addEventListener('change', onKindnessChange);
      // Turn on the check animation only after the first paint
      requestAnimationFrame(() => requestAnimationFrame(() => kindEls.wrap.classList.add('is-live')));
    }


    /* ---------------- Start ---------------- */
    fillHeader();
    renderBottomNav('today');
    setupQuoteCard();
    setupPoemCard();
    setupSmile();
    setupArtCard();
    setupKindnessCard();
  });
})();
