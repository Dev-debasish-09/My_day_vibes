/* =====================================================================
   Little Sunshine: home.js (the "Today" page)
   Reads the saved profile, applies the sky, fills in the header, the
   quote of the day, today's poem, "Tap for a smile", and wires up the
   bottom navigation.

   Loaded in <head> without defer. The top part runs right away (redirect
   if there is no profile, apply the sky before first paint); the rest
   waits for DOMContentLoaded.
   ===================================================================== */
(function () {
  'use strict';

  /* -------------------------------------------------------------------
     Settings (same storage key and skies as app.js)
     ------------------------------------------------------------------- */
  const STORAGE_KEY = 'littleSunshine:v1';
  const FAVORITES_KEY = 'littleSunshine:favorites';
  const QUOTES_URL = 'data/quotes.json';
  const POEMS_URL = 'data/poems.json';
  const COMPLIMENTS_URL = 'data/compliments.json';

  // Used by "Tap for a smile" until compliments.json loads (or if it can't)
  const FALLBACK_SMILES = [
    "You're doing better than you think.",
    'Someone is glad you exist today.',
    "You're here, and that's enough.",
  ];

  // Burst particle colors: pink, peach, butter, lavender, mint (like the welcome petals)
  const PETAL_COLORS = ['#F7B9C8', '#FFCBA4', '#FFE8A3', '#D6C6F2', '#BFE3CC'];
  const BURST_COUNT = 12;

  // statusBar is used for <meta name="theme-color"> (it's the sky's top color)
  const SKIES = {
    peach:    { statusBar: '#FFD8BE' },
    lavender: { statusBar: '#D9CCF5' },
    sea:      { statusBar: '#CDE7F5' },
    mint:     { statusBar: '#CFE3D4' },
  };

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
  function loadProfile() {
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!data || typeof data.name !== 'string' || !data.name.trim()) return null;
      return {
        name: data.name.trim(),
        sky: SKIES[data.sky] ? data.sky : 'peach',
      };
    } catch (err) {
      return null;
    }
  }

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


  /* -------------------------------------------------------------------
     "Today" helpers: the same pick all day, a new one tomorrow.
     Reused by the other cards later.
     ------------------------------------------------------------------- */

  // Local date as "YYYY-MM-DD"
  function todayKey() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

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

  // Returns the same item all day, and a different one tomorrow
  function pickForToday(array, salt) {
    if (!array.length) return undefined;
    const random = seededRandom(getTodaySeed(salt));
    return array[Math.floor(random() * array.length)];
  }


  /* -------------------------------------------------------------------
     Small helpers
     ------------------------------------------------------------------- */
  function applySky(key) {
    // The sky themes live on <html>, like on the welcome page, so the
    // page background and the overscroll color match too.
    root.setAttribute('data-sky', key);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', SKIES[key].statusBar);
  }

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
     Run immediately: no profile means go back to the welcome page
     ------------------------------------------------------------------- */
  const profile = loadProfile();
  if (!profile) {
    window.location.replace('./');
    return;
  }

  applySky(profile.sky);
  root.style.setProperty('--sun-rise', '1'); // sun high in the sky


  /* -------------------------------------------------------------------
     Everything below needs the page's elements
     ------------------------------------------------------------------- */
  document.addEventListener('DOMContentLoaded', function init() {
    const $ = (id) => document.getElementById(id);
    const toast = $('toast');
    let toastTimer = 0;


    /* ---------------- Header ---------------- */
    function fillHeader() {
      const now = new Date();
      $('home-greeting').textContent = GREETINGS[partOfDay(now.getHours())];
      $('home-name').textContent = profile.name;
      $('home-date').textContent = formatDate(now);
    }


    /* ---------------- Toast ---------------- */
    function showToast(message) {
      toast.textContent = message;
      toast.classList.add('is-shown');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toast.classList.remove('is-shown'), 3200);
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


    /* ---------------- Bottom navigation ---------------- */
    // Tabs that don't have a page yet
    function wireNavigation() {
      document.querySelectorAll('[data-soon]').forEach((tab) => {
        tab.addEventListener('click', () => showToast('This page is coming soon.'));
      });
    }


    /* ---------------- Start ---------------- */
    fillHeader();
    wireNavigation();
    setupQuoteCard();
    setupPoemCard();
    setupSmile();
  });
})();
