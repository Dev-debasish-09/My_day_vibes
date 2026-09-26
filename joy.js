/* =====================================================================
   Little Sunshine: joy.js (the "Joy Jar" page)
   One small good thing a day becomes a paper star in a glass jar.
   Saves [{ text, date }] in localStorage, draws the stars, picks a
   random memory, and shows the full list (with delete).
   The profile, sky, toast, and bottom navigation come from shared.js
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
  const JOYS_KEY = 'littleSunshine:joys';
  const MAX_TEXT = 140;
  const MAX_VISIBLE_STARS = 60; // the jar shows the newest 60; every joy is still kept

  // Star colors come from the current sky, so they follow a sky change
  // (the palest sky colors are left out: they vanish against the glass)
  const STAR_COLORS = ['--button', '--hill-front', '--hill-back', '--sun-edge'];

  // Where the pile sits inside the jar (SVG units, see joy.html)
  const PILE = {
    floor: 269,     // center of the bottom row
    rowHeight: 16,
    spacing: 21,    // between star centers in a row
    wideRow: 7,     // rows alternate 7 and 6 stars, so they nest
    centerX: 120,
    dropFrom: 58,   // stars fall in from just under the lid
  };

  const root = document.documentElement;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');


  /* -------------------------------------------------------------------
     Storage (always wrapped in try/catch: private mode or blocked
     storage must never break the page)
     ------------------------------------------------------------------- */
  function isValidJoy(j) {
    return j && typeof j.text === 'string' && j.text.trim() !== '' &&
      typeof j.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(j.date);
  }

  // Oldest first, in the order they were added
  function loadJoys() {
    try {
      const list = JSON.parse(localStorage.getItem(JOYS_KEY));
      return Array.isArray(list) ? list.filter(isValidJoy) : [];
    } catch (err) {
      return [];
    }
  }

  function saveJoys(list) {
    try {
      localStorage.setItem(JOYS_KEY, JSON.stringify(list));
      return true;
    } catch (err) {
      return false;
    }
  }


  /* -------------------------------------------------------------------
     Small helpers
     ------------------------------------------------------------------- */
  // "12 September", plus the year if it isn't this year
  function formatJoyDate(key) {
    const parts = key.split('-').map(Number);
    const date = new Date(parts[0], parts[1] - 1, parts[2]);
    const options = { day: 'numeric', month: 'long' };
    if (parts[0] !== new Date().getFullYear()) options.year = 'numeric';
    return date.toLocaleDateString('en-GB', options);
  }

  // Small stable hash (FNV-1a), so each joy keeps its own color and tilt
  function hash(text) {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Restart a CSS animation class, even if it's already on the element
  function replayClass(el, className) {
    el.classList.remove(className);
    void el.getBoundingClientRect(); // force a reflow so the animation starts again
    el.classList.add(className);
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
    const SVG_NS = 'http://www.w3.org/2000/svg';
    const els = {
      jarSection: $('jar-section'),
      jar: $('jar'),
      stars: $('jar-stars'),
      lid: $('jar-lid'),
      empty: $('jar-empty'),
      form: $('joy-form'),
      input: $('joy-input'),
      hint: $('joy-hint'),
      count: $('joy-count'),
      memories: $('joy-memories'),
      pick: $('memory-pick'),
      memory: $('memory'),
      memoryDate: $('memory-date'),
      memoryText: $('memory-text'),
      listToggle: $('list-toggle'),
      listCard: $('joy-list-card'),
      list: $('joy-list'),
    };

    let joys = loadJoys();
    let lastMemory = null;


    /* ---------------- The jar ---------------- */
    // Position of the star in slot `index`, with a little wobble so the
    // pile looks tossed in rather than stacked. Each row fills from the
    // middle outwards, so the first star lands in the center.
    function slotPosition(index, seed) {
      let row = 0;
      let first = 0;
      while (true) {
        const size = row % 2 === 0 ? PILE.wideRow : PILE.wideRow - 1;
        if (index < first + size) {
          // Columns sorted by distance from the middle: 3, 2, 4, 1, 5, 0, 6 (for 7)
          const middle = (size - 1) / 2;
          const order = Array.from({ length: size }, (_, c) => c)
            .sort((a, b) => Math.abs(a - middle) - Math.abs(b - middle) || a - b);
          const x = PILE.centerX + (order[index - first] - middle) * PILE.spacing;
          return {
            x: x + ((seed & 0xff) / 255 - 0.5) * 6,
            y: PILE.floor - row * PILE.rowHeight + (((seed >>> 8) & 0xff) / 255 - 0.5) * 4,
          };
        }
        first += size;
        row++;
      }
    }

    function createStar(joy, index) {
      const seed = hash(joy.date + '|' + joy.text);
      const pos = slotPosition(index, seed);
      const rotate = ((seed >>> 16) % 72) - 36;
      const scale = 0.9 + ((seed >>> 24) % 5) * 0.05;

      // Outer <g> places the star; inner <g> is what the drop animation moves
      const place = document.createElementNS(SVG_NS, 'g');
      place.setAttribute('transform', `translate(${pos.x.toFixed(1)} ${pos.y.toFixed(1)})`);

      const star = document.createElementNS(SVG_NS, 'g');
      star.setAttribute('class', 'jar-star');
      star.style.setProperty('--c', `var(${STAR_COLORS[seed % STAR_COLORS.length]})`);
      star.style.setProperty('--drop', (PILE.dropFrom - pos.y).toFixed(1) + 'px');
      star.style.setProperty('--turn', rotate + 'deg');

      const body = document.createElementNS(SVG_NS, 'use');
      body.setAttribute('href', '#star-shape');
      body.setAttribute('class', 'jar-star__paper');
      body.setAttribute('transform', `rotate(${rotate}) scale(${scale})`);

      // Faint folds from the center to each point, like a folded paper star
      const folds = document.createElementNS(SVG_NS, 'path');
      folds.setAttribute('class', 'jar-star__folds');
      folds.setAttribute('d', 'M0 0 0-9M0 0 8.6-2.8M0 0 5.3 7.3M0 0-5.3 7.3M0 0-8.6-2.8');
      folds.setAttribute('transform', `rotate(${rotate}) scale(${scale})`);

      star.append(body, folds);
      place.appendChild(star);
      return place;
    }

    // Draws the newest 60 joys. With `dropNewest`, the last star falls in.
    function renderJar(dropNewest) {
      const shown = joys.slice(-MAX_VISIBLE_STARS);
      els.stars.replaceChildren(...shown.map(createStar));

      els.empty.hidden = joys.length > 0;
      els.jar.setAttribute('aria-label', joys.length === 0
        ? 'An empty glass jar'
        : 'A glass jar with ' + joys.length + (joys.length === 1 ? ' paper star' : ' paper stars'));

      if (dropNewest && shown.length && !reducedMotion.matches) {
        els.stars.lastElementChild.firstElementChild.classList.add('is-dropping');
        replayClass(els.lid, 'is-bumped');
      }
    }


    /* ---------------- Writing a joy ---------------- */
    function updateCount() {
      els.count.textContent = els.input.value.length + ' / ' + MAX_TEXT;
    }

    function setHint(message) {
      els.hint.textContent = message;
      if (message) els.input.setAttribute('aria-invalid', 'true');
      else els.input.removeAttribute('aria-invalid');
    }

    function addJoy(event) {
      event.preventDefault();
      const text = els.input.value.replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT);
      if (!text) {
        setHint('Write a little something first.');
        els.input.focus();
        return;
      }

      const next = joys.concat({ text: text, date: todayKey() });
      if (!saveJoys(next)) {
        showToast("I couldn't save that on this device, sorry.");
        return;
      }
      joys = next;

      els.input.value = '';
      els.input.blur(); // closes the phone keyboard so the jar is in view
      updateCount();
      setHint('');

      // Bring the jar into view so the star can be seen dropping in
      const box = els.jarSection.getBoundingClientRect();
      if (box.top < 0 || box.bottom > window.innerHeight) {
        els.jarSection.scrollIntoView({ block: 'center', behavior: reducedMotion.matches ? 'auto' : 'smooth' });
      }

      renderJar(true);
      renderRest();
      showToast('Added to your jar.');
    }


    /* ---------------- Pick a memory ---------------- */
    function showMemory(joy) {
      lastMemory = joy;
      els.memoryDate.textContent = 'On ' + formatJoyDate(joy.date) + ' you wrote:';
      els.memoryText.textContent = joy.text;
    }

    // A random joy, different from the one showing if there's a choice
    async function pickMemory() {
      if (!joys.length) return;
      const options = joys.length > 1 ? joys.filter((j) => j !== lastMemory) : joys;
      const joy = options[Math.floor(Math.random() * options.length)];

      if (els.memory.hidden) {
        showMemory(joy);
        els.memory.hidden = false;
        return;
      }
      els.memory.classList.add('is-fading');
      await wait(reducedMotion.matches ? 0 : 240);
      showMemory(joy);
      els.memory.classList.remove('is-fading');
    }


    /* ---------------- See all ---------------- */
    // Deleting takes two taps: the first turns the button into "Delete?"
    function armDelete(button) {
      if (button.classList.contains('is-armed')) return true;
      button.classList.add('is-armed');
      button.textContent = 'Delete?';
      setTimeout(() => {
        if (!button.isConnected) return;
        button.classList.remove('is-armed');
        button.textContent = 'Delete';
      }, 3000);
      return false;
    }

    function deleteJoy(joy, button) {
      if (!armDelete(button)) return;
      const next = joys.filter((j) => j !== joy);
      if (!saveJoys(next)) {
        showToast("I couldn't change that on this device, sorry.");
        return;
      }
      joys = next;
      if (lastMemory === joy) {
        lastMemory = null;
        els.memory.hidden = true;
      }
      renderJar(false);
      renderRest();
      showToast('Taken out of your jar.');
      // Keep keyboard focus in the list, not lost at the top of the page
      const firstDelete = els.list.querySelector('.joy-list__delete');
      (firstDelete || els.listToggle).focus();
    }

    function renderList() {
      els.list.replaceChildren(...joys.slice().reverse().map((joy) => {
        const item = document.createElement('li');
        item.className = 'joy-list__item';

        const words = document.createElement('div');
        words.className = 'joy-list__words';
        const text = document.createElement('p');
        text.className = 'joy-list__text';
        text.textContent = joy.text;
        const date = document.createElement('p');
        date.className = 'joy-list__date';
        date.textContent = formatJoyDate(joy.date);
        words.append(text, date);

        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'joy-list__delete';
        remove.textContent = 'Delete';
        remove.setAttribute('aria-label', 'Delete "' + joy.text + '" from ' + formatJoyDate(joy.date));
        remove.addEventListener('click', () => deleteJoy(joy, remove));

        item.append(words, remove);
        return item;
      }));
    }

    function setListOpen(open) {
      els.listCard.hidden = !open;
      els.listToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      els.listToggle.textContent = open ? 'Hide list' : 'See all (' + joys.length + ')';
    }

    // Everything under the jar that depends on the saved joys
    function renderRest() {
      els.memories.hidden = joys.length === 0;
      if (joys.length === 0) setListOpen(false);
      else setListOpen(!els.listCard.hidden);
      renderList();
    }


    /* ---------------- Start ---------------- */
    renderBottomNav('joy');
    renderJar(false);
    renderRest();
    updateCount();

    els.form.addEventListener('submit', addJoy);
    els.input.addEventListener('input', () => {
      updateCount();
      if (els.input.value.trim()) setHint('');
    });
    els.pick.addEventListener('click', pickMemory);
    els.listToggle.addEventListener('click', () => setListOpen(els.listCard.hidden));
  });
})();
