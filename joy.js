/* =====================================================================
   Little Sunshine: joy.js (the "Joy Jar" page)
   One small good thing a day. It's written on a paper note, folds into
   a star, flies into a glowing glass jar, and twinkles there like a
   fairy light. Tap a star (or "Pick a memory") to read it again as a
   small letter. Saves [{ text, date }] in localStorage.
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
    dropFrom: 60,   // stars fall in from the jar's mouth
  };
  const MOUTH = { x: 120, y: 60 };  // where a flying note enters (and a star leaves)
  const STAR_SIZE = 22;             // a star's width in SVG units

  // The note folds from a rectangle into a star: both are 10-point
  // polygons, in the same order, so the browser can morph between them
  const NOTE_SHAPE = 'polygon(50% 0%, 100% 0%, 100% 35%, 100% 57%, 100% 100%, 50% 100%, 0% 100%, 0% 57%, 0% 35%, 0% 0%)';
  const STAR_SHAPE = 'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)';
  const NOTE_COLOR = '#FFF8EA';

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
  function dateFromKey(key) {
    const parts = key.split('-').map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }

  // "12 September", plus the year if it isn't this year
  function formatJoyDate(key) {
    const date = dateFromKey(key);
    const options = { day: 'numeric', month: 'long' };
    if (date.getFullYear() !== new Date().getFullYear()) options.year = 'numeric';
    return date.toLocaleDateString('en-GB', options);
  }

  // "September 2026"
  function formatMonth(key) {
    return dateFromKey(key).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  }

  // Small stable hash (FNV-1a), so each joy keeps its own color, tilt, and twinkle
  function hash(text) {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function seedOf(joy) {
    return hash(joy.date + '|' + joy.text);
  }

  function colorVarOf(joy) {
    return STAR_COLORS[seedOf(joy) % STAR_COLORS.length];
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
      stage: $('jar-stage'),
      jar: $('jar'),
      stars: $('jar-stars'),
      rise: $('jar-rise'),
      lid: $('jar-lid'),
      count: $('jar-count'),
      empty: $('jar-empty'),
      pickWrap: $('jar-pick-wrap'),
      pick: $('memory-pick'),
      form: $('joy-form'),
      note: $('joy-note'),
      input: $('joy-input'),
      hint: $('joy-hint'),
      chars: $('joy-count'),
      add: $('joy-add'),
      all: $('joy-all'),
      listToggle: $('list-toggle'),
      listCard: $('joy-list-card'),
      list: $('joy-list'),
      memory: $('memory'),
      memoryIntro: $('memory-intro'),
      memoryText: $('memory-text'),
      stampDay: $('stamp-day'),
      stampMonth: $('stamp-month'),
      memoryClose: $('memory-close'),
    };

    let joys = loadJoys();
    let lastMemory = null;
    let busy = false; // a star is flying or rising; ignore new taps until it's done


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

    function svgEl(name, attrs) {
      const el = document.createElementNS(SVG_NS, name);
      Object.keys(attrs).forEach((key) => el.setAttribute(key, attrs[key]));
      return el;
    }

    // One fairy-light star: a warm halo that twinkles, and the paper star on top
    function createStar(joy, slot, joyIndex) {
      const seed = seedOf(joy);
      const pos = slotPosition(slot, seed);
      const rotate = ((seed >>> 16) % 72) - 36;
      const scale = 0.9 + ((seed >>> 24) % 5) * 0.05;
      const shapeTransform = `rotate(${rotate}) scale(${scale})`;

      // Outer <g> places the star and says which joy it is
      const place = svgEl('g', {
        class: 'jar-star-place',
        transform: `translate(${pos.x.toFixed(1)} ${pos.y.toFixed(1)})`,
      });
      place.dataset.index = joyIndex;
      place.dataset.x = pos.x.toFixed(1);
      place.dataset.y = pos.y.toFixed(1);

      // Inner <g> is what the drop and rise animations move
      const star = svgEl('g', { class: 'jar-star' });
      star.style.setProperty('--c', `var(${colorVarOf(joy)})`);
      star.style.setProperty('--drop', (PILE.dropFrom - pos.y).toFixed(1) + 'px');
      star.style.setProperty('--turn', rotate + 'deg');
      // Each star twinkles at its own slow pace
      star.style.setProperty('--tw', (2.6 + (seed % 40) / 10).toFixed(1) + 's');
      star.style.setProperty('--tw-delay', (-(seed % 60) / 10).toFixed(1) + 's');

      star.append(
        svgEl('circle', { class: 'jar-star__hit', r: 12 }),     // a bigger tap target
        svgEl('circle', { class: 'jar-star__halo', r: 19 }),
        svgEl('use', { class: 'jar-star__paper', href: '#star-shape', transform: shapeTransform }),
        // Faint folds from the center to each point, like a folded paper star
        svgEl('path', {
          class: 'jar-star__folds',
          d: 'M0 0 0-9M0 0 8.6-2.8M0 0 5.3 7.3M0 0-5.3 7.3M0 0-8.6-2.8',
          transform: shapeTransform,
        })
      );
      place.appendChild(star);
      return place;
    }

    // Draws the newest 60 joys. With `dropNewest`, the last star falls in.
    function renderJar(dropNewest) {
      const shown = joys.slice(-MAX_VISIBLE_STARS);
      const offset = joys.length - shown.length;
      els.stars.replaceChildren(...shown.map((joy, i) => createStar(joy, i, offset + i)));

      const n = joys.length;
      els.stage.classList.toggle('is-empty', n === 0);
      // The more stars inside, the brighter the jar glows (full at 40)
      els.stage.style.setProperty('--glow', (0.18 + 0.62 * Math.min(n, 40) / 40).toFixed(2));

      els.jar.setAttribute('aria-label', n === 0
        ? 'An empty glass jar'
        : 'A glowing glass jar with ' + n + (n === 1 ? ' star' : ' stars'));
      els.count.textContent = n + (n === 1 ? ' happy moment saved' : ' happy moments saved');
      els.count.hidden = n === 0;
      els.empty.hidden = n > 0;

      if (dropNewest && shown.length && !reducedMotion.matches) {
        els.stars.lastElementChild.firstElementChild.classList.add('is-dropping');
      }
    }

    // SVG coordinates (inside the jar) -> screen coordinates
    function jarToScreen(x, y) {
      const ctm = els.jar.getScreenCTM();
      const point = new DOMPoint(x, y).matrixTransform(ctm);
      return { x: point.x, y: point.y, scale: ctm.a };
    }

    function flashJar() {
      replayClass(els.stage, 'is-flashing');
    }

    function bumpLid() {
      if (!reducedMotion.matches) replayClass(els.lid, 'is-bumped');
    }


    /* ---------------- Writing a joy: the note folds and flies ---------------- */
    function updateCount() {
      els.chars.textContent = els.input.value.length + ' / ' + MAX_TEXT;
    }

    function setHint(message) {
      els.hint.textContent = message;
      if (message) els.input.setAttribute('aria-invalid', 'true');
      else els.input.removeAttribute('aria-invalid');
    }

    // Resolves once scrolling has settled (or after a short wait)
    function afterScroll() {
      return new Promise((resolve) => {
        let done = false;
        const finish = () => { if (!done) { done = true; resolve(); } };
        window.addEventListener('scrollend', finish, { once: true });
        setTimeout(finish, 700);
      });
    }

    // Scroll so the jar's mouth is comfortably on screen
    async function bringJarIntoView() {
      const box = els.jar.getBoundingClientRect();
      if (box.top >= 0 && box.top < window.innerHeight * 0.45) return;
      els.jarSection.scrollIntoView({ block: 'start', behavior: 'smooth' });
      await afterScroll();
    }

    // The note shrinks, turns, and becomes a star, then flies in an arc
    // to the jar's mouth. Resolves when it arrives.
    async function foldAndFly(joy) {
      const note = els.note.getBoundingClientRect();
      const from = { x: note.left + note.width / 2, y: note.top + note.height / 2 };
      const mouth = jarToScreen(MOUTH.x, MOUTH.y);
      const color = getComputedStyle(root).getPropertyValue(colorVarOf(joy)).trim();

      const SIZE = 60;
      const endScale = (STAR_SIZE * mouth.scale) / SIZE; // same size as a star in the jar

      // The wrapper moves and glows; the paper inside changes shape and color
      // (a glow on the clipped paper itself would be clipped away)
      const fly = document.createElement('div');
      fly.className = 'fly-star';
      fly.setAttribute('aria-hidden', 'true');
      fly.style.left = (from.x - SIZE / 2) + 'px';
      fly.style.top = (from.y - SIZE / 2) + 'px';
      const paper = document.createElement('div');
      paper.className = 'fly-star__paper';
      fly.appendChild(paper);
      document.body.appendChild(fly);

      // 1. Fold: the note-sized paper shrinks, turns, and changes shape
      const FOLD = { duration: 560, easing: 'cubic-bezier(0.55, 0, 0.25, 1)', fill: 'forwards' };
      paper.animate([
        { clipPath: NOTE_SHAPE, backgroundColor: NOTE_COLOR },
        { clipPath: NOTE_SHAPE, backgroundColor: NOTE_COLOR, offset: 0.35 },
        { clipPath: STAR_SHAPE, backgroundColor: color },
      ], FOLD);
      await fly.animate([
        { transform: `scale(${note.width / SIZE}, ${note.height / SIZE}) rotate(-1deg)` },
        { transform: `scale(${(note.height * 0.7) / SIZE}) rotate(40deg)`, offset: 0.35 },
        { transform: 'scale(0.62) rotate(160deg)' },
      ], FOLD).finished;

      // 2. Fly: along a curve that rises above the jar, then dips into its mouth
      const dx = mouth.x - from.x;
      const dy = mouth.y - from.y;
      const control = { x: dx * 0.3, y: Math.min(0, dy) - 110 };
      const frames = [];
      for (let i = 0; i <= 20; i++) {
        const t = i / 20;
        const x = 2 * (1 - t) * t * control.x + t * t * dx;
        const y = 2 * (1 - t) * t * control.y + t * t * dy;
        const s = 0.62 + (endScale - 0.62) * t;
        frames.push({
          transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${s.toFixed(3)}) rotate(${(160 + 250 * t).toFixed(1)}deg)`,
          offset: t,
        });
      }
      const flight = fly.animate(frames, { duration: 780, easing: 'cubic-bezier(0.4, 0.05, 0.45, 1)', fill: 'forwards' });
      setTimeout(bumpLid, 600); // the cork lifts to let it in
      await flight.finished;
      fly.remove();
    }

    async function addJoy(event) {
      event.preventDefault();
      if (busy) return;
      const text = els.input.value.replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT);
      if (!text) {
        setHint('Write a little something first.');
        els.input.focus();
        return;
      }

      const joy = { text: text, date: todayKey() };
      const next = joys.concat(joy);
      if (!saveJoys(next)) {
        showToast("I couldn't save that on this device, sorry.");
        return;
      }
      joys = next;
      busy = true;
      els.add.disabled = true;
      setHint('');
      els.input.blur(); // closes the phone keyboard

      if (!reducedMotion.matches) {
        await bringJarIntoView();
        // The note's words stay on the paper until it starts to fold
        const flying = foldAndFly(joy);
        requestAnimationFrame(() => { els.input.value = ''; updateCount(); });
        await flying;
      } else {
        els.input.value = '';
        updateCount();
      }

      renderJar(true);
      // Brighter glow as the star lands (the drop takes about 600ms to land)
      setTimeout(flashJar, reducedMotion.matches ? 0 : 580);
      renderRest();
      showToast('Added to your jar.');
      els.add.disabled = false;
      busy = false;
    }


    /* ---------------- A memory, as a small letter ---------------- */
    function openMemory(joy) {
      lastMemory = joy;
      const date = dateFromKey(joy.date);
      els.stampDay.textContent = date.getDate();
      els.stampMonth.textContent = date.toLocaleDateString('en-GB', { month: 'short' }) +
        (date.getFullYear() !== new Date().getFullYear() ? ' ' + date.getFullYear() : '');
      els.memoryIntro.textContent = 'On ' + formatJoyDate(joy.date) + ' you wrote:';
      els.memoryText.textContent = joy.text;

      els.memory.classList.remove('is-closing');
      if (typeof els.memory.showModal === 'function') {
        if (!els.memory.open) els.memory.showModal();
      } else {
        els.memory.setAttribute('open', ''); // very old browsers: still shows, without the backdrop
      }
    }

    async function closeMemory() {
      if (!els.memory.open || els.memory.classList.contains('is-closing')) return;
      if (!reducedMotion.matches) {
        els.memory.classList.add('is-closing');
        await wait(200);
      }
      els.memory.classList.remove('is-closing');
      if (typeof els.memory.close === 'function') els.memory.close();
      else els.memory.removeAttribute('open');
    }

    // Tapping a star opens its memory
    function onStarTap(event) {
      const place = event.target.closest('.jar-star-place');
      if (!place || busy) return;
      const joy = joys[Number(place.dataset.index)];
      if (joy) openMemory(joy);
    }


    /* ---------------- Pick a memory: the jar shakes, a star rises ---------------- */
    async function riseOut(place) {
      const x = Number(place.dataset.x);
      const y = Number(place.dataset.y);
      const clone = place.cloneNode(true);
      delete clone.dataset.index;
      const star = clone.querySelector('.jar-star');
      star.classList.remove('is-dropping');
      els.rise.appendChild(clone);
      place.style.visibility = 'hidden'; // the star leaves its place while it's out

      setTimeout(bumpLid, 380);
      await star.animate([
        { transform: 'translate(0px, 0px) scale(1)', opacity: 1 },
        { transform: `translate(${MOUTH.x - x}px, ${MOUTH.y - y}px) scale(1.3)`, opacity: 1, offset: 0.55 },
        { transform: `translate(${MOUTH.x - x}px, ${MOUTH.y - 70 - y}px) scale(2)`, opacity: 0 },
      ], { duration: 950, easing: 'ease-in-out' }).finished;

      clone.remove();
      place.style.visibility = '';
    }

    async function pickMemory() {
      if (!joys.length || busy) return;
      const options = joys.length > 1 ? joys.filter((j) => j !== lastMemory) : joys;
      const joy = options[Math.floor(Math.random() * options.length)];
      const place = els.stars.querySelector(`.jar-star-place[data-index="${joys.indexOf(joy)}"]`);

      // Older joys (beyond the 60 shown) and reduced motion: just open it
      if (reducedMotion.matches || !place) {
        openMemory(joy);
        return;
      }

      busy = true;
      replayClass(els.stage, 'is-shaking');
      await wait(520);
      await riseOut(place);
      els.stage.classList.remove('is-shaking');
      busy = false;
      openMemory(joy);
    }


    /* ---------------- See all: paper notes grouped by month ---------------- */
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
      if (lastMemory === joy) lastMemory = null;
      renderJar(false);
      renderRest();
      showToast('Taken out of your jar.');
      // Keep keyboard focus in the list, not lost at the top of the page
      const firstDelete = els.list.querySelector('.note-item__delete');
      (firstDelete || els.listToggle).focus();
    }

    function createNoteItem(joy) {
      const item = document.createElement('li');
      item.className = 'note-item';

      // The note itself opens the memory
      const open = document.createElement('button');
      open.type = 'button';
      open.className = 'note-item__open';
      const text = document.createElement('span');
      text.className = 'note-item__text';
      text.textContent = joy.text;
      const date = document.createElement('span');
      date.className = 'note-item__date';
      date.textContent = formatJoyDate(joy.date);
      open.append(text, date);
      open.addEventListener('click', () => openMemory(joy));

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'note-item__delete';
      remove.textContent = 'Delete';
      remove.setAttribute('aria-label', 'Delete "' + joy.text + '" from ' + formatJoyDate(joy.date));
      remove.addEventListener('click', () => deleteJoy(joy, remove));

      item.append(open, remove);
      return item;
    }

    function renderList() {
      // Newest first: by date, then by the order they were added
      const sorted = joys
        .map((joy, index) => ({ joy, index }))
        .sort((a, b) => b.joy.date.localeCompare(a.joy.date) || b.index - a.index)
        .map((entry) => entry.joy);

      const groups = [];
      sorted.forEach((joy) => {
        const month = joy.date.slice(0, 7);
        const last = groups[groups.length - 1];
        if (last && last.month === month) last.joys.push(joy);
        else groups.push({ month: month, joys: [joy] });
      });

      els.list.replaceChildren(...groups.map((group) => {
        const section = document.createElement('section');
        section.className = 'note-group';
        const title = document.createElement('h3');
        title.className = 'note-group__title';
        title.textContent = formatMonth(group.joys[0].date);
        const list = document.createElement('ul');
        list.className = 'note-list';
        list.append(...group.joys.map(createNoteItem));
        section.append(title, list);
        return section;
      }));
    }

    function setListOpen(open) {
      els.listCard.hidden = !open;
      els.listToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      els.listToggle.textContent = open ? 'Hide list' : 'See all (' + joys.length + ')';
    }

    // Everything under the jar that depends on the saved joys
    function renderRest() {
      const any = joys.length > 0;
      els.pickWrap.hidden = !any;
      els.all.hidden = !any;
      setListOpen(any && !els.listCard.hidden);
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
    els.stars.addEventListener('click', onStarTap);
    els.pick.addEventListener('click', pickMemory);
    els.listToggle.addEventListener('click', () => setListOpen(els.listCard.hidden));

    els.memoryClose.addEventListener('click', closeMemory);
    // Tapping outside the letter (on the blurred backdrop) closes it
    els.memory.addEventListener('click', (event) => {
      if (event.target === els.memory) closeMemory();
    });
    // Esc: close with the same gentle fade
    els.memory.addEventListener('cancel', (event) => {
      event.preventDefault();
      closeMemory();
    });
  });
})();
