/* =====================================================================
   Little Sunshine: home.js (the "Today" page)
   Reads the saved profile, applies the sky, fills in the header, the
   quote of the day, and wires up the bottom navigation.

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

  // Favorites are a list of { type, text, author, savedAt }.
  // `type` ("quote" for now) lets poems and other things share the list later.
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

    // Load quotes.json; resolves to a clean array, or throws if unusable
    async function loadQuotes() {
      const response = await fetch(QUOTES_URL);
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const data = await response.json();
      const clean = (Array.isArray(data) ? data : []).filter(
        (q) => q && typeof q.text === 'string' && q.text.trim()
      );
      if (!clean.length) throw new Error('No quotes');
      return clean;
    }

    function formatQuote(quote) {
      return '“' + quote.text + '”' + (quote.author ? ' — ' + quote.author : '');
    }

    function isQuoteSaved(quote) {
      return loadFavorites().some((f) => f.type === 'quote' && f.text === quote.text);
    }

    function renderQuote(quote) {
      currentQuote = quote;
      quoteEls.text.textContent = quote.text;
      quoteEls.author.textContent = quote.author || '';
      quoteEls.author.hidden = !quote.author;
      updateSaveButton();
    }

    function updateSaveButton() {
      const saved = isQuoteSaved(currentQuote);
      quoteEls.save.setAttribute('aria-pressed', saved ? 'true' : 'false');
    }

    function toggleSaveQuote() {
      const list = loadFavorites();
      const index = list.findIndex((f) => f.type === 'quote' && f.text === currentQuote.text);
      if (index >= 0) {
        list.splice(index, 1);
      } else {
        list.push({
          type: 'quote',
          text: currentQuote.text,
          author: currentQuote.author || '',
          savedAt: new Date().toISOString(),
        });
      }
      if (!saveFavorites(list)) {
        showToast("I couldn't save that on this device, sorry.");
        return;
      }
      updateSaveButton();
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
        quotes = await loadQuotes();
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
  });
})();
