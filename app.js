/* =====================================================================
   Little Sunshine: app.js
   Handles the three screens, the rising sun, sky themes, the greeting,
   petals, and saving { name, sky, joinedDate } in localStorage.

   This file is loaded in <head> without defer. The top part runs right
   away (to apply the saved sky before first paint); the rest waits for
   DOMContentLoaded.
   ===================================================================== */
(function () {
  'use strict';

  /* -------------------------------------------------------------------
     Content + settings
     ------------------------------------------------------------------- */
  const STORAGE_KEY = 'littleSunshine:v1';
  const MAX_NAME = 24;

  // Order here = order of the tiles = arrow-key order.
  // statusBar is used for <meta name="theme-color"> (it's the sky's top color).
  const SKIES = {
    peach:    { label: 'Peach sunrise', statusBar: '#FFD8BE' },
    lavender: { label: 'Lavender dusk', statusBar: '#D9CCF5' },
    sea:      { label: 'Sea breeze',    statusBar: '#CDE7F5' },
    mint:     { label: 'Mint garden',   statusBar: '#CFE3D4' },
  };
  const SKY_KEYS = Object.keys(SKIES);

  const GREETINGS = {
    morning:   'Good morning,',
    afternoon: 'Good afternoon,',
    evening:   'Good evening,',
    night:     'Hello, night owl,',
  };

  const MESSAGES = {
    morning: [
      'The day is new, and so are you. Go gently.',
      'No need to have it all figured out. Just the next small step.',
      "Open a window, drink some water. You're allowed to start slowly.",
    ],
    afternoon: [
      'Whatever the morning was, the rest of today is still yours.',
      "Take a breath and loosen your shoulders. You're doing better than you think.",
      "It's okay if today is an ordinary day. Ordinary days hold us up.",
    ],
    evening: [
      "You made it through today. That's something to be proud of.",
      'What didn’t get done can wait for tomorrow. You did enough.',
      'Let the day soften at the edges. You can set it down now.',
    ],
    night: [
      "Rest is not a reward. You're allowed to have it anyway.",
      "The world is quiet now. You don't have to carry anything until morning.",
      "If your mind is busy, that's okay. Be as kind to yourself as you'd be to a friend.",
    ],
  };

  const WELCOME_BACK = [
    'Welcome back. I kept your sky warm for you.',
    "There you are. I'm really glad you came back.",
    'Oh, hello again. This place missed you a little.',
  ];

  const PETAL_COLORS = ['#F7B9C8', '#FFCBA4', '#FFE8A3', '#D6C6F2', '#BFE3CC']; // pink, peach, butter, lavender, mint

  // How high the sun sits on each screen (0 = behind hills, 1 = high)
  const RISE = {
    nameStart: 0.14,   // peeking over the hills
    namePerLetter: 0.024,
    nameMax: 0.42,     // reached after ~12 letters
    sky: 0.68,
    greet: 1,
  };

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const root = document.documentElement;


  /* -------------------------------------------------------------------
     Storage (always wrapped in try/catch: private mode, blocked storage,
     or a full quota must never break the page)
     ------------------------------------------------------------------- */
  function loadProfile() {
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!data || typeof data.name !== 'string') return null;
      const name = cleanName(data.name);
      if (!name) return null;
      return {
        name: name,
        sky: SKIES[data.sky] ? data.sky : 'peach',
        joinedDate: /^\d{4}-\d{2}-\d{2}$/.test(data.joinedDate) ? data.joinedDate : todayKey(),
      };
    } catch (err) {
      return null;
    }
  }

  function saveProfile(profile) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    } catch (err) {
      /* Storage unavailable: the page still works, it just won't remember. */
    }
  }


  /* -------------------------------------------------------------------
     Small helpers
     ------------------------------------------------------------------- */
  // Collapse inner spaces, trim, and cap the length
  function cleanName(value) {
    return String(value).replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
  }

  // Local date as "YYYY-MM-DD"
  function todayKey(date) {
    const d = date || new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  // Day 1 = the day you joined. Uses UTC math on calendar dates so
  // daylight-saving changes can't make a day count twice.
  function dayNumber(joinedDate) {
    const parts = joinedDate.split('-').map(Number);
    const joined = Date.UTC(parts[0], parts[1] - 1, parts[2]);
    const now = new Date();
    const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.max(1, Math.floor((today - joined) / 86400000) + 1);
  }

  function partOfDay(hour) {
    if (hour >= 5 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 17) return 'afternoon';
    if (hour >= 17 && hour < 22) return 'evening';
    return 'night';
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function pick(list) {
    return list[Math.floor(Math.random() * list.length)];
  }


  /* -------------------------------------------------------------------
     Theme + sun (these touch only <html>, so they work before the body exists)
     ------------------------------------------------------------------- */
  function applySky(key) {
    root.setAttribute('data-sky', key);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', SKIES[key].statusBar);
  }

  function setSunRise(value) {
    root.style.setProperty('--sun-rise', String(value));
  }

  function nameRise(length) {
    return Math.min(RISE.nameMax, RISE.nameStart + Math.min(length, 12) * RISE.namePerLetter);
  }


  /* -------------------------------------------------------------------
     Run immediately: apply the saved sky before the first paint
     ------------------------------------------------------------------- */
  const savedProfile = loadProfile();
  applySky(savedProfile ? savedProfile.sky : 'peach');

  // Working state. `draftSky` is the sky being previewed on screen 2;
  // it only becomes profile.sky when "Choose this sky" is pressed.
  const profile = savedProfile || { name: '', sky: 'peach', joinedDate: null };
  let draftSky = profile.sky;


  /* -------------------------------------------------------------------
     Everything below needs the page's elements
     ------------------------------------------------------------------- */
  document.addEventListener('DOMContentLoaded', function init() {
    const $ = (id) => document.getElementById(id);
    const els = {
      card: $('card'),
      screens: { name: $('screen-name'), sky: $('screen-sky'), greet: $('screen-greet') },
      nameForm: $('name-form'),
      nameInput: $('name-input'),
      nameEcho: $('name-echo'),
      nameHint: $('name-hint'),
      nameSlots: document.querySelectorAll('[data-name]'),
      skyGrid: $('sky-grid'),
      tiles: Array.from(document.querySelectorAll('.tile')),
      skyBack: $('sky-back'),
      skyChoose: $('sky-choose'),
      greetTime: $('greet-time'),
      greetName: $('greet-name'),
      greetWelcome: $('greet-welcome'),
      greetMessage: $('greet-message'),
      greetDay: $('greet-day'),
      openDay: $('open-day'),
      changeSetup: $('change-setup'),
    };

    let currentScreen = null;
    let switching = false;
    let petalsReleased = false;


    /* ---------------- Screen switching (cross-fade + card resize) ---------------- */
    async function showScreen(name, options) {
      const opts = options || {};
      const next = els.screens[name];
      const prev = currentScreen;
      if (next === prev || switching) return;
      switching = true;
      currentScreen = next;

      const reduce = reducedMotion.matches;

      // 1. Fade the current screen out
      if (prev) {
        prev.classList.remove('is-visible');
        await wait(reduce ? 0 : 260);
      }

      // 2. Swap (every other screen is hidden, even on first show),
      //    and animate the card from its old height to its new one
      const startHeight = els.card.getBoundingClientRect().height;
      Object.values(els.screens).forEach((screen) => { screen.hidden = screen !== next; });

      if (prev && !reduce) {
        const endHeight = els.card.getBoundingClientRect().height;
        els.card.style.height = startHeight + 'px';
        els.card.getBoundingClientRect(); // force layout so the next line animates
        els.card.style.height = endHeight + 'px';
        setTimeout(() => { els.card.style.height = ''; }, 400);
      }

      // 3. Fade the new screen in (the layout read first makes the fade actually animate)
      next.getBoundingClientRect();
      next.classList.add('is-visible');

      // Move focus to the new heading so keyboard and screen reader users land in the right place
      if (opts.focus !== false) {
        const target = next.querySelector('[data-focus]');
        if (target) target.focus({ preventScroll: true });
      }

      switching = false;
    }


    /* ---------------- Screen 1: Name ---------------- */
    function updateNameEcho() {
      const name = cleanName(els.nameInput.value);
      els.nameEcho.textContent = name || 'you';
      if (name) clearNameError();
      setSunRise(nameRise(name.length));
    }

    function showNameError() {
      els.nameHint.textContent = 'Type your name or a nickname to continue.';
      els.nameInput.setAttribute('aria-invalid', 'true');
      els.nameInput.focus();
    }

    function clearNameError() {
      els.nameHint.textContent = '';
      els.nameInput.removeAttribute('aria-invalid');
    }

    function goToNameScreen() {
      els.nameInput.value = profile.name;
      clearNameError();
      updateNameEcho();
      showScreen('name');
    }

    els.nameInput.addEventListener('input', updateNameEcho);

    els.nameForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const name = cleanName(els.nameInput.value);
      if (!name) {
        showNameError();
        return;
      }
      profile.name = name;
      els.nameInput.blur(); // closes the phone keyboard
      goToSkyScreen();
    });


    /* ---------------- Screen 2: Pick your sky ---------------- */
    function selectSky(key) {
      draftSky = key;
      applySky(key); // the whole page fades to the new colors (CSS @property transition)
      els.tiles.forEach((tile) => {
        const on = tile.dataset.sky === key;
        tile.setAttribute('aria-checked', on ? 'true' : 'false');
        tile.tabIndex = on ? 0 : -1; // roving tabindex: only the checked tile is in the tab order
      });
    }

    function goToSkyScreen() {
      els.nameSlots.forEach((slot) => { slot.textContent = profile.name; });
      selectSky(draftSky);
      setSunRise(RISE.sky);
      showScreen('sky');
    }

    els.tiles.forEach((tile) => {
      tile.addEventListener('click', () => selectSky(tile.dataset.sky));
    });

    // Arrow keys move the selection, like native radio buttons
    els.skyGrid.addEventListener('keydown', (event) => {
      let index = SKY_KEYS.indexOf(draftSky);
      const last = SKY_KEYS.length - 1;
      switch (event.key) {
        case 'ArrowRight':
        case 'ArrowDown': index = index === last ? 0 : index + 1; break;
        case 'ArrowLeft':
        case 'ArrowUp':   index = index === 0 ? last : index - 1; break;
        case 'Home':      index = 0; break;
        case 'End':       index = last; break;
        default: return;
      }
      event.preventDefault();
      selectSky(SKY_KEYS[index]);
      els.tiles[index].focus();
    });

    els.skyBack.addEventListener('click', goToNameScreen);

    els.skyChoose.addEventListener('click', () => {
      profile.sky = draftSky;
      if (!profile.joinedDate) profile.joinedDate = todayKey();
      saveProfile({ name: profile.name, sky: profile.sky, joinedDate: profile.joinedDate });
      goToGreeting({ returning: false });
    });


    /* ---------------- Screen 3: Personal greeting ---------------- */
    function fillGreeting(returning) {
      const now = new Date();
      const part = partOfDay(now.getHours());
      const day = dayNumber(profile.joinedDate || todayKey());

      els.greetTime.textContent = GREETINGS[part];
      els.greetName.textContent = profile.name;

      // Same message all day (changes with the date), so reloading doesn't reshuffle it
      const messages = MESSAGES[part];
      els.greetMessage.textContent = messages[now.getDate() % messages.length];

      els.greetWelcome.hidden = !returning;
      els.greetWelcome.textContent = returning ? pick(WELCOME_BACK) : '';

      els.greetDay.textContent = day === 1
        ? "Day one of us. I'm glad you're here."
        : 'This is day ' + day + ' together.';
    }

    async function goToGreeting(opts) {
      fillGreeting(opts.returning);
      setSunRise(RISE.greet);
      await showScreen('greet', { focus: opts.focus });
      releasePetals();
    }

    els.openDay.addEventListener('click', () => {
      window.location.href = 'home.html';
    });

    els.changeSetup.addEventListener('click', goToNameScreen);


    /* ---------------- Petals (once per visit) ---------------- */
    function releasePetals() {
      if (petalsReleased || reducedMotion.matches) return;
      petalsReleased = true;

      const layer = document.createElement('div');
      layer.className = 'petals';
      layer.setAttribute('aria-hidden', 'true');

      const count = window.innerWidth < 720 ? 22 : 34;
      let longest = 0;

      for (let i = 0; i < count; i++) {
        const petal = document.createElement('span');
        const duration = 7 + Math.random() * 5;   // seconds to fall
        const delay = Math.random() * 3.5;
        longest = Math.max(longest, duration + delay);

        petal.className = 'petal';
        petal.style.setProperty('--x', (Math.random() * 100).toFixed(2) + '%');
        petal.style.setProperty('--dur', duration.toFixed(2) + 's');
        petal.style.setProperty('--delay', delay.toFixed(2) + 's');
        petal.style.setProperty('--size', (9 + Math.random() * 7).toFixed(1) + 'px');
        petal.style.setProperty('--sway', (1.8 + Math.random() * 1.6).toFixed(2) + 's');
        petal.style.setProperty('--c', PETAL_COLORS[i % PETAL_COLORS.length]);
        petal.appendChild(document.createElement('i'));
        layer.appendChild(petal);
      }

      document.body.appendChild(layer);
      setTimeout(() => layer.remove(), longest * 1000 + 500);
    }


    /* ---------------- Start ---------------- */
    // Read the sun's current style first so it starts at 0 and visibly rises on load.
    getComputedStyle(root).getPropertyValue('--sun-rise');

    if (savedProfile && window.location.hash === '#edit') {
      // Came from "Change name or sky" on the Today page: open the name screen, prefilled
      history.replaceState(null, '', window.location.pathname);
      goToNameScreen();
    } else if (savedProfile) {
      // Returning visitor: straight to the greeting
      goToGreeting({ returning: true, focus: false });
    } else {
      setSunRise(RISE.nameStart);
      showScreen('name', { focus: false });
    }
  });
})();
