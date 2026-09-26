/* =====================================================================
   Little Sunshine: shared.js
   The bits every page needs: the saved profile, sky themes, the toast,
   the bottom navigation, the floating light in the sky, and haptics.
   Exposed as window.LittleSunshine.

   Load it in <head> without defer, before the page's own script. The
   top part runs right away: on every page except the welcome page
   (index.html), no saved name means go back to the welcome page.
   ===================================================================== */
(function () {
  'use strict';

  /* -------------------------------------------------------------------
     Settings
     ------------------------------------------------------------------- */
  const KEY_PREFIX = 'littleSunshine:';            // every key this app saves starts with this
  const PROFILE_KEY = 'littleSunshine:profile';
  const LEGACY_PROFILE_KEY = 'littleSunshine:v1'; // before shared.js; moved over on first read
  const SOUND_KEY = 'littleSunshine:sound';       // "on" or "off" (off by default)
  const MAX_NAME = 24;

  // Order here = order of the sky tiles on the welcome page.
  // statusBar is used for <meta name="theme-color"> (it's the sky's top color).
  const SKIES = {
    peach:    { label: 'Peach sunrise', statusBar: '#FFD8BE' },
    lavender: { label: 'Lavender dusk', statusBar: '#D9CCF5' },
    sea:      { label: 'Sea breeze',    statusBar: '#CDE7F5' },
    mint:     { label: 'Mint garden',   statusBar: '#CFE3D4' },
  };

  // Bottom navigation, left to right. Shapes with class "tab__fill"
  // gently fill with the accent color on the active tab.
  const TABS = [
    {
      key: 'today',
      label: 'Today',
      href: 'home.html',
      icon: '<circle class="tab__fill" cx="12" cy="12" r="4"/>' +
        '<path d="M12 3v1.5M12 19.5V21M3 12h1.5M19.5 12H21M5.6 5.6l1.1 1.1M17.3 17.3l1.1 1.1M5.6 18.4l1.1-1.1M17.3 6.7l1.1-1.1"/>',
    },
    {
      key: 'joy',
      label: 'Joy Jar',
      href: 'joy.html',
      icon: '<path d="M8 3.5h8"/>' +
        '<path class="tab__fill" d="M9 3.5v3c-2.4 1-4 3.3-4 6.2V17a3.5 3.5 0 0 0 3.5 3.5h7A3.5 3.5 0 0 0 19 17v-4.3c0-2.9-1.6-5.2-4-6.2v-3"/>' +
        '<path class="tab__fill" d="M12 16.2c-1.6-1-2.6-2-2.6-3.1a1.3 1.3 0 0 1 2.6-.4 1.3 1.3 0 0 1 2.6.4c0 1.1-1 2.1-2.6 3.1z"/>',
    },
    {
      key: 'breathe',
      label: 'Breathe',
      href: 'breathe.html',
      icon: '<path d="M3.5 9h11a2.5 2.5 0 1 0-2.5-2.5"/>' +
        '<path d="M3.5 13h14a2.5 2.5 0 1 1-2.5 2.5"/>' +
        '<path d="M3.5 17h6"/>',
    },
    {
      key: 'me',
      label: 'Me',
      href: 'me.html',
      icon: '<circle class="tab__fill" cx="12" cy="8.5" r="3.8"/>' +
        '<path class="tab__fill" d="M4.5 20c.8-3.6 3.8-5.8 7.5-5.8s6.7 2.2 7.5 5.8"/>',
    },
  ];

  // Floating light (bokeh) in the sky: where each circle sits (% of the
  // screen), how big it is, its color, how strongly it shows, and how
  // far and how slowly it drifts. Fixed values, so every page matches.
  const BOKEH = [
    { x: 12, y: 14, size: 150, c: '--sun-core',  o: 0.4,  dx: 30,  dy: 18,  dur: 38 },
    { x: 84, y: 10, size: 110, c: '--sun-edge',  o: 0.32, dx: -24, dy: 22,  dur: 46 },
    { x: 70, y: 32, size: 190, c: '#FFFFFF',     o: 0.28, dx: -34, dy: -16, dur: 52 },
    { x: 26, y: 40, size: 90,  c: '--sun-edge',  o: 0.35, dx: 22,  dy: -20, dur: 34 },
    { x: 52, y: 6,  size: 70,  c: '#FFFFFF',     o: 0.4,  dx: 18,  dy: 14,  dur: 30 },
    { x: 92, y: 46, size: 130, c: '--hill-back', o: 0.25, dx: -20, dy: -24, dur: 44 },
    { x: 6,  y: 58, size: 120, c: '--sun-core',  o: 0.3,  dx: 26,  dy: -14, dur: 48 },
  ];

  // Taps that get a tiny vibration (where the phone supports it): the
  // nav, main buttons, hearts, the smile sun, check-ins and choices
  const HAPTIC_TAPS = [
    '.tab', '.btn--primary', '.icon-btn--heart', '.smile__sun',
    '.kindness__input', '.mood__input', '.pill__input', '.pattern__input', '#breath-stop',
    '.letter-arrived__button', '.letter-item--ready', '.calm-tile',
  ].join(', ');

  const root = document.documentElement;


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


  /* -------------------------------------------------------------------
     Profile storage: { name, sky, joinedDate }
     (always wrapped in try/catch: private mode, blocked storage, or a
     full quota must never break the page)
     ------------------------------------------------------------------- */
  function readStoredProfile() {
    try {
      const saved = localStorage.getItem(PROFILE_KEY);
      if (saved !== null) return JSON.parse(saved);

      // One-time move from the old key, so nobody has to set up again
      const legacy = localStorage.getItem(LEGACY_PROFILE_KEY);
      if (legacy === null) return null;
      localStorage.setItem(PROFILE_KEY, legacy);
      localStorage.removeItem(LEGACY_PROFILE_KEY);
      return JSON.parse(legacy);
    } catch (err) {
      return null;
    }
  }

  // Returns the saved profile, or null if there's no usable name
  function loadProfile() {
    const data = readStoredProfile();
    if (!data || typeof data.name !== 'string') return null;
    const name = cleanName(data.name);
    if (!name) return null;
    return {
      name: name,
      sky: SKIES[data.sky] ? data.sky : 'peach',
      joinedDate: /^\d{4}-\d{2}-\d{2}$/.test(data.joinedDate) ? data.joinedDate : todayKey(),
    };
  }

  // Returns true if it was saved
  function saveProfile(profile) {
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify({
        name: profile.name,
        sky: profile.sky,
        joinedDate: profile.joinedDate,
      }));
      return true;
    } catch (err) {
      return false; // storage unavailable: the page still works, it just won't remember
    }
  }


  /* -------------------------------------------------------------------
     Sounds on/off, shared by the Breathe and Me pages
     ------------------------------------------------------------------- */
  function loadSoundOn() {
    try {
      return localStorage.getItem(SOUND_KEY) === 'on';
    } catch (err) {
      return false;
    }
  }

  function saveSoundOn(on) {
    try {
      localStorage.setItem(SOUND_KEY, on ? 'on' : 'off');
      return true;
    } catch (err) {
      return false; // it just won't be remembered
    }
  }

  // "Reset everything": removes every Little Sunshine key (and nothing else
  // that might share this origin). Returns true if it worked.
  function clearAllData() {
    try {
      Object.keys(localStorage)
        .filter((key) => key.startsWith(KEY_PREFIX))
        .forEach((key) => localStorage.removeItem(key));
      return true;
    } catch (err) {
      return false;
    }
  }


  /* -------------------------------------------------------------------
     Sky theme. The themes live on <html> (not <body>), so this works
     from <head> before the body exists, and the page background and
     overscroll color match too.
     ------------------------------------------------------------------- */
  function applySky(key) {
    const sky = SKIES[key] ? key : 'peach';
    root.setAttribute('data-sky', sky);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', SKIES[sky].statusBar);
  }


  /* -------------------------------------------------------------------
     Toast: one per page, added to <body> once the page has loaded.
     role=status announces it politely.
     ------------------------------------------------------------------- */
  let toastTimer = 0;

  function getToast() {
    let toast = document.getElementById('toast');
    if (!toast && document.body) {
      toast = document.createElement('div');
      toast.className = 'toast';
      toast.id = 'toast';
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');
      document.body.appendChild(toast);
    }
    return toast;
  }

  function showToast(message) {
    const toast = getToast();
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('is-shown');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('is-shown'), 3200);
  }


  /* -------------------------------------------------------------------
     Bottom navigation. `activeTab` is "today", "joy", "breathe" or "me".
     Added at the end of <body>, just before the toast.
     ------------------------------------------------------------------- */
  function renderBottomNav(activeTab) {
    const nav = document.createElement('nav');
    nav.className = 'tabbar';
    nav.setAttribute('aria-label', 'Main');

    const inner = document.createElement('div');
    inner.className = 'tabbar__inner';

    TABS.forEach((tab) => {
      const link = document.createElement('a');
      link.className = 'tab';
      link.href = tab.href;
      if (tab.key === activeTab) {
        link.classList.add('is-active');
        link.setAttribute('aria-current', 'page');
      }
      link.innerHTML =
        '<svg class="tab__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + tab.icon + '</svg>' +
        '<span class="tab__label"></span>';
      link.querySelector('.tab__label').textContent = tab.label;
      inner.appendChild(link);
    });

    nav.appendChild(inner);
    document.body.insertBefore(nav, getToast());
    return nav;
  }


  /* -------------------------------------------------------------------
     Floating light: soft circles drifting behind the sun and hills.
     Added to the page's .scene; styles.css draws and moves them (and
     hides them with reduced motion).
     ------------------------------------------------------------------- */
  function addFloatingLight() {
    const scene = document.querySelector('.scene');
    if (!scene || scene.querySelector('.bokeh-layer')) return;

    const layer = document.createElement('div');
    layer.className = 'bokeh-layer';
    BOKEH.forEach((b, i) => {
      const dot = document.createElement('span');
      dot.className = 'bokeh';
      const style = dot.style;
      style.setProperty('--x', b.x + '%');
      style.setProperty('--y', b.y + '%');
      style.setProperty('--size', b.size + 'px');
      style.setProperty('--c', b.c.startsWith('--') ? 'var(' + b.c + ')' : b.c);
      style.setProperty('--o', String(b.o));
      style.setProperty('--dx', b.dx + 'px');
      style.setProperty('--dy', b.dy + 'px');
      style.setProperty('--dur', b.dur + 's');
      // Start each one part-way through its drift, so they don't move in step
      style.setProperty('--delay', -(i * 7) + 's');
      layer.appendChild(dot);
    });

    // Just above the sky gradient: behind the sun and the hills
    const sky = scene.querySelector('.sky');
    scene.insertBefore(layer, sky ? sky.nextSibling : scene.firstChild);
  }


  /* -------------------------------------------------------------------
     Haptics: a tiny tap (10ms) on important taps, if the phone can
     ------------------------------------------------------------------- */
  function haptic() {
    try {
      // Only during a real tap: browsers block (and warn about) vibration otherwise
      if (navigator.userActivation && !navigator.userActivation.isActive) return;
      if (typeof navigator.vibrate === 'function') navigator.vibrate(10);
    } catch (err) { /* no vibration here: nothing to do */ }
  }

  function onTap(event) {
    const target = event.target instanceof Element ? event.target : null;
    if (target && target.closest(HAPTIC_TAPS)) haptic();
  }


  /* -------------------------------------------------------------------
     Run immediately: no saved name means go back to the welcome page
     ------------------------------------------------------------------- */
  const isWelcomePage = /(^|\/)(index(\.html)?)?$/.test(window.location.pathname);
  if (!isWelcomePage && !loadProfile()) {
    window.location.replace('./');
  }

  // Make sure the toast exists before anything is announced in it,
  // and light up the sky
  document.addEventListener('DOMContentLoaded', () => {
    getToast();
    addFloatingLight();
  });

  // One listener for every page's haptic taps
  document.addEventListener('click', onTap);


  window.LittleSunshine = {
    SKIES: SKIES,
    MAX_NAME: MAX_NAME,
    cleanName: cleanName,
    todayKey: todayKey,
    loadProfile: loadProfile,
    saveProfile: saveProfile,
    loadSoundOn: loadSoundOn,
    saveSoundOn: saveSoundOn,
    clearAllData: clearAllData,
    applySky: applySky,
    showToast: showToast,
    renderBottomNav: renderBottomNav,
    haptic: haptic,
  };
})();
