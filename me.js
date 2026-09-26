/* =====================================================================
   Little Sunshine: me.js (the "Me" page)
   Your name and joined date, a daily mood check-in, your week in mood
   dots, a few gentle numbers, saved favorites (with remove), settings
   (sounds, reset everything), and a support card (static, in me.html).
   The profile, sky, sounds, toast, and bottom navigation come from
   shared.js (window.LittleSunshine).

   Loaded in <head> without defer, after shared.js. The top part runs
   right away (apply the sky before first paint); the rest waits for
   DOMContentLoaded.
   ===================================================================== */
(function () {
  'use strict';

  const {
    loadProfile, applySky, showToast, renderBottomNav, todayKey,
    loadSoundOn, saveSoundOn, clearAllData,
  } = window.LittleSunshine;

  /* -------------------------------------------------------------------
     Settings
     ------------------------------------------------------------------- */
  const MOODS_KEY = 'littleSunshine:moods';         // { "YYYY-MM-DD": "good", ... }
  const FAVORITES_KEY = 'littleSunshine:favorites'; // written by home.js
  const KINDNESS_KEY = 'littleSunshine:kindness';   // written by home.js
  const JOYS_KEY = 'littleSunshine:joys';           // written by joy.js

  // Low moods get comfort, never forced cheer
  const MOODS = {
    'very-low': { label: 'Very low', reply: 'Thank you for telling me. Hard days are allowed. Be as gentle with yourself as you can.' },
    'low':      { label: 'Low',      reply: "That sounds heavy. You don't have to fix anything right now. I'm glad you're here." },
    'okay':     { label: 'Okay',     reply: 'Okay is a perfectly good place to be.' },
    'good':     { label: 'Good',     reply: "I'm really glad. Keep a little of that for later." },
    'great':    { label: 'Great',    reply: 'That makes me so happy. Maybe it deserves a star in your joy jar?' },
  };

  const DAY_DATE = /^\d{4}-\d{2}-\d{2}$/;
  const root = document.documentElement;


  /* -------------------------------------------------------------------
     Storage (always wrapped in try/catch: private mode or blocked
     storage must never break the page)
     ------------------------------------------------------------------- */
  function readJson(key) {
    try {
      return JSON.parse(localStorage.getItem(key));
    } catch (err) {
      return null;
    }
  }

  function writeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (err) {
      return false;
    }
  }

  // Only well-formed days with a known mood
  function loadMoods() {
    const data = readJson(MOODS_KEY);
    const moods = {};
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      Object.keys(data).forEach((day) => {
        if (DAY_DATE.test(day) && MOODS[data[day]]) moods[day] = data[day];
      });
    }
    return moods;
  }

  // Same shape home.js saves: { type: "quote" | "poem", text, author, savedAt }
  function loadFavorites() {
    const list = readJson(FAVORITES_KEY);
    return Array.isArray(list)
      ? list.filter((f) => f && (f.type === 'quote' || f.type === 'poem') && typeof f.text === 'string' && f.text)
      : [];
  }

  function countKindness() {
    const list = readJson(KINDNESS_KEY);
    return Array.isArray(list) ? list.filter((d) => typeof d === 'string' && DAY_DATE.test(d)).length : 0;
  }

  function countJoys() {
    const list = readJson(JOYS_KEY);
    return Array.isArray(list)
      ? list.filter((j) => j && typeof j.text === 'string' && j.text.trim()).length
      : 0;
  }


  /* -------------------------------------------------------------------
     Small helpers
     ------------------------------------------------------------------- */
  function dateFromKey(key) {
    const parts = key.split('-').map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }

  // "20 September", plus the year if it isn't this year
  function formatDay(date) {
    const options = { day: 'numeric', month: 'long' };
    if (date.getFullYear() !== new Date().getFullYear()) options.year = 'numeric';
    return date.toLocaleDateString('en-GB', options);
  }

  // The last 7 days as dates, oldest first, today last
  function lastSevenDays() {
    const today = new Date();
    return Array.from({ length: 7 }, (_, i) =>
      new Date(today.getFullYear(), today.getMonth(), today.getDate() - (6 - i)));
  }

  // Newest first; favorites saved before savedAt existed go last
  function bySavedAtDesc(a, b) {
    return (Date.parse(b.savedAt) || 0) - (Date.parse(a.savedAt) || 0);
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
    const els = {
      name: $('me-name'),
      since: $('me-since'),
      moods: $('moods'),
      reply: $('mood-reply'),
      week: $('week'),
      countKindness: $('count-kindness'),
      countJoys: $('count-joys'),
      countFavorites: $('count-favorites'),
      favorites: $('favorites'),
      favoritesEmpty: $('favorites-empty'),
      sound: $('sound-toggle'),
      resetOpen: $('reset-open'),
      resetConfirm: $('reset-confirm'),
      resetCancel: $('reset-cancel'),
      resetYes: $('reset-yes'),
    };


    /* ---------------- Header ---------------- */
    function fillHeader() {
      els.name.textContent = profile.name;
      els.since.textContent = 'Here since ' + formatDay(dateFromKey(profile.joinedDate));
    }


    /* ---------------- Mood check-in ---------------- */
    // The reply is a live region, so a new choice is read out
    function showMood(mood) {
      els.moods.querySelectorAll('.mood__input').forEach((input) => {
        input.checked = input.value === mood;
      });
      els.reply.textContent = mood ? MOODS[mood].reply : '';
    }

    // Choosing again the same day just replaces today's mood
    function onMoodChange(event) {
      const mood = event.target.value;
      const moods = loadMoods();
      moods[todayKey()] = mood;
      if (!writeJson(MOODS_KEY, moods)) {
        showToast("I couldn't save that on this device, sorry.");
      }
      showMood(mood);
      renderWeek(moods);
    }


    /* ---------------- Your week ---------------- */
    function renderWeek(moods) {
      const today = todayKey();
      els.week.replaceChildren(...lastSevenDays().map((date) => {
        const key = todayKey(date);
        const mood = moods[key];
        const dayName = date.toLocaleDateString('en-GB', { weekday: 'long' });

        const item = document.createElement('li');
        item.className = 'week__day' + (key === today ? ' is-today' : '');
        if (mood) item.dataset.mood = mood;

        const dot = document.createElement('span');
        dot.className = 'week__dot';
        dot.setAttribute('aria-hidden', 'true');

        const letter = document.createElement('span');
        letter.className = 'week__letter';
        letter.setAttribute('aria-hidden', 'true');
        letter.textContent = dayName.charAt(0);

        // Read out as "Monday: good" or "Monday: no check-in"
        const spoken = document.createElement('span');
        spoken.className = 'visually-hidden';
        spoken.textContent = (key === today ? 'Today' : dayName) + ': ' +
          (mood ? MOODS[mood].label.toLowerCase() : 'no check-in');

        item.append(dot, letter, spoken);
        return item;
      }));
    }


    /* ---------------- Little numbers ---------------- */
    function renderNumbers() {
      els.countKindness.textContent = countKindness();
      els.countJoys.textContent = countJoys();
      els.countFavorites.textContent = loadFavorites().length;
    }


    /* ---------------- Favorites ---------------- */
    // Removing takes two taps: the first turns the button into "Remove?"
    function armRemove(button) {
      if (button.classList.contains('is-armed')) return true;
      button.classList.add('is-armed');
      button.textContent = 'Remove?';
      setTimeout(() => {
        if (!button.isConnected) return;
        button.classList.remove('is-armed');
        button.textContent = 'Remove';
      }, 3000);
      return false;
    }

    function removeFavorite(fav, button) {
      if (!armRemove(button)) return;
      // Match on the saved list (not our copy), in case another tab changed it
      const next = loadFavorites().filter((f) => !(f.type === fav.type && f.text === fav.text));
      if (!writeJson(FAVORITES_KEY, next)) {
        showToast("I couldn't change that on this device, sorry.");
        return;
      }
      renderFavorites();
      renderNumbers();
      showToast('Removed from your favorites.');
      // Keep keyboard focus in the card, not lost at the top of the page
      const first = els.favorites.querySelector('.joy-list__delete');
      (first || $('favorites-title')).focus();
    }

    function renderFavorites() {
      const favorites = loadFavorites().sort(bySavedAtDesc);
      els.favoritesEmpty.hidden = favorites.length > 0;
      els.favorites.hidden = favorites.length === 0;

      els.favorites.replaceChildren(...favorites.map((fav) => {
        const item = document.createElement('li');
        item.className = 'joy-list__item';

        const words = document.createElement('div');
        words.className = 'joy-list__words';

        const text = document.createElement('p');
        text.className = 'joy-list__text favorites__text favorites__text--' + fav.type;
        text.textContent = fav.text; // poems keep their line breaks (CSS pre-line)

        const meta = document.createElement('p');
        meta.className = 'joy-list__date';
        meta.textContent = fav.type === 'poem' ? 'Poem' : (fav.author ? '— ' + fav.author : 'Quote');

        words.append(text, meta);

        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'joy-list__delete';
        remove.textContent = 'Remove';
        remove.setAttribute('aria-label', 'Remove from favorites: ' + fav.text.split('\n')[0]);
        remove.addEventListener('click', () => removeFavorite(fav, remove));

        item.append(words, remove);
        return item;
      }));
    }


    /* ---------------- Settings: sounds ---------------- */
    function showSound(on) {
      els.sound.setAttribute('aria-checked', on ? 'true' : 'false');
    }

    function toggleSound() {
      const on = els.sound.getAttribute('aria-checked') !== 'true';
      if (!saveSoundOn(on)) {
        showToast("I couldn't save that on this device, sorry.");
        return;
      }
      showSound(on);
    }


    /* ---------------- Settings: reset everything ---------------- */
    function setResetOpen(open) {
      els.resetConfirm.hidden = !open;
      els.resetOpen.hidden = open;
      els.resetOpen.setAttribute('aria-expanded', open ? 'true' : 'false');
      (open ? els.resetCancel : els.resetOpen).focus();
    }

    function resetEverything() {
      if (!clearAllData()) {
        showToast("I couldn't clear this device, sorry.");
        return;
      }
      // Nothing saved any more: start again at the welcome page
      window.location.replace('./');
    }


    /* ---------------- Start ---------------- */
    renderBottomNav('me');
    fillHeader();

    const moods = loadMoods();
    showMood(moods[todayKey()] || null);
    renderWeek(moods);
    renderNumbers();
    renderFavorites();
    showSound(loadSoundOn());

    els.moods.addEventListener('change', onMoodChange);
    els.sound.addEventListener('click', toggleSound);
    els.resetOpen.addEventListener('click', () => setResetOpen(true));
    els.resetCancel.addEventListener('click', () => setResetOpen(false));
    els.resetYes.addEventListener('click', resetEverything);
  });
})();
