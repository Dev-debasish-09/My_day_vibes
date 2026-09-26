/* =====================================================================
   Little Sunshine: me.js (the "Me" page)
   Your name and joined date on a little sky card, a daily mood check-in,
   your garden this week (each day's mood grows a flower), a few gentle
   numbers, saved favorites as a swipeable row (with remove), settings
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
  const BREATHS_KEY = 'littleSunshine:breaths';     // written by breathe.js

  // Low moods get comfort, never forced cheer.
  // In the garden, a better mood means more petals and a taller stem.
  const MOODS = {
    'very-low': { label: 'Very low', petals: 3, stem: 34, size: 0.8,
      reply: 'Thank you for telling me. Hard days are allowed. Be as gentle with yourself as you can.' },
    'low':      { label: 'Low',      petals: 4, stem: 42, size: 0.88,
      reply: "That sounds heavy. You don't have to fix anything right now. I'm glad you're here." },
    'okay':     { label: 'Okay',     petals: 5, stem: 52, size: 0.95,
      reply: 'Okay is a perfectly good place to be.' },
    'good':     { label: 'Good',     petals: 6, stem: 62, size: 1,
      reply: "I'm really glad. Keep a little of that for later." },
    'great':    { label: 'Great',    petals: 8, stem: 72, size: 1.08,
      reply: 'That makes me so happy. Maybe it deserves a star in your joy jar?' },
  };

  // The garden's hill (see me.html): a curve from (0,146) over (175,104) to (350,146)
  const GARDEN = { width: 350, days: 7, edge: 146, peak: 104 };

  const DAY_DATE = /^\d{4}-\d{2}-\d{2}$/;
  const SVG_NS = 'http://www.w3.org/2000/svg';
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

  function countBreaths() {
    const n = Number(readJson(BREATHS_KEY));
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
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

  // Height of the garden's hill at x (the quadratic curve in me.html)
  function hillY(x) {
    const t = x / GARDEN.width;
    return (1 - t) * (1 - t) * GARDEN.edge + 2 * t * (1 - t) * GARDEN.peak + t * t * GARDEN.edge;
  }

  // Restart a CSS animation class, even if it's already on the element
  function replayClass(el, className) {
    el.classList.remove(className);
    void el.getBoundingClientRect(); // force a reflow so the animation starts again
    el.classList.add(className);
  }

  function svgEl(name, attrs) {
    const el = document.createElementNS(SVG_NS, name);
    Object.keys(attrs).forEach((key) => el.setAttribute(key, attrs[key]));
    return el;
  }


  /* -------------------------------------------------------------------
     Run immediately (shared.js has already sent visitors with no
     profile back to the welcome page)
     ------------------------------------------------------------------- */
  const profile = loadProfile();
  if (!profile) return;

  applySky(profile.sky);
  root.style.setProperty('--sun-rise', '0'); // the page's sun rests; the sky card has its own


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
      plants: $('garden-plants'),
      days: $('garden-days'),
      countJoys: $('count-joys'),
      countKindness: $('count-kindness'),
      countBreaths: $('count-breaths'),
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
      replayClass(els.reply, 'is-new');
      renderGarden(moods, todayKey()); // only today's flower grows again
    }


    /* ---------------- Your garden this week ---------------- */
    // A flower: a stem, a leaf for okay and up, and a bloom whose petal
    // count and size follow the mood
    function createFlower(x, base, mood) {
      const m = MOODS[mood];
      const top = base - m.stem;
      const group = svgEl('g', { class: 'garden__plant-body' });

      group.appendChild(svgEl('path', {
        class: 'garden__stem',
        d: `M${x} ${base} Q${x - 5} ${base - m.stem / 2} ${x} ${top}`,
        pathLength: 1,
      }));

      if (m.petals >= 5) {
        const y = base - m.stem * 0.42;
        group.appendChild(svgEl('path', {
          class: 'garden__leaf',
          d: `M${x - 2} ${y}q8-9 17-5q-7 9-17 5z`,
        }));
      }

      // The outer <g> places the bloom; the inner one is what grows (a CSS
      // animation on the outer one would replace its position)
      const place = svgEl('g', { transform: `translate(${x} ${top})` });
      const bloom = svgEl('g', { class: 'garden__bloom' });
      const s = m.size;
      for (let k = 0; k < m.petals; k++) {
        bloom.appendChild(svgEl('ellipse', {
          class: 'garden__petal',
          cx: 0, cy: (-7 * s).toFixed(1), rx: (5 * s).toFixed(1), ry: (8.5 * s).toFixed(1),
          transform: `rotate(${(k * 360) / m.petals})`,
        }));
      }
      bloom.appendChild(svgEl('circle', { class: 'garden__center', r: (4.2 * s).toFixed(1) }));
      place.appendChild(bloom);
      group.appendChild(place);
      return group;
    }

    // No mood that day: a small seed resting in the ground (never anything sad)
    function createSeed(x, base) {
      const group = svgEl('g', { class: 'garden__seed-group' });
      group.append(
        svgEl('path', { class: 'garden__mound', d: `M${x - 9} ${base + 1}q9-6 18 0` }),
        svgEl('ellipse', { class: 'garden__seed', cx: x, cy: base - 1, rx: 4.2, ry: 3, transform: `rotate(-18 ${x} ${base - 1})` }),
        svgEl('circle', { class: 'garden__seed-shine', cx: x - 1.4, cy: base - 2, r: 0.9 })
      );
      return group;
    }

    // `grow`: "all" (the page just opened), a day key (only that day), or nothing
    function renderGarden(moods, grow) {
      const today = todayKey();
      const colWidth = GARDEN.width / GARDEN.days;

      const plants = [];
      const days = [];
      lastSevenDays().forEach((date, i) => {
        const key = todayKey(date);
        const mood = moods[key];
        const x = colWidth * i + colWidth / 2;
        const base = hillY(x) + 2;

        const plant = svgEl('g', { class: 'garden-plant' });
        plant.style.setProperty('--d', (i * 90) + 'ms');
        if (mood) plant.setAttribute('data-mood', mood);
        if (grow === 'all' || grow === key) plant.classList.add('is-growing');
        if (grow === key) plant.style.setProperty('--d', '0ms');
        plant.appendChild(mood ? createFlower(x, base, mood) : createSeed(x, base));
        plants.push(plant);

        // Day letter, and what screen readers hear
        const dayName = date.toLocaleDateString('en-GB', { weekday: 'long' });
        const item = document.createElement('li');
        item.className = 'garden__day' + (key === today ? ' is-today' : '');
        const letter = document.createElement('span');
        letter.setAttribute('aria-hidden', 'true');
        letter.textContent = dayName.charAt(0);
        const spoken = document.createElement('span');
        spoken.className = 'visually-hidden';
        spoken.textContent = (key === today ? 'Today' : dayName) + ': ' +
          (mood ? MOODS[mood].label.toLowerCase() + ' flower' : 'a seed, no check-in');
        item.append(letter, spoken);
        days.push(item);
      });

      els.plants.replaceChildren(...plants);
      els.days.replaceChildren(...days);
    }


    /* ---------------- Little numbers ---------------- */
    function renderNumbers() {
      els.countJoys.textContent = countJoys();
      els.countKindness.textContent = countKindness();
      els.countBreaths.textContent = countBreaths();
    }


    /* ---------------- Favorites: a swipeable row of cards ---------------- */
    // Removing takes two taps: the first turns the corner button into "Remove?"
    function armRemove(button) {
      if (button.classList.contains('is-armed')) return true;
      button.classList.add('is-armed');
      button.querySelector('.fav-card__remove-text').textContent = 'Remove?';
      setTimeout(() => {
        if (!button.isConnected) return;
        button.classList.remove('is-armed');
        button.querySelector('.fav-card__remove-text').textContent = '';
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
      showToast('Removed from your favorites.');
      // Keep keyboard focus in the row, not lost at the top of the page
      const first = els.favorites.querySelector('.fav-card__remove');
      (first || $('favorites-title')).focus();
    }

    function createFavoriteCard(fav, index) {
      const card = document.createElement('li');
      card.className = 'fav-card fav-card--' + (index % 5);

      const text = document.createElement('p');
      text.className = 'fav-card__text fav-card__text--' + fav.type;
      text.textContent = fav.text; // poems keep their line breaks (CSS pre-line)

      const meta = document.createElement('p');
      meta.className = 'fav-card__meta';
      meta.textContent = fav.type === 'poem' ? 'Poem' : (fav.author ? '— ' + fav.author : 'Quote');

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'fav-card__remove';
      remove.setAttribute('aria-label', 'Remove from favorites: ' + fav.text.split('\n')[0]);
      remove.innerHTML =
        '<span class="fav-card__remove-text"></span>' +
        '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7 7l10 10M17 7L7 17"/></svg>';
      remove.addEventListener('click', () => removeFavorite(fav, remove));

      card.append(remove, text, meta);
      return card;
    }

    function renderFavorites() {
      const favorites = loadFavorites().sort(bySavedAtDesc);
      els.favoritesEmpty.hidden = favorites.length > 0;
      els.favorites.hidden = favorites.length === 0;
      els.favorites.replaceChildren(...favorites.map(createFavoriteCard));
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
    renderGarden(moods, 'all'); // the flowers grow up as the page opens
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
